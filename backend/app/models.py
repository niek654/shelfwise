import enum
from datetime import datetime, timezone
from typing import Any, List, Optional

from sqlalchemy import JSON, BigInteger, Boolean, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    books: Mapped[List["Book"]] = relationship(back_populates="owner", cascade="all, delete-orphan")


class Book(Base):
    __tablename__ = "books"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    title: Mapped[str] = mapped_column(String(512), index=True)
    subtitle: Mapped[Optional[str]] = mapped_column(String(512))
    authors: Mapped[list] = mapped_column(JSON, default=list)
    publisher: Mapped[Optional[str]] = mapped_column(String(255))
    published_date: Mapped[Optional[str]] = mapped_column(String(32))
    # Derived from published_date (free-form across sources) for filtering and sorting.
    published_year: Mapped[Optional[int]] = mapped_column(Integer, index=True)
    isbn10: Mapped[Optional[str]] = mapped_column(String(10), index=True)
    isbn13: Mapped[Optional[str]] = mapped_column(String(13), index=True)
    doi: Mapped[Optional[str]] = mapped_column(String(255))
    language: Mapped[Optional[str]] = mapped_column(String(16))
    description: Mapped[Optional[str]] = mapped_column(Text)
    page_count: Mapped[Optional[int]] = mapped_column(Integer)
    categories: Mapped[list] = mapped_column(JSON, default=list)
    series: Mapped[Optional[str]] = mapped_column(String(255))
    series_index: Mapped[Optional[str]] = mapped_column(String(16))
    metadata_source: Mapped[Optional[str]] = mapped_column(String(64))
    cover_path: Mapped[Optional[str]] = mapped_column(String(1024))

    file_path: Mapped[str] = mapped_column(String(1024))
    original_filename: Mapped[str] = mapped_column(String(512))
    file_format: Mapped[str] = mapped_column(String(16))
    file_size: Mapped[int] = mapped_column(BigInteger)
    file_hash: Mapped[str] = mapped_column(String(64), index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    owner: Mapped[User] = relationship(back_populates="books")


class UploadStatus(str, enum.Enum):
    processing = "processing"
    review = "review"
    completed = "completed"
    failed = "failed"


class Upload(Base):
    __tablename__ = "uploads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    original_filename: Mapped[str] = mapped_column(String(512))
    temp_path: Mapped[str] = mapped_column(String(1024))
    file_format: Mapped[str] = mapped_column(String(16))
    file_size: Mapped[int] = mapped_column(BigInteger)
    file_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[UploadStatus] = mapped_column(
        Enum(UploadStatus, native_enum=False, length=16), default=UploadStatus.processing
    )
    extracted: Mapped[dict] = mapped_column(JSON, default=dict)
    candidates: Mapped[list] = mapped_column(JSON, default=list)
    error: Mapped[Optional[str]] = mapped_column(Text)
    duplicate_of: Mapped[Optional[int]] = mapped_column(Integer)
    book_id: Mapped[Optional[int]] = mapped_column(ForeignKey("books.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AppSetting(Base):
    """Instance-wide settings changed from the UI (environment variables cover the rest)."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[Any] = mapped_column(JSON)
