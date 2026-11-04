"""Shared clock marker grammar; never rewrite medicine or safety/classifier text."""
import re

# Android dictation commonly returns "p.m." or "p. m.". Require a complete
# marker, so "amoxicillin"/"pmol" cannot supply an AM/PM suffix to a number.
AM_PM = r'[ap]\s*\.?\s*m(?:\s*\.)?(?!\w)'


def canonical_marker(marker):
    """Canonicalize only the captured marker; native-script markers stay intact."""
    compact = re.sub(r'[.\s]', '', marker or '').casefold()
    return compact if compact in ('am', 'pm') else marker
