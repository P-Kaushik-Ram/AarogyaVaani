"""Synthetic regressions from Motorola dictation; no golden/training edits."""
import importlib
import pytest
from fastapi.testclient import TestClient
from main import app
from pipeline.analyze import analyze
from pipeline.clock import canonical_marker
from pipeline.english import is_shorthand, normalize
from pipeline.extract import extract


MARKERS = [
    ('pm', '22:00'), ('PM', '22:00'), ('p.m.', '22:00'),
    ('p. m.', '22:00'), ('P. M.', '22:00'), ('p . m .', '22:00'),
    ('p.m', '22:00'), ('p m', '22:00'), ('p.\u00a0m.', '22:00'),
    ('am', '10:00'), ('AM', '10:00'), ('a.m.', '10:00'),
    ('a. m.', '10:00'), ('A. M.', '10:00'), ('a . m .', '10:00'),
    ('a.m', '10:00'), ('a m', '10:00'), ('a.\u202fm.', '10:00'),
]
CLOCKS = [
    ('10:30 p.m.', '22:30'), ('10 : 30 P. M.', '22:30'),
    ('8 p.m.', '20:00'), ('12 a.m.', '00:00'), ('12 p.m.', '12:00'),
    ('12:30 a.m.', '00:30'), ('12:30 p. m.', '12:30'), ('1 a.m.', '01:00'),
]
MOTOROLA = [
    ('remind calcium 10 p.m. daily', 'calcium', '22:00'),
    ('remind Vitamin C 10 p.m. daily', 'vitamin c', '22:00'),
]


def assert_complete(result, medicine, time):
    assert result['intent'] == 'add_reminder'
    assert result['safety'] == {'triggered': False, 'reason': None}
    assert result['draft'] == {
        'medicine': medicine, 'times': [time], 'days_of_week': 'daily', 'note': None,
    }
    assert result['missing'] == []
    assert result['candidates'] == {}


@pytest.mark.parametrize('marker,time', MARKERS)
@pytest.mark.parametrize('prefix', ['remind calcium', 'Calcium'])
def test_equivalent_markers_in_commands_and_bounded_shorthand(prefix, marker, time):
    text = f'{prefix} 10 {marker} daily'
    assert_complete(analyze(text), 'calcium', time)
    draft, missing, _ = extract(text, 'en')
    assert draft['medicine'] == 'calcium'
    assert draft['times'] == [time]
    assert missing == []


@pytest.mark.parametrize('clock,time', CLOCKS)
@pytest.mark.parametrize('prefix', ['remind calcium', 'Calcium'])
def test_minutes_midnight_noon_and_morning_evening(prefix, clock, time):
    assert_complete(analyze(f'{prefix} {clock} daily'), 'calcium', time)


@pytest.mark.parametrize('text', [
    'Calcium, 10 p.m., daily.', 'Calcium 10 p.m., daily',
    'Calcium at 10 p.m. every day.', 'Calcium\t10\tp.\tm.\tdaily',
    'Calcium\n10 P.\nM.\nevery day', 'Calcium\u00a010\u202fp.m.\u00a0daily',
])
def test_transcription_whitespace_and_bounded_separator_punctuation(text):
    assert is_shorthand(text)
    assert_complete(analyze(text), 'calcium', '22:00')


@pytest.mark.parametrize('name', ['amlodipine', 'amoxicillin', 'ampicillin', 'diazepam', 'vitamin b12'])
def test_medicine_letters_and_digits_are_not_time_markers(name):
    assert_complete(analyze(f'{name} 10 p.m. daily'), name, '22:00')
    result = analyze(f'remind {name} daily')
    assert result['draft']['medicine'] == name
    assert result['draft']['times'] == []
    assert 'time' in result['missing']


@pytest.mark.parametrize('marker,expected', [
    ('P. M.', 'pm'), ('a . m .', 'am'), (None, None),
    ('amoxicillin', 'amoxicillin'), ('diazepam', 'diazepam'),
    ('மணிக்கு', 'மணிக்கு'), ('बजे', 'बजे'),
])
def test_normalization_only_canonicalizes_a_captured_meridiem(marker, expected):
    assert canonical_marker(marker) == expected


def test_safety_classifier_and_medicine_extraction_receive_original_normalized_text(monkeypatch):
    module = importlib.import_module('pipeline.analyze')
    text = '  Remind Vitamin C 10 P. M. daily  '
    observed = {}
    for name in ('classify', 'command', 'triggered', 'extract'):
        original = getattr(module, name)

        def spy(value, *args, _original=original, _name=name, **kwargs):
            observed.setdefault(_name, []).append(value)
            return _original(value, *args, **kwargs)

        monkeypatch.setattr(module, name, spy)
    result = module.analyze(text)
    assert_complete(result, 'vitamin c', '22:00')
    assert normalize(text) == 'remind vitamin c 10 p. m. daily'
    for values in observed.values():
        assert values and all(value == normalize(text) for value in values)


