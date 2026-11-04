"""Synthetic P13 fixtures. Every API write uses a fresh tmp_path database."""
import pytest
from fastapi.testclient import TestClient
from main import app
from pipeline.analyze import analyze
from pipeline.packs import installed, load

SAMPLES = {
 'en': ('remind me to take', 'daily', 'morning', 'night', 'at', 'eight', 'show my reminders', 'cancel', 'Should I double my dose?'),
 'hi': ('याद दिलाओ', 'रोज़', 'सुबह', 'रात', 'बजे', 'आठ', 'रिमाइंडर दिखाओ', 'रद्द', 'क्या मैं खुराक बढ़ा सकता हूँ?'),
 'ta': ('நினைவூட்டு', 'தினமும்', 'காலை', 'இரவு', 'மணிக்கு', 'எட்டு', 'நினைவூட்டல் காட்டு', 'ரத்து', 'மருந்தளவை அதிகரிக்கலாமா'),
 'ml': ('ഓർമ്മിപ്പിക്കൂ', 'ദിവസവും', 'രാവിലെ', 'രാത്രി', 'മണിക്ക്', 'എട്ട്', 'ഓർമ്മപ്പെടുത്തലുകൾ കാണിക്കൂ', 'ഓർമ്മപ്പെടുത്തൽ റദ്ദാക്കൂ', 'ഡോസ് കൂട്ടാമോ'),
 'kn': ('ನೆನಪಿಸು', 'ಪ್ರತಿದಿನ', 'ಬೆಳಿಗ್ಗೆ', 'ರಾತ್ರಿ', 'ಗಂಟೆಗೆ', 'ಎಂಟು', 'ಜ್ಞಾಪನೆಗಳನ್ನು ತೋರಿಸು', 'ಜ್ಞಾಪನೆ ರದ್ದುಮಾಡು', 'ಡೋಸ್ ಹೆಚ್ಚಿಸಬಹುದೇ'),
 'te': ('గుర్తు చేయి', 'ప్రతిరోజూ', 'ఉదయం', 'రాత్రి', 'గంటలకు', 'ఎనిమిది', 'రిమైండర్లు చూపించు', 'రిమైండర్ రద్దు చేయి', 'మోతాదు పెంచవచ్చా'),
}

def sentence(code, *, hour='8', period=None, name='Personal Brand Ω', daily=True):
 add,frequency,morning,night,marker,*_=SAMPLES[code]
 clock=f'at {hour}' if code=='en' else f'{hour} {marker}'
 return f'{add} "{name}" {period or night} {clock} {frequency if daily else ""}'


@pytest.mark.parametrize('code', SAMPLES)
@pytest.mark.parametrize('period_index,expected', [(2,'08:00'), (3,'20:00')])
def test_native_clock_period_and_exact_user_entity(code, period_index, expected):
 text=sentence(code, period=SAMPLES[code][period_index])
 result=analyze(text,code)
 assert result['detected_language']==code
 assert result['intent']=='add_reminder'
 assert result['draft']==dict(medicine='Personal Brand Ω',times=[expected],days_of_week='daily',note=None)
 assert not result['missing'] and not result['safety']['triggered']


@pytest.mark.parametrize('code', SAMPLES)
def test_native_number_words_and_multiple_explicit_times(code):
 result=analyze(sentence(code,hour=SAMPLES[code][5]),code)
 assert result['draft']['times']==['20:00'] and not result['missing']
 add,freq,morning,night,marker,*_=SAMPLES[code]
 clocks='at 8 am and 9 pm' if code=='en' else f'{morning} 8 {marker} {night} 9 {marker}'
 result=analyze(f'{add} "New Brand" {clocks} {freq}',code)
 assert result['draft']['times']==['08:00','21:00'] and not result['missing']


@pytest.mark.parametrize('code', SAMPLES)
@pytest.mark.parametrize('kind', ['missing_time','ambiguous','missing_name','frequency','dosage','unsafe','two_names'])
def test_incomplete_and_unsafe_cannot_be_confirmed(code,kind):
 add,freq,morning,night,marker,_,view,cancel,unsafe=SAMPLES[code]
 text=sentence(code)
 expected={'missing_time':'time','ambiguous':'time_ambiguous','missing_name':'medicine','frequency':'frequency','dosage':'dosage','two_names':'medicine'}
 if kind=='missing_time':text=f'{add} "New Brand" {morning} {freq}'
 if kind=='ambiguous':text=f'{add} "New Brand" at 8 {freq}'
 if kind=='missing_name':text=f'{add} {night} at 8 PM {freq}'
 if kind=='frequency':text=sentence(code,daily=False)
 if kind=='dosage':text+=' 2 tablets'
 if kind=='unsafe':text+=' '+unsafe
 if kind=='two_names':text+=' "Another Brand"'
 result=analyze(text,code)
 if kind=='unsafe':
  assert result['safety']['triggered'] and result['draft'] is None
 else:assert expected[kind] in result['missing']


