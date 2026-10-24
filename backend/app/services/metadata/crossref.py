from typing import List, Optional

import httpx

from ...config import get_settings
from ...schemas import BookMetadata
from .base import Provider, fill_isbns, strip_html

API = "https://api.crossref.org/works"


class Crossref(Provider):
    name = "crossref"
    label = "Crossref"

    def _params(self, extra: dict) -> dict:
        mailto = get_settings().crossref_mailto
        return {**extra, **({"mailto": mailto} if mailto else {})}

    def _parse(self, item: dict) -> BookMetadata:
        parts = (item.get("published") or item.get("issued") or {}).get("date-parts") or [[]]
        date = "-".join(f"{p:02d}" if i else str(p) for i, p in enumerate(parts[0])) if parts[0] else None
        authors = [
            " ".join(x for x in (a.get("given"), a.get("family")) if x) or a.get("name", "")
            for a in item.get("author", []) + item.get("editor", [])
        ]
        meta = BookMetadata(
            title=(item.get("title") or [""])[0],
            subtitle=(item.get("subtitle") or [None])[0],
            authors=[a for a in authors if a],
            publisher=item.get("publisher"),
            published_date=date,
            doi=item.get("DOI"),
            language=item.get("language"),
            description=strip_html(item.get("abstract")),
            categories=item.get("subject", []),
            source=self.name,
            source_id=item.get("DOI"),
            source_url=item.get("URL"),
        )
        isbns = [i.get("value", "") for i in item.get("isbn-type", [])] or item.get("ISBN", [])
        return fill_isbns(meta, isbns)

    async def by_doi(self, client: httpx.AsyncClient, doi: str) -> List[BookMetadata]:
        resp = await client.get(f"{API}/{doi}", params=self._params({}))
        if resp.status_code == 404:
            return []
        resp.raise_for_status()
        return [self._parse(resp.json()["message"])]

    async def by_isbn(self, client, isbn):
        resp = await client.get(API, params=self._params({"filter": f"isbn:{isbn}", "rows": "3"}))
        resp.raise_for_status()
        return [self._parse(i) for i in resp.json()["message"].get("items", [])]

    async def search(self, client, title, author: Optional[str] = None, limit: int = 5):
        params = {"query.bibliographic": title, "rows": str(limit), "filter": "type:book,type:monograph,type:edited-book"}
        if author:
            params["query.author"] = author
        resp = await client.get(API, params=self._params(params))
        resp.raise_for_status()
        return [self._parse(i) for i in resp.json()["message"].get("items", [])]
