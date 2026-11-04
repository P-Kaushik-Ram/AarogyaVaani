"""Neon GET-only metadata verification before any disposable-branch writes."""
import json
import ssl
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, build_opener, HTTPSHandler, HTTPRedirectHandler

PROJECT = 'example-neon-project'
TEST_BRANCH = 'example-test-branch'
PRODUCTION_BRANCH = 'production'
BASE = 'https://console.neon.tech/api/v2'


class VerificationError(RuntimeError):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        raise VerificationError('Neon metadata redirects are forbidden')


def metadata(path, key):
    if not key or any(char in key for char in '\r\n'):
        raise VerificationError('Neon API key is required for branch verification')
    request = Request(BASE + path, headers={'Authorization': 'Bearer ' + key,
                                            'Accept': 'application/json'}, method='GET')
    opener = build_opener(HTTPSHandler(context=ssl.create_default_context()), NoRedirect())
    try:
        with opener.open(request, timeout=20) as response:
            return json.load(response)
    except Exception:
        raise VerificationError('Neon metadata API verification failed; details suppressed') from None


def verify(test_url, production_url, key, fetch=None):
    """Bind both URLs to distinct branch IDs returned by Neon's authenticated API."""
    get = fetch or (lambda path: metadata(path, key))
    try:
        test, prod = urlsplit(test_url), urlsplit(production_url)
        if any(url.scheme not in ('postgres', 'postgresql') or url.path != '/neondb'
               or url.port not in (None, 5432) or url.fragment for url in (test, prod)):
            raise VerificationError('Direct neondb connections on the PostgreSQL port are required')
        test_host, prod_host = test.hostname, prod.hostname
        if not test_host or not prod_host or test_host.replace('-pooler', '') == prod_host.replace('-pooler', ''):
            raise VerificationError('A distinct test endpoint is required')
        project = get(f'/projects/{PROJECT}')['project']
        if project['id'] != PROJECT or project['region_id'] != 'example-region':
            raise VerificationError('Project or region mismatch')
        def branch(name):
            data = get(f'/projects/{PROJECT}/branches?' + urlencode({'search': name, 'limit': 100}))
            matches = [item for item in data['branches'] if item.get('name') == name]
            if len(matches) != 1 or matches[0].get('project_id') != PROJECT:
                raise VerificationError('Exact branch metadata could not be verified')
            item = matches[0]
            if not item['id'].startswith('br-') or not all(c.isalnum() or c == '-' for c in item['id']):
                raise VerificationError('Invalid branch metadata')
            return item
        test, production = branch(TEST_BRANCH), branch(PRODUCTION_BRANCH)
        if test['id'] == production['id']:
            raise VerificationError('Production branch is forbidden')
        def endpoint(branch_id, host):
            rows = get(f'/projects/{PROJECT}/branches/{branch_id}/endpoints')['endpoints']
            matches = [row for row in rows if row.get('host') == host]
            if len(matches) != 1:
                raise VerificationError('URL does not match the verified branch endpoint')
            row = matches[0]
            if (row.get('branch_id') != branch_id or row.get('project_id') != PROJECT
                    or row.get('region_id') != 'example-region'
                    or row.get('type') != 'read_write' or row.get('disabled', False)):
                raise VerificationError('Endpoint metadata mismatch')
            return row
        target = endpoint(test['id'], test_host)
        endpoint(production['id'], prod_host)
        # Non-secret evidence only. Do not return URLs, roles, passwords or API keys.
        return {'project_id': PROJECT, 'test_branch': TEST_BRANCH,
                'test_branch_id': test['id'], 'production_branch': PRODUCTION_BRANCH,
                'production_branch_id': production['id'], 'endpoint_id': target['id'],
                'region': 'example-region', 'verified_via': 'Neon authenticated GET metadata'}
    except VerificationError:
        raise
    except Exception:
        raise VerificationError('Incomplete or invalid Neon branch metadata') from None
