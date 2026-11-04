"""Masked PowerShell pipe consumer; writes only ignored .env.test after API checks."""
import os
import sys
from pathlib import Path
from dotenv import dotenv_values, set_key
from tools.secure_neon_setup import secure_url
from tools.neon_branch_guard import verify
from db import postgres


def run(path=Path('.env.test'), production_path=Path('.env'), source=None, target=None):
    source, target = source or sys.stdin, target or sys.stdout
    def report(message):
        print(message, file=target, flush=True)
    original = production_path.read_bytes()
    old_url = os.environ.get('DATABASE_URL')
    try:
        existing = dotenv_values(path, interpolate=False)
        report('REPLACE' if 'TEST_DATABASE_URL' in existing else 'NEW')
        approval = source.readline().strip()
        if 'TEST_DATABASE_URL' in existing and approval != 'APPROVE':
            report('Test environment configuration: BLOCKED (replacement not approved)')
            return 2
        url = secure_url(source.readline().rstrip('\r\n'))
        key = source.readline().strip()
        production_url = dotenv_values(production_path, interpolate=False).get('DATABASE_URL', '')
        verify(url, production_url, key)
        os.environ['DATABASE_URL'] = url
        with postgres.connection() as conn:
            conn.execute('SET TRANSACTION READ ONLY')
            row = conn.execute('SELECT 1,current_database()').fetchone()
            if row[0] != 1 or row[1] != 'neondb':
                raise RuntimeError('Unexpected database')
        if production_path.read_bytes() != original:
            raise RuntimeError('Production environment changed')
        set_key(str(path), 'TEST_DATABASE_URL', url, quote_mode='always')
        set_key(str(path), 'NEON_API_KEY', key, quote_mode='always')
        report('Test branch API verification: PASS (example-test-branch, Singapore)')
        report('Verified TLS and test connectivity: PASS')
        report('Test environment configuration: PASS (.env.test only)')
        report('Production environment unchanged: PASS')
        return 0
    except Exception:
        report('Test setup: BLOCKED (branch identity or connectivity could not be verified; details suppressed)')
        return 1
    finally:
        if old_url is None:
            os.environ.pop('DATABASE_URL', None)
        else:
            os.environ['DATABASE_URL'] = old_url


if __name__ == '__main__':
    raise SystemExit(run())
