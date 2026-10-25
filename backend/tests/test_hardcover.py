import asyncio
import json

import httpx

from app.config import get_settings
from app.services.metadata.hardcover import Hardcover

EDITION = {
    "data": {
        "editions": [
            {
                "title": "The Way of Kings",
                "subtitle": None,
                "isbn_10": "0765326353",
                "isbn_13": "9780765326355",
                "pages": 1007,
                "release_date": "2010-08-31",
                "cached_image": {"url": "https://assets.hardcover.app/cover.jpg"},
                "publisher": {"name": "Tor Books"},
                "book": {
                    "slug": "the-way-of-kings",
                    "title": "The Way of Kings",
                    "subtitle": None,
                    "description": "Roshar is a world of stone and storms.",
                    "cached_tags": {"Genre": [{"tag": "Fantasy"}, {"tag": "Epic"}]},
                    "contributions": [{"author": {"name": "Brandon Sanderson"}}],
                    "book_series": [{"position": 1.0, "series": {"name": "The Stormlight Archive"}}],
                },
            }
        ]
    }
}

SEARCH = {
    "data": {
        "search": {
            "results": {
                "hits": [
                    {
                        "document": {
                            "title": "Oathbringer",
                            "author_names": ["Brandon Sanderson"],
                            "release_year": 2017,
                            "isbns": ["9780765326379", "076532637X"],
                            "series_names": ["The Stormlight Archive"],
                            "featured_series_position": 3,
                            "image": {"url": "https://assets.hardcover.app/o.jpg"},
                            "slug": "oathbringer",
                        }
                    }
                ]
            }
        }
    }
}


def run(handler, coro_factory, monkeypatch, token="Bearer abc123"):
    monkeypatch.setattr(get_settings(), "hardcover_api_token", token)
    seen = []

    def wrapped(request):
        seen.append(request)
        return handler(request)

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(wrapped)) as client:
            return await coro_factory(client)

    return asyncio.run(go()), seen


def test_by_isbn(monkeypatch):
    result, seen = run(
        lambda r: httpx.Response(200, json=EDITION), lambda c: Hardcover().by_isbn(c, "9780765326355"), monkeypatch
    )
    assert seen[0].headers["authorization"] == "Bearer abc123"
    assert json.loads(seen[0].content)["variables"] == {"isbn13": "9780765326355", "isbn10": "0765326353"}
    book = result[0]
    assert book.authors == ["Brandon Sanderson"]
    assert book.series == "The Stormlight Archive" and book.series_index == "1"
    assert book.publisher == "Tor Books" and book.page_count == 1007
    assert book.categories == ["Fantasy", "Epic"]
    assert book.cover_url == "https://assets.hardcover.app/cover.jpg"
    assert book.source_url == "https://hardcover.app/books/the-way-of-kings"


def test_search_and_token_without_prefix(monkeypatch):
    result, seen = run(
        lambda r: httpx.Response(200, json=SEARCH),
        lambda c: Hardcover().search(c, "Oathbringer", "Sanderson"),
        monkeypatch,
        token="abc123",
    )
    assert seen[0].headers["authorization"] == "Bearer abc123"
    book = result[0]
    assert (book.title, book.series, book.series_index, book.isbn13) == (
        "Oathbringer", "The Stormlight Archive", "3", "9780765326379",
    )


def test_graphql_errors_are_reported(monkeypatch):
    from app.services.metadata.hardcover import HardcoverError

    body = {"errors": [{"message": "field 'cached_image' not found in type: 'editions'"}]}
    try:
        run(lambda r: httpx.Response(200, json=body), lambda c: Hardcover().by_isbn(c, "9780765326355"), monkeypatch)
    except HardcoverError as exc:
        assert "cached_image" in str(exc)
    else:
        raise AssertionError("expected HardcoverError")
