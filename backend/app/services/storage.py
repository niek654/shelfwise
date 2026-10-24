"""File naming and storage for the library."""

import hashlib
import re
import shutil
import unicodedata
from pathlib import Path
from typing import Optional

import httpx

from ..config import get_settings
from ..schemas import BookMetadata
from .metadata.base import USER_AGENT

_INVALID = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def sanitize(part: str, max_len: int = 120) -> str:
    part = unicodedata.normalize("NFC", part)
    part = _INVALID.sub("", part)
    part = re.sub(r"\s+", " ", part).strip(" .")
    return part[:max_len].rstrip(" .") or "Unknown"


class _Fields(dict):
    def __missing__(self, key: str) -> str:  # unknown template fields render empty
        return ""


def _year(date: Optional[str]) -> str:
    match = re.search(r"\d{4}", date or "")
    return match.group(0) if match else ""


def render_name(meta: BookMetadata, ext: str, template: Optional[str] = None) -> Path:
    """Render the configured template into a relative library path, e.g.
    'Frank Herbert/Frank Herbert - Dune (1965).epub'."""
    template = template or get_settings().filename_template
    authors = meta.authors or ["Unknown Author"]
    fields = {
        "author": authors[0],
        "authors": ", ".join(authors[:3]) + (" et al." if len(authors) > 3 else ""),
        "title": meta.title or "Untitled",
        "subtitle": meta.subtitle or "",
        "year": _year(meta.published_date),
        "isbn": meta.isbn13 or meta.isbn10 or "",
        "publisher": meta.publisher or "",
        "series": meta.series or "",
    }
    rendered = template.format_map(_Fields({k: v.replace("/", "-") for k, v in fields.items()}))
    # Drop empty brackets left by missing fields, e.g. "Title ()".
    rendered = re.sub(r"\s*[(\[]\s*[)\]]", "", rendered)
    parts = [sanitize(p) for p in rendered.split("/") if p.strip()]
    return Path(*parts).with_name(parts[-1] + f".{ext}")


def unique_path(path: Path) -> Path:
    if not path.exists():
        return path
    n = 2
    while True:
        candidate = path.with_name(f"{path.stem} ({n}){path.suffix}")
        if not candidate.exists():
            return candidate
        n += 1


def store_file(src: Path, rel: Path) -> Path:
    """Move src into the library at rel (de-duplicated). Returns the path relative to the library."""
    library = get_settings().library_dir
    dest = unique_path(library / rel)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(dest))
    return dest.relative_to(library)


def relocate(current_rel: str, new_rel: Path) -> str:
    library = get_settings().library_dir
    current = library / current_rel
    if (library / new_rel) == current:
        return current_rel
    dest = unique_path(library / new_rel)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(current), str(dest))
    _prune_empty(current.parent)
    return str(dest.relative_to(library))


def delete_file(rel: str) -> None:
    library = get_settings().library_dir
    path = library / rel
    path.unlink(missing_ok=True)
    _prune_empty(path.parent)


def _prune_empty(directory: Path) -> None:
    library = get_settings().library_dir.resolve()
    directory = directory.resolve()
    while directory != library and library in directory.parents:
        try:
            directory.rmdir()
        except OSError:
            return
        directory = directory.parent


def library_path(rel: str) -> Path:
    library = get_settings().library_dir.resolve()
    path = (library / rel).resolve()
    if library not in path.parents:
        raise ValueError("Path escapes library")
    return path


async def download_cover(url: str, dest: Path) -> bool:
    try:
        async with httpx.AsyncClient(timeout=15, headers={"User-Agent": USER_AGENT}, follow_redirects=True) as c:
            resp = await c.get(url)
        if resp.status_code != 200 or not resp.headers.get("content-type", "").startswith("image/"):
            return False
        # Open Library serves a 1x1 placeholder when no cover exists.
        if len(resp.content) < 1000:
            return False
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(resp.content)
        return True
    except httpx.HTTPError:
        return False
