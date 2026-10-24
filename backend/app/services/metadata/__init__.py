"""Query all metadata providers concurrently and rank/merge the results."""

import asyncio
import logging
from typing import Awaitable, Dict, List, Optional

import httpx

from ...config import get_settings
from ...schemas import BookMetadata
from .. import isbn as isbn_utils
from .base import USER_AGENT, Provider
from .crossref import Crossref
from .google_books import GoogleBooks
from .open_library import OpenLibrary
from .worldcat import WorldCat

log = logging.getLogger(__name__)

PROVIDERS: List[Provider] = [GoogleBooks(), OpenLibrary(), WorldCat(), Crossref()]
MERGE_FIELDS = [
    "subtitle", "publisher", "published_date", "isbn10", "isbn13", "doi", "language",
    "description", "page_count", "cover_url", "series", "series_index",
]


def active_providers() -> List[Provider]:
    return [p for p in PROVIDERS if p.enabled()]


async def _safe(provider: Provider, coro: Awaitable[List[BookMetadata]]) -> List[BookMetadata]:
    try:
        return await coro
    except Exception as exc:
        log.warning("Metadata provider %s failed: %s", provider.name, exc)
        return []


def _merge(group: List[BookMetadata]) -> BookMetadata:
    """Combine several records for the same ISBN, preferring earlier (higher-priority) sources."""
    merged = group[0].model_copy(deep=True)
    for other in group[1:]:
        for field in MERGE_FIELDS:
            if not getattr(merged, field) and getattr(other, field):
                setattr(merged, field, getattr(other, field))
        if not merged.authors and other.authors:
            merged.authors = other.authors
        if not merged.categories and other.categories:
            merged.categories = other.categories
        # Longer descriptions are usually more useful.
        if other.description and len(other.description) > len(merged.description or "") * 2:
            merged.description = other.description
    merged.source = "combined"
    merged.source_id = None
    merged.source_url = None
    return merged


def _key(meta: BookMetadata) -> str:
    return meta.isbn13 or f"{meta.title.lower()}|{(meta.authors or [''])[0].lower()}"


async def lookup(
    isbn: Optional[str] = None,
    doi: Optional[str] = None,
    title: Optional[str] = None,
    author: Optional[str] = None,
    limit: int = 5,
) -> List[BookMetadata]:
    providers = active_providers()
    settings = get_settings()
    results: List[BookMetadata] = []
    async with httpx.AsyncClient(
        timeout=settings.metadata_timeout, headers={"User-Agent": USER_AGENT}, follow_redirects=True
    ) as client:
        isbn13 = isbn_utils.normalize(isbn) if isbn else None
        if isbn13:
            batches = await asyncio.gather(*(_safe(p, p.by_isbn(client, isbn13)) for p in providers))
            # Providers sometimes return near-matches; keep only exact ISBN hits.
            results += [m for b in batches for m in b if m.isbn13 in (None, isbn13)]
            for m in results:
                m.isbn13 = m.isbn13 or isbn13
                m.isbn10 = m.isbn10 or isbn_utils.to_isbn10(isbn13)
        if doi:
            crossref = next(p for p in PROVIDERS if isinstance(p, Crossref))
            results += await _safe(crossref, crossref.by_doi(client, doi))
        if not results and title:
            batches = await asyncio.gather(*(_safe(p, p.search(client, title, author, limit)) for p in providers))
            # Interleave so each provider's best hit is near the top.
            for i in range(max((len(b) for b in batches), default=0)):
                results += [b[i] for b in batches if i < len(b)]

    results = [r for r in results if r.title]
    groups: Dict[str, List[BookMetadata]] = {}
    for r in results:
        groups.setdefault(_key(r), []).append(r)

    ranked: List[BookMetadata] = []
    for group in groups.values():
        if len(group) > 1:
            ranked.append(_merge(group))
        ranked.extend(group)
    return ranked[: max(limit * 2, 10)]
