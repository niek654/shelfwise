import io
import os
import zipfile

import pytest

from app.schemas import BookMetadata
from app.services.metadata import LookupOutcome

OPF = """<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Dune</dc:title>
    <dc:creator>Frank Herbert</dc:creator>
    <dc:identifier>urn:isbn:9780441013593</dc:identifier>
    <dc:language>en</dc:language>
  </metadata>
  <manifest><item id="c" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/></manifest>
</package>"""


def make_epub() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("mimetype", "application/epub+zip")
        zf.writestr(
            "META-INF/container.xml",
            '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles>'
            '<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>'
            "</rootfiles></container>",
        )
        zf.writestr("OEBPS/content.opf", OPF)
        zf.writestr("OEBPS/cover.jpg", b"\xff\xd8" + b"0" * 2000)
    return buf.getvalue()


@pytest.fixture(autouse=True)
def fake_lookup(monkeypatch):
    calls = []

    async def lookup(isbn=None, doi=None, title=None, author=None, limit=5):
        calls.append(isbn or title)
        return LookupOutcome(candidates=[
            BookMetadata(
                title="Dune", authors=["Frank Herbert"], published_date="1965-08-01",
                isbn13="9780441013593", publisher="Ace", source="google_books",
            )
        ], providers=[{"name": "google_books", "label": "Google Books", "status": "ok", "message": "1 result"}])

    monkeypatch.setattr("app.services.metadata.lookup", lookup)
    return calls


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_full_flow(client, data_dir, fake_lookup):
    cfg = client.get("/api/config").json()
    assert cfg["needs_setup"] is True

    r = client.post("/api/auth/register", json={"username": "alice", "email": "alice@example.com", "password": "password123"})
    assert r.status_code == 201, r.text
    alice = r.json()["access_token"]
    assert client.get("/api/auth/me", headers=auth(alice)).json()["is_admin"] is True

    r = client.post("/api/auth/register", json={"username": "bob", "email": "bob@example.com", "password": "password123"})
    bob = r.json()["access_token"]
    assert client.get("/api/auth/me", headers=auth(bob)).json()["is_admin"] is False

    # Upload -> processed in background -> review
    r = client.post(
        "/api/uploads",
        headers=auth(alice),
        files=[("files", ("random_name.epub", make_epub(), "application/epub+zip"))],
    )
    assert r.status_code == 201, r.text
    upload_id = r.json()[0]["id"]
    up = client.get(f"/api/uploads/{upload_id}", headers=auth(alice)).json()
    assert up["status"] == "review"
    assert up["extracted"]["title"] == "Dune"
    assert up["extracted"]["isbns"] == ["9780441013593"]
    assert fake_lookup == ["9780441013593"]
    assert up["candidates"][0]["publisher"] == "Ace"
    assert up["extracted"]["lookup"][0]["status"] == "ok"
    assert client.get(f"/api/uploads/{upload_id}/cover", headers=auth(alice)).status_code == 200

    # Other users cannot see it
    assert client.get(f"/api/uploads/{upload_id}", headers=auth(bob)).status_code == 404

    # Confirm -> renamed and stored
    meta = dict(up["candidates"][0])
    meta["cover_url"] = None
    r = client.post(f"/api/uploads/{upload_id}/confirm", headers=auth(alice), json=meta)
    assert r.status_code == 200, r.text
    book = r.json()
    assert book["file_name"] == "Frank Herbert - Dune (1965).epub"
    assert book["has_cover"] is True
    assert os.path.exists(os.path.join(data_dir, "library", "Frank Herbert", book["file_name"]))

    # Library listing and search
    page = client.get("/api/books?q=herbert", headers=auth(alice)).json()
    assert page["total"] == 1
    assert client.get("/api/books?q=9780441013593", headers=auth(alice)).json()["total"] == 1
    assert client.get("/api/books", headers=auth(bob)).json()["total"] == 0

    # Metadata and cover read back from the stored file
    fm = client.get(f"/api/books/{book['id']}/file-metadata", headers=auth(alice)).json()
    assert (fm["title"], fm["authors"], fm["isbn13"], fm["source"], fm["cover_url"]) == (
        "Dune", ["Frank Herbert"], "9780441013593", "file", "file",
    )
    assert client.get(f"/api/books/{book['id']}/file-cover", headers=auth(alice)).content.startswith(b"\xff\xd8")
    version = lambda: client.get(f"/api/books/{book['id']}", headers=auth(alice)).json()["updated_at"]
    before = version()
    r = client.patch(f"/api/books/{book['id']}", headers=auth(alice), json={"cover_url": "file", "rename_file": False})
    assert r.status_code == 200 and r.json()["has_cover"] is True
    # Replacing a JPEG cover with another JPEG keeps the file name, so the version used in
    # cover URLs (updated_at) must still change or browsers keep showing the cached cover.
    assert version() != before

    # Edit renames the file
    r = client.patch(f"/api/books/{book['id']}", headers=auth(alice), json={"title": "Dune Messiah", "published_date": "1969"})
    assert r.status_code == 200, r.text
    assert r.json()["file_name"] == "Frank Herbert - Dune Messiah (1969).epub"
    assert r.json()["publisher"] == "Ace"  # untouched fields are kept

    r = client.get(f"/api/books/{book['id']}/download?access_token={alice}")
    assert r.status_code == 200 and r.content.startswith(b"PK")

    # Duplicate detection
    r = client.post("/api/uploads", headers=auth(alice), files=[("files", ("again.epub", make_epub(), "application/epub+zip"))])
    dup = client.get(f"/api/uploads/{r.json()[0]['id']}", headers=auth(alice)).json()
    assert dup["duplicate_of"] == book["id"]
    assert client.delete(f"/api/uploads/{dup['id']}", headers=auth(alice)).status_code == 204

    # Admin endpoints
    assert client.get("/api/users", headers=auth(bob)).status_code == 403
    toggle = {"name": "crossref", "enabled": False}
    assert client.put("/api/settings/providers", headers=auth(bob), json=toggle).status_code == 403
    assert client.put("/api/settings/providers", headers=auth(alice), json=toggle).status_code == 204
    crossref = next(p for p in client.get("/api/config").json()["providers"] if p["name"] == "crossref")
    assert crossref["active"] is False and crossref["switched_off"] is True
    toggle["enabled"] = True
    client.put("/api/settings/providers", headers=auth(alice), json=toggle)
    assert next(p for p in client.get("/api/config").json()["providers"] if p["name"] == "crossref")["active"]
    assert len(client.get("/api/users", headers=auth(alice)).json()) == 2

    assert client.delete(f"/api/books/{book['id']}", headers=auth(alice)).status_code == 204
    assert not os.path.exists(os.path.join(data_dir, "library", "Frank Herbert"))


