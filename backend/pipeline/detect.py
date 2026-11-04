from pipeline.packs import installed,load

RANGES = {'hi':(0x900,0x97f),'ta':(0xb80,0xbff),'te':(0xc00,0xc7f),'kn':(0xc80,0xcff),'ml':(0xd00,0xd7f)}

def detect_language(text, ui_language='en'):
    # Quoted user entities do not determine the instruction's language.
    from pipeline.multilingual import QUOTED
    text=QUOTED.sub(' ',text)
    # Native scripts take precedence over borrowed Latin medicine names.
    counts={lang:sum(lo<=ord(c)<=hi for c in text) for lang,(lo,hi) in RANGES.items()}
    largest=max(counts.values())
    if largest:
        tied=[lang for lang,count in counts.items() if count==largest]
        code=ui_language if ui_language in tied else tied[0]
    else:
        code='unsupported' if any(c.isalpha() and not ('a'<=c.lower()<='z') for c in text) else 'en'
    if code=='en' and ui_language in ('ml','kn','te'):
        from pipeline.safety import contains
        commands=load(ui_language)['commands']
        if any(p.isascii() and contains(text,p) for key in ('add','view','cancel') for p in commands[key]):
            code=ui_language
    return code if code in installed() else 'unsupported'
