"""Small deterministic reminder grammar. No translation service or drug inference.

Quoted names are opaque user entities. They are never transliterated, spellchecked
or interpreted as medication identities. Legacy known-name shorthand is retained.
Only explicit clocks and representable daily recurrence can become complete drafts.
"""
import re
from pipeline.packs import load
from pipeline.safety import contains

QUOTED = re.compile(r'"([^"\n]{1,100})"|“([^”\n]{1,100})”')
NUMBERS = {
    'en': ['one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'],
    'hi': ['एक','दो','तीन','चार','पाँच','छह','सात','आठ','नौ','दस','ग्यारह','बारह'],
    'ta': ['ஒன்று','இரண்டு','மூன்று','நான்கு','ஐந்து','ஆறு','ஏழு','எட்டு','ஒன்பது','பத்து','பதினொன்று','பன்னிரண்டு'],
}
MARKERS = {'en': [], 'hi': ['बजे'], 'ta': ['மணிக்கு','மணி']}
DATED = {
    'hi': ['आज','कल','साप्ताहिक','सोमवार','मंगलवार','बुधवार','गुरुवार','शुक्रवार','शनिवार','रविवार'],
    'ta': ['இன்று','நாளை','வாரந்தோறும்','திங்கட்கிழமை','செவ்வாய்க்கிழமை','புதன்கிழமை','வியாழக்கிழமை','வெள்ளிக்கிழமை','சனிக்கிழமை','ஞாயிற்றுக்கிழமை'],
    'ml': ['ഇന്ന്','നാളെ','ആഴ്ചയിൽ'],
    'kn': ['ಇಂದು','ನಾಳೆ','ವಾರಕ್ಕೆ'],
    'te': ['ఈరోజు','రేపు','వారానికి'],
}


def entity(text):
    matches = list(QUOTED.finditer(text))
    # Multiple names need clarification, never silently pick the first medicine.
    return next((v for v in matches[0].groups() if v is not None), None) if len(matches)==1 else None


def clock_source(text, language):
    text = QUOTED.sub(' ', text).casefold()
    pack = load(language)['time_words']
    numbers = pack.get('numbers', dict(zip(NUMBERS.get(language, []), range(1,13))))
    # Whole whitespace-delimited words only, outside medicine entities.
    for word, number in sorted(numbers.items(), key=lambda pair: len(pair[0]), reverse=True):
        text = re.sub(r'(?<!\S)'+re.escape(word)+r'(?!\S)', str(number), text)
    markers = pack.get('clock_markers', MARKERS.get(language, []))
    for marker in sorted(markers, key=len, reverse=True):
        text = re.sub(r'(\d{1,2}(?:\s*:\s*\d{2})?)\s*'+re.escape(marker), r'at \1 ', text)
    return text


def recurrence(text, language):
    text = QUOTED.sub(' ', text)
    pack = load(language)['frequency_words']
    explicit = any(contains(text, word) for word in pack['words'])
    # Existing English recurrence handles dates, weekdays and unsupported intervals.
    if language=='en':
        from pipeline.english import recurrence as english_recurrence
        return english_recurrence(text)
    from pipeline.english import recurrence as english_recurrence
    # Catch borrowed English dates/intervals as well as each documented native
    # pack's unsupported recurrence. A quoted brand never supplies repetition.
    _, english_missing = english_recurrence('daily '+text)
    unsupported = bool(english_missing) or any(contains(text, word) for word in pack['unsupported']+DATED.get(language, []))
    if explicit and not unsupported:
        return 'daily', []
    return None, ['frequency']


def has_dosage(text, language):
    # A stated quantity is not a prescription. Ask the user to review it manually;
    # do not infer dosage from a tablet count or silently discard dose instructions.
    text = clock_source(text, language)
    return bool(re.search(r'(?<!\w)\d+(?:\.\d+)?\s*(?:mg\b|mcg\b|ml\b|tablets?\b|pills?\b|गोली|गोलियाँ|மாத்திரை|ഗുളിക|ಮಾತ್ರೆ|మాత్ర)', text))
