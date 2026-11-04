"""Reliability contracts, exclusively in tmp_path SQLite via in-process ASGI."""
from concurrent.futures import ThreadPoolExecutor
import pytest
from fastapi.testclient import TestClient
from main import app
from db import store


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('AAROGYAVAANI_DB', str(tmp_path / 'p14-synthetic.db'))
    with TestClient(app) as http:
        yield http


def identity(client, timezone='Asia/Kolkata'):
    result = client.post('/v1/devices', json={'timezone': timezone})
    assert result.status_code == 201
    return {'Authorization': 'Bearer ' + result.json()['token']}


def body(**changes):
    return dict(medicine='P14 Synthetic', times=['08:00'], confirmed=True, **changes)


@pytest.mark.parametrize('name,times', [
    ('P14 Morning', ['08:00']), ('P14 Afternoon', ['13:00']),
    ('P14 Evening', ['21:00']), ('P14 Multiple', ['21:00', '08:00', '13:00']),
    ('P14 Midnight Ω B12', ['23:59', '00:00']),
])
def test_create_and_reopen_preserve_independent_rows(client, name, times):
    headers = identity(client)
    original = client.post('/v1/reminders', headers=headers, json=body()).json()
    result = client.post('/v1/reminders', headers=headers,
                         json={'medicine': name, 'times': times, 'confirmed': True})
    assert result.status_code == 201
    saved = result.json()
    assert saved['times'] == sorted(times) and saved['timezone'] == 'Asia/Kolkata'
    assert saved['id'] != original['id']
    # store.connection opens and closes an actual SQLite connection on every call.
    with TestClient(app) as reopened:
        rows = reopened.get('/v1/reminders', headers=headers).json()
        assert rows == [original, saved]


@pytest.mark.parametrize('change', [
    {'medicine': ''}, {'medicine': '   '}, {'times': []}, {'times': ['24:00']},
    {'times': ['12:60']}, {'times': ['8 pm']}, {'times': ['8:00']},
    {'times': ['08:00', '08:00']}, {'confirmed': False}, {'confirmed': None},
    {'dosage': '-2 tablets'}, {'timezone': 'Invalid/Zone'},
    {'days_of_week': []}, {'days_of_week': [0, 8]},
])
def test_invalid_create_does_not_overwrite_existing(client, change):
    headers = identity(client)
    original = client.post('/v1/reminders', headers=headers, json=body()).json()
    result = client.post('/v1/reminders', headers=headers, json={**body(), **change})
    assert result.status_code == 422
    assert client.get('/v1/reminders', headers=headers).json() == [original]


def test_missing_confirmation_and_medicine_are_rejected(client):
    headers = identity(client)
    for field in ('confirmed', 'medicine'):
        data = body()
        del data[field]
        assert client.post('/v1/reminders', headers=headers, json=data).status_code == 422
    assert client.get('/v1/reminders', headers=headers).json() == []


@pytest.mark.parametrize('zone', ['Asia/Kolkata', 'America/New_York', 'Pacific/Honolulu'])
def test_saved_timezone_is_explicit_and_survives_connection_reopen(client, zone):
    headers = identity(client, zone)
    result = client.post('/v1/reminders', headers=headers, json=body())
    assert result.status_code == 201
    assert result.json()['timezone'] == zone
    assert client.get('/v1/reminders', headers=headers).json()[0] == result.json()


def test_edit_and_soft_cancel_preserve_tracking_and_other_reminders(client):
    headers = identity(client)
    first = client.post('/v1/reminders', headers=headers, json=body()).json()
    other = client.post('/v1/reminders', headers=headers, json=body()).json()
    rid = first['id']
    event = {'type': 'taken', 'scheduled_for': '2026-10-19T08:00:00+05:30'}
    recorded = client.post(f'/v1/reminders/{rid}/events', headers=headers, json=event).json()
    edited = client.patch(f'/v1/reminders/{rid}', headers=headers,
                          json={'times': ['13:00', '21:00']})
    assert edited.status_code == 200 and edited.json()['id'] == rid
    assert client.delete(f'/v1/reminders/{rid}', headers=headers).status_code == 200
    assert client.get('/v1/reminders', headers=headers).json() == [other]
    assert client.delete(f'/v1/reminders/{rid}', headers=headers).status_code == 404
    with store.connection() as connection:
        assert dict(connection.execute('SELECT * FROM dose_events WHERE id=?', (recorded['id'],)).fetchone()) == recorded
        assert connection.execute('SELECT status FROM reminders WHERE id=?', (rid,)).fetchone()[0] == 'deleted'


def test_simultaneous_dose_events_and_timezone_equivalent_retries_are_idempotent(client):
    headers = identity(client)
    rid = client.post('/v1/reminders', headers=headers, json=body()).json()['id']
    moments = ['2026-10-19T08:00:00+05:30', '2026-10-19T02:30:00Z'] * 3
    def submit(moment):
        response = client.post(f'/v1/reminders/{rid}/events', headers=headers,
                               json={'type': 'taken', 'scheduled_for': moment})
        assert response.status_code == 201
        return response.json()['id']
    with ThreadPoolExecutor(max_workers=3) as pool:
        assert len(set(pool.map(submit, moments))) == 1
    with store.connection() as connection:
        assert connection.execute('SELECT COUNT(*) FROM dose_events').fetchone()[0] == 1


def test_auth_and_missing_ids_do_not_erase_existing_data(client):
    headers = identity(client)
    original = client.post('/v1/reminders', headers=headers, json=body()).json()
    assert client.get('/v1/reminders', headers={'Authorization': 'Bearer synthetic-invalid'}).status_code == 401
    for method in ('delete', 'patch'):
        kwargs = {'json': {'times': ['09:00']}} if method == 'patch' else {}
        assert getattr(client, method)('/v1/reminders/999999', headers=headers, **kwargs).status_code == 404
    assert client.post('/v1/reminders/999999/events', headers=headers,
                       json={'type': 'taken', 'scheduled_for': '2026-10-19T02:30:00Z'}).status_code == 404
    assert client.get('/v1/reminders', headers=headers).json() == [original]


def test_create_endpoint_has_no_server_idempotency_contract(client):
    # Characterization: separate confirmed POSTs are separate records. UI lock and
    # persistent uncertain-save marker are essential; automatic write retry is unsafe.
    headers = identity(client)
    first = client.post('/v1/reminders', headers=headers, json=body())
    second = client.post('/v1/reminders', headers=headers, json=body())
    assert first.status_code == second.status_code == 201
    assert first.json()['id'] != second.json()['id']
    assert len(client.get('/v1/reminders', headers=headers).json()) == 2
