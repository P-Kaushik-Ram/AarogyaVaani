"""Explicit Neon checks/empty-schema initialization; secrets never reach output."""
import argparse
import os
from urllib.parse import urlsplit
from pathlib import Path
from dotenv import load_dotenv
from db import postgres
from tools import neon_branch_guard


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['connect', 'initialize-empty', 'check', 'synthetic'])
    args = parser.parse_args()
    load_dotenv(Path(__file__).resolve().parents[1] / '.env', override=False, interpolate=False)
    if not os.environ.get('DATABASE_URL'):
        print('BLOCKED: DATABASE_URL is not configured in the server environment or ignored .env')
        return 2
    try:
        if args.action == 'synthetic':
            import pytest
            load_dotenv(Path(__file__).resolve().parents[1] / '.env.test', override=False, interpolate=False)
            test_url = os.environ.get('TEST_DATABASE_URL', '')
            test_host = urlsplit(test_url).hostname
            production_host = urlsplit(os.environ['DATABASE_URL']).hostname
            if not test_host or test_host.replace('-pooler', '') == production_host.replace('-pooler', ''):
                print('BLOCKED: a separate disposable TEST_DATABASE_URL is required; production endpoint forbidden')
                return 2
            neon_branch_guard.verify(test_url, os.environ['DATABASE_URL'], os.environ.get('NEON_API_KEY', ''))
            print('DONE-VERIFIED: Neon API maps the endpoint to example-test-branch, distinct from production')
            # Never emit database exception payloads through pytest tracebacks.
            return pytest.main(['tests/test_postgres.py', '-q', '--tb=no', '--show-capture=no'])
        with postgres.connection() as conn:
            conn.execute('SET TRANSACTION READ ONLY')
            assert conn.execute('SELECT 1').fetchone()[0] == 1
            if args.action == 'initialize-empty':
                count = conn.execute("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'").fetchone()[0]
                if count:
                    print('BLOCKED: initialize-empty requires an empty public schema')
                    return 2
        if args.action == 'initialize-empty':
            postgres.initialize()
        if args.action in ('initialize-empty', 'check'):
            postgres.check()
        print('DONE-VERIFIED: ' + args.action)
        return 0
    except Exception as error:
        print('BLOCKED: database operation failed (' + type(error).__name__ + '); details suppressed to protect credentials')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
