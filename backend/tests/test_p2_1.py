"""P2.1 synthetic reliability regressions; frozen P0 golden files remain unchanged."""
import pytest
from fastapi.testclient import TestClient
from main import app
from pipeline.analyze import analyze
from pipeline.classify import classify
from pipeline.english import is_shorthand
from pipeline.packs import load


SHORT = [
    ('Calcium at 10am', 'calcium', '10:00', ['frequency']),
    ('Calcium 10am', 'calcium', '10:00', ['frequency']),
    ('Calcium 10am daily', 'calcium', '10:00', []),
    ('Metformin at 8pm', 'metformin', '20:00', ['frequency']),
    ('Metformin 8 pm every day', 'metformin', '20:00', []),
    ('Vitamin D at 9 AM', 'vitamin d', '09:00', ['frequency']),
    ('Paracetamol tomorrow at 7pm', 'paracetamol', '19:00', ['date', 'frequency']),
    ('Remind me about Calcium at 10am', 'calcium', '10:00', ['frequency']),
    ('Set a reminder for Calcium at 10am', 'calcium', '10:00', ['frequency']),
    ('Remind me to take Calcium at 10 AM every day', 'calcium', '10:00', []),
]

MEDICAL = [
    'Should I take Calcium at 10am?', 'Can I double my Calcium dose?',
    'Is Metformin safe for me?', 'Should I stop taking my medicine?',
    'How many Calcium tablets should I take?', 'Can I take two tablets instead of one?',
    'Remind me if I should take Calcium at 10am daily',
    'Calcium 10am daily and can I double my dose?',
    'Set a reminder for Calcium at 10am and tell me if it is safe',
    'Should\tI take Calcium at 10am?',
]


@pytest.mark.parametrize('text,medicine,time,missing', SHORT)
def test_short_and_complete(text, medicine, time, missing):
    result = analyze(text)
    assert result['intent'] == 'add_reminder'
    assert result['safety'] == {'triggered': False, 'reason': None}
    assert result['draft']['medicine'] == medicine
    assert result['draft']['times'] == [time]
    assert result['missing'] == missing
    assert result['draft']['days_of_week'] == (None if missing else 'daily')


@pytest.mark.parametrize('name', load('en')['medicines']['names'])
def test_all_installed_english_names_generalize(name):
    result = analyze(f'{name} at 10am daily')
    assert result['intent'] == 'add_reminder'
    assert result['draft']['medicine'] == name
    assert result['draft']['times'] == ['10:00']
    assert result['missing'] == []


@pytest.mark.parametrize('text', [
    '  CALCIUM   at   10AM  daily  ', 'calcium\tat\t10\tam\tdaily',
    'Calcium\nat 10 AM\nevery day', 'Calcium\u00a0at\u00a010am\u00a0daily',
    'Calcium 10 am Daily', 'Calcium at 10 AM every day.',
])
def test_normalization(text):
    result = analyze(text)
    assert result['intent'] == 'add_reminder'
    assert result['draft'] == {'medicine': 'calcium', 'times': ['10:00'], 'days_of_week': 'daily', 'note': None}
    assert result['missing'] == []


@pytest.mark.parametrize('text', MEDICAL)
def test_medical_safety_precedes_shorthand_or_explicit_commands(text):
    result = analyze(text)
    assert result['intent'] == 'out_of_scope'
    assert result['safety']['triggered']
    assert result['draft'] is None


@pytest.mark.parametrize('text', [
    'Calcium', 'I bought Calcium at 10am', 'The Calcium shipment arrives at 10am',
    'Calcium costs 10 rupees', 'My exam is at 10am daily',
    'Calcium at 10am is printed on the box', 'Calcium 10am daily and the weather',
    'I read about Metformin 8 pm every day', 'CalciumX at 10am',
    'Calcium at 10am?', 'Is Calcium at 10am a good idea?',
])
def test_mentions_and_unrelated_prose_never_create_drafts(text):
    assert not is_shorthand(text)
    result = analyze(text)
    assert result['intent'] != 'add_reminder'
    assert result['draft'] is None


