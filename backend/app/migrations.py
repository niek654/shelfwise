"""Minimal schema upkeep run at startup.

`create_all` creates missing tables but never alters existing ones, so columns added
to a model in a later release are added here (nullable only), followed by one-off
data backfills. Idempotent: safe to run on every start.
"""

import logging

from sqlalchemy import inspect, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from .db import Base
from .models import Book
from .services.languages import normalize_language, parse_year

log = logging.getLogger(__name__)


def add_missing_columns(engine: Engine) -> None:
    inspector = inspect(engine)
    for table in Base.metadata.sorted_tables:
        if not inspector.has_table(table.name):
            continue
        existing = {c["name"] for c in inspector.get_columns(table.name)}
        missing = [c for c in table.columns if c.name not in existing]
        if not missing:
            continue
        with engine.begin() as conn:
            for column in missing:
                ddl = column.type.compile(dialect=engine.dialect)
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {ddl}'))
                log.info("Added column %s.%s", table.name, column.name)
            for index in table.indexes:
                if any(c.name in {m.name for m in missing} for c in index.columns):
                    index.create(bind=conn, checkfirst=True)


def backfill(db: Session) -> None:
    changed = 0
    for book in db.scalars(select(Book).where(Book.published_year.is_(None), Book.published_date.is_not(None))):
        year = parse_year(book.published_date)
        if year:
            book.published_year = year
            changed += 1
    for raw in db.scalars(select(Book.language).where(Book.language.is_not(None)).distinct()).all():
        normalized = normalize_language(raw)
        if normalized != raw:
            for book in db.scalars(select(Book).where(Book.language == raw)):
                book.language = normalized
                changed += 1
    if changed:
        db.commit()
        log.info("Normalised year/language on %d books", changed)


def run(engine: Engine, db: Session) -> None:
    add_missing_columns(engine)
    backfill(db)
