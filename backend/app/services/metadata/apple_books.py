"""Apple Books via the public iTunes Search API (no key needed)."""

import re
from typing import List, Optional

import httpx

from ...config import get_settings
from ...schemas import BookMetadata
from .base import Provider, split_title, strip_html

API = "https://itunes.apple.com"


class AppleBooks(Provider):
    name = "apple_books"
    label = "Apple Books"

    def _country(self) -> str:
        return (get_settings().apple_books_country or "us").lower()

    def _parse(self, item: dict) -> BookMetadata:
        artwork = item.get("artworkUrl100") or item.get("artworkUrl60")
        if artwork:
            # Artwork URLs encode the size; ask for a large rendition.
            artwork = re.sub(r"/\d+x\d+bb\.", "/1000x1000bb.", artwork)
        author = item.get("artistName") or ""
        # Apple files some titles as "Pragmatic Programmer, The".
        title, subtitle = split_title(item.get("trackName", ""))
        return BookMetadata(
            title=title,
            subtitle=subtitle,
            authors=[a.strip() for a in re.split(r"\s*(?:&|,| and )\s*", author) if a.strip()],
            published_date=(item.get("releaseDate") or "")[:10] or None,
            description=strip_html(item.get("description")),
            categories=[g for g in item.get("genres", []) if g not in ("Books", "Boeken")][:6],
            cover_url=artwork,
            source=self.name,
            source_id=str(item.get("trackId") or ""),
            source_url=item.get("trackViewUrl"),
        )

    async def by_isbn(self, client: httpx.AsyncClient, isbn: str) -> List[BookMetadata]:
        resp = await client.get(f"{API}/lookup", params={"isbn": isbn, "country": self._country()})
        resp.raise_for_status()
        results = [self._parse(i) for i in resp.json().get("results", []) if i.get("kind") == "ebook"]
        for r in results:
            r.isbn13 = isbn
        return results

    async def search(self, client, title, author: Optional[str] = None, limit: int = 5):
        term = f"{title} {author}" if author else title
        resp = await client.get(
            f"{API}/search",
            params={"term": term, "media": "ebook", "entity": "ebook", "limit": str(limit), "country": self._country()},
        )
        resp.raise_for_status()
        return [self._parse(i) for i in resp.json().get("results", [])]
