import hashlib
import json
import os
import secrets
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime,timezone
from pathlib import Path

SCHEMA='''
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS devices(user_id TEXT PRIMARY KEY,token_hash TEXT UNIQUE NOT NULL,created_at TEXT NOT NULL,timezone TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reminders(id INTEGER PRIMARY KEY,user_id TEXT NOT NULL REFERENCES devices ON DELETE CASCADE,medicine TEXT NOT NULL,times TEXT NOT NULL,days_of_week TEXT NOT NULL,note TEXT,status TEXT NOT NULL,language TEXT NOT NULL,timezone TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dose_events(id INTEGER PRIMARY KEY,reminder_id INTEGER NOT NULL REFERENCES reminders ON DELETE CASCADE,scheduled_for TEXT NOT NULL,type TEXT NOT NULL,recorded_at TEXT NOT NULL,UNIQUE(reminder_id,scheduled_for,type));
CREATE TABLE IF NOT EXISTS reminder_log(id INTEGER PRIMARY KEY,reminder_id INTEGER NOT NULL REFERENCES reminders ON DELETE CASCADE,scheduled_for TEXT NOT NULL,UNIQUE(reminder_id,scheduled_for));
CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,"window" INTEGER NOT NULL,count INTEGER NOT NULL);
'''

def now(): return datetime.now(timezone.utc).isoformat()

@contextmanager
def connection():
    if os.environ.get('DATABASE_URL'):
        from db.postgres import connection as postgres_connection
        with postgres_connection() as conn:
            yield conn
        return
    path=Path(os.environ.get('AAROGYAVAANI_DB',str(Path(__file__).parent/'backend.db')))
    path.parent.mkdir(parents=True,exist_ok=True)
    conn=sqlite3.connect(path,timeout=10)
    conn.row_factory=sqlite3.Row
    conn.executescript(SCHEMA)
    try:
        with conn: yield conn
    finally:conn.close()

def digest(token):return hashlib.sha256(token.encode()).hexdigest()

def register(tz):
    uid=secrets.token_hex(16);token=secrets.token_urlsafe(32)
    with connection() as c:c.execute('INSERT INTO devices VALUES(?,?,?,?)',(uid,digest(token),now(),tz))
    return {'user_id':uid,'token':token}

def authenticate(token):
    with connection() as c:
        row=c.execute('SELECT user_id,timezone FROM devices WHERE token_hash=?',(digest(token),)).fetchone()
    return dict(row) if row else None

def allow(key,limit=60):
    window=int(time.time()//60)
    with connection() as c:
        c.execute('DELETE FROM rate_limits WHERE "window"<?',(window-1,))
        c.execute('INSERT INTO rate_limits VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits."window"=excluded."window" THEN rate_limits.count+1 ELSE 1 END,"window"=excluded."window"',(digest(key),window))
        return c.execute('SELECT count FROM rate_limits WHERE key=?',(digest(key),)).fetchone()[0]<=limit

def decode(row):
    if not row:return None
    result=dict(row)
    for key in ('times','days_of_week'):result[key]=json.loads(result[key])
    return result

def listing(uid):
    with connection() as c:return [decode(r) for r in c.execute("SELECT * FROM reminders WHERE user_id=? AND status='active' ORDER BY id",(uid,))]

def get(uid,rid):
    with connection() as c:return decode(c.execute("SELECT * FROM reminders WHERE id=? AND user_id=? AND status!='deleted'",(rid,uid)).fetchone())

def save(uid,data):
    with connection() as c:
        cur=c.execute('INSERT INTO reminders(user_id,medicine,times,days_of_week,note,status,language,timezone,updated_at) VALUES(?,?,?,?,?,?,?,?,?) RETURNING id',(uid,data['medicine'],json.dumps(data['times']),json.dumps(data['days_of_week']),data['note'],data['status'],data['language'],data['timezone'],now()))
        rid=cur.fetchone()[0]
    return get(uid,rid)

def update(uid,rid,data):
    with connection() as c:
        c.execute("UPDATE reminders SET medicine=?,times=?,days_of_week=?,note=?,status=?,language=?,timezone=?,updated_at=? WHERE id=? AND user_id=? AND status!='deleted'",(data['medicine'],json.dumps(data['times']),json.dumps(data['days_of_week']),data['note'],data['status'],data['language'],data['timezone'],now(),rid,uid))
    return get(uid,rid)

def delete(uid,rid):
    with connection() as c:c.execute("UPDATE reminders SET status='deleted',updated_at=? WHERE id=? AND user_id=?",(now(),rid,uid))

def event(rid,data):
    with connection() as c:
        c.execute('INSERT INTO dose_events(reminder_id,scheduled_for,type,recorded_at) VALUES(?,?,?,?) ON CONFLICT(reminder_id,scheduled_for,type) DO NOTHING',(rid,data['scheduled_for'],data['type'],now()))
        return dict(c.execute('SELECT * FROM dose_events WHERE reminder_id=? AND scheduled_for=? AND type=?',(rid,data['scheduled_for'],data['type'])).fetchone())

def delete_user(uid):
    with connection() as c:c.execute('DELETE FROM devices WHERE user_id=?',(uid,))
