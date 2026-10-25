from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..models import Book, User
from ..schemas import BookMetadata, BookOut, BookPage, BookUpdate
from ..services import extract, library, storage

router = APIRouter(prefix="/api/books", tags=["books"])

# cover_url value meaning "use the cover embedded in the book file".
FILE_COVER = "file"

SORTS = {
    "added": Book.created_at.desc(),
    "title": func.lower(Book.title).asc(),
    "author": cast(Book.authors, String).asc(),
    "published": Book.published_date.desc(),
}


def get_book(book_id: int, user: User, db: Session) -> Book:
    book = db.get(Book, book_id)
    if not book or (book.owner_id != user.id and not user.is_admin):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found")
    return book


@router.get("", response_model=BookPage)
def list_books(
    q: Optional[str] = None,
    format: Optional[str] = None,
    sort: str = Query("added", pattern="^(added|title|author|published)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(48, ge=1, le=200),
    all_users: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(Book)
    if not (all_users and user.is_admin):
        stmt = stmt.where(Book.owner_id == user.id)
    if q:
        like = f"%{q.strip()}%"
        digits = "".join(c for c in q if c.isdigit() or c in "Xx")
        conditions = [
            Book.title.ilike(like),
            Book.subtitle.ilike(like),
            cast(Book.authors, String).ilike(like),
            Book.publisher.ilike(like),
            Book.series.ilike(like),
        ]
        if len(digits) >= 10:
            conditions += [Book.isbn13 == digits.upper(), Book.isbn10 == digits.upper()]
        stmt = stmt.where(or_(*conditions))
    if format:
        stmt = stmt.where(Book.file_format == format.lower())
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(SORTS[sort], Book.id.desc()).offset((page - 1) * page_size).limit(page_size))
    return BookPage(items=[library.to_out(b) for b in rows], total=total or 0, page=page, page_size=page_size)


@router.get("/stats")
def stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(Book.file_format, func.count(Book.id), func.coalesce(func.sum(Book.file_size), 0))
        .where(Book.owner_id == user.id)
        .group_by(Book.file_format)
    ).all()
    return {
        "total": sum(r[1] for r in rows),
        "size": sum(int(r[2]) for r in rows),
        "formats": {r[0]: r[1] for r in rows},
    }


@router.get("/{book_id}", response_model=BookOut)
def read_book(book_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return library.to_out(get_book(book_id, user, db))


@router.patch("/{book_id}", response_model=BookOut)
async def update_book(
    book_id: int, body: BookUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    book = get_book(book_id, user, db)
    library.normalize_metadata(body)
    library.apply_metadata(book, body, only_set=True)
    if not book.title:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Title is required")
    if body.cover_url == FILE_COVER:
        _, cover = _read_file(book)
        if cover:
            library.set_cover_from_bytes(book, *cover)
    elif body.cover_url:
        await library.set_cover_from_url(book, body.cover_url)
    if body.rename_file:
        new_rel = storage.render_name(library.book_metadata(book), book.file_format)
        book.file_path = storage.relocate(book.file_path, new_rel)
    db.commit()
    return library.to_out(book)


def _read_file(book: Book):
    path = storage.library_path(book.file_path)
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File missing from library")
    return extract.extract(path, book.original_filename)


@router.get("/{book_id}/file-metadata", response_model=BookMetadata)
def file_metadata(book_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Metadata embedded in the stored file itself (EPUB/PDF), as an alternative to online sources."""
    hints, cover = _read_file(get_book(book_id, user, db))
    return BookMetadata(
        title=hints.get("title") or "",
        authors=hints.get("authors") or [],
        publisher=hints.get("publisher"),
        published_date=hints.get("published_date"),
        language=hints.get("language"),
        description=hints.get("description"),
        isbn13=(hints.get("isbns") or [None])[0],
        doi=hints.get("doi"),
        series=hints.get("series"),
        series_index=hints.get("series_index"),
        cover_url=FILE_COVER if cover else None,
        source="file",
    )


@router.get("/{book_id}/file-cover")
def file_cover(book_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _, cover = _read_file(get_book(book_id, user, db))
    if not cover:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "The file has no embedded cover")
    return Response(content=cover[0], media_type=cover[1])


class BulkDelete(BaseModel):
    ids: List[int] = Field(min_length=1, max_length=1000)


@router.post("/bulk-delete")
def bulk_delete(body: BulkDelete, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete several books (and their files) at once. Books the user may not access are skipped."""
    books = db.scalars(select(Book).where(Book.id.in_(set(body.ids)))).all()
    allowed = [b for b in books if b.owner_id == user.id or user.is_admin]
    for book in allowed:
        library.delete_book_files(book)
        db.delete(book)
    db.commit()
    return {"deleted": len(allowed)}


@router.delete("/{book_id}", status_code=204)
def delete_book(book_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    book = get_book(book_id, user, db)
    library.delete_book_files(book)
    db.delete(book)
    db.commit()


@router.get("/{book_id}/download")
def download(book_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    book = get_book(book_id, user, db)
    path = storage.library_path(book.file_path)
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File missing from library")
    return FileResponse(path, filename=path.name)


@router.get("/{book_id}/cover")
def cover(book_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    path = library.cover_file(get_book(book_id, user, db))
    if not path or not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No cover")
    return FileResponse(path, headers={"Cache-Control": "private, max-age=3600"})


@router.post("/{book_id}/cover", response_model=BookOut)
async def upload_cover(
    book_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    book = get_book(book_id, user, db)
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cover must be an image")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Cover too large")
    library.set_cover_from_bytes(book, data, file.content_type or "image/jpeg")
    db.commit()
    return library.to_out(book)
