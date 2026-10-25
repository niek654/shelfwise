"""Normalise the many ways sources write a language ("en", "eng", "en-US", "Dutch") to ISO 639-1."""

import re
from typing import Optional

_ALIASES = {
    # ISO 639-2 bibliographic and terminology codes
    "eng": "en", "dut": "nl", "nld": "nl", "ger": "de", "deu": "de", "fre": "fr", "fra": "fr",
    "spa": "es", "ita": "it", "por": "pt", "swe": "sv", "dan": "da", "nor": "no", "nob": "nb",
    "nno": "nn", "fin": "fi", "pol": "pl", "rus": "ru", "jpn": "ja", "chi": "zh", "zho": "zh",
    "kor": "ko", "ara": "ar", "tur": "tr", "gre": "el", "ell": "el", "lat": "la", "cze": "cs",
    "ces": "cs", "hun": "hu", "heb": "he", "fry": "fy", "ice": "is", "isl": "is", "ukr": "uk",
    # English and native names some files use
    "english": "en", "dutch": "nl", "nederlands": "nl", "german": "de", "deutsch": "de",
    "french": "fr", "français": "fr", "francais": "fr", "spanish": "es", "español": "es",
    "italian": "it", "italiano": "it", "portuguese": "pt", "swedish": "sv", "danish": "da",
    "norwegian": "no", "finnish": "fi", "polish": "pl", "russian": "ru", "japanese": "ja",
    "chinese": "zh", "flemish": "nl", "vlaams": "nl",
}


def normalize_language(value: Optional[str]) -> Optional[str]:
    if not value or not value.strip():
        return None
    raw = value.strip().lower()
    base = re.split(r"[-_]", raw, maxsplit=1)[0]  # "en-US" -> "en"
    if re.fullmatch(r"[a-z]{2}", base):
        return base
    return _ALIASES.get(base) or _ALIASES.get(raw) or raw[:16]


def parse_year(value: Optional[str]) -> Optional[int]:
    """First plausible publication year in a free-form date ("09/15/2019", "Sep 2019", "2019-07-30")."""
    # Digit boundaries rather than \b, so catalogue forms like "c1965" and "©1965" also match.
    match = re.search(r"(?<!\d)(1[4-9]\d\d|20\d\d)(?!\d)", value or "")
    return int(match.group(1)) if match else None
