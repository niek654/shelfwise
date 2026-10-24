from typing import List, Optional

import httpx

from ...config import get_settings
from ...schemas import BookMetadata
from .base import Provider, fill_isbns

API = "https://www.googleapis.com/books/v1/volumes"


class GoogleBooks(Provider):
    name = "google_books"
    label = "Google Books"

    async def _query(self, client: httpx.AsyncClient, q: str, limit: int) -> List[BookMetadata]:
        params = {"q": q, "maxResults": str(limit), "printType": "books"}
        key = get_settings().google_books_api_key
        if key:
            params["key"] = key
        resp = await client.get(API, params=params)
        resp.raise_for_status()
        return [self._parse(item) for item in resp.json().get("items", [])]

    def _parse(self, item: dict) -> BookMetadata:
        info = item.get("volumeInfo", {})
        images = info.get("imageLinks", {})
        cover = images.get("extraLarge") or images.get("large") or images.get("medium") or images.get("thumbnail")
        if cover:
            cover = cover.replace("http://", "https://").replace("&edge=curl", "")
        meta = BookMetadata(
            title=info.get("title", ""),
            subtitle=info.get("subtitle"),
            authors=info.get("authors", []),
            publisher=info.get("publisher"),
            published_date=info.get("publishedDate"),
            language=info.get("language"),
            description=info.get("description"),
            page_count=info.get("pageCount"),
            categories=info.get("categories", []),
            cover_url=cover,
            source=self.name,
            source_id=item.get("id"),
            source_url=info.get("infoLink"),
        )
        return fill_isbns(meta, [i.get("identifier", "") for i in info.get("industryIdentifiers", [])])

    async def by_isbn(self, client, isbn):
        return await self._query(client, f"isbn:{isbn}", 3)

    async def search(self, client, title, author: Optional[str] = None, limit: int = 5):
        q = f'intitle:"{title}"'
        if author:
            q += f' inauthor:"{author}"'
        return await self._query(client, q, limit)
