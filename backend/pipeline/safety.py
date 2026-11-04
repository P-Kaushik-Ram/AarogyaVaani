"""Command recognition precedes phrase checks; commands cannot mask advice."""
import re
from pipeline.packs import installed,load

def contains(text, phrase):
    if phrase.isascii() and phrase.strip().isalpha():
        return bool(re.search(r'\b'+re.escape(phrase.strip())+r'\b',text,re.I))
    return phrase.casefold() in text.casefold()

def command(text,language):
    commands=load(language)['commands']
    # Cancellation has priority over the add stem inside 'reminder'.
    for key,intent in [('cancel','cancel_reminder'),('view','view_reminders'),('add','add_reminder'),('help','help')]:
        if any(contains(text,p) for p in commands[key]):
            return intent
    if text.casefold().strip(' !.?') in commands['greeting']:
        return 'greeting'
    return None

def triggered(text):
    # Scan every installed pack: switching scripts or mixing languages cannot disable safety.
    return any(re.search(pattern,text,re.I) for code in installed() for pattern in load(code)['safety']['patterns'])
