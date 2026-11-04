"""Default tests must never inherit a real production database URL."""
import pytest


@pytest.fixture(autouse=True)
def isolate_database_url(monkeypatch):
    monkeypatch.delenv('DATABASE_URL', raising=False)
