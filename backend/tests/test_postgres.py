"""Configuration checks plus opt-in, isolated live PostgreSQL integration."""
import os
import ssl
import uuid
from unittest.mock import Mock
import pytest
from db import postgres, store


@pytest.mark.parametrize('url', [
    'sqlite:///local.db', 'postgresql://u:p@host/db?sslmode=require',
    'postgresql://u:p@host/db?sslmode=disable',
    'postgresql://u:p@host/db?channel_binding=disable',
    'postgresql://u:p@host/db?options=unsafe',
])
def test_reject_unsupported_or_unverified_tls(monkeypatch, url):
    monkeypatch.setenv('DATABASE_URL', url)
    with pytest.raises(RuntimeError) as error:
        postgres.options()
    assert url not in str(error.value)


def test_certificate_hostname_verification_and_url_decoding(monkeypatch):
    monkeypatch.setenv('DATABASE_URL', 'postgresql://synthetic:p%40ss@host/db?sslmode=verify-full')
    options = postgres.options()
    assert options['ssl_context'].verify_mode == ssl.CERT_REQUIRED
    assert options['ssl_context'].check_hostname
    assert options['password'] == 'p@ss'
    assert options['require_channel_binding']


@pytest.mark.parametrize('fail', [False, True])
def test_transaction_lifecycle(monkeypatch, fail):
    monkeypatch.setenv('DATABASE_URL', 'postgresql://synthetic:p@host/db')
    raw = Mock()
    monkeypatch.setattr(postgres, 'connect', Mock(return_value=raw))
    try:
        with postgres.connection():
            if fail:
                raise ValueError('synthetic')
    except ValueError:
        pass
    assert raw.close.call_count == 1
    assert raw.rollback.call_count == int(fail)
    assert raw.commit.call_count == int(not fail)