def test_rejects_unsupported(client):
    token = client.post("/api/auth/login", json={"username": "alice", "password": "password123"}).json()["access_token"]
    r = client.post("/api/uploads", headers=auth(token), files=[("files", ("evil.exe", b"MZ", "application/octet-stream"))])
    assert r.status_code == 415


def test_filename_template():
    from app.services.storage import render_name

    meta = BookMetadata(title='What/If? "Serious"', authors=["Randall Munroe"])
    assert str(render_name(meta, "pdf")) == "Randall Munroe/Randall Munroe - What-If Serious.pdf"


def test_series(client):
    from app.db import SessionLocal
    from app.models import Book, User

    token = client.post("/api/auth/login", json={"username": "bob", "password": "password123"}).json()["access_token"]
    with SessionLocal() as db:
        bob = db.query(User).filter_by(username="bob").one()
        for title, idx in [("Words of Radiance", "2"), ("Oathbringer", "3"), ("The Way of Kings", "1"),
                           ("Edgedancer", "2.5"), ("Rhythm of War", "10"), ("Art book", None)]:
            db.add(Book(owner_id=bob.id, title=title, authors=["Brandon Sanderson"], series="Stormlight Archive",
                        series_index=idx, file_path=f"x/{title}.epub", original_filename="x.epub",
                        file_format="epub", file_size=1, file_hash=title))
        db.commit()

    series = client.get("/api/series", headers=auth(token)).json()
    assert series == [{
        "name": "Stormlight Archive", "count": 6, "authors": ["Brandon Sanderson"],
        "covers": [], "next_index": "11",
    }]
    # A cover change must change the version the series overview uses for that cover.
    with SessionLocal() as db:
        first = db.query(Book).filter_by(title="The Way of Kings").one()
        first.cover_path = "kings.jpg"
        db.commit()
        book_id = first.id
    cover = lambda: client.get("/api/series", headers=auth(token)).json()[0]["covers"][0]  # noqa: E731
    before = cover()
    assert before["book_id"] == book_id
    from app.services import library
    with SessionLocal() as db:
        library.set_cover_from_bytes(db.get(Book, book_id), b"\xff\xd8new", "image/jpeg")
        db.commit()
    assert cover()["version"] != before["version"]
    with SessionLocal() as db:
        db.get(Book, book_id).cover_path = None
        db.commit()

    books = client.get("/api/series/books", params={"name": "Stormlight Archive"}, headers=auth(token)).json()
    assert [b["title"] for b in books] == [
        "The Way of Kings", "Words of Radiance", "Edgedancer", "Oathbringer", "Rhythm of War", "Art book",
    ]
    assert client.get("/api/series/books", params={"name": "Nope"}, headers=auth(token)).status_code == 404


def test_series_rename_and_bulk_delete(client):
    token = client.post("/api/auth/login", json={"username": "bob", "password": "password123"}).json()["access_token"]
    alice = client.post("/api/auth/login", json={"username": "alice", "password": "password123"}).json()["access_token"]

    r = client.patch("/api/series", headers=auth(token), json={"name": "Stormlight Archive", "new_name": " The Stormlight Archive "})
    assert r.status_code == 200 and r.json() == {"name": "The Stormlight Archive", "updated": 6, "merged": False}
    names = [s["name"] for s in client.get("/api/series", headers=auth(token)).json()]
    assert names == ["The Stormlight Archive"]
    assert client.patch("/api/series", headers=auth(token), json={"name": "Nope", "new_name": "X"}).status_code == 404

    books = client.get("/api/series/books", params={"name": "The Stormlight Archive"}, headers=auth(token)).json()
    ids = [b["id"] for b in books[:2]]
    # Another (non-admin) user's request for these ids deletes nothing... alice is admin, so use a fresh user.
    client.post("/api/auth/register", json={"username": "carol", "email": "carol@example.com", "password": "password123"})
    carol = client.post("/api/auth/login", json={"username": "carol", "password": "password123"}).json()["access_token"]
    assert client.post("/api/books/bulk-delete", headers=auth(carol), json={"ids": ids}).json() == {"deleted": 0}
    assert client.post("/api/books/bulk-delete", headers=auth(token), json={"ids": ids + [999999]}).json() == {"deleted": 2}
    assert client.get("/api/books", headers=auth(token)).json()["total"] == 4
    assert client.post("/api/books/bulk-delete", headers=auth(token), json={"ids": []}).status_code == 422
    assert alice  # admin login still works
