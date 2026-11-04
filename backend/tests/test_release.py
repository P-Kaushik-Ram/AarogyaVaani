"""Release checks use only synthetic databases and in-process HTTP."""
import hashlib
import sqlite3
import pytest
from fastapi.testclient import TestClient
from db import store
from deployment.server import checked_database, configured_app


@pytest.fixture
def production(tmp_path, monkeypatch):
    path = tmp_path / 'release-synthetic.db'
    monkeypatch.setenv('AAROGYAVAANI_DB', str(path))
    monkeypatch.setenv('AAROGYAVAANI_ALLOWED_HOSTS', 'release.example')
    with store.connection():
        pass
    return path


def test_production_rejects_missing_database_without_creating_it(tmp_path, monkeypatch):
    path = tmp_path / 'missing.db'
    monkeypatch.setenv('AAROGYAVAANI_DB', str(path))
    with pytest.raises(RuntimeError, match='existing absolute'):
        checked_database()
    assert not path.exists()


def test_production_rejects_relative_and_legacy_database(tmp_path, monkeypatch):
    monkeypatch.setenv('AAROGYAVAANI_DB', 'relative.db')
    with pytest.raises(RuntimeError):
        checked_database()
    path = tmp_path / 'legacy.db'
    with sqlite3.connect(path) as connection:
        connection.execute('CREATE TABLE users(id INTEGER)')
    monkeypatch.setenv('AAROGYAVAANI_DB', str(path))
    with pytest.raises(RuntimeError, match='schema'):
        checked_database()


@pytest.mark.parametrize('hosts', ['', '*', '*.example', 'https://release.example', 'release.example:443'])
def test_production_requires_exact_host_allowlist(production, monkeypatch, hosts):
    monkeypatch.setenv('AAROGYAVAANI_ALLOWED_HOSTS', hosts)
    with pytest.raises(RuntimeError, match='Exact'):
        configured_app()


def test_readiness_is_readonly_host_restricted_and_fails_closed(production):
    before = hashlib.sha256(production.read_bytes()).hexdigest()
    with TestClient(configured_app(), base_url='https://release.example') as client:
        assert client.get('/v1/ready').json() == {'status': 'ready'}
        assert client.get('/v1/health').status_code == 200
        assert client.get('/v1/ready', headers={'Host': 'attacker.example'}).status_code == 400
        assert client.get('/v1/reminders').status_code == 401
        assert 'access-control-allow-origin' not in client.options('/v1/reminders', headers={
            'Origin': 'https://attacker.example', 'Access-Control-Request-Method': 'GET'}).headers
        assert hashlib.sha256(production.read_bytes()).hexdigest() == before
        # Replacement is simulated only on the temporary test file.
        production.rename(production.with_suffix('.retained'))
        assert client.get('/v1/ready').status_code == 503
        assert client.post('/v1/devices', json={'timezone': 'Asia/Kolkata'}).status_code == 503
        assert not production.exists()


def test_active_filter_and_identity_do_not_erase_soft_deleted_records(production):
    first, second = store.register('Asia/Kolkata'), store.register('Asia/Kolkata')
    data = dict(medicine='Release synthetic', times=['00:00'], days_of_week='daily',
                note=None, status='active', language='en', timezone='Asia/Kolkata')
    cancelled = store.save(first['user_id'], data)
    active = store.save(first['user_id'], {**data, 'times': ['22:00']})
    foreign = store.save(second['user_id'], data)
    store.delete(first['user_id'], cancelled['id'])
    with store.connection() as connection:
        original = [tuple(row) for row in connection.execute('SELECT * FROM reminders ORDER BY id')]
    assert store.listing(first['user_id']) == [active]
    assert store.listing(second['user_id']) == [foreign]
    assert store.authenticate(first['token'])['user_id'] == first['user_id']
    assert store.authenticate('release-invalid-token') is None
    with store.connection() as connection:
        assert original == [tuple(row) for row in connection.execute('SELECT * FROM reminders ORDER BY id')]
        assert connection.execute('SELECT status FROM reminders WHERE id=?', (cancelled['id'],)).fetchone()[0] == 'deleted'
