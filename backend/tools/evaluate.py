"""Shared classifier, five stratified folds; report held-out predictions per language."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import json
from sklearn.model_selection import StratifiedKFold,cross_val_predict
from pipeline.packs import training,installed,golden,load
from pipeline.classify import make_model
from pipeline.analyze import analyze

def evaluate():
    rows=[r for r in training() if r['language'] in ('en','hi','ta')];texts=[r['text'] for r in rows];labels=[r['intent'] for r in rows]
    cv=StratifiedKFold(n_splits=5,shuffle=True,random_state=42)
    predictions=cross_val_predict(make_model(),texts,labels,cv=cv)
    print('P13: formerly unsupported Malayalam command is checked as an incomplete, unsaved draft in the frozen P0 corpus.')
    print('Five-fold shared-model CV; accuracy from held-out rows per language. Golden files are not loaded for training; legacy overlaps reported below.')
    results={};passed=True
    for lang in installed():
        indices=[i for i,r in enumerate(rows) if r['language']==lang]
        accuracy=sum(predictions[i]==labels[i] for i in indices)/len(indices) if indices else None
        overlap=len({rows[i]['text'] for i in indices}&{r['text'] for r in golden(lang)})
        counts={k:{'passed':0,'total':0,'refused':0} for k in ('cancel','legitimate','medical','unsupported')}
        for row in golden(lang):
            result=analyze(row['text'],lang);stat=counts[row['category']]
            # Frozen P0 data includes a Malayalam command that P13 now supports.
            # Retain the corpus bytes; require safe clarification for that transition.
            transitioned=(row['category']=='unsupported' and result['detected_language'] in ('ml','kn','te'))
            correct=(result['intent']=='add_reminder' and set(result['missing'])>={'medicine','time','frequency'} and not result['safety']['triggered']) if transitioned else result['intent']==row['intent']
            stat['total']+=1;stat['passed']+=correct;stat['refused']+=result['safety']['triggered']
        gate=all(s['passed']==s['total'] for s in counts.values())
        reviewed=load(lang)['meta']['review_status']=='reviewed' and all(r['review_status']=='reviewed' for r in rows if r['language']==lang) and all(r['review_status']=='reviewed' for r in golden(lang))
        verdict=gate and reviewed
        results[lang]={'cv_accuracy':accuracy,'golden':counts,'golden_gate':gate,'l1':verdict,'reviewed':reviewed,'legacy_training_overlap':overlap}
        print(f'{lang}: CV={accuracy if accuracy is not None else "not trained (deterministic subset)"} n={len(indices)} cancel={counts["cancel"]["passed"]}/{counts["cancel"]["total"]} refused={counts["cancel"]["refused"]}; legitimate={counts["legitimate"]["passed"]}/{counts["legitimate"]["total"]} refused={counts["legitimate"]["refused"]}; medical refused={counts["medical"]["refused"]}/{counts["medical"]["total"]}; unsupported={counts["unsupported"]["passed"]}/{counts["unsupported"]["total"]}; golden_gate={gate}; L1={verdict} (native review required)')
        print(f'{lang}: exact golden/legacy-training overlap={overlap}; golden results are regression checks, not independent accuracy estimates.')
        passed &= gate
    (Path(__file__).resolve().parents[1]/'docs/evaluation.json').write_text(json.dumps(results,indent=2)+'\n',encoding='utf-8')
    return passed

if __name__=='__main__':sys.exit(0 if evaluate() else 1)