@pytest.mark.parametrize('code', SAMPLES)
def test_entities_do_not_supply_clocks_and_cancellation_requires_exact_match(code):
 add,freq,_,_,_,_,view,cancel,*_=SAMPLES[code]
 result=analyze(f'{add} "Brand 8 PM B12" {freq}',code)
 assert result['draft']['medicine']=='Brand 8 PM B12'
 assert result['draft']['times']==[] and 'time' in result['missing']
 reminders=[dict(id=4,medicine='Brand Ω'),dict(id=5,medicine='Brand Ω Extra')]
 assert analyze(view,code,reminders)['matches']==[dict(id=r['id'],medicine=r['medicine']) for r in reminders]
 result=analyze(f'{cancel} "Brand Ω"',code,reminders)
 assert result['intent']=='cancel_reminder' and result['matches']==[dict(id=4,medicine='Brand Ω')]


@pytest.mark.parametrize('code,add,daily', [('ml','ormippikku','divasavum'),('kn','nenapisu','pratidina'),('te','gurtu cheyi','pratiroju')])
def test_bounded_selected_language_transliteration(code,add,daily):
 result=analyze(f'{add} "Brand X" at 8 PM {daily}',code)
 assert result['detected_language']==code and result['draft']['times']==['20:00'] and not result['missing']


@pytest.mark.parametrize('code', SAMPLES)
def test_authenticated_unicode_analyze_review_confirm_api(code,tmp_path,monkeypatch):
 db=tmp_path/'isolated-p13.db';monkeypatch.setenv('AAROGYAVAANI_DB',str(db))
 with TestClient(app) as client:
  device=client.post('/v1/devices',json={'timezone':'Asia/Kolkata'}).json()
  headers={'Authorization':'Bearer '+device['token']}
  body={'text':sentence(code),'ui_language':code}
  assert client.post('/v1/analyze',json=body).status_code==401
  result=client.post('/v1/analyze',headers=headers,json=body).json()
  assert not result['missing']
  assert client.get('/v1/reminders',headers=headers).json()==[]
  draft=dict(result['draft'],language=code)
  assert client.post('/v1/reminders',headers=headers,json=dict(draft,confirmed=False)).status_code==422
  assert client.get('/v1/reminders',headers=headers).json()==[]
  saved=client.post('/v1/reminders',headers=headers,json=dict(draft,confirmed=True))
  assert saved.status_code==201 and saved.json()['medicine']=='Personal Brand Ω'
  assert saved.json()['language']==code and saved.json()['timezone']=='Asia/Kolkata'
  assert len(client.get('/v1/reminders',headers=headers).json())==1
  assert {p['code'] for p in client.get('/v1/languages',headers=headers).json()}==set(SAMPLES)


def test_no_dictionary_expansion_and_readiness_is_honest():
 assert set(installed())==set(SAMPLES)
 for code in ('ml','kn','te'):
  assert load(code)['medicines']=={'names':[],'entity_mode':'quoted-user-input'}
  assert load(code)['meta']['readiness_understanding'] is False


def test_multiple_ambiguous_clocks_do_not_offer_a_single_destructive_choice():
 result=analyze('remind me "My Brand" at 8 and at 9 daily')
 assert 'time_ambiguous' in result['missing'] and not result['candidates']


@pytest.mark.parametrize('code', SAMPLES)
def test_brand_does_not_supply_recurrence_and_mixed_dates_are_not_daily(code):
 add,_,_,night,_,*_=SAMPLES[code]
 result=analyze(f'{add} "Daily" {night} at 8 PM',code)
 assert 'frequency' in result['missing'] and result['draft']['days_of_week'] is None
 result=analyze(sentence(code)+' tomorrow',code)
 assert 'frequency' in result['missing'] and result['draft']['days_of_week'] is None

@pytest.mark.parametrize('code,digit', [('hi','८'),('ta','௮'),('ml','൮'),('kn','೮'),('te','౮')])
def test_native_digits_are_explicit_clocks(code,digit):
 result=analyze(sentence(code,hour=digit),code)
 assert result['draft']['times']==['20:00'] and not result['missing']


def test_a_later_period_does_not_disambiguate_an_earlier_clock():
 result=analyze('remind me "My Brand" at 8 and night at 9 daily')
 assert 'time_ambiguous' in result['missing'] and not result['candidates']


@pytest.mark.parametrize('code', ['ml','kn','te'])
def test_new_packs_do_not_extend_legacy_auto_commit(code):
 result=analyze(sentence(code),code,require_recurrence=False)
 assert result['intent']=='unsupported_language' and result['draft'] is None


@pytest.mark.parametrize('name', ['"calcium '+('x'*100)+'"','"calcium','“calcium'])
def test_malformed_or_oversized_quoted_entities_never_fall_back_to_a_drug_guess(name):
 result=analyze(f'remind me {name} at 8 PM daily')
 assert result['draft']['medicine'] is None and 'medicine' in result['missing']

@pytest.mark.parametrize('code', SAMPLES)
def test_twelve_needs_explicit_meridiem_but_zero_is_not_shifted_by_a_period(code):
 result=analyze(sentence(code,hour='12'),code)
 assert 'time_ambiguous' in result['missing'] and result['candidates']['times']==['00:00','12:00']
 result=analyze(sentence(code,hour='00:15'),code)
 assert result['draft']['times']==['00:15'] and not result['missing']
