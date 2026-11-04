import csv
from datetime import datetime,timezone
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from pipeline.analyze import analyze
from pipeline.detect import detect_language
from pipeline.packs import ROOT,golden,installed
from tools.check_language_pack import check
from main import app
from db import store
from src import db,scheduler

CASES=[(lang,row) for lang in installed() for row in golden(lang)]

@pytest.mark.parametrize('lang,row',CASES,ids=[f'{lang}-{i}' for i,(lang,_) in enumerate(CASES)])
def test_frozen_golden(lang,row):
    result=analyze(row['text'],lang)
    if row['category']=='unsupported' and result['detected_language'] in ('ml','kn','te'):
        # P13 now understands this formerly unsupported command; the original
        # frozen corpus and all medical safety expectations remain untouched.
        assert result['intent']=='add_reminder'
        assert set(result['missing'])>={'medicine','time','frequency'}
    else:assert result['intent']==row['intent']
    assert result['safety']['triggered']==(row['category']=='medical')

def test_packs():assert check()

def test_golden_files_frozen():
    import hashlib,json
    root=Path(__file__).resolve().parents[1]
    expected=json.loads((root/'tests/golden_sha256.json').read_text())
    assert all(hashlib.sha256((root/name).read_bytes()).hexdigest()==digest for name,digest in expected.items())

@pytest.mark.parametrize('text,expected',[
    ('hello','en'),('हिन्दी metformin','hi'),('தமிழ் metformin','ta'),('മലയാളം','ml'),('ಕನ್ನಡ','kn'),('తెలుగు','te'),('你好','unsupported')])
def test_detection(text,expected):assert detect_language(text)==expected

def test_tie_breaker():
    assert detect_language('अஅ','ta')=='ta'
    assert detect_language('अஅ','hi')=='hi'

def test_analyze_pure_and_frequency(tmp_path,monkeypatch):
    path=tmp_path/'never.db';monkeypatch.setenv('AAROGYAVAANI_DB',str(path))
    assert analyze('remind me to take my dose of metformin every morning')['intent']=='add_reminder'
    result=analyze('remind me twice a day for paracetamol')
    assert result['draft']['times']==[]
    assert 'time' in result['missing']
    assert not path.exists()
    result=analyze('remind me at 8')
    assert 'time_ambiguous' in result['missing']
    assert result['candidates']=={'times':['08:00','20:00']}
    assert analyze('remind me vitamin b12 every morning')['draft']['times']==[]
    assert 'time' in analyze('remind me vitamin b12 every morning')['missing']
    assert analyze('remind me metformin every other day at 8 pm')['missing']==['frequency']

@pytest.mark.parametrize('text,times',[
    ('remind me metformin at 8 am and 9 pm',['08:00','21:00']),
    ('remind me metformin at 00:15',['00:15']),
    ('எனக்கு தினமும் இரவு 8 மணிக்கு மெட்ஃபார்மின் நினைவூட்டு',['20:00']),
    ('मुझे सुबह 8 बजे मेटफॉर्मिन याद दिलाओ',['08:00']),
])
def test_times(text,times):assert analyze(text)['draft']['times']==times

def test_scheduler_frequency_timezone_days(tmp_path,monkeypatch):
    monkeypatch.setattr(db,'DB_PATH',tmp_path/'legacy.db');db.init_db()
    uid=db.get_or_create_user('test');db.set_timezone(uid,'Asia/Kolkata')
    db.add_reminder(uid,'metformin',None,None,'twice_daily','en')
    assert len(scheduler.due_reminders_at(uid,datetime(2026,10,16,2,30,tzinfo=timezone.utc)))==1
    assert len(scheduler.due_reminders_at(uid,datetime(2026,10,16,15,30,tzinfo=timezone.utc)))==1
    assert not scheduler.due_reminders_at(uid,datetime(2026,10,16,15,31,tzinfo=timezone.utc))
    db.add_reminder(uid,'aspirin',None,None,'once_daily','en',times=['10:00'],days_of_week=[1])
    assert not scheduler.due_reminders_at(uid,datetime(2026,10,16,10,0))
    assert len(scheduler.due_reminders_at(uid,datetime(2026,10,19,10,0)))==1

@pytest.fixture
def client(tmp_path,monkeypatch):
    monkeypatch.setenv('AAROGYAVAANI_DB',str(tmp_path/'api.db'))
    with TestClient(app) as c:yield c

def register(client,tz='Asia/Kolkata'):
    r=client.post('/v1/devices',json={'timezone':tz});assert r.status_code==201
    data=r.json();return data,{'Authorization':'Bearer '+data['token']}

