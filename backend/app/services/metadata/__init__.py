"""Query all metadata providers concurrently and rank/merge the results."""

import asyncio
import difflib
import logging
import re
from dataclasses import dataclass, field
from typing import Awaitable, Dict, List, Optional, Set, Tuple

import httpx

from ...config import get_settings
from ...db import SessionLocal
from ...schemas import BookMetadata
from .. import app_settings
from .. import isbn as isbn_utils
from .base import USER_AGENT, Provider
from .apple_books import AppleBooks
from .crossref import Crossref
from .google_books import GoogleBooks
from .hardcover import Hardcover, HardcoverError
from .national_libraries import DNB, KB
from .open_library import OpenLibrary
from .openalex import OpenAlex
from .worldcat import WorldCat

log = logging.getLogger(__name__)

# Order is priority: when records are merged, earlier providers win for each field.
PROVIDERS: List[Provider] = [
    GoogleBooks(), Hardcover(), OpenLibrary(), AppleBooks(), KB(), DNB(), WorldCat(), Crossref(), OpenAlex(),
]
COVER_PRIORITY = ["apple_books", "hardcover", "google_books", "open_library"]
MERGE_FIELDS = [
    "subtitle", "publisher", "published_date", "isbn10", "isbn13", "doi", "language",
    "description", "page_count", "cover_url", "series", "series_index",
]


@dataclass
class LookupOutcome:
    candidates: List[BookMetadata]
    # Per provider: {"name", "label", "status": ok|no_results|error|disabled, "message"}
    providers: List[dict] = field(default_factory=list)


def disabled_providers() -> Set[str]:
    """Providers an administrator switched off (stored in the database)."""
    with SessionLocal() as db:
        return set(app_settings.get(db, app_settings.DISABLED_PROVIDERS, []))


def active_providers(disabled: Optional[Set[str]] = None) -> List[Provider]:
    disabled = disabled_providers() if disabled is None else disabled
    return [p for p in PROVIDERS if p.enabled() and p.name not in disabled]


def provider_note(provider: Provider) -> Optional[str]:
    """Configuration hint shown next to a provider in the UI."""
    if isinstance(provider, GoogleBooks) and not get_settings().google_books_api_key:
        return "No API key: uses Google's shared anonymous quota, which is usually exhausted"
    if isinstance(provider, WorldCat) and not provider.enabled():
        return "Needs OCLC WSKey credentials"
    if isinstance(provider, Hardcover) and not provider.enabled():
        return "Needs a free API token from hardcover.app"
    return None


def _describe_error(provider: Provider, exc: Exception) -> str:
    if isinstance(exc, HardcoverError):
        return f"API error: {exc}"
    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        if code == 429:
            if isinstance(provider, GoogleBooks) and not get_settings().google_books_api_key:
                return "Rate limited: set SHELFWISE_GOOGLE_BOOKS_API_KEY"
            return "Rate limited, try again later"
        if code in (401, 403):
            return "Access denied: check the API credentials"
        return f"HTTP {code}"
    if isinstance(exc, httpx.TimeoutException):
        return "Timed out"
    if isinstance(exc, httpx.HTTPError):
        return "Could not connect"
    return "Unexpected error"


async def _safe(provider: Provider, coro: Awaitable[List[BookMetadata]]) -> Tuple[List[BookMetadata], Optional[str]]:
    try:
        return await coro, None
    except Exception as exc:
        log.warning("Metadata provider %s failed: %s", provider.name, exc)
        return [], _describe_error(provider, exc)


