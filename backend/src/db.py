"""
Database layer for AarogyaVaani. SQLite - no setup cost, sufficient for
prototype-scale usage (a handful of users), easy to swap for something
bigger later if the project grows past this stage.
"""

import sqlite3
import json
import os
from zoneinfo import ZoneInfo
from pathlib import Path
from datetime import datetime

DB_PATH = Path(os.environ.get('AAROGYAVAANI_LEGACY_DB',str(Path(__file__).resolve().parent.parent / 'aarogyavaani.db')))

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT UNIQUE NOT NULL,
    name TEXT,
    preferred_language TEXT DEFAULT 'en',
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    medicine TEXT,
    time_of_day TEXT,
    clock_time TEXT,
    frequency TEXT,
    language TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS reminder_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reminder_id INTEGER NOT NULL,
    sent_date TEXT NOT NULL,
    sent_hour INTEGER NOT NULL,
    sent_at TEXT NOT NULL,
    FOREIGN KEY (reminder_id) REFERENCES reminders(id)
);

CREATE INDEX IF NOT EXISTS idx_reminder_log_lookup
ON reminder_log(reminder_id, sent_date, sent_hour);
"""


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    conn.executescript(SCHEMA)
    for table, column, definition in [('users','timezone',"TEXT DEFAULT 'Asia/Kolkata'"),('reminders','times','TEXT'),('reminders','days_of_week',"TEXT DEFAULT '\"daily\"'")]:
        columns={r[1] for r in conn.execute(f'PRAGMA table_info({table})')}
        if column not in columns:conn.execute(f'ALTER TABLE {table} ADD COLUMN {column} {definition}')
    conn.commit()
    conn.close()


def get_or_create_user(chat_id: str, name: str = None, language: str = "en") -> int:
    conn = get_connection()
    cur = conn.execute("SELECT id FROM users WHERE chat_id = ?", (chat_id,))
    row = cur.fetchone()
    if row:
        conn.close()
        return row["id"]
    cur = conn.execute(
        "INSERT INTO users (chat_id, name, preferred_language, created_at) VALUES (?, ?, ?, ?)",
        (chat_id, name, language, datetime.now().isoformat()),
    )
    conn.commit()
    user_id = cur.lastrowid
    conn.close()
    return user_id


def add_reminder(user_id: int, medicine: str, time_of_day: str, clock_time: str,
                  frequency: str, language: str, times=None, days_of_week='daily') -> int:
    if times is None:
        from src.scheduler import normalize_time, TIME_OF_DAY_HOUR
        clock=normalize_time(clock_time)
        times=[f'{clock[0]:02}:{clock[1]:02}'] if clock else ([f'{TIME_OF_DAY_HOUR[time_of_day]:02}:00'] if time_of_day else [])
        if frequency=='twice_daily':
            times=times or ['08:00','21:00']
            if len(times)==1:times += [t for t in ['08:00','21:00'] if t not in times][:1]
    conn = get_connection()
    cur = conn.execute(
        """INSERT INTO reminders
           (user_id, medicine, time_of_day, clock_time, frequency, language, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (user_id, medicine, time_of_day, clock_time, frequency, language,
         datetime.now().isoformat()),
    )
    conn.commit()
    reminder_id = cur.lastrowid
    conn.execute('UPDATE reminders SET times=?,days_of_week=? WHERE id=?',(json.dumps(times),json.dumps(days_of_week),reminder_id))
    conn.commit()
    conn.close()
    return reminder_id


def get_active_reminders(user_id: int) -> list:
    conn = get_connection()
    cur = conn.execute(
        "SELECT * FROM reminders WHERE user_id = ? AND active = 1", (user_id,)
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def user_timezone(user_id):
    with get_connection() as conn:
        row=conn.execute('SELECT timezone FROM users WHERE id=?',(user_id,)).fetchone()
        return row['timezone'] if row else 'Asia/Kolkata'


def set_timezone(user_id,timezone):
    ZoneInfo(timezone)
    with get_connection() as conn:conn.execute('UPDATE users SET timezone=? WHERE id=?',(timezone,user_id))


def cancel_reminder(user_id: int, medicine: str) -> int:
    """Deactivates the most recent active reminder matching the medicine name.
    Returns number of rows affected."""
    conn = get_connection()
    cur = conn.execute(
        """UPDATE reminders SET active = 0
           WHERE user_id = ? AND active = 1 AND medicine LIKE ?""",
        (user_id, f"%{medicine}%" if medicine else "%"),
    )
    conn.commit()
    affected = cur.rowcount
    conn.close()
    return affected


if __name__ == "__main__":
    if DB_PATH.exists():
        DB_PATH.unlink()
    init_db()
    uid = get_or_create_user("test_chat_1", "Test User", "ta")
    print("Created user id:", uid)
    rid = add_reminder(uid, "மெட்ஃபார்மின்", "morning", "8:00", "once_daily", "ta")
    print("Created reminder id:", rid)
    print("Active reminders:", get_active_reminders(uid))
    n = cancel_reminder(uid, "மெட்ஃபார்மின்")
    print("Cancelled count:", n)
    print("Active reminders after cancel:", get_active_reminders(uid))
