"""Compatibility fields; vocabulary comes from language packs."""
import re
from pipeline.packs import load,installed

MEDICINES={c:load(c)['medicines']['names'] for c in installed()}
TIME_OF_DAY={c:load(c)['time_words']['words'] for c in installed()}
FREQUENCY={c:load(c)['frequency_words']['words'] for c in installed()}

def extract_medicine(text,language):
    return next((m for m in sorted(MEDICINES.get(language,[])+MEDICINES['en'],key=len,reverse=True) if m.casefold() in text.casefold()),None)

def extract_time_of_day(text,language):
    return next((v for k,v in TIME_OF_DAY.get(language,{}).items() if k in text),None)

def extract_clock_time(text):
    match=re.search(r'(?<!\w)(\d{1,2})(?::(\d{2}))?\s*(am|pm|மணி|बजे)',text,re.I)
    if not match:return None
    return f"{match[1]}:{match[2] or '00'}"+(f' {match[3].lower()}' if match[3].lower() in ('am','pm') else '')

def extract_frequency(text,language):
    return next((v for k,v in FREQUENCY.get(language,{}).items() if k in text),'once_daily')

def extract_entities(text,language):
    return {'medicine':extract_medicine(text,language),'time_of_day':extract_time_of_day(text,language),'clock_time':extract_clock_time(text),'frequency':extract_frequency(text,language)}
