"""Book-level helpers shared by the books, uploads and users routers."""

from pathlib import Path
from typing import Optional

from ..config import get_settings
from ..models import Book
from ..schemas import BookMetadata, BookOut
from . import isbn as isbn_utils
from . import storage

BOOK_FIELDS = [
    "title", "subtitle", "authors", "publisher", "published_date", "isbn10", "isbn13", "doi",
    "language", "description", "page_count", "categories", "series", "series_index",
]


def to_out(book: Book) -> BookOut:
    out = BookOut.model_validate(book)
    out.has_cover = bool(book.cover_path)
    out.file_name = Path(book.file_path).name
    return out


def normalize_metadata(meta: BookMetadata) -> BookMetadata:
    # Only touch fields that hold a value: assigning marks a field as "set" for PATCH semantics.
    if meta.title is not None:
        meta.title = meta.title.strip()
    if meta.authors is not None:
        meta.authors = [a.strip() for a in meta.authors if a and a.strip()]
    if meta.categories is not None:
        meta.categories = [c.strip() for c in meta.categories if c and c.strip()]
    if meta.isbn13:
        meta.isbn13 = isbn_utils.to_isbn13(meta.isbn13) or isbn_utils.clean(meta.isbn13)[:13] or None
    if meta.isbn10:
        meta.isbn10 = isbn_utils.to_isbn10(meta.isbn10) or isbn_utils.clean(meta.isbn10)[:10] or None
    if meta.isbn13 and not meta.isbn10:
        meta.isbn10 = isbn_utils.to_isbn10(meta.isbn13)
    if meta.isbn10 and not meta.isbn13:
        meta.isbn13 = isbn_utils.to_isbn13(meta.isbn10)
    return meta


def apply_metadata(book: Book, meta: BookMetadata, only_set: bool = False) -> None:
    data = meta.model_dump(exclude_unset=only_set)
    for field in BOOK_FIELDS:
        if field not in data:
            continue
        value = data[field]
        if value is None:
            if field == "title":
                continue
            value = [] if field in ("authors", "categories") else None
        setattr(book, field, value)
    if meta.source:
        book.metadata_source = meta.source


def book_metadata(book: Book) -> BookMetadata:
    return BookMetadata(**{f: getattr(book, f) for f in BOOK_FIELDS})


def cover_file(book: Book) -> Optional[Path]:
    if not book.cover_path:
        return None
    return get_settings().cover_dir / book.cover_path


async def set_cover_from_url(book: Book, url: str) -> bool:
    name = f"{book.id}.jpg"
    if await storage.download_cover(url, get_settings().cover_dir / name):
        book.cover_path = name
        return True
    return False


def set_cover_from_bytes(book: Book, data: bytes, media_type: str = "image/jpeg") -> None:
    ext = {"image/png": "png", "image/webp": "webp", "image/gif": "gif"}.get(media_type, "jpg")
    cover_dir = get_settings().cover_dir
    cover_dir.mkdir(parents=True, exist_ok=True)
    old = cover_file(book)
    name = f"{book.id}.{ext}"
    if old and old.name != name:
        old.unlink(missing_ok=True)
    (cover_dir / name).write_bytes(data)
    book.cover_path = name


def delete_book_files(book: Book) -> None:
    storage.delete_file(book.file_path)
    cover = cover_file(book)
    if cover:
        cover.unlink(missing_ok=True)
