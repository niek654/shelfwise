import re
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..models import Book, User
from ..schemas import BookOut
from ..services import library

router = APIRouter(prefix="/api/series", tags=["series"])


class SeriesOut(BaseModel):
    name: str
    count: int
    authors: List[str]
    cover_book_ids: List[int]
    next_index: Optional[str]


def index_key(book: Book):
    """Sort key for series positions: numeric ('1', '2.5', '10') first, then the rest."""
    match = re.match(r"\s*(\d+(?:[.,]\d+)?)", book.series_index or "")
    if match:
        return (0, float(match.group(1).replace(",", ".")), book.title.lower())
    return (1, 0.0, book.title.lower())


def _next_index(books: List[Book]) -> Optional[str]:
    numbers = [index_key(b)[1] for b in books if index_key(b)[0] == 0]
    return str(int(max(numbers)) + 1) if numbers else None


def _series_books(db: Session, user: User) -> Dict[str, List[Book]]:
    books = db.scalars(select(Book).where(Book.owner_id == user.id, Book.series.is_not(None), Book.series != ""))
    grouped: Dict[str, List[Book]] = {}
    for book in books:
        grouped.setdefault(book.series.strip(), []).append(book)
    return grouped


@router.get("", response_model=List[SeriesOut])
def list_series(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    out = []
    for name, books in _series_books(db, user).items():
        books.sort(key=index_key)
        authors: Dict[str, int] = {}
        for b in books:
            for a in b.authors[:2]:
                authors[a] = authors.get(a, 0) + 1
        out.append(
            SeriesOut(
                name=name,
                count=len(books),
                authors=sorted(authors, key=lambda a: -authors[a])[:2],
                cover_book_ids=[b.id for b in books if b.cover_path][:3],
                next_index=_next_index(books),
            )
        )
    return sorted(out, key=lambda s: s.name.lower())


@router.get("/books", response_model=List[BookOut])
def series_books(
    name: str = Query(..., min_length=1), user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    books = _series_books(db, user).get(name.strip())
    if not books:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Series not found")
    return [library.to_out(b) for b in sorted(books, key=index_key)]
