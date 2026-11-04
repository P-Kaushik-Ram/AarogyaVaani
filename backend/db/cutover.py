"""Read-only, owner-scoped cutover reconciliation. Never exports token hashes."""
import hashlib
import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from db import store


@contextmanager
def readonly():
    if os.environ.get('DATABASE_URL'):
        from db.postgres import connection
        with connection() as conn:
            conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
            yield conn
    else:
        path = Path(os.environ.get('AAROGYAVAANI_DB', str(Path(__file__).parent/'backend.db'))).resolve()
        conn = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute('PRAGMA query_only=ON')
            conn.execute('BEGIN')
            yield conn
        finally:
            conn.close()


def identity(token):
    with readonly() as conn:
        device = conn.execute('SELECT * FROM devices WHERE token_hash=?', (store.digest(token),)).fetchone()
        if not device:
            return None
        uid = device['user_id']
        reminders = [dict(r) for r in conn.execute('SELECT * FROM reminders WHERE user_id=? ORDER BY id', (uid,))]
        events = [dict(r) for r in conn.execute('SELECT e.* FROM dose_events e JOIN reminders r ON r.id=e.reminder_id WHERE r.user_id=? ORDER BY e.id', (uid,))]
        logs = [dict(r) for r in conn.execute('SELECT e.* FROM reminder_log e JOIN reminders r ON r.id=e.reminder_id WHERE r.user_id=? ORDER BY e.id', (uid,))]
        # Parse arrays for representation-independent SQLite/PostgreSQL comparison.
        for row in reminders:
            for key in ('times', 'days_of_week'):
                row[key] = json.loads(row[key])
        payload = {'device': dict(device), 'reminders': reminders, 'events': events, 'logs': logs}
        encoded = json.dumps(payload, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()
        return {'version': 1, 'user_id': uid, 'timezone': device['timezone'],
                'counts': {'devices': 1, 'reminders': len(reminders), 'events': len(events), 'logs': len(logs),
                           'deleted': sum(r['status'] == 'deleted' for r in reminders),
                           'paused': sum(r['status'] == 'paused' for r in reminders)},
                'digest': hashlib.sha256(encoded).hexdigest(),
                'writes_blocked': os.environ.get('AAROGYAVAANI_CUTOVER_READ_ONLY') == '1'}


def verification_snapshot():
    """Future importer reconciliation; read-only and never returns record values."""
    result = {'version': 1, 'tables': {}, 'relationships_valid': True}
    with readonly() as conn:
        for table, order in [('devices', 'user_id'), ('reminders', 'id'),
                             ('dose_events', 'id'), ('reminder_log', 'id')]:
            rows = [dict(row) for row in conn.execute(f'SELECT * FROM {table} ORDER BY {order}')]
            if table == 'reminders':
                for row in rows:
                    for key in ('times', 'days_of_week'):
                        row[key] = json.loads(row[key])
            encoded = json.dumps(rows, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()
            result['tables'][table] = {'count': len(rows), 'digest': hashlib.sha256(encoded).hexdigest()}
            if table == 'reminders':
                result['tables'][table].update(deleted=sum(row['status'] == 'deleted' for row in rows),
                                              paused=sum(row['status'] == 'paused' for row in rows))
        for query in (
            'SELECT COUNT(*) FROM reminders r LEFT JOIN devices d ON d.user_id=r.user_id WHERE d.user_id IS NULL',
            'SELECT COUNT(*) FROM dose_events e LEFT JOIN reminders r ON r.id=e.reminder_id WHERE r.id IS NULL',
            'SELECT COUNT(*) FROM reminder_log e LEFT JOIN reminders r ON r.id=e.reminder_id WHERE r.id IS NULL',
        ):
            if conn.execute(query).fetchone()[0]:
                result['relationships_valid'] = False
    return result


def compare(source, target):
    differences = [table for table in ('devices', 'reminders', 'dose_events', 'reminder_log')
                   if source['tables'][table] != target['tables'][table]]
    if not source['relationships_valid'] or not target['relationships_valid']:
        differences.append('relationships')
    return {'ok': not differences, 'differences': differences}