def _norm_title(title: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", title.lower().split(":")[0]).strip()


def _similar(a: str, b: str) -> bool:
    a, b = _norm_title(a), _norm_title(b)
    return bool(a and b) and (a == b or difflib.SequenceMatcher(None, a, b).ratio() >= 0.85)


def _surnames(meta: BookMetadata) -> set:
    return {re.sub(r"[^a-z]", "", a.lower().split()[-1]) for a in meta.authors if a.split()}


def _same_work(a: BookMetadata, b: BookMetadata) -> bool:
    if not _similar(a.title, b.title):
        return False
    sa, sb = _surnames(a), _surnames(b)
    return not sa or not sb or bool(sa & sb)


def _merge(group: List[BookMetadata]) -> BookMetadata:
    """Combine several records for the same ISBN, preferring earlier (higher-priority) sources."""
    merged = group[0].model_copy(deep=True)
    for other in group[1:]:
        for f in MERGE_FIELDS:
            if not getattr(merged, f) and getattr(other, f):
                setattr(merged, f, getattr(other, f))
        if not merged.authors and other.authors:
            merged.authors = other.authors
        if not merged.categories and other.categories:
            merged.categories = other.categories
        # Longer descriptions are usually more useful.
        if other.description and len(other.description) > len(merged.description or "") * 2:
            merged.description = other.description
    # Cover quality differs a lot by source; pick the sharpest available.
    for source in COVER_PRIORITY:
        cover = next((g.cover_url for g in group if g.source == source and g.cover_url), None)
        if cover:
            merged.cover_url = cover
            break
    merged.source = "combined"
    merged.source_id = None
    merged.source_url = None
    return merged


def _key(meta: BookMetadata) -> str:
    return meta.isbn13 or f"{_norm_title(meta.title)}|{(meta.authors or [''])[0].lower()}"


async def lookup(
    isbn: Optional[str] = None,
    doi: Optional[str] = None,
    title: Optional[str] = None,
    author: Optional[str] = None,
    limit: int = 5,
    title_search: bool = False,
) -> LookupOutcome:
    """Look up by ISBN and/or DOI first. Providers without an exact hit then get a
    title/author search, using the title of the best identifier match when there is one.

    With `title_search` (a title the user typed), every provider is also searched by that
    title, and those results are kept even when they differ from the identifier match."""
    disabled = disabled_providers()
    providers = active_providers(disabled)
    settings = get_settings()
    found: Dict[str, List[BookMetadata]] = {p.name: [] for p in providers}
    errors: Dict[str, str] = {}

    async with httpx.AsyncClient(
        timeout=settings.metadata_timeout, headers={"User-Agent": USER_AGENT}, follow_redirects=True
    ) as client:
        isbn13 = isbn_utils.normalize(isbn) if isbn else None
        if isbn13:
            batches = await asyncio.gather(*(_safe(p, p.by_isbn(client, isbn13)) for p in providers))
            for p, (results, error) in zip(providers, batches):
                if error:
                    errors[p.name] = error
                # Providers sometimes return near-matches; keep only exact ISBN hits.
                for m in results:
                    if m.isbn13 in (None, isbn13):
                        m.isbn13 = m.isbn13 or isbn13
                        m.isbn10 = m.isbn10 or isbn_utils.to_isbn10(isbn13)
                        found[p.name].append(m)
        if doi:
            doi_providers = [p for p in providers if isinstance(p, (Crossref, OpenAlex))]
            batches = await asyncio.gather(*(_safe(p, p.by_doi(client, doi)) for p in doi_providers))
            for p, (results, error) in zip(doi_providers, batches):
                found[p.name] += results
                if error:
                    errors[p.name] = error

        exact = [m for p in providers for m in found[p.name]]
        explicit = title_search and bool(title)
        search_title = title if explicit or not exact else exact[0].title
        search_author = author if explicit or not exact else (exact[0].authors or [None])[0]
        pending = [p for p in providers if (explicit or not found[p.name]) and p.name not in errors]
        if search_title and pending:
            batches = await asyncio.gather(
                *(_safe(p, p.search(client, search_title, search_author, limit)) for p in pending)
            )
            for p, (results, error) in zip(pending, batches):
                if error:
                    errors[p.name] = error
                # With an identifier match in hand, only keep the same work (other editions).
                found[p.name] += [r for r in results if explicit or not exact or _similar(r.title, search_title)]

    statuses = []
    for p in PROVIDERS:
        if not p.enabled():
            status, message = "disabled", provider_note(p)
        elif p.name in disabled:
            status, message = "disabled", "Turned off in settings"
        elif p.name in errors and not found[p.name]:
            status, message = "error", errors[p.name]
        elif found[p.name]:
            status, message = "ok", f"{len(found[p.name])} result{'s' if len(found[p.name]) != 1 else ''}"
        else:
            status, message = "no_results", "No match"
        statuses.append({"name": p.name, "label": p.label, "status": status, "message": message})

    # Exact identifier matches first, then title matches; interleave providers so each
    # provider's best hit is near the top.
    ordered: List[BookMetadata] = list(exact)
    extra = [[m for m in found[p.name] if m not in exact] for p in providers]
    for i in range(max((len(b) for b in extra), default=0)):
        ordered += [b[i] for b in extra if i < len(b)]

    groups: Dict[str, List[BookMetadata]] = {}
    for r in ordered:
        if not r.title:
            continue
        key = _key(r)
        if not r.isbn13:
            # Sources without ISBNs (Apple Books, OpenAlex) join the record for the same work.
            key = next((k for k, g in groups.items() if _same_work(g[0], r)), key)
        groups.setdefault(key, []).append(r)
    ranked: List[BookMetadata] = []
    for group in groups.values():
        if len({g.source for g in group}) > 1:
            ranked.append(_merge(group))
        ranked.extend(group)
    return LookupOutcome(candidates=ranked[: max(limit * 3, 12)], providers=statuses)
