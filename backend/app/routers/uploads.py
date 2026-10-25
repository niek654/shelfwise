"""Upload pipeline: upload -> process (extract + metadata lookup) -> user review -> rename -> store."""

import logging
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..config import get_settings
from ..db import SessionLocal, get_db
from ..models import Book, Upload, UploadStatus, User
from ..schemas import UploadConfirm, UploadOut
from ..services import extract, library, metadata, storage

router = APIRouter(prefix="/api/uploads", tags=["uploads"])
log = logging.getLogger(__name__)


class LookupIn(BaseModel):
    isbn: Optional[str] = None
    title: Optional[str] = None
    author: Optional[str] = None
    doi: Optional[str] = None


def _get_upload(upload_id: int, user: User, db: Session) -> Upload:
    upload = db.get(Upload, upload_id)
    if not upload or upload.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Upload not found")
    return upload


def _cover_path(upload: Upload) -> Path:
    return get_settings().upload_dir / f"{Path(upload.temp_path).stem}.cover"


async def process_upload(upload_id: int) -> None:
    """Background job: extract embedded metadata, then query the metadata providers."""
    db = SessionLocal()
    try:
        upload = db.get(Upload, upload_id)
        if not upload:
            return
        try:
            hints, cover = extract.extract(Path(upload.temp_path), upload.original_filename)
            if cover:
                _cover_path(upload).write_bytes(cover[0])
                hints["embedded_cover"] = cover[1]

            dup = db.scalar(
                select(Book.id).where(Book.owner_id == upload.user_id, Book.file_hash == upload.file_hash)
            )
            upload.duplicate_of = dup

            author = (hints.get("authors") or [None])[0]
            outcome = None
            # Files often list several ISBNs (print, e-book); try the first two.
            for isbn in hints["isbns"][:2] or [None]:
                outcome = await metadata.lookup(isbn=isbn, doi=hints.get("doi"), title=hints.get("title"), author=author)
                if outcome.candidates:
                    break

            # Provider statuses live in `extracted` so no schema migration is needed.
            upload.extracted = {**hints, "lookup": outcome.providers}
            upload.candidates = [c.model_dump() for c in outcome.candidates]
            upload.status = UploadStatus.review
        except Exception as exc:  # keep the upload reviewable even if processing breaks
            log.exception("Processing upload %s failed", upload_id)
            upload.error = str(exc)
            upload.extracted = upload.extracted or extract.parse_filename(upload.original_filename)
            upload.status = UploadStatus.review
        db.commit()
    finally:
        db.close()


@router.post("", response_model=List[UploadOut], status_code=201)
async def upload_files(
    background: BackgroundTasks,
    files: List[UploadFile] = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    settings = get_settings()
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    max_bytes = settings.max_upload_mb * 1024 * 1024
    created: List[Upload] = []

    for file in files:
        name = Path(file.filename or "upload").name
        fmt = Path(name).suffix.lower().lstrip(".")
        if fmt not in extract.SUPPORTED_FORMATS:
            raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, f"Unsupported file type: {name}")
        dest = settings.upload_dir / f"{uuid.uuid4().hex}.{fmt}"
        size = 0
        with dest.open("wb") as out:
            while chunk := await file.read(1 << 20):
                size += len(chunk)
                if size > max_bytes:
                    out.close()
                    dest.unlink(missing_ok=True)
                    raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"{name} exceeds the upload limit")
                out.write(chunk)
        upload = Upload(
            user_id=user.id,
            original_filename=name,
            temp_path=str(dest),
            file_format=fmt,
            file_size=size,
            file_hash=storage.sha256_file(dest),
            status=UploadStatus.processing,
            extracted={},
            candidates=[],
        )
        db.add(upload)
        db.flush()
        created.append(upload)
    db.commit()

    for upload in created:
        background.add_task(process_upload, upload.id)
    return created


@router.get("", response_model=List[UploadOut])
def list_uploads(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(
        select(Upload)
        .where(Upload.user_id == user.id, Upload.status.in_([UploadStatus.processing, UploadStatus.review]))
        .order_by(Upload.created_at)
    ).all()


@router.get("/{upload_id}", response_model=UploadOut)
def read_upload(upload_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _get_upload(upload_id, user, db)


@router.get("/{upload_id}/cover")
def embedded_cover(upload_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    upload = _get_upload(upload_id, user, db)
    path = _cover_path(upload)
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No embedded cover")
    return FileResponse(path, media_type=upload.extracted.get("embedded_cover", "image/jpeg"))


@router.post("/{upload_id}/lookup", response_model=UploadOut)
async def relookup(
    upload_id: int, body: LookupIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    upload = _get_upload(upload_id, user, db)
    if not any([body.isbn, body.title, body.doi]):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Provide an ISBN, DOI or title")
    outcome = await metadata.lookup(
        isbn=body.isbn, doi=body.doi, title=body.title, author=body.author, title_search=True
    )
    upload.candidates = [c.model_dump() for c in outcome.candidates]
    upload.extracted = {**upload.extracted, "lookup": outcome.providers}
    db.commit()
    return upload


@router.post("/{upload_id}/confirm")
async def confirm(
    upload_id: int, body: UploadConfirm, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    upload = _get_upload(upload_id, user, db)
    if upload.status != UploadStatus.review:
        raise HTTPException(status.HTTP_409_CONFLICT, "Upload is not ready for confirmation")
    meta = library.normalize_metadata(body)
    if not meta.title:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Title is required")

    rel = storage.render_name(meta, upload.file_format)
    stored = storage.store_file(Path(upload.temp_path), rel)
    book = Book(
        owner_id=user.id,
        file_path=str(stored),
        original_filename=upload.original_filename,
        file_format=upload.file_format,
        file_size=upload.file_size,
        file_hash=upload.file_hash,
    )
    library.apply_metadata(book, meta)
    db.add(book)
    db.flush()

    embedded = _cover_path(upload)
    got_cover = False
    if meta.cover_url and meta.cover_url != "embedded":
        got_cover = await library.set_cover_from_url(book, meta.cover_url)
    if not got_cover and embedded.exists():
        library.set_cover_from_bytes(book, embedded.read_bytes(), upload.extracted.get("embedded_cover", "image/jpeg"))
    if not got_cover and not book.cover_path and meta.isbn13:
        await library.set_cover_from_url(book, f"https://covers.openlibrary.org/b/isbn/{meta.isbn13}-L.jpg")
    embedded.unlink(missing_ok=True)

    upload.status = UploadStatus.completed
    upload.book_id = book.id
    db.commit()
    return library.to_out(book)


@router.delete("/{upload_id}", status_code=204)
def discard(upload_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    upload = _get_upload(upload_id, user, db)
    if upload.status == UploadStatus.completed:
        raise HTTPException(status.HTTP_409_CONFLICT, "Upload already stored")
    Path(upload.temp_path).unlink(missing_ok=True)
    _cover_path(upload).unlink(missing_ok=True)
    db.delete(upload)
    db.commit()
