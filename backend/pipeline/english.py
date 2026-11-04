"""Bounded English reminder syntax, independent of classifier probabilities.

Only complete medicine + temporal phrases match; advice/questions and arbitrary
surrounding prose cannot match. Phrase safety still has precedence in analyze().
"""
import re
from functools import lru_cache
from pipeline.packs import load
from pipeline.clock import AM_PM


def normalize(text):
    return ' '.join(text.split()).casefold()


@lru_cache
def shorthand_pattern():
    names = sorted({normalize(n) for n in load('en')['medicines']['names']}, key=len, reverse=True)
    medicine = '(?:' + '|'.join(re.escape(n) for n in names) + ')'
    clock = rf'(?:[0-9]{{1,2}}(?:\s*:\s*[0-9]{{2}})? *(?:{AM_PM})?)(?![a-z0-9])'
    period = '(?:' + '|'.join(re.escape(w) for w in load('en')['time_words']['words']) + ')'
    frequency = '(?:' + '|'.join(re.escape(w) for w in load('en')['frequency_words']['words']) + ')'
    # A bare hour needs "at"; without it, require a colon or AM/PM marker.
    explicit_clock = rf'(?:[0-9]{{1,2}}\s*:\s*[0-9]{{2}} *(?:{AM_PM})?|[0-9]{{1,2}} *(?:{AM_PM}))(?![a-z0-9])'
    temporal = rf'(?:at {clock}|{explicit_clock}|(?:in the |every )?{period})'
    # Dictation commas are permitted only between the existing grammar fields;
    # fullmatch still excludes questions and unrelated surrounding prose.
    separator = r'(?: +|, *)'
    return re.compile(rf'{medicine}(?:{separator}(?:today|tomorrow|tonight))?{separator}(?:{temporal}(?:{separator}{frequency})?|{frequency})\.?')


def is_shorthand(text):
    return bool(shorthand_pattern().fullmatch(normalize(text)))


def recurrence(text):
    """Return representable recurrence or explicit missing fields; never guess daily.

    Current English NLP represents daily repetition only. API form clients can
    still explicitly supply weekdays. One-off dates need a future data model.
    """
    text = normalize(text)
    frequencies = load('en')['frequency_words']
    explicit = any(re.search(r'\b' + re.escape(w) + r'\b', text) for w in frequencies['words'])
    periods = '|'.join(re.escape(w) for w in load('en')['time_words']['words'])
    explicit = explicit or bool(re.search(rf'\bevery (?:{periods})\b', text))
    unsupported = any(re.search(r'\b' + re.escape(w) + r'\b', text) for w in frequencies['unsupported'])
    unsupported = unsupported or bool(re.search(
        r'\b(?:mon|tues|wednes|thurs|fri|satur|sun)days?\b|\b(?:weekly|monthly|weekends?|weekdays?|annually|hourly)\b|\bevery \d+\b', text))
    dated = bool(re.search(
        r'\b(?:today|tomorrow|tonight|yesterday|once only|just once|one[ -]off|next week|next month)\b'
        r'|\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}/\d{1,2}(?:/\d{2,4})?\b'
        r'|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b', text))
    missing = []
    if dated:
        missing.append('date')
    if not explicit or unsupported or dated:
        missing.append('frequency')
    return ('daily' if not missing else None), missing
