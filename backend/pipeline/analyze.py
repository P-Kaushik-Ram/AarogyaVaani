from pipeline.detect import detect_language
from pipeline.classify import classify
from pipeline.extract import extract
from pipeline.packs import load,installed
from pipeline.multilingual import recurrence as multilingual_recurrence
from pipeline.safety import command,triggered
from pipeline.english import normalize,is_shorthand

def analyze(text,ui_language='en',reminders=(),*,require_recurrence=True):
    """Pure operation: no database access, logging, or reminder writes."""
    language=detect_language(text,ui_language)
    # Understanding follows the instruction script; replies follow the selected UI.
    # Preserve detected-language replies only for the separate legacy CLI adapter.
    reply_language=ui_language if require_recurrence and ui_language in installed() else (language if language!='unsupported' else 'en')
    replies=load(reply_language)['replies']
    result={'detected_language':language,'intent':'unsupported_language','confidence':0.0,'safety':{'triggered':False,'reason':None},'draft':None,'missing':[],'candidates':{},'matches':[],'reply':{'text':replies['unsupported'],'language':reply_language}}
    if language=='unsupported' or (not require_recurrence and language in ('ml','kn','te')):return result
    original=text
    entity_text=original if any(mark in original for mark in ('"','“')) else None
    if language=='en':text=normalize(text)
    clarification=None
    predicted,confidence=classify(text) if language in ('en','hi','ta') else ('out_of_scope',0.0)
    recognized=command(text,language)
    unsafe=bool(triggered(text))
    if language=='en' and not unsafe and require_recurrence:
        if recognized is None and is_shorthand(text):
            recognized='add_reminder'
        elif recognized is None and predicted=='add_reminder':
            # A medicine mention in unrelated prose is insufficient evidence to add.
            predicted='out_of_scope'
    if language in ('ml','kn','te') and recognized is None and not unsafe:return result
    intent='out_of_scope' if unsafe else (recognized or predicted)
    # The statistical safety layer remains fail-closed for unrecognised requests.
    unsafe=unsafe or (intent=='out_of_scope')
    result.update(intent=intent,confidence=confidence,safety={'triggered':unsafe,'reason':('phrase' if triggered(text) else 'classifier') if unsafe else None})
    if intent=='add_reminder':
        result['draft'],result['missing'],result['candidates']=extract(entity_text if require_recurrence and entity_text else text,language,strict=require_recurrence)
        reply='draft'
        if require_recurrence:
            days,missing=multilingual_recurrence(text,language)
            result['draft']['days_of_week']=days
            result['missing']=list(dict.fromkeys(result['missing']+missing))
            if result['missing']:
                key=next((field for field in ('medicine','time_invalid','time_ambiguous','time','dosage','date','frequency') if field in result['missing']),None)
                reply_key={'medicine':'add_reminder_missing_medicine','time':'missing_time','time_invalid':'missing_time'}.get(key,key)
                if reply_key in replies:clarification=replies[reply_key]
    elif intent=='cancel_reminder':
        draft,_,_=extract(entity_text if require_recurrence and entity_text else text,language,strict=require_recurrence)
        result['matches']=[{'id':r['id'],'medicine':r['medicine']} for r in reminders if draft['medicine'] and r['medicine'].casefold()==draft['medicine'].casefold()]
        reply='cancel_review' if require_recurrence else 'draft'
    elif intent=='view_reminders':
        result['matches']=[{'id':r['id'],'medicine':r['medicine']} for r in reminders]
        reply=('view_reminders' if require_recurrence else 'draft') if reminders else 'no_reminders'
    else:reply=intent if intent in replies else 'out_of_scope'
    result['reply']['text']=clarification or replies[reply]
    return result
