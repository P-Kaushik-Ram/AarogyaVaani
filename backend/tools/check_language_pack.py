"""Validate structure, schemas and command/safety collisions without model training."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import re
from pipeline.packs import ROOT,FILES,installed,load,golden,training

def check():
    errors=[]
    reply_keys=set(load('en')['replies'])
    rows=training()
    for lang in installed():
        folder=ROOT/lang
        try:
            for name in [f'{f}.json' for f in FILES]+['training.csv','golden_test.csv']:
                assert (folder/name).is_file(),f'missing {name}'
            p=load(lang)
            assert p['meta']['code']==lang
            assert {'script','speech_locale','readiness_ui','readiness_understanding','readiness_voice','review_status'}<=p['meta'].keys()
            assert set(p['replies'])==reply_keys,'reply key mismatch'
            assert {'add','view','cancel','help','greeting'}<=p['commands'].keys()
            assert all(isinstance(p['commands'][k],list) and p['commands'][k] for k in p['commands'])
            assert isinstance(p['medicines']['names'],list)
            assert p['medicines']['names'] or p['medicines'].get('entity_mode')=='quoted-user-input'
            assert all(isinstance(n,str) and n.strip() for n in p['medicines']['names'])
            assert {'words','defaults'}<=p['time_words'].keys()
            assert {'morning','afternoon','evening','night'}==p['time_words']['defaults'].keys()
            assert {'words','twice_defaults','unsupported'}<=p['frequency_words'].keys()
            assert len(p['frequency_words']['twice_defaults'])==2
            assert all(re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d',t) for t in list(p['time_words']['defaults'].values())+p['frequency_words']['twice_defaults'])
            assert len(golden(lang))>=50,'golden set below 50'
            assert len({r['text'] for r in golden(lang)})==len(golden(lang)),'duplicate golden text'
            assert all(r['review_status'] and r['text'] and r['intent'] for r in rows if r['language']==lang)
            for pattern in p['safety']['patterns']:
                re.compile(pattern)
                for code in installed():
                    for verb in load(code)['commands']['cancel']:
                        assert not re.search(pattern,verb,re.I),f'cancel collision: {code}'
            for row in golden(lang):
                assert row['category'] in ('medical','legitimate','cancel','unsupported')
                assert row['review_status']
            print(f'{lang}: PASS ({len(golden(lang))} golden rows)')
        except (AssertionError,KeyError,ValueError) as exc:
            errors.append(f'{lang}: {exc}')
    if errors:
        print('\n'.join(errors));return False
    return True

if __name__=='__main__':sys.exit(0 if check() else 1)
