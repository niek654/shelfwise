import re
from typing import List, Optional

import httpx

from ...schemas import BookMetadata
from .. import isbn as isbn_utils

USER_AGENT = "Shelfwise/0.1 (+https://github.com/niek654/shelfwise)"


class Provider:
    name: str = "base"
    label: str = "Base"

    def enabled(self) -> bool:
        return True

    async def by_isbn(self, client: httpx.AsyncClient, isbn: str) -> List[BookMetadata]:
        return []

    async def by_doi(self, client: httpx.AsyncClient, doi: str) -> List[BookMetadata]:
        return []

    async def search(
        self, client: httpx.AsyncClient, title: str, author: Optional[str] = None, limit: int = 5
    ) -> List[BookMetadata]:
        return []


def fill_isbns(meta: BookMetadata, isbns: List[str]) -> BookMetadata:
    for raw in isbns:
        value = isbn_utils.clean(raw)
        if len(value) == 13 and isbn_utils.is_valid_isbn13(value):
            meta.isbn13 = meta.isbn13 or value
        elif len(value) == 10 and isbn_utils.is_valid_isbn10(value):
            meta.isbn10 = meta.isbn10 or value
    if meta.isbn13 and not meta.isbn10:
        meta.isbn10 = isbn_utils.to_isbn10(meta.isbn13)
    if meta.isbn10 and not meta.isbn13:
        meta.isbn13 = isbn_utils.to_isbn13(meta.isbn10)
    return meta


def strip_html(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    return re.sub(r"<[^>]+>", "", value).strip() or None


_ARTICLE = re.compile(r"^(.*?)\s*, (The|A|An|De|Het|Een|Der|Die|Das|Le|La|Les)$")


def split_title(raw: str) -> "tuple[str, Optional[str]]":
    """'Pragmatic Programmer, The: Your journey' -> ('The Pragmatic Programmer', 'Your journey')."""
    main, _, sub = re.sub(r"\s+:\s*", ": ", raw or "").partition(": ")
    main = _ARTICLE.sub(r"\2 \1", main.strip())
    return main, sub.strip() or None
