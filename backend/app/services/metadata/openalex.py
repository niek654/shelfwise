"""OpenAlex: open catalogue of scholarly works, including academic books."""

from typing import List, Optional

import httpx

from ...config import get_settings
from ...schemas import BookMetadata
from .base import Provider

API = "https://api.openalex.org/works"


def _abstract(index: Optional[dict]) -> Optional[str]:
    """OpenAlex ships abstracts as {word: [positions]}; rebuild the text."""
    if not index:
        return None
    words = sorted((pos, word) for word, positions in index.items() for pos in positions)
    return " ".join(word for _, word in words) or None


class OpenAlex(Provider):
    name = "openalex"
    label = "OpenAlex"

    def _params(self, extra: dict) -> dict:
        s = get_settings()
        params = dict(extra)
        if s.openalex_api_key:
            params["api_key"] = s.openalex_api_key
        if s.crossref_mailto:
            params["mailto"] = s.crossref_mailto
        return params

    def _parse(self, work: dict) -> BookMetadata:
        location = work.get("primary_location") or {}
        source = location.get("source") or {}
        doi = (work.get("doi") or "").replace("https://doi.org/", "") or None
        return BookMetadata(
            title=work.get("display_name") or work.get("title") or "",
            authors=[
                a["author"]["display_name"]
                for a in work.get("authorships", [])
                if (a.get("author") or {}).get("display_name")
            ],
            publisher=source.get("host_organization_name") or source.get("display_name"),
            published_date=work.get("publication_date") or (str(work["publication_year"]) if work.get("publication_year") else None),
            doi=doi,
            language=work.get("language"),
            description=_abstract(work.get("abstract_inverted_index")),
            categories=[t["display_name"] for t in work.get("topics", [])[:5] if t.get("display_name")],
            source=self.name,
            source_id=(work.get("id") or "").rsplit("/", 1)[-1] or None,
            source_url=work.get("id"),
        )

    async def by_doi(self, client: httpx.AsyncClient, doi: str) -> List[BookMetadata]:
        resp = await client.get(f"{API}/doi:{doi}", params=self._params({}))
        if resp.status_code == 404:
            return []
        resp.raise_for_status()
        return [self._parse(resp.json())]

    async def search(self, client, title, author: Optional[str] = None, limit: int = 5):
        query = f"{title} {author}" if author else title
        resp = await client.get(
            API, params=self._params({"search": query, "filter": "type:book", "per_page": str(limit)})
        )
        resp.raise_for_status()
        return [self._parse(w) for w in resp.json().get("results", [])]
