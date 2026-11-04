"""Synthetic ASGI deployment tests. No environment file or real Neon access."""
import runpy
import sqlite3
from contextlib import contextmanager
from unittest.mock import Mock
import pytest
from fastapi.testclient import TestClient
from db import store, postgres


@pytest.fixture
def cloud(tmp_path, monkeypatch):
    path = tmp_path / 'cloud-synthetic.db'
    with sqlite3.connect(path) as conn:
        conn.executescript(store.SCHEMA)
    @contextmanager
    def synthetic():
        conn = sqlite3.connect(path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA foreign_keys=ON')
        try:
            with conn:
                yield conn
        finally:
            conn.close()
    def ready():
        with sqlite3.connect(path.as_uri() + '?mode=ro', uri=True) as conn:
            conn.execute('PRAGMA query_only=ON')
            assert conn.execute('SELECT 1').fetchone()[0] == 1
    monkeypatch.setenv('DATABASE_URL', 'postgresql://synthetic:synthetic@invalid/neondb?sslmode=verify-full&channel_binding=require')
    monkeypatch.setenv('AAROGYAVAANI_ALLOWED_HOSTS', 'synthetic.example.test')
    monkeypatch.setattr(postgres, 'connection', synthetic)
    monkeypatch.setattr(postgres, 'check', ready)
    return runpy.run_path('api/index.py')['app']


def test_import_is_database_free(monkeypatch):
    monkeypatch.setenv('DATABASE_URL', 'postgresql://synthetic:synthetic@invalid/neondb')
    monkeypatch.setenv('AAROGYAVAANI_ALLOWED_HOSTS', 'synthetic.example.test')
    check = Mock(side_effect=AssertionError('Import must not access database'))
    monkeypatch.setattr(postgres, 'check', check)
    assert runpy.run_path('api/index.py')['app'] is not None
    check.assert_not_called()


def test_cloud_routes_and_contracts_use_process_configuration(cloud):
    with TestClient(cloud, base_url='https://synthetic.example.test') as client:
        assert client.get('/v1/health').json() == {'status': 'ok', 'version': '0.1.0'}
        assert client.get('/v1/ready').json() == {'status': 'ready'}
        assert client.get('/v1/reminders').status_code == 401
        device = client.post('/v1/devices', json={'timezone': 'Asia/Kolkata'})
        assert device.status_code == 201
        headers = {'Authorization': 'Bearer ' + device.json()['token']}
        create = client.post('/v1/reminders', headers=headers, json={
            'medicine': 'Cloud synthetic only', 'times': ['08:00'], 'confirmed': True})
        assert create.status_code == 201
        rid = create.json()['id']
        assert client.get('/v1/reminders', headers=headers).json() == [create.json()]
        assert client.get('/v1/languages', headers=headers).status_code == 200
        assert client.get('/v1/help', headers=headers).status_code == 200
        assert client.post('/v1/analyze', headers=headers, json={
            'text': 'remind me to take paracetamol every day at 8 am', 'ui_language': 'en'}).status_code == 200
        assert client.patch(f'/v1/reminders/{rid}', headers=headers, json={'times': ['09:00']}).status_code == 200
        event = {'type': 'taken', 'scheduled_for': '2026-10-20T03:30:00Z'}
        assert client.post(f'/v1/reminders/{rid}/events', headers=headers, json=event).status_code == 201
        assert client.delete(f'/v1/reminders/{rid}', headers=headers).status_code == 200
        assert client.get('/v1/reminders', headers=headers).json() == []
        assert client.patch(f'/v1/reminders/{rid}', headers=headers, json={'status': 'active'}).status_code == 404
        assert client.delete('/v1/me', headers=headers).status_code == 200
        assert client.get('/v1/reminders', headers=headers).status_code == 401


def test_untrusted_host_rejected_before_database(cloud, monkeypatch):
    check = Mock(side_effect=RuntimeError('Database unavailable'))
    monkeypatch.setattr(postgres, 'check', check)
    with TestClient(cloud, base_url='https://untrusted.example') as client:
        assert client.get('/v1/health').status_code == 400
    check.assert_not_called()


def test_connection_failure_after_readiness_is_redacted(cloud, monkeypatch):
    @contextmanager
    def failure():
        raise postgres.pg8000.dbapi.InterfaceError('synthetic-sensitive-details')
        yield
    monkeypatch.setattr(postgres, 'connection', failure)
    with TestClient(cloud, base_url='https://synthetic.example.test') as client:
        response = client.post('/v1/devices', json={'timezone': 'Asia/Kolkata'})
        assert response.status_code == 503
        assert response.json() == {'status': 'unavailable'}


def test_schema_unavailable_fails_closed(cloud, monkeypatch):
    monkeypatch.setattr(postgres, 'check', Mock(side_effect=RuntimeError('Schema absent')))
    with TestClient(cloud, base_url='https://synthetic.example.test') as client:
        assert client.get('/v1/ready').status_code == 503
        assert client.post('/v1/devices', json={'timezone': 'Asia/Kolkata'}).status_code == 503
