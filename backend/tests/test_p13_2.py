"""Selected response language is independent of instruction script; no live data."""
import pytest
from fastapi.testclient import TestClient
from main import app
from pipeline.analyze import analyze
from pipeline.packs import installed,load
from pipeline.detect import RANGES

CASES=[
 ('remind me "Brand Ω B12" at 8 PM daily','draft'),
 ('remind me at 8 PM daily','add_reminder_missing_medicine'),
 ('remind me "Brand Ω B12" daily','missing_time'),
 ('remind me "Brand Ω B12" at 8 daily','time_ambiguous'),
 ('remind me "Brand Ω B12" at 8 PM','frequency'),
 ('remind me "Brand Ω B12" at 8 PM daily tomorrow','date'),
 ('remind me "Brand Ω B12" at 8 PM daily 2 tablets','dosage'),
 ('hello','greeting'),('help','help'),('你好','unsupported'),
 ('can I double my dose?','out_of_scope'),
 ('show my reminders','view_reminders'),('cancel "Brand Ω B12"','cancel_review'),
]

@pytest.mark.parametrize('language',installed())
@pytest.mark.parametrize('text,key',CASES)
def test_reply_follows_selected_language_not_detected_english(language,text,key):
 before=[dict(id=41,medicine='Brand Ω B12')]
 result=analyze(text,language,before)
 assert result['reply']=={'language':language,'text':load(language)['replies'][key]}
 if language!='en':
  lo,hi=RANGES[language]
  assert any(lo<=ord(c)<=hi for c in result['reply']['text'])
 if result['draft'] and '"Brand Ω B12"' in text:
  assert result['draft']['medicine']=='Brand Ω B12'
 assert before==[dict(id=41,medicine='Brand Ω B12')]


@pytest.mark.parametrize('language',installed())
def test_no_english_fallback_when_selected_language_differs_from_native_input(language):
 result=analyze('"என் மருந்து" தினமும் இரவு 8 மணிக்கு நினைவூட்டு',language)
 assert result['detected_language']=='ta'
 assert result['reply']['language']==language
 assert result['draft']['medicine']=='என் மருந்து'


def test_legacy_cli_retains_detected_language_reply():
 result=analyze('வணக்கம்','en',require_recurrence=False)
 assert result['reply']['language']=='ta'


@pytest.mark.parametrize('language',installed())
def test_localized_api_analysis_and_explicit_confirmed_save(language,tmp_path,monkeypatch):
 monkeypatch.setenv('AAROGYAVAANI_DB',str(tmp_path/'p132-isolated.db'))
 with TestClient(app) as client:
  token=client.post('/v1/devices',json={'timezone':'Asia/Kolkata'}).json()['token']
  headers={'Authorization':'Bearer '+token}
  r=client.post('/v1/analyze',headers=headers,json={'text':'remind me "CaseSensitive Ω" at 8 PM daily','ui_language':language}).json()
  assert r['reply']['language']==language and not r['missing']
  assert client.get('/v1/reminders',headers=headers).json()==[]
  payload=dict(r['draft'],language=language)
  assert client.post('/v1/reminders',headers=headers,json=dict(payload,confirmed=False)).status_code==422
  saved=client.post('/v1/reminders',headers=headers,json=dict(payload,confirmed=True))
  assert saved.status_code==201 and saved.json()['medicine']=='CaseSensitive Ω'
  assert saved.json()['language']==language
  # Transport failures are status codes; selected-language copy belongs to frontend.
  assert client.post('/v1/reminders',headers=headers,json=dict(payload,confirmed=False)).status_code==422