def test_live_postgres_synthetic_schema(monkeypatch):
    url = os.environ.get('TEST_DATABASE_URL')
    if not url:
        pytest.skip('TEST_DATABASE_URL is not configured; no live PostgreSQL claims')
    from dotenv import dotenv_values
    from pathlib import Path
    from urllib.parse import urlsplit
    production = dotenv_values(Path(__file__).resolve().parents[1] / '.env', interpolate=False).get('DATABASE_URL', '')
    production_host = urlsplit(production).hostname
    test_host = urlsplit(url).hostname
    if not test_host or (production_host and test_host.replace('-pooler', '') == production_host.replace('-pooler', '')):
        pytest.fail('Production endpoint forbidden for synthetic integration tests', pytrace=False)
    from tools.neon_branch_guard import verify
    test_values = dotenv_values(Path(__file__).resolve().parents[1] / '.env.test', interpolate=False)
    key = os.environ.get('NEON_API_KEY') or test_values.get('NEON_API_KEY', '')
    try:
        verify(url, production, key)
    except Exception:
        pytest.fail('Neon API branch verification failed; no schema writes authorized', pytrace=False)
    monkeypatch.setenv('DATABASE_URL', url)
    schema = 'synthetic_' + uuid.uuid4().hex
    connect = postgres.connect
    admin = connect(**postgres.options())
    admin.cursor().execute(f'CREATE SCHEMA {schema}')
    admin.commit()

    def isolated(**options):
        raw = connect(**options)
        raw.cursor().execute(f'SET search_path TO {schema}')
        raw.commit()
        return raw

    monkeypatch.setattr(postgres, 'connect', isolated)
    try:
        postgres.initialize()
        postgres.initialize()
        postgres.check()
        from fastapi.testclient import TestClient
        import runpy
        monkeypatch.setenv('AAROGYAVAANI_ALLOWED_HOSTS', 'synthetic.example.test')
        app = runpy.run_path('api/index.py')['app']
        with TestClient(app, base_url='https://synthetic.example.test') as client:
            assert client.get('/v1/ready').status_code == 200
            identity = client.post('/v1/devices', json={'timezone': 'Asia/Kolkata'})
            assert identity.status_code == 201
            headers = {'Authorization': 'Bearer ' + identity.json()['token']}
            assert store.authenticate(identity.json()['token'])['user_id'] == identity.json()['user_id']
            # Remote TLS connections can cross a minute boundary. Keep the rate
            # bucket deterministic; the nested clock below still proves reset.
            monkeypatch.setattr(store.time, 'time', lambda: 60)
            assert store.allow('synthetic-rate', limit=2)
            assert store.allow('synthetic-rate', limit=2)
            assert not store.allow('synthetic-rate', limit=2)
            with monkeypatch.context() as clock:
                clock.setattr(store.time, 'time', lambda: 120)
                assert store.allow('synthetic-rate', limit=2)
            from concurrent.futures import ThreadPoolExecutor
            with ThreadPoolExecutor(max_workers=3) as pool:
                assert sum(pool.map(lambda _: store.allow('synthetic-concurrent-rate', limit=3), range(6))) == 3
            response = client.post('/v1/reminders', headers=headers, json={
                'medicine': 'Synthetic only', 'times': ['08:00'], 'confirmed': True})
            assert response.status_code == 201
            rid = response.json()['id']
            other = store.register('Asia/Kolkata')
            assert store.get(other['user_id'], rid) is None
            assert client.get('/v1/languages', headers=headers).status_code == 200
            assert client.get('/v1/help', headers=headers).status_code == 200
            assert client.post('/v1/analyze', headers=headers, json={
                'text': 'remind me to take paracetamol every day at 8 am', 'ui_language': 'en'}).status_code == 200
            assert len(client.get('/v1/reminders', headers=headers).json()) == 1
            event = {'type': 'taken', 'scheduled_for': '2026-10-19T02:30:00Z'}
            first = client.post(f'/v1/reminders/{rid}/events', headers=headers, json=event)
            second = client.post(f'/v1/reminders/{rid}/events', headers=headers, json=event)
            assert first.status_code == second.status_code == 201
            assert first.json() == second.json()
            for event_type in ('skipped', 'snoozed'):
                tracked = client.post(f'/v1/reminders/{rid}/events', headers=headers,
                                      json={**event, 'type': event_type})
                assert tracked.status_code == 201
            def retry_event(_):
                return client.post(f'/v1/reminders/{rid}/events', headers=headers, json=event).json()['id']
            with ThreadPoolExecutor(max_workers=3) as pool:
                assert set(pool.map(retry_event, range(3))) == {first.json()['id']}
            assert client.patch(f'/v1/reminders/{rid}', headers=headers, json={'times': ['09:00']}).status_code == 200
            assert client.delete(f'/v1/reminders/{rid}', headers=headers).status_code == 200
            assert client.get('/v1/reminders', headers=headers).json() == []
            assert client.patch(f'/v1/reminders/{rid}', headers=headers, json={'status': 'active'}).status_code == 404
            assert store.update(identity.json()['user_id'], rid, {**response.json(), 'status': 'active'}) is None
            with store.connection() as conn:
                assert conn.execute('SELECT status FROM reminders WHERE id=?', (rid,)).fetchone()[0] == 'deleted'
            assert client.delete('/v1/me', headers=headers).status_code == 200
            assert store.authenticate(identity.json()['token']) is None
            with store.connection() as conn:
                assert conn.execute('SELECT COUNT(*) FROM dose_events').fetchone()[0] == 0
            survivor = store.save(other['user_id'], response.json())
            with pytest.raises(postgres.pg8000.dbapi.DatabaseError):
                with store.connection() as conn:
                    conn.execute('INSERT INTO reminder_log(reminder_id,scheduled_for) VALUES(?,?)', (survivor['id'], 'synthetic-valid-before-error'))
                    conn.execute('INSERT INTO reminder_log(reminder_id,scheduled_for) VALUES(?,?)', (-1, 'synthetic'))
            with store.connection() as conn:
                assert conn.execute('SELECT COUNT(*) FROM reminder_log').fetchone()[0] == 0
    finally:
        admin.cursor().execute(f'DROP SCHEMA {schema} CASCADE')
        admin.commit()
        admin.close()


def test_vercel_forbids_sqlite_fallback(monkeypatch):
    import runpy
    monkeypatch.delenv('DATABASE_URL', raising=False)
    with pytest.raises(RuntimeError, match='DATABASE_URL required'):
        runpy.run_path('api/index.py')


def test_postgres_production_failure_is_redacted(monkeypatch):
    from deployment.server import checked_database
    monkeypatch.setenv('DATABASE_URL', 'postgresql://synthetic:p@host/db')
    def fail():
        raise ValueError('synthetic-private-detail')
    monkeypatch.setattr(postgres, 'check', fail)
    with pytest.raises(RuntimeError) as error:
        checked_database()
    assert str(error.value) == 'PostgreSQL connectivity or schema check failed'


def test_inventory_does_not_write_or_expose_rows(tmp_path):
    import sqlite3
    from tools.sqlite_inventory import inventory
    path = tmp_path / 'inventory.db'
    with sqlite3.connect(path) as conn:
        conn.execute('CREATE TABLE reminders(id INTEGER PRIMARY KEY, medicine TEXT, status TEXT)')
        conn.execute("INSERT INTO reminders VALUES(1,'synthetic-private-detail','deleted')")
    result = inventory(path)
    assert result['file_hash_unchanged']
    assert result['tables']['reminders']['soft_deleted_rows'] == 1
    assert 'synthetic-private-detail' not in str(result)
