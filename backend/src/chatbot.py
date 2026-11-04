"""Legacy auto-commit adapter. New clients use analyze + explicit commit."""
from src import db
from pipeline.analyze import analyze
from pipeline.packs import load

RESPONSES={key:{lang:load(lang)['replies'][key] for lang in ('en','hi','ta')} for key in load('en')['replies']}

class AarogyaVaaniBot:
    def __init__(self):db.init_db()

    def process_message(self,chat_id,text):
        # Preserve the original CLI/Telegram daily default only in this legacy adapter.
        # The authenticated API always uses analyze()'s strict recurrence default.
        result=analyze(text,require_recurrence=False)
        language=result['reply']['language'];replies=load(language)['replies']
        user_id=db.get_or_create_user(chat_id,language=language)
        intent=result['intent']
        if intent=='add_reminder':
            draft=result['draft']
            if result['missing']:return replies['add_reminder_missing_medicine'] if 'medicine' in result['missing'] else replies['draft']
            from src.entity_extract import extract_entities
            entities=extract_entities(text,language)
            db.add_reminder(user_id,draft['medicine'],entities['time_of_day'],entities['clock_time'],entities['frequency'],language,times=draft['times'],days_of_week=draft['days_of_week'])
            return replies['add_reminder_ok'].format(medicine=draft['medicine'],freq=entities['frequency'],when=', '.join(draft['times']))
        if intent=='view_reminders':
            reminders=db.get_active_reminders(user_id)
            return '\n'.join(f"- {r['medicine']} ({r['clock_time'] or r['times']})" for r in reminders) if reminders else replies['no_reminders']
        if intent=='cancel_reminder':
            from pipeline.extract import extract
            medicine=extract(text,language)[0]['medicine']
            count=db.cancel_reminder(user_id,medicine) if medicine else 0
            return replies['cancelled' if count else 'cancel_not_found']
        return result['reply']['text']