MEDICAL = [
    'Should I take Calcium at 10 p.m.?',
    'Remind me if I should take Calcium at 10 p.m. daily',
    'Calcium 10 p.m. daily and can I double my dose?',
    'Set a reminder for Calcium at 10 p.m. and tell me if it is safe',
    'How many Calcium tablets should I take at 10 a.m.?',
]
UNRELATED = [
    'I bought Calcium at 10 p.m.', 'The Calcium shipment arrives at 10 p.m.',
    'Calcium 10 p.m. daily and the weather', 'Calcium at 10 p.m. daily?',
    'CalciumX at 10 p.m. daily', 'My exam is at 10 p.m. daily',
]


@pytest.mark.parametrize('text', MEDICAL + UNRELATED)
def test_safety_and_unrelated_text_do_not_gain_drafts(text):
    assert not is_shorthand(text)
    result = analyze(text)
    assert result['safety']['triggered']
    assert result['draft'] is None


INCOMPLETE = [
    ('remind me at 10 p.m. daily', 'medicine'),
    ('remind calcium daily', 'time'),
    ('Calcium 10 p.m.', 'frequency'),
    ('remind calcium at 10 daily', 'time_ambiguous'),
    ('remind calcium 10 daily', 'time'),
    ('remind calcium 25 p.m. daily', 'time_invalid'),
    ('remind calcium 0 a.m. daily', 'time_invalid'),
    ('remind calcium 10:60 p.m. daily', 'time_invalid'),
    ('remind calcium tomorrow at 10 p.m. daily', 'date'),
    ('remind calcium on 2026-10-22 at 10 p.m. daily', 'date'),
    ('remind calcium at 10 p.m. Mondays', 'frequency'),
    ('remind calcium every other day at 10 p.m.', 'frequency'),
    ('remind calcium 10 amoxicillin daily', 'time'),
    ('remind calcium 10 pmol daily', 'time'),
]


@pytest.mark.parametrize('text,missing', INCOMPLETE)
def test_incomplete_ambiguous_invalid_and_unrepresentable_reminders_stay_blocked(text, missing):
    result = analyze(text)
    assert result['intent'] == 'add_reminder'
    assert missing in result['missing']
    if missing in ('date', 'frequency'):
        assert result['draft']['days_of_week'] is None
    if missing == 'time_ambiguous':
        assert result['draft']['times'] == []
        assert result['candidates']['times'] == ['10:00', '22:00']


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('AAROGYAVAANI_DB', str(tmp_path / 'p5_1.db'))
    with TestClient(app) as http:
        registration = http.post('/v1/devices', json={}).json()
        http.headers['Authorization'] = 'Bearer ' + registration['token']
        yield http


API_CASES = MOTOROLA + [
    (f'Calcium 10 {marker} daily', 'calcium', time) for marker, time in MARKERS
] + [(f'remind calcium {clock} daily', 'calcium', time) for clock, time in CLOCKS]


@pytest.mark.parametrize('mode', ['text', 'voice'])
@pytest.mark.parametrize('text,medicine,time', API_CASES)
def test_typed_and_speech_text_use_same_authenticated_analysis_without_saving(client, mode, text, medicine, time):
    response = client.post('/v1/analyze', json={'text': text, 'input_mode': mode})
    assert response.status_code == 200
    result = response.json()
    assert_complete(result, medicine, time)
    assert client.get('/v1/reminders').json() == []
    assert client.post('/v1/reminders', json=result['draft']).status_code == 422
    assert client.post('/v1/reminders', json={**result['draft'], 'confirmed': False}).status_code == 422
    assert client.get('/v1/reminders').json() == []


@pytest.mark.parametrize('mode', ['text', 'voice'])
@pytest.mark.parametrize('text,medicine,time', MOTOROLA)
def test_exact_phone_phrases_only_save_after_explicit_confirmation(client, mode, text, medicine, time):
    body = {'text': text, 'input_mode': mode}
    result = client.post('/v1/analyze', json=body).json()
    assert_complete(result, medicine, time)
    assert client.get('/v1/reminders').json() == []
    saved = client.post('/v1/reminders', json={**result['draft'], 'confirmed': True})
    assert saved.status_code == 201
    assert saved.json()['times'] == ['22:00']
    client.post('/v1/analyze', json=body)
    assert len(client.get('/v1/reminders').json()) == 1


@pytest.mark.parametrize('mode', ['text', 'voice'])
def test_api_safety_and_incomplete_rejections_preserved_for_both_origins(client, mode):
    for text in MEDICAL:
        result = client.post('/v1/analyze', json={'text': text, 'input_mode': mode}).json()
        assert result['safety']['triggered']
        assert result['draft'] is None
    for text, missing in INCOMPLETE[:12]:
        response = client.post('/v1/analyze', json={'text': text, 'input_mode': mode})
        assert response.status_code == 200
        result = response.json()
        assert missing in result['missing']
        # Submit all unresolved fields as returned; strict persistence still rejects.
        assert client.post('/v1/reminders', json={**result['draft'], 'confirmed': True}).status_code == 422
    assert client.get('/v1/reminders').json() == []
