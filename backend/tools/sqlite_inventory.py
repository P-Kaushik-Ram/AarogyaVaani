"""Read-only migration inventory: metadata/counts only, never row contents."""
import argparse
import hashlib
import json
import sqlite3
from pathlib import Path
from contextlib import closing


def inventory(path):
    path = Path(path).resolve(strict=True)
    before = hashlib.sha256(path.read_bytes()).hexdigest()
    with closing(sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)) as conn:
        conn.execute('PRAGMA query_only=ON')
        result = {'file': path.name, 'integrity': conn.execute('PRAGMA quick_check').fetchone()[0], 'tables': {}}
        for (name,) in conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"):
            quoted = '"' + name.replace('"', '""') + '"'
            columns = [row[1] for row in conn.execute(f'PRAGMA table_info({quoted})')]
            table = {'columns': columns, 'rows': conn.execute(f'SELECT COUNT(*) FROM {quoted}').fetchone()[0]}
            if name == 'reminders' and 'status' in columns:
                table['soft_deleted_rows'] = conn.execute("SELECT COUNT(*) FROM reminders WHERE status='deleted'").fetchone()[0]
            result['tables'][name] = table
        result['foreign_key_violations'] = len(conn.execute('PRAGMA foreign_key_check').fetchall())
    result['file_hash_unchanged'] = before == hashlib.sha256(path.read_bytes()).hexdigest()
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('paths', nargs='+')
    args = parser.parse_args()
    print(json.dumps([inventory(path) for path in args.paths], indent=2))