def test_all_api_endpoints(client):
    assert client.get('/v1/health').json()['status']=='ok'
    d,h=register(client,'Europe/London');_,h2=register(client)
    for method,url in [('GET','/v1/reminders'),('GET','/v1/languages'),('GET','/v1/help'),('POST','/v1/analyze'),('POST','/v1/reminders'),('PATCH','/v1/reminders/1'),('DELETE','/v1/reminders/1'),('POST','/v1/reminders/1/events'),('DELETE','/v1/me')]:
        assert client.request(method,url).status_code==401
    for text,intent in [('மெட்ஃபார்மின் நினைவூட்டலை நிறுத்து','cancel_reminder'),('मेटफॉर्मिन का रिमाइंडर रोक दो','cancel_reminder'),('is omeprazole safe for me?','out_of_scope'),('remind me at 8','add_reminder')]:
        r=client.post('/v1/analyze',headers=h,json={'text':text});assert r.status_code==200;assert r.json()['intent']==intent
    assert client.get('/v1/reminders',headers=h).json()==[]
    draft=client.post('/v1/analyze',headers=h,json={'text':'remind me metformin at 8 am and 9 pm daily'}).json()['draft']
    assert client.post('/v1/reminders',headers=h,json=draft).status_code==422
    r=client.post('/v1/reminders',headers=h,json=dict(draft,confirmed=True));assert r.status_code==201
    rid=r.json()['id'];assert r.json()['timezone']=='Europe/London'
    assert client.get('/v1/reminders',headers=h).json()[0]['times']==['08:00','21:00']
    assert client.get('/v1/reminders',headers=h2).json()==[]
    assert client.patch(f'/v1/reminders/{rid}',headers=h2,json={'status':'paused'}).status_code==404
    assert client.delete(f'/v1/reminders/{rid}',headers=h2).status_code==404
    assert client.post(f'/v1/reminders/{rid}/events',headers=h2,json={'type':'taken','scheduled_for':'2026-10-16T08:00:00+05:30'}).status_code==404
    assert client.patch(f'/v1/reminders/{rid}',headers=h,json={'times':['09:00'],'days_of_week':[1,3,5],'status':'paused'}).status_code==200
    assert client.get('/v1/reminders',headers=h).json()==[]
    assert client.patch(f'/v1/reminders/{rid}',headers=h,json={'status':'active'}).status_code==200
    for typ in ('taken','snoozed','skipped'):
        data={'type':typ,'scheduled_for':'2026-10-16T08:00:00+05:30'}
        first=client.post(f'/v1/reminders/{rid}/events',headers=h,json=data)
        second=client.post(f'/v1/reminders/{rid}/events',headers=h,json=data)
        assert first.status_code==second.status_code==201;assert first.json()['id']==second.json()['id']
    assert len(client.get('/v1/languages',headers=h).json())==6
    assert all(not r['readiness_understanding'] for r in client.get('/v1/languages',headers=h).json())
    assert 'रिमाइंडर' in client.get('/v1/help?lang=hi',headers=h).json()['text']
    assert client.delete(f'/v1/reminders/{rid}',headers=h).status_code==200
    assert client.post(f'/v1/reminders/{rid}/events',headers=h,json={'type':'taken','scheduled_for':'2026-10-16T08:00:00Z'}).status_code==404
    assert client.delete('/v1/me',headers=h).status_code==200
    assert client.get('/v1/reminders',headers=h).status_code==401
    with store.connection() as c:
        assert c.execute('SELECT COUNT(*) FROM reminders WHERE user_id=?',(d['user_id'],)).fetchone()[0]==0
        assert c.execute('SELECT COUNT(*) FROM dose_events').fetchone()[0]==0
        assert c.execute('SELECT COUNT(*) FROM devices WHERE token_hash=?',(d['token'],)).fetchone()[0]==0

def test_validation_and_privacy(client,capsys):
    _,h=register(client)
    for text in ['x'*301,'','   ']:
        r=client.post('/v1/analyze',headers=h,json={'text':text});assert r.status_code==422;assert text not in r.text or not text.strip()
    assert client.post('/v1/devices',json={'timezone':'invalid'}).status_code==422
    for times in [['25:00'],['08:00','08:00'],[]]:
        assert client.post('/v1/reminders',headers=h,json={'medicine':'metformin','times':times,'confirmed':True}).status_code==422
    assert client.post('/v1/reminders',headers=h,json={'medicine':'metformin','times':['08:00'],'confirmed':False}).status_code==422
    assert client.get('/v1/help?lang=ml',headers=h).status_code==200
    assert client.get('/v1/help?lang=xx',headers=h).status_code==422
    assert not capsys.readouterr().out

def test_rate_limits(client):
    _,h=register(client)
    statuses=[client.get('/v1/reminders',headers=h).status_code for _ in range(61)]
    assert statuses[-1]==429
    for _ in range(9):assert client.post('/v1/devices',json={}).status_code==201
    assert client.post('/v1/devices',json={}).status_code==429
