import asyncio

import httpx

from app.schemas import BookMetadata
from app.services import metadata
from app.services.metadata.crossref import Crossref
from app.services.metadata.google_books import GoogleBooks
from app.services.metadata.open_library import OpenLibrary

ISBN = "9780135957059"


class RateLimitedGoogle(GoogleBooks):
    async def by_isbn(self, client, isbn):
        request = httpx.Request("GET", "https://www.googleapis.com/books/v1/volumes")
        raise httpx.HTTPStatusError("429", request=request, response=httpx.Response(429, request=request))


class FakeOpenLibrary(OpenLibrary):
    async def by_isbn(self, client, isbn):
        return [BookMetadata(title="The Pragmatic Programmer", authors=["Andy Hunt"], isbn13=isbn, source=self.name)]


class FakeCrossref(Crossref):
    searched = None

    async def by_isbn(self, client, isbn):
        return []

    async def search(self, client, title, author=None, limit=5):
        FakeCrossref.searched = (title, author)
        return [
            BookMetadata(title="The Pragmatic Programmer: 20th Anniversary Edition", authors=["Andy Hunt"],
                         isbn13="9780135956977", source=self.name),
            BookMetadata(title="Programming Pearls", authors=["Jon Bentley"], source=self.name),
        ]


def test_fallback_search_and_statuses(monkeypatch):
    monkeypatch.setattr(metadata, "PROVIDERS", [RateLimitedGoogle(), FakeOpenLibrary(), FakeCrossref()])
    monkeypatch.setattr(metadata, "disabled_providers", lambda: set())
    outcome = asyncio.run(metadata.lookup(isbn=ISBN, title="pragprog draft"))

    # Crossref had no ISBN hit, so it was searched by the title of the ISBN match, not the file's junk title.
    assert FakeCrossref.searched == ("The Pragmatic Programmer", "Andy Hunt")
    sources = [c.source for c in outcome.candidates]
    assert sources[0] == "open_library"
    assert "crossref" in sources
    assert all(c.title != "Programming Pearls" for c in outcome.candidates)

    status = {p["name"]: p for p in outcome.providers}
    assert status["google_books"]["status"] == "error"
    assert "GOOGLE_BOOKS_API_KEY" in status["google_books"]["message"]
    assert status["open_library"]["status"] == "ok"
    assert status["crossref"]["status"] == "ok"


def test_explicit_title_search_and_switched_off(monkeypatch):
    monkeypatch.setattr(metadata, "PROVIDERS", [RateLimitedGoogle(), FakeOpenLibrary(), FakeCrossref()])
    monkeypatch.setattr(metadata, "disabled_providers", lambda: {"google_books"})
    outcome = asyncio.run(metadata.lookup(isbn=ISBN, title="Programming Pearls", title_search=True))

    # The typed title is searched as-is, and its results are kept even though they differ from the ISBN match.
    assert FakeCrossref.searched == ("Programming Pearls", None)
    titles = [c.title for c in outcome.candidates]
    assert titles[0] == "The Pragmatic Programmer"
    assert "Programming Pearls" in titles

    status = {p["name"]: p for p in outcome.providers}
    assert status["google_books"]["status"] == "disabled"
    assert status["google_books"]["message"] == "Turned off in settings"
