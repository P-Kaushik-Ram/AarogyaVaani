"""No production credentials/network: protocol guard and private-input workflow."""
import io
import os
import struct
from contextlib import contextmanager
from unittest.mock import Mock
import pytest
from dotenv import dotenv_values
from scramp.core import ScramMechanism
from db import postgres
from tools import secure_neon_setup as setup

URL = 'postgresql://synthetic:synthetic@localhost/neondb?sslmode=require&channel_binding=require'


def auth(code, suffix=b''):
    return struct.pack('!I', code) + suffix


def guard(binding=('tls-server-end-point', b'synthetic-certificate-digest')):
    connection = object.__new__(postgres.BoundConnection)
    connection._binding_started = connection._binding_verified = False
    connection.channel_binding = binding
    connection.user = b'synthetic'
    connection.password = b'synthetic'
    connection._sock = io.BytesIO()
    connection._send_message = Mock()
    return connection


@pytest.mark.parametrize('message,binding', [
    (auth(0), ('tls-server-end-point', b'digest')),
    (auth(3), ('tls-server-end-point', b'digest')),
    (auth(5, b'salt'), ('tls-server-end-point', b'digest')),
    (auth(10, b'SCRAM-SHA-256\0\0'), ('tls-server-end-point', b'digest')),
    (auth(10, b'SCRAM-SHA-256-PLUS\0\0'), None),
    (auth(12, b'v=invalid'), ('tls-server-end-point', b'digest')),
])
def test_authentication_downgrades_send_no_password_or_proof(message, binding):
    connection = guard(binding)
    with pytest.raises(postgres.pg8000.dbapi.InterfaceError):
        connection.handle_AUTHENTICATION_REQUEST(message, None)
    connection._send_message.assert_not_called()
    assert not connection._binding_verified


@pytest.mark.parametrize('bad_signature', [False, True])
def test_real_scram_plus_exchange_and_signature_validation(bad_signature):
    connection = guard()
    mechanism = ScramMechanism('SCRAM-SHA-256-PLUS')
    info = mechanism.make_auth_info('synthetic')
    server = mechanism.make_server(lambda username: info, channel_binding=connection.channel_binding)
    connection.handle_AUTHENTICATION_REQUEST(auth(10, b'SCRAM-SHA-256\0SCRAM-SHA-256-PLUS\0\0'), None)
    assert connection.auth.mechanism_name == 'SCRAM-SHA-256-PLUS'
    payload = connection._send_message.call_args.args[1]
    method, response = payload.split(b'\0', 1)
    assert method == b'SCRAM-SHA-256-PLUS'
    server.set_client_first(response[4:].decode())
    connection.handle_AUTHENTICATION_REQUEST(auth(11, server.get_server_first().encode()), None)
    server.set_client_final(connection._send_message.call_args.args[1].decode())
    final = server.get_server_final().encode()
    if bad_signature:
        with pytest.raises(Exception):
            connection.handle_AUTHENTICATION_REQUEST(auth(12, b'v=invalid'), None)
        assert not connection._binding_verified
    else:
        connection.handle_AUTHENTICATION_REQUEST(auth(12, final), None)
        connection.handle_AUTHENTICATION_REQUEST(auth(0), None)
        assert connection._binding_verified


def test_connect_cannot_disable_binding(monkeypatch):
    factory = Mock()
    monkeypatch.setattr(postgres, 'BoundConnection', factory)
    postgres.connect(user='synthetic', require_channel_binding=True)
    factory.assert_called_once_with(user='synthetic')


@pytest.mark.parametrize('approval,existing,fail,expected', [
    ('NEW', False, False, 0), ('APPROVE', True, False, 0),
    ('NO', True, False, 2), ('APPROVE', True, True, 1),
])
def test_private_setup_preserves_settings_and_redacts_failures(tmp_path, monkeypatch, approval, existing, fail, expected):
    path = tmp_path / '.env'
    original = '# keep comment\nUNRELATED=preserved\n'
    if existing:
        original += 'DATABASE_URL=previous-private-value\n'
    path.write_text(original)
    operations = []
    @contextmanager
    def connection():
        if fail:
            raise ValueError(URL)
        raw = Mock()
        def execute(sql):
            operations.append(sql)
            return Mock(fetchone=lambda: (1,))
        raw.execute = execute
        yield raw
    monkeypatch.setattr(postgres, 'connection', connection)
    output = io.StringIO()
    result = setup.run(path, io.StringIO(approval + '\n' + URL + '\n'), output)
    assert result == expected
    assert URL not in output.getvalue() and 'previous-private-value' not in output.getvalue()
    assert dotenv_values(path)['UNRELATED'] == 'preserved'
    if expected == 0:
        assert operations == ['SET TRANSACTION READ ONLY', 'SELECT 1']
        saved = dotenv_values(path, interpolate=False)['DATABASE_URL']
        assert 'sslmode=verify-full' in saved and 'channel_binding=require' in saved
    else:
        assert path.read_text() == original
    assert os.environ.get('DATABASE_URL') is None


@pytest.mark.parametrize('extra', ['sslmode=disable', 'channel_binding=disable', 'channel_binding=prefer'])
def test_helper_rejects_security_downgrades(extra):
    with pytest.raises(ValueError):
        setup.secure_url('postgresql://synthetic:synthetic@localhost/neondb?' + extra)


def test_failed_constructor_closes_socket(monkeypatch):
    def fail(self, **kwargs):
        raise ValueError('synthetic constructor failure')
    monkeypatch.setattr(postgres.pg8000.dbapi.Connection, '__init__', fail)
    close = Mock()
    monkeypatch.setattr(postgres.BoundConnection, 'close', close)
    with pytest.raises(ValueError):
        postgres.BoundConnection(user='synthetic')
    close.assert_called_once()


def test_unreviewed_driver_version_is_rejected(monkeypatch):
    monkeypatch.setattr(postgres, 'version', lambda package: 'unreviewed')
    with pytest.raises(RuntimeError, match='reviewed pg8000'):
        postgres.BoundConnection(user='synthetic')


@pytest.mark.parametrize('test_host,allowed', [('production.invalid', False),
    ('production-pooler.invalid', False), ('disposable.invalid', True)])
def test_synthetic_command_cannot_target_production(monkeypatch, test_host, allowed):
    import sys
    from tools import neon_database
    monkeypatch.setenv('DATABASE_URL', 'postgresql://synthetic:synthetic@production.invalid/neondb')
    monkeypatch.setenv('TEST_DATABASE_URL', f'postgresql://synthetic:synthetic@{test_host}/neondb')
    monkeypatch.setattr(neon_database, 'load_dotenv', lambda *args, **kwargs: None)
    monkeypatch.setattr(neon_database.neon_branch_guard, 'verify', Mock(return_value={}))
    monkeypatch.setattr(sys, 'argv', ['neon_database', 'synthetic'])
    run = Mock(return_value=0)
    monkeypatch.setattr(pytest, 'main', run)
    assert neon_database.main() == (0 if allowed else 2)
    assert run.called == allowed
