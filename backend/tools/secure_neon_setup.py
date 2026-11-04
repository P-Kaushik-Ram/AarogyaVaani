"""Private pipe input for Set-NeonEnvironment.ps1. Never echo credential input."""
import os
import ssl
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlsplit, parse_qs, urlencode, urlunsplit
from dotenv import dotenv_values, set_key, load_dotenv
from db import postgres, store


def secure_url(raw):
    url = urlsplit(raw)
    if (url.scheme not in ('postgres', 'postgresql') or not url.hostname
            or not url.username or not url.password or url.path != '/neondb'
            or '-pooler' in url.hostname or url.fragment
            or any(char in raw for char in '\r\n\x00')):
        raise ValueError('Invalid direct Neon configuration')
    query = parse_qs(url.query, keep_blank_values=True)
    if query.get('sslmode', ['require']) not in (['require'], ['verify-full']):
        raise ValueError('Unsupported TLS policy')
    if query.get('channel_binding', ['require']) != ['require']:
        raise ValueError('Required channel binding must not be disabled')
    query['sslmode'] = ['verify-full']
    query['channel_binding'] = ['require']
    return urlunsplit(url._replace(query=urlencode(query, doseq=True)))


def run(path=Path('.env'), input_stream=None, output_stream=None):
    source = input_stream or sys.stdin
    target = output_stream or sys.stdout
    def report(message):
        print(message, file=target, flush=True)

    old_url = os.environ.get('DATABASE_URL')
    old_sqlite = os.environ.get('AAROGYAVAANI_DB')
    try:
        existing = dotenv_values(path, interpolate=False)
        report('REPLACE' if 'DATABASE_URL' in existing else 'NEW')
        approval = source.readline().strip()
        if 'DATABASE_URL' in existing and approval != 'APPROVE':
            report('Environment configuration: FAIL (replacement not approved)')
            return 2
        try:
            secured = secure_url(source.readline().rstrip('\r\n'))
            os.environ['DATABASE_URL'] = secured
            options = postgres.options()
            context = options['ssl_context']
            if not (context.check_hostname and context.verify_mode == ssl.CERT_REQUIRED
                    and options['require_channel_binding']):
                raise ValueError('Required TLS policy missing')
        except Exception:
            report('Environment configuration: FAIL (unsupported URL/options; settings preserved)')
            return 2

        try:
            with postgres.connection() as conn:
                conn.execute('SET TRANSACTION READ ONLY')
                if conn.execute('SELECT 1').fetchone()[0] != 1:
                    raise ValueError('Unexpected query result')
        except Exception:
            report('Database connectivity: FAIL (details suppressed; settings preserved)')
            return 1
        report('Database connectivity: PASS')
        report('TLS verification: PASS (certificate, hostname and channel binding)')

        set_key(str(path), 'DATABASE_URL', secured, quote_mode='always')
        os.environ.pop('DATABASE_URL', None)
        load_dotenv(path, override=False, interpolate=False)
        if os.environ.get('DATABASE_URL') != secured:
            raise ValueError('Environment reload mismatch')
        report('Environment configuration: PASS')

        os.environ.pop('DATABASE_URL', None)
        with tempfile.TemporaryDirectory() as temp:
            os.environ['AAROGYAVAANI_DB'] = str(Path(temp) / 'synthetic.db')
            with store.connection() as conn:
                if conn.execute('SELECT 1').fetchone()[0] != 1:
                    raise ValueError('SQLite query failed')
        report('SQLite compatibility: PASS (temporary synthetic database only)')
        return 0
    except Exception:
        report('Environment configuration: FAIL (details suppressed)')
        return 1
    finally:
        for key, value in [('DATABASE_URL', old_url), ('AAROGYAVAANI_DB', old_sqlite)]:
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


if __name__ == '__main__':
    raise SystemExit(run())
