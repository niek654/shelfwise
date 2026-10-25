import sqlite3

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session

from app.services.languages import normalize_language, parse_year


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_normalizers():
    assert [normalize_language(v) for v in ["en", "EN-us", "eng", "dut", "Nederlands", "ger", "", None]] == [
        "en", "en", "en", "nl", "nl", "de", None, None,
    ]
    assert [parse_year(v) for v in ["09/15/2019", "Sep 2019", "2019-07-30", "c1965", "n.d.", None]] == [
        2019, 2019, 2019, 1965, None, None,
    ]


def test_filters_and_facets(client):
    client.post("/api/auth/register", json={"username": "dora", "email": "dora@example.com", "password": "password123"})
    token = client.post("/api/auth/login", json={"username": "dora", "password": "password123"}).json()["access_token"]
    from app.db import SessionLocal
    from app.models import Book, User
    from app.schemas import BookMetadata
    from app.services import library

    with SessionLocal() as db:
        dora = db.query(User).filter_by(username="dora").one()
        specs = [
            ("Het diner", ["Herman Koch"], "dut", "2009", "Anthos", ["Roman"], None),
            ("Zomerhuis met zwembad", ["Herman Koch"], "nl-NL", "2011", "Anthos", ["Roman"], None),
            ("Dune", ["Frank Herbert"], "eng", "08/01/1965", "Ace", ["Science fiction"], "Dune"),
            ("Herren von Winterfell", ["George R. R. Martin", "Jörn Ingwersen"], "ger", "2010", "Penhaligon", [], "Lied"),
        ]
        for i, (title, authors, lang, date, pub, cats, series) in enumerate(specs):
            book = Book(owner_id=dora.id, file_path=f"f/{i}.epub", original_filename="x.epub", file_format="epub" if i else "pdf",
                        file_size=1, file_hash=f"dora{i}", cover_path="c.jpg" if i % 2 else None)
            meta = library.normalize_metadata(BookMetadata(title=title, authors=authors, language=lang, published_date=date,
                                                           publisher=pub, categories=cats, series=series))
            library.apply_metadata(book, meta)
            db.add(book)
        db.commit()

    def titles(**params):
        r = client.get("/api/books", params={"sort": "title", **params}, headers=auth(token))
        assert r.status_code == 200, r.text
        return [b["title"] for b in r.json()["items"]]

    assert titles(language="nl") == ["Het diner", "Zomerhuis met zwembad"]
    assert titles(language="de") == ["Herren von Winterfell"]
    assert titles(author="Herman Koch", year_from=2010) == ["Zomerhuis met zwembad"]
    assert titles(author="Jörn Ingwersen") == ["Herren von Winterfell"]
    assert titles(q="jörn") == ["Herren von Winterfell"]
    assert titles(category="Roman", format="epub") == ["Zomerhuis met zwembad"]
    assert titles(publisher="Anthos", missing="cover") == ["Het diner"]
    assert titles(year_to=1999) == ["Dune"]
    assert titles(missing="series") == ["Het diner", "Zomerhuis met zwembad"]
    assert client.get("/api/books", params={"missing": "nonsense"}, headers=auth(token)).status_code == 422

    f = client.get("/api/books/facets", headers=auth(token)).json()
    assert f["languages"] == [{"value": "nl", "count": 2}, {"value": "de", "count": 1}, {"value": "en", "count": 1}]
    assert f["authors"][0] == {"value": "Herman Koch", "count": 2}
    assert f["years"] == {"min": 1965, "max": 2011}
    assert f["missing"]["cover"] == 2 and f["missing"]["series"] == 2
    assert {"value": "pdf", "count": 1} in f["formats"]


def test_migration_adds_column_and_backfills(tmp_path):
    from app import migrations
    from app.models import Book

    path = tmp_path / "old.db"
    con = sqlite3.connect(path)
    # A books table as created by an earlier release: no published_year column, raw values.
    con.execute(
        "CREATE TABLE books (id INTEGER PRIMARY KEY, owner_id INTEGER, title VARCHAR(512), subtitle VARCHAR(512),"
        " authors JSON, publisher VARCHAR(255), published_date VARCHAR(32), isbn10 VARCHAR(10), isbn13 VARCHAR(13),"
        " doi VARCHAR(255), language VARCHAR(16), description TEXT, page_count INTEGER, categories JSON,"
        " series VARCHAR(255), series_index VARCHAR(16), metadata_source VARCHAR(64), cover_path VARCHAR(1024),"
        " file_path VARCHAR(1024), original_filename VARCHAR(512), file_format VARCHAR(16), file_size BIGINT,"
        " file_hash VARCHAR(64), created_at DATETIME, updated_at DATETIME)"
    )
    con.execute("INSERT INTO books (id, owner_id, title, authors, categories, published_date, language, file_path,"
                " original_filename, file_format, file_size, file_hash) VALUES"
                " (1, 1, 'Dune', '[]', '[]', '09/15/1965', 'eng', 'x', 'x', 'epub', 1, 'h')")
    con.commit()
    con.close()

    engine = create_engine(f"sqlite:///{path}")
    with Session(engine) as db:
        migrations.run(engine, db)
        migrations.run(engine, db)  # idempotent
        book = db.get(Book, 1)
        assert (book.published_year, book.language) == (1965, "en")
    assert "ix_books_published_year" in {i["name"] for i in inspect(engine).get_indexes("books")}