@pytest.mark.parametrize('text,field', [
    ('remind me at 10am daily', 'medicine'),
    ('remind me calcium daily', 'time'),
    ('Calcium daily', 'time'),
    ('Calcium at 10 daily', 'time_ambiguous'),
    ('Calcium at 25:00 daily', 'time_invalid'),
    ('Calcium at 10am', 'frequency'),
    ('Remind me calcium at 10am Mondays', 'frequency'),
    ('Remind me calcium every other day at 10am', 'frequency'),
    ('Remind me calcium tomorrow at 10am daily', 'date'),
    ('Remind me calcium on 2026-10-22 at 10am daily', 'date'),
])
def test_missing_ambiguous_and_unrepresentable_fields(text, field):
    result = analyze(text)
    assert result['intent'] == 'add_reminder'
    assert field in result['missing']
    if field in ('date', 'frequency'):
        assert result['draft']['days_of_week'] is None


@pytest.mark.parametrize('lang,text', [
    ('hi', 'क्या मैं मेटफॉर्मिन की खुराक बढ़ा सकता हूँ?'),
    ('ta', 'மெட்ஃபார்மின் பக்க விளைவுகள் என்ன?'),
    ('hi', 'Calcium 10am daily क्या मैं खुराक बढ़ा सकता हूँ?'),
    ('ta', 'Calcium 10am daily எடுக்கலாமா'),
])
def test_hindi_tamil_and_mixed_safety(lang, text):
    result = analyze(text, lang)
    assert result['safety']['triggered']
    assert result['draft'] is None


@pytest.mark.parametrize('lang,text', [('ml', 'മലയാളം'), ('kn', 'ಕನ್ನಡ'), ('te', 'తెలుగు')])
def test_bare_language_names_are_not_reminder_commands(lang, text):
    result = analyze(text, lang)
    assert result['detected_language'] == lang
    assert result['intent'] == 'unsupported_language'
    assert result['draft'] is None


def test_model_probability_is_not_misrepresented_as_rule_confidence():
    _, probability = classify('calcium at 10am')
    assert analyze('Calcium at 10am')['confidence'] == probability


def test_legacy_adapter_does_not_gain_a_new_shorthand_autocommit_path():
    assert analyze('Calcium at 10am', require_recurrence=False)['intent'] == 'out_of_scope'
    assert analyze('remind me calcium at 10am', require_recurrence=False)['missing'] == []


def test_authenticated_analyze_is_pure_and_commit_stays_explicit(tmp_path, monkeypatch):
    monkeypatch.setenv('AAROGYAVAANI_DB', str(tmp_path / 'p2_1.db'))
    with TestClient(app) as client:
        assert client.post('/v1/analyze', json={'text': 'Calcium at 10am'}).status_code == 401
        registration = client.post('/v1/devices', json={}).json()
        headers = {'Authorization': 'Bearer ' + registration['token']}
        assert client.post('/v1/analyze', headers=headers, json={'text': 'Calcium at 10am', 'require_recurrence': False}).status_code == 422
        for _ in range(3):
            result = client.post('/v1/analyze', headers=headers, json={'text': 'Calcium at 10am'}).json()
            assert result['missing'] == ['frequency']
            assert client.get('/v1/reminders', headers=headers).json() == []
        # Null is an unresolved draft value, never a valid persisted schedule.
        assert client.post('/v1/reminders', headers=headers, json={**result['draft'], 'confirmed': True}).status_code == 422
        complete = client.post('/v1/analyze', headers=headers, json={'text': 'Calcium at 10am daily'}).json()
        for _ in range(3):
            assert client.post('/v1/reminders', headers=headers, json=complete['draft']).status_code == 422
        assert client.get('/v1/reminders', headers=headers).json() == []
        saved = client.post('/v1/reminders', headers=headers, json={**complete['draft'], 'confirmed': True})
        assert saved.status_code == 201
        for _ in range(3):
            client.post('/v1/analyze', headers=headers, json={'text': 'Calcium at 10am daily'})
        assert len(client.get('/v1/reminders', headers=headers).json()) == 1
        for text in MEDICAL[:6]:
            response = client.post('/v1/analyze', headers=headers, json={'text': text})
            assert response.status_code == 200
            assert response.json()['draft'] is None
        assert len(client.get('/v1/reminders', headers=headers).json()) == 1
