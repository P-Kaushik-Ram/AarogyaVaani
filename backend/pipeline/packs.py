import csv
import json
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'data' / 'languages'
FILES = ('meta','safety','commands','time_words','frequency_words','medicines','replies')

@lru_cache
def load(code):
    if code not in installed():
        raise ValueError('unsupported language')
    return {name:json.loads((ROOT/code/f'{name}.json').read_text(encoding='utf-8')) for name in FILES}

def installed():
    return sorted(p.name for p in ROOT.iterdir() if p.is_dir() and (p/'meta.json').exists())

def training():
    return [dict(row,language=lang) for lang in installed() for row in csv.DictReader((ROOT/lang/'training.csv').open(encoding='utf-8'))]

def golden(lang):
    with (ROOT/lang/'golden_test.csv').open(encoding='utf-8') as f:
        return list(csv.DictReader(f))
