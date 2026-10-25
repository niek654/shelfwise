"""Hardcover (hardcover.app) GraphQL API. Needs a personal API token.

Strong on series information. Free tokens allow 60 requests/minute and
5,000/day; each lookup uses one request.
"""

from typing import List, Optional

import httpx

from ...config import get_settings
from ...schemas import BookMetadata
from .. import isbn as isbn_utils
from .base import Provider, fill_isbns

API = "https://api.hardcover.app/v1/graphql"

EDITION_QUERY = """
query EditionByIsbn($isbn13: String!, $isbn10: String!) {
  editions(where: {_or: [{isbn_13: {_eq: $isbn13}}, {isbn_10: {_eq: $isbn10}}]}, limit: 1) {
    title
    subtitle
    isbn_10
    isbn_13
    pages
    release_date
    cached_image
    publisher { name }
    book {
      slug
      title
      subtitle
      description
      cached_tags
      contributions { author { name } }
      book_series { position series { name } }
    }
  }
}
"""

SEARCH_QUERY = """
query SearchBooks($query: String!, $perPage: Int!) {
  search(query: $query, query_type: "Book", per_page: $perPage, page: 1) { results }
}
"""


class HardcoverError(Exception):
    pass


class Hardcover(Provider):
    name = "hardcover"
    label = "Hardcover"

    def enabled(self) -> bool:
        return bool(get_settings().hardcover_api_token)

    async def _query(self, client: httpx.AsyncClient, query: str, variables: dict) -> dict:
        token = (get_settings().hardcover_api_token or "").strip()
        # Hardcover shows tokens with a "Bearer " prefix; accept them with or without it.
        if not token.lower().startswith("bearer "):
            token = f"Bearer {token}"
        resp = await client.post(
            API, json={"query": query, "variables": variables}, headers={"authorization": token}
        )
        resp.raise_for_status()
        body = resp.json()
        if body.get("errors"):
            raise HardcoverError(str(body["errors"][0].get("message", body["errors"][0]))[:200])
        return body.get("data") or {}

    @staticmethod
    def _image(value) -> Optional[str]:
        if isinstance(value, dict):
            return value.get("url")
        return value if isinstance(value, str) else None

    @staticmethod
    def _tags(cached_tags) -> List[str]:
        # cached_tags looks like {"Genre": [{"tag": "Fantasy", ...}], "Mood": [...]}
        if not isinstance(cached_tags, dict):
            return []
        return [t.get("tag") for t in cached_tags.get("Genre", [])[:6] if isinstance(t, dict) and t.get("tag")]

    async def by_isbn(self, client, isbn):
        isbn10 = isbn_utils.to_isbn10(isbn) or isbn
        data = await self._query(client, EDITION_QUERY, {"isbn13": isbn, "isbn10": isbn10})
        results = []
        for ed in data.get("editions", []):
            book = ed.get("book") or {}
            series = next(iter(book.get("book_series") or []), None) or {}
            meta = BookMetadata(
                title=ed.get("title") or book.get("title") or "",
                subtitle=ed.get("subtitle") or book.get("subtitle"),
                authors=[c["author"]["name"] for c in book.get("contributions", []) if (c.get("author") or {}).get("name")],
                publisher=(ed.get("publisher") or {}).get("name"),
                published_date=ed.get("release_date"),
                page_count=ed.get("pages"),
                description=book.get("description"),
                categories=self._tags(book.get("cached_tags")),
                series=(series.get("series") or {}).get("name"),
                series_index=str(series["position"]).removesuffix(".0") if series.get("position") is not None else None,
                cover_url=self._image(ed.get("cached_image")),
                source=self.name,
                source_id=book.get("slug"),
                source_url=f"https://hardcover.app/books/{book['slug']}" if book.get("slug") else None,
            )
            results.append(fill_isbns(meta, [ed.get("isbn_13") or "", ed.get("isbn_10") or "", isbn]))
        return results

    async def search(self, client, title, author: Optional[str] = None, limit: int = 5):
        query = f"{title} {author}" if author else title
        data = await self._query(client, SEARCH_QUERY, {"query": query, "perPage": limit})
        results = (data.get("search") or {}).get("results") or {}
        out = []
        for hit in results.get("hits", []):
            doc = hit.get("document", {})
            year = doc.get("release_year")
            position = doc.get("featured_series_position")
            meta = BookMetadata(
                title=doc.get("title", ""),
                subtitle=doc.get("subtitle"),
                authors=doc.get("author_names") or [],
                published_date=str(year) if year else None,
                page_count=doc.get("pages"),
                description=doc.get("description"),
                categories=(doc.get("genres") or [])[:6],
                series=(doc.get("series_names") or [None])[0],
                series_index=str(position).removesuffix(".0") if position is not None else None,
                cover_url=self._image(doc.get("image")),
                source=self.name,
                source_id=doc.get("slug"),
                source_url=f"https://hardcover.app/books/{doc['slug']}" if doc.get("slug") else None,
            )
            out.append(fill_isbns(meta, (doc.get("isbns") or [])[:20]))
        return out
