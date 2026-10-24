from datetime import datetime
from typing import Annotated, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from .models import UploadStatus


# Deliberately loose: self-hosted installs often use local domains (user@nas.lan).
Email = Annotated[str, Field(pattern=r"^[^@\s]+@[^@\s]+$", max_length=255)]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- auth / users -----------------------------------------------------------

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginIn(BaseModel):
    username: str
    password: str


class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    email: Email
    password: str = Field(min_length=8, max_length=128)


class UserOut(ORM):
    id: int
    username: str
    email: str
    is_admin: bool
    is_active: bool
    created_at: datetime


class UserCreate(RegisterIn):
    is_admin: bool = False


class UserUpdate(BaseModel):
    email: Optional[Email] = None
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)
    is_admin: Optional[bool] = None
    is_active: Optional[bool] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


# --- metadata ---------------------------------------------------------------

class BookMetadata(BaseModel):
    """Normalised metadata, as produced by providers and edited by the user."""

    title: str = ""
    subtitle: Optional[str] = None
    authors: List[str] = []
    publisher: Optional[str] = None
    published_date: Optional[str] = None
    isbn10: Optional[str] = None
    isbn13: Optional[str] = None
    doi: Optional[str] = None
    language: Optional[str] = None
    description: Optional[str] = None
    page_count: Optional[int] = None
    categories: List[str] = []
    series: Optional[str] = None
    series_index: Optional[str] = None
    cover_url: Optional[str] = None
    source: Optional[str] = None
    source_id: Optional[str] = None
    source_url: Optional[str] = None


# --- books ------------------------------------------------------------------

class BookOut(ORM):
    id: int
    owner_id: int
    title: str
    subtitle: Optional[str]
    authors: List[str]
    publisher: Optional[str]
    published_date: Optional[str]
    isbn10: Optional[str]
    isbn13: Optional[str]
    doi: Optional[str]
    language: Optional[str]
    description: Optional[str]
    page_count: Optional[int]
    categories: List[str]
    series: Optional[str]
    series_index: Optional[str]
    metadata_source: Optional[str]
    has_cover: bool = False
    file_name: str = ""
    original_filename: str
    file_format: str
    file_size: int
    created_at: datetime
    updated_at: datetime


class BookUpdate(BookMetadata):
    title: Optional[str] = None  # type: ignore[assignment]
    authors: Optional[List[str]] = None  # type: ignore[assignment]
    categories: Optional[List[str]] = None  # type: ignore[assignment]
    rename_file: bool = True


class BookPage(BaseModel):
    items: List[BookOut]
    total: int
    page: int
    page_size: int


# --- uploads ----------------------------------------------------------------

class UploadOut(ORM):
    id: int
    original_filename: str
    file_format: str
    file_size: int
    status: UploadStatus
    extracted: dict
    candidates: List[dict]
    error: Optional[str]
    duplicate_of: Optional[int]
    book_id: Optional[int]
    created_at: datetime


class UploadConfirm(BookMetadata):
    pass


class LookupResult(BaseModel):
    candidates: List[BookMetadata]
    providers: List[str]
