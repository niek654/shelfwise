import io
import os
import zipfile

import pytest

from app.schemas import BookMetadata

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
        return [
            BookMetadata(
                title="Dune", authors=["Frank Herbert"], published_date="1965-08-01",
                isbn13="9780441013593", publisher="Ace", source="google_books",
            )
        ]

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
