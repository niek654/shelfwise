"""WorldCat via the OCLC WorldCat Search API v2.

Requires an OCLC WSKey (client id + secret) with the `wcapi` scope. The provider
is disabled when no credentials are configured.
"""

import time
from typing import List, Optional

import httpx

from ...config import get_settings
from ...schemas import BookMetadata
from .base import Provider, fill_isbns

TOKEN_URL = "https://oauth.oclc.org/token"
API = "https://americas.discovery.api.oclc.org/worldcat/search/v2/bibs"


class WorldCat(Provider):
    name = "worldcat"
    label = "WorldCat"

    def __init__(self) -> None:
        self._token: Optional[str] = None
        self._expires = 0.0

    def enabled(self) -> bool:
        s = get_settings()
        return bool(s.worldcat_client_id and s.worldcat_client_secret)

    async def _auth(self, client: httpx.AsyncClient) -> str:
        if self._token and time.time() < self._expires - 60:
            return self._token
        s = get_settings()
        resp = await client.post(
            TOKEN_URL,
            data={"grant_type": "client_credentials", "scope": "wcapi"},
            auth=(s.worldcat_client_id or "", s.worldcat_client_secret or ""),
        )
        resp.raise_for_status()
        body = resp.json()
        self._token = body["access_token"]
        self._expires = time.time() + int(body.get("expires_in", 1200))
        return self._token

    async def _query(self, client: httpx.AsyncClient, q: str, limit: int) -> List[BookMetadata]:
        token = await self._auth(client)
        resp = await client.get(
            API, params={"q": q, "limit": str(limit)}, headers={"Authorization": f"Bearer {token}"}
        )
        resp.raise_for_status()
        return [self._parse(r) for r in resp.json().get("bibRecords", [])]

    @staticmethod
    def _txt(node) -> Optional[str]:
        if isinstance(node, dict):
            return node.get("text")
        return node if isinstance(node, str) else None

    def _parse(self, rec: dict) -> BookMetadata:
        title = (rec.get("title", {}).get("mainTitles") or [{}])[0]
        title_text = (self._txt(title) or "").split(" / ")[0].strip()
        main, _, sub = title_text.partition(" : ")
        creators = rec.get("contributor", {}).get("creators", [])
        authors = []
        for c in creators:
            name = " ".join(x for x in (self._txt(c.get("firstName")), self._txt(c.get("secondName"))) if x)
            if name:
                authors.append(name)
        publisher = (rec.get("publishers") or [{}])[0]
        ids = rec.get("identifier", {})
        oclc = ids.get("oclcNumber")
        summary = (rec.get("description", {}).get("summaries") or [{}])[0]
        meta = BookMetadata(
            title=main.strip(),
            subtitle=sub.strip() or None,
            authors=authors,
            publisher=self._txt(publisher.get("publisherName")),
            published_date=rec.get("date", {}).get("publicationDate"),
            language=rec.get("language", {}).get("itemLanguage"),
            description=self._txt(summary),
            categories=[self._txt(s.get("subjectName")) for s in rec.get("subjects", [])[:8] if s.get("subjectName")],
            source=self.name,
            source_id=oclc,
            source_url=f"https://search.worldcat.org/title/{oclc}" if oclc else None,
        )
        return fill_isbns(meta, ids.get("isbns", []))

    async def by_isbn(self, client, isbn):
        return await self._query(client, f"bn:{isbn}", 3)

    async def search(self, client, title, author: Optional[str] = None, limit: int = 5):
        q = f"ti:{title}" + (f" AND au:{author}" if author else "")
        return await self._query(client, q, limit)
