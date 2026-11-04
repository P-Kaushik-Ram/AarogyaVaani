"""Mock API metadata only. No credentials, Neon calls or schema writes."""
import copy
import io
from contextlib import contextmanager
from unittest.mock import Mock
import pytest
from tools import neon_branch_guard as guard, secure_neon_test_setup as setup


def responses():
    project = guard.PROJECT
    return {
        f'/projects/{project}': {'project': {'id': project, 'region_id': 'example-region'}},
        f'/projects/{project}/branches?search=example-test-branch&limit=100': {'branches': [
            {'id': 'br-test', 'name': 'example-test-branch', 'project_id': project}]},
        f'/projects/{project}/branches?search=production&limit=100': {'branches': [
            {'id': 'br-production', 'name': 'production', 'project_id': project}]},
        f'/projects/{project}/branches/br-test/endpoints': {'endpoints': [
            {'id': 'ep-test', 'host': 'test.invalid', 'branch_id': 'br-test', 'project_id': project,
             'region_id': 'example-region', 'type': 'read_write'}]},
        f'/projects/{project}/branches/br-production/endpoints': {'endpoints': [
            {'id': 'ep-production', 'host': 'production.invalid', 'branch_id': 'br-production', 'project_id': project,
             'region_id': 'example-region', 'type': 'read_write'}]},
    }


TEST = 'postgresql://synthetic:synthetic@test.invalid/neondb?sslmode=require&channel_binding=require'
PRODUCTION = 'postgresql://synthetic:synthetic@production.invalid/neondb'


def test_api_metadata_binds_url_to_exact_branch():
    result = guard.verify(TEST, PRODUCTION, 'synthetic', fetch=responses().__getitem__)
    assert result['test_branch_id'] == 'br-test'
    assert result['production_branch_id'] == 'br-production'
    assert 'synthetic' not in str(result)


@pytest.mark.parametrize('mutation', ['wrong_branch', 'wrong_endpoint_branch', 'wrong_project',
    'wrong_region', 'wrong_host', 'ambiguous', 'api_failure'])
def test_metadata_mismatch_stops_before_database(mutation):
    data = responses()
    branch_key = f'/projects/{guard.PROJECT}/branches?search=example-test-branch&limit=100'
    endpoint_key = f'/projects/{guard.PROJECT}/branches/br-test/endpoints'
    if mutation == 'wrong_branch':
        data[branch_key]['branches'][0]['name'] = 'production'
    elif mutation == 'wrong_endpoint_branch':
        data[endpoint_key]['endpoints'][0]['branch_id'] = 'br-production'
    elif mutation == 'wrong_project':
        data[endpoint_key]['endpoints'][0]['project_id'] = 'another-project'
    elif mutation == 'wrong_region':
        data[endpoint_key]['endpoints'][0]['region_id'] = 'aws-us-east-1'
    elif mutation == 'wrong_host':
        data[endpoint_key]['endpoints'][0]['host'] = 'unrelated.invalid'
    elif mutation == 'ambiguous':
        data[branch_key]['branches'].append(copy.deepcopy(data[branch_key]['branches'][0]))
    else:
        data = {}
    with pytest.raises(guard.VerificationError):
        guard.verify(TEST, PRODUCTION, 'synthetic', fetch=data.__getitem__)


@pytest.mark.parametrize('verified', [False, True])
def test_secure_test_setup_preserves_production_and_stops_on_bad_metadata(tmp_path, monkeypatch, verified):
    production, test = tmp_path / '.env', tmp_path / '.env.test'
    original = 'DATABASE_URL=' + PRODUCTION + '\nUNRELATED=preserved\n'
    production.write_text(original)
    verify = Mock(return_value={}) if verified else Mock(side_effect=guard.VerificationError('synthetic'))
    monkeypatch.setattr(setup, 'verify', verify)
    calls = []
    @contextmanager
    def connection():
        calls.append('read-only')
        conn = Mock()
        conn.execute.return_value.fetchone.return_value = (1, 'neondb')
        yield conn
    monkeypatch.setattr(setup.postgres, 'connection', connection)
    output = io.StringIO()
    result = setup.run(test, production, io.StringIO('NEW\n' + TEST + '\nsynthetic-api-key\n'), output)
    assert result == (0 if verified else 1)
    assert production.read_text() == original
    assert TEST not in output.getvalue() and 'synthetic-api-key' not in output.getvalue()
    if verified:
        assert test.is_file() and calls == ['read-only']
        from dotenv import dotenv_values
        values = dotenv_values(test, interpolate=False)
        assert 'DATABASE_URL' not in values
        assert values['NEON_API_KEY'] == 'synthetic-api-key'
    else:
        assert not test.exists() and calls == []
