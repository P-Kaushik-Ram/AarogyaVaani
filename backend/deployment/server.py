"""Fail closed instead of accidentally serving a fresh, empty production DB.

Run with ``python -m deployment.server``. Configure the existing absolute database
path and exact public hostname in the service environment, never in source code.
"""
import os
from contextlib import closing
from pathlib import Path
import sqlite3


def checked_database():
    if os.environ.get('DATABASE_URL'):
        from db.postgres import check
        try:
            check()
        except Exception:
            raise RuntimeError('PostgreSQL connectivity or schema check failed') from None
        return None
    raw = os.environ.get('AAROGYAVAANI_DB', '')
    path = Path(raw)
    if not raw or not path.is_absolute() or not path.is_file():
        raise RuntimeError('AAROGYAVAANI_DB must name an existing absolute database file')
    # mode=ro deliberately forbids initialization, migration and rate-limit writes.
    with closing(sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)) as connection:
        connection.execute('PRAGMA query_only=ON')
        if connection.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
            raise RuntimeError('Database integrity check failed')
        required = {
            'devices': {'user_id', 'token_hash', 'created_at', 'timezone'},
            'reminders': {'id', 'user_id', 'medicine', 'times', 'days_of_week', 'note', 'status', 'language', 'timezone', 'updated_at'},
            'dose_events': {'id', 'reminder_id', 'scheduled_for', 'type', 'recorded_at'},
            'reminder_log': {'id', 'reminder_id', 'scheduled_for'},
            'rate_limits': {'key', 'window', 'count'},
        }
        for table, columns in required.items():
            actual = {row[1] for row in connection.execute(f'PRAGMA table_info({table})')}
            if not columns <= actual:
                raise RuntimeError('Existing API database schema required')
    return path


def configured_app(*, validate_on_start=True):
    if validate_on_start:
        checked_database()
    hosts = os.environ.get('AAROGYAVAANI_ALLOWED_HOSTS', '').split(',')
    hosts = [host.strip() for host in hosts if host.strip()]
    if not hosts or any('*' in host or '/' in host or ':' in host for host in hosts):
        raise RuntimeError('Exact AAROGYAVAANI_ALLOWED_HOSTS required (no wildcard, scheme or port)')
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse
    from starlette.middleware.trustedhost import TrustedHostMiddleware
    from starlette.concurrency import run_in_threadpool
    from pg8000.dbapi import Error as PostgreSQLError
    from scramp import ScramException
    from main import app

    # A wrapper keeps production host enforcement out of local development/tests.
    outer = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    @outer.middleware('http')
    async def existing_database_only(request, call_next):
        # Also guard after startup: a lost mount must never become a fresh DB.
        try:
            await run_in_threadpool(checked_database)
            return await call_next(request)
        except (RuntimeError, sqlite3.Error, PostgreSQLError, ScramException, OSError):
            return JSONResponse({'status': 'unavailable'}, status_code=503)

    @outer.get('/v1/ready')
    def ready():
        try:
            checked_database()
        except (RuntimeError, sqlite3.Error, OSError):
            return JSONResponse({'status': 'unavailable'}, status_code=503)
        return {'status': 'ready'}

    outer.mount('/', app)
    # Reject untrusted hosts before opening a database connection.
    outer.add_middleware(TrustedHostMiddleware, allowed_hosts=hosts + ['127.0.0.1', 'localhost'])
    return outer


if __name__ == '__main__':
    import uvicorn
    # Only the local TLS tunnel can reach this listener; trust no forwarded headers.
    uvicorn.run(configured_app(), host='127.0.0.1', port=int(os.environ.get('PORT', '8000')),
                proxy_headers=False, access_log=False, workers=1)
