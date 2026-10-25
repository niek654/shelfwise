from typing import List, Optional

import httpx

from ...schemas import BookMetadata
from ..languages import normalize_language
from .base import Provider, fill_isbns

BASE = "https://openlibrary.org"
COVERS = "https://covers.openlibrary.org/b"


class OpenLibrary(Provider):
    name = "open_library"
    label = "Open Library"

    async def by_isbn(self, client: httpx.AsyncClient, isbn: str) -> List[BookMetadata]:
        resp = await client.get(
            f"{BASE}/api/books", params={"bibkeys": f"ISBN:{isbn}", "format": "json", "jscmd": "data"}
        )
        resp.raise_for_status()
        data = resp.json().get(f"ISBN:{isbn}")
        if not data:
            return []
        ids = data.get("identifiers", {})
        cover = data.get("cover", {})
        meta = BookMetadata(
            title=data.get("title", ""),
            subtitle=data.get("subtitle"),
            authors=[a["name"] for a in data.get("authors", []) if a.get("name")],
            publisher=next((p["name"] for p in data.get("publishers", []) if p.get("name")), None),
            published_date=data.get("publish_date"),
            page_count=data.get("number_of_pages"),
            categories=[s["name"] for s in data.get("subjects", [])[:8] if s.get("name")],
            description=(data.get("excerpts") or [{}])[0].get("text"),
            cover_url=cover.get("large") or cover.get("medium"),
            source=self.name,
            source_id=data.get("key"),
            source_url=data.get("url"),
        )
        return [fill_isbns(meta, ids.get("isbn_13", []) + ids.get("isbn_10", []) + [isbn])]

    async def search(self, client, title, author: Optional[str] = None, limit: int = 5):
        params = {
            "title": title,
            "limit": str(limit),
            "fields": "key,title,subtitle,author_name,publisher,first_publish_year,isbn,language,"
            "number_of_pages_median,subject,cover_i",
        }
        if author:
            params["author"] = author
        resp = await client.get(f"{BASE}/search.json", params=params)
        resp.raise_for_status()
        results = []
        for doc in resp.json().get("docs", []):
            languages = doc.get("language") or []
            year = doc.get("first_publish_year")
            meta = BookMetadata(
                title=doc.get("title", ""),
                subtitle=doc.get("subtitle"),
                authors=doc.get("author_name", []),
                publisher=(doc.get("publisher") or [None])[0],
                published_date=str(year) if year else None,
                # Search docs list the languages of *all* editions of the work; only trust a single one.
                language=normalize_language(languages[0]) if len(languages) == 1 else None,
                page_count=doc.get("number_of_pages_median"),
                categories=(doc.get("subject") or [])[:8],
                cover_url=f"{COVERS}/id/{doc['cover_i']}-L.jpg" if doc.get("cover_i") else None,
                source=self.name,
                source_id=doc.get("key"),
                source_url=f"{BASE}{doc['key']}" if doc.get("key") else None,
            )
            results.append(fill_isbns(meta, (doc.get("isbn") or [])[:10]))
        return results
