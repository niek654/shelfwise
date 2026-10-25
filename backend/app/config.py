from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SHELFWISE_", env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://shelfwise:shelfwise@db:5432/shelfwise"
    secret_key: str = "change-me"
    access_token_minutes: int = 60 * 24 * 7

    data_dir: Path = Path("/data")

    # Library layout. Available fields: {author}, {authors}, {title}, {subtitle},
    # {year}, {isbn}, {publisher}, {series}. Slashes create sub-directories.
    filename_template: str = "{author}/{author} - {title} ({year})"
    max_upload_mb: int = 500

    allow_registration: bool = True
    admin_username: Optional[str] = None
    admin_email: Optional[str] = None
    admin_password: Optional[str] = None

    # Metadata providers
    google_books_api_key: Optional[str] = None
    worldcat_client_id: Optional[str] = None
    worldcat_client_secret: Optional[str] = None
    crossref_mailto: Optional[str] = None  # also sent to OpenAlex
    hardcover_api_token: Optional[str] = None
    openalex_api_key: Optional[str] = None
    apple_books_country: str = "us"
    metadata_timeout: float = 10.0

    static_dir: Path = Path(__file__).resolve().parent.parent / "static"

    @property
    def library_dir(self) -> Path:
        return self.data_dir / "library"

    @property
    def upload_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def cover_dir(self) -> Path:
        return self.data_dir / "covers"


@lru_cache
def get_settings() -> Settings:
    return Settings()
