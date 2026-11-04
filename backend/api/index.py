"""Vercel ASGI entry point; forbid ephemeral SQLite in serverless production."""
import os
from deployment.server import configured_app

if not os.environ.get('DATABASE_URL'):
    raise RuntimeError('Server-side DATABASE_URL required on Vercel')
# Vercel imports the ASGI entry during builds. Do not connect or mutate schema at
# import time; request readiness checks fail closed until the schema is approved.
app = configured_app(validate_on_start=False)
