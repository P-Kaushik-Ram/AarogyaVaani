"""P14.3: synthetic credentials and temporary databases only; no cloud access."""
import hashlib
import shutil
import sqlite3
import pytest
from fastapi.testclient import TestClient
from main import app
from db import store, cutover


@pytest.fixture
def source(tmp_path, monkeypatch):
    path = tmp_path/'source.db'
    monkeypatch.setenv('AAROGYAVAANI_DB', str(path))
    owner, other = store.register('Asia/Kolkata'), store.register('Asia/Kolkata')
    body = dict(medicine='Synthetic only', times=['08:00'], days_of_week='daily',
                note=None, status='active', language='en', timezone='Asia/Kolkata')
    active = store.save(owner['user_id'], body)
    deleted = store.save(owner['user_id'], body)
    store.save(owner['user_id'], {**body, 'status': 'paused'})
    store.save(other['user_id'], body)
    store.event(deleted['id'], {'scheduled_for': '2026-10-20T00:00:00+00:00', 'type': 'taken'})
    with store.connection() as conn:
        conn.execute('INSERT INTO reminder_log(reminder_id,scheduled_for) VALUES(?,?)', (deleted['id'], 'synthetic-log'))
    store.delete(owner['user_id'], deleted['id'])
    return path, owner, active, deleted


def test_manifest_is_authenticated_readonly_and_retains_deleted_history(source, monkeypatch):
    path, owner, active, deleted = source
    monkeypatch.setenv('AAROGYAVAANI_CUTOVER_READ_ONLY', '1')
    before = path.read_bytes()
    with TestClient(app) as client:
        assert client.get('/v1/cutover/identity').status_code == 401
        assert client.get('/v1/cutover/identity', headers={'Authorization': 'Bearer invalid-synthetic'}).status_code == 401
        response = client.get('/v1/cutover/identity', headers={'Authorization': 'Bearer '+owner['token']})
        assert response.status_code == 200
        manifest = response.json()
        assert manifest['counts'] == dict(devices=1, reminders=3, events=1, logs=1, deleted=1, paused=1)
        assert manifest['user_id'] == owner['user_id'] and manifest['writes_blocked']
        assert owner['token'] not in response.text and store.digest(owner['token']) not in response.text
        assert response.headers['cache-control'] == 'no-store'
        assert client.post('/v1/devices', json={'timezone': 'Asia/Kolkata'}).status_code == 503
        assert client.get('/v1/reminders', headers={'Authorization':'Bearer '+owner['token']}).status_code == 503
        assert client.delete(f'/v1/reminders/{active["id"]}', headers={'Authorization':'Bearer '+owner['token']}).status_code == 503
    assert path.read_bytes() == before


@pytest.mark.parametrize('table,statement', [
    ('devices', "UPDATE devices SET token_hash='synthetic-changed' WHERE user_id=?"),
    ('reminders', "UPDATE reminders SET status='active' WHERE user_id=? AND status='deleted'"),
    ('dose_events', "DELETE FROM dose_events WHERE reminder_id IN (SELECT id FROM reminders WHERE user_id=?)"),
    ('reminder_log', "DELETE FROM reminder_log WHERE reminder_id IN (SELECT id FROM reminders WHERE user_id=?)"),
])
def test_reconciliation_detects_auth_deleted_or_history_loss(source, tmp_path, monkeypatch, table, statement):
    path, owner, _, _ = source
    original = cutover.verification_snapshot()
    target = tmp_path/'target.db'
    shutil.copyfile(path, target)  # Closed synthetic DB only, never a real migration.
    monkeypatch.setenv('AAROGYAVAANI_DB', str(target))
    assert cutover.compare(original, cutover.verification_snapshot())['ok']
    with sqlite3.connect(target) as conn:
        conn.execute(statement, (owner['user_id'],))
    result = cutover.compare(original, cutover.verification_snapshot())
    assert not result['ok'] and table in result['differences']


def test_relationship_corruption_and_missing_sqlite_fail_closed(source, tmp_path, monkeypatch):
    path, owner, _, _ = source
    with sqlite3.connect(path) as conn:
        conn.execute('UPDATE reminders SET user_id=? WHERE user_id=?', ('orphan-synthetic', owner['user_id']))
    assert not cutover.verification_snapshot()['relationships_valid']
    missing = tmp_path/'absent.db'
    monkeypatch.setenv('AAROGYAVAANI_DB', str(missing))
    with pytest.raises(sqlite3.Error):
        cutover.identity('synthetic')
    assert not missing.exists()


def test_identity_digest_survives_copy_and_detects_changed_reminder(source, tmp_path, monkeypatch):
    path, owner, _, _ = source
    original = cutover.identity(owner['token'])
    target = tmp_path/'target.db'
    shutil.copyfile(path, target)
    monkeypatch.setenv('AAROGYAVAANI_DB', str(target))
    assert cutover.identity(owner['token']) == original
    with sqlite3.connect(target) as conn:
        conn.execute('UPDATE reminders SET note=? WHERE user_id=?', ('synthetic-change', owner['user_id']))
    assert cutover.identity(owner['token'])['digest'] != original['digest']
