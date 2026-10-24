"""ISBN parsing, validation and conversion."""

import re
from typing import List, Optional

_CANDIDATE = re.compile(r"(?:97[89][\s-]?)?(?:\d[\s-]?){9}[\dXx]")


def clean(value: str) -> str:
    return re.sub(r"[^0-9Xx]", "", value or "").upper()


def is_valid_isbn10(isbn: str) -> bool:
    if not re.fullmatch(r"\d{9}[\dX]", isbn):
        return False
    total = sum((10 - i) * (10 if c == "X" else int(c)) for i, c in enumerate(isbn))
    return total % 11 == 0


def is_valid_isbn13(isbn: str) -> bool:
    if not re.fullmatch(r"97[89]\d{10}", isbn):
        return False
    total = sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(isbn))
    return total % 10 == 0


def to_isbn13(isbn: str) -> Optional[str]:
    isbn = clean(isbn)
    if is_valid_isbn13(isbn):
        return isbn
    if not is_valid_isbn10(isbn):
        return None
    core = "978" + isbn[:9]
    check = (10 - sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(core)) % 10) % 10
    return core + str(check)


def to_isbn10(isbn: str) -> Optional[str]:
    isbn = clean(isbn)
    if is_valid_isbn10(isbn):
        return isbn
    if not is_valid_isbn13(isbn) or not isbn.startswith("978"):
        return None
    core = isbn[3:12]
    check = (11 - sum((10 - i) * int(c) for i, c in enumerate(core)) % 11) % 11
    return core + ("X" if check == 10 else str(check))


def normalize(isbn: str) -> Optional[str]:
    """Return a valid ISBN-13 for any valid ISBN-10/13 input, else None."""
    return to_isbn13(isbn)


def find_isbns(text: str) -> List[str]:
    """Find all valid ISBNs in free text, normalised to ISBN-13, in order of appearance."""
    found: List[str] = []
    for match in _CANDIDATE.finditer(text or ""):
        isbn = normalize(match.group(0))
        if isbn and isbn not in found:
            found.append(isbn)
    return found
