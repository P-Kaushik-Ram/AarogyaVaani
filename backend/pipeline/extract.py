import re
from pipeline.packs import load
from pipeline.clock import AM_PM, canonical_marker
from pipeline.multilingual import QUOTED,entity,clock_source,has_dosage

# Match contextual clock expressions, not digits inside medicine names (B12).
CLOCK = re.compile(rf'(?:(?<=\bat )|(?<!\w))(?P<h>\d{{1,2}})(?:\s*:\s*(?P<m>\d{{2}}))?\s*(?P<marker>{AM_PM}|மணி(?:க்கு)?|बजे)?',re.I)

def extract(text,language,*,strict=False):
    pack=load(language); lower=text.casefold()
    names=pack['medicines']['names']+load('en')['medicines']['names']
    medicine=next((name for name in sorted(names,key=len,reverse=True) if name.casefold() in lower),None)
    if strict:
        quoted=list(QUOTED.finditer(text))
        if any(mark in text for mark in ('"','“','”')):medicine=entity(text)
        lower=clock_source(text,language)
    words={**load('en')['time_words']['words'],**pack['time_words']['words']}
    periods=list(dict.fromkeys(v for k,v in words.items() if k in lower))
    frequencies={**load('en')['frequency_words']['words'],**pack['frequency_words']['words']}
    twice=any(k in lower and v=='twice_daily' for k,v in frequencies.items())
    missing=[]; candidates={}; times=[]
    if not medicine or not medicine.strip(): missing.append('medicine')
    matches=[]
    for m in CLOCK.finditer(lower):
        # No marker/colon/at: not a clock. Native digits are accepted by int().
        before=lower[max(0,m.start()-3):m.start()]
        if not (m['marker'] or m['m'] or before.endswith('at ')):
            continue
        matches.append(m)
    for m in matches:
        hour=int(m['h']); minute=int(m['m'] or 0); marker=canonical_marker(m['marker'])
        if minute>59 or hour>23 or (marker in ('am','pm') and not 1<=hour<=12):
            missing.append('time_invalid'); continue
        if marker in ('am','pm'):
            hour=hour%12+(12 if marker=='pm' else 0)
        elif strict and periods and hour==12:
            missing.append('time_ambiguous')
            candidates['times']=[f'00:{minute:02}',f'12:{minute:02}'];continue
        elif periods and 0<hour<=12:
            # Each clock uses its nearest preceding period, rather than the
            # first period of the entire sentence (morning 8 and night 9).
            preceding=[(lower.rfind(k,0,m.start()),v) for k,v in words.items() if lower.rfind(k,0,m.start())>=0]
            period=max(preceding,default=(-1,None if strict else periods[0]))[1]
            if period is None:
                missing.append('time_ambiguous')
                candidates['times']=[f'{hour%12:02}:{minute:02}',f'{hour%12+12:02}:{minute:02}'];continue
            if period in ('afternoon','evening','night'):hour=hour%12+12
            elif hour==12:hour=0
        elif hour<13 and m['m'] is None:
            missing.append('time_ambiguous')
            candidates['times']=[f'{hour%12:02}:{minute:02}',f'{hour%12+12:02}:{minute:02}'];continue
        times.append(f'{hour:02}:{minute:02}')
    if strict and len(matches)>1 and 'time_ambiguous' in missing:
        candidates={}  # Correct the full sentence; a single chip cannot resolve several clocks.
    if not matches and not strict:
        times=[pack['time_words']['defaults'][period] for period in periods]
    if twice and strict and len(set(times))!=2:missing.append('time')
    if twice and not strict and 'time_ambiguous' not in missing:
        if not times: times=pack['frequency_words']['twice_defaults'].copy()
        elif len(set(times))==1:
            times+= [t for t in pack['frequency_words']['twice_defaults'] if t not in times][:1]
    if not times and not any(k.startswith('time_') for k in missing): missing.append('time')
    if strict and has_dosage(text,language):missing.append('dosage')
    # Unsupported recurrence is explicitly clarified, never silently converted to daily.
    if any(k in lower for k in pack['frequency_words']['unsupported']+load('en')['frequency_words']['unsupported']):
        missing.append('frequency')
    return {'medicine':medicine,'times':sorted(set(times)),'days_of_week':'daily','note':None},list(dict.fromkeys(missing)),candidates
