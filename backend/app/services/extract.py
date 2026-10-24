"""Extract metadata hints (title, authors, ISBN, DOI, cover) from uploaded files."""

import logging
import posixpath
import re
import zipfile
from pathlib import Path
from typing import Optional, Tuple
from xml.etree import ElementTree as ET

from . import isbn as isbn_utils

log = logging.getLogger(__name__)

SUPPORTED_FORMATS = {"epub", "pdf", "mobi", "azw", "azw3", "fb2", "djvu", "cbz", "cbr", "txt", "rtf", "docx"}
DOI_RE = re.compile(r"\b(10\.\d{4,9}/[^\s\"<>]+[^\s\"<>.,;)\]])", re.IGNORECASE)

NS = {
    "c": "urn:oasis:names:tc:opendocument:xmlns:container",
    "opf": "http://www.idpf.org/2007/opf",
    "dc": "http://purl.org/dc/elements/1.1/",
}


def _text(el: Optional[ET.Element]) -> Optional[str]:
    if el is None or el.text is None:
        return None
    value = " ".join(el.text.split())
    return value or None


def _empty() -> dict:
    return {
        "title": None,
        "authors": [],
        "publisher": None,
        "published_date": None,
        "language": None,
        "description": None,
        "isbns": [],
        "doi": None,
    }


def parse_filename(filename: str) -> dict:
    """Best-effort guess from names like 'Author - Title (2001).epub'."""
    data = _empty()
    stem = Path(filename).stem
    data["isbns"] = isbn_utils.find_isbns(stem)
    stem = re.sub(r"[\[(](?:97[89])?[\dXx-]{10,17}[\])]", "", stem)
    year = re.search(r"[\[(]((?:1[5-9]|20)\d\d)[\])]", stem)
    if year:
        data["published_date"] = year.group(1)
        stem = stem.replace(year.group(0), "")
    stem = re.sub(r"[_]+", " ", stem).strip(" .-")
    if " - " in stem:
        author, title = stem.split(" - ", 1)
        data["authors"] = [a.strip() for a in re.split(r"\s*(?:&|;| and )\s*", author) if a.strip()]
        data["title"] = title.strip()
    else:
        data["title"] = stem
    return data


def _extract_epub(path: Path) -> Tuple[dict, Optional[Tuple[bytes, str]]]:
    data = _empty()
    cover: Optional[Tuple[bytes, str]] = None
    with zipfile.ZipFile(path) as zf:
        container = ET.fromstring(zf.read("META-INF/container.xml"))
        rootfile = container.find(".//c:rootfile", NS)
        if rootfile is None:
            return data, None
        opf_path = rootfile.attrib["full-path"]
        opf = ET.fromstring(zf.read(opf_path))
        meta = opf.find("opf:metadata", NS)
        if meta is None:
            return data, None

        data["title"] = _text(meta.find("dc:title", NS))
        data["authors"] = [t for t in (_text(e) for e in meta.findall("dc:creator", NS)) if t]
        data["publisher"] = _text(meta.find("dc:publisher", NS))
        data["published_date"] = _text(meta.find("dc:date", NS))
        data["language"] = _text(meta.find("dc:language", NS))
        desc = _text(meta.find("dc:description", NS))
        data["description"] = re.sub(r"<[^>]+>", "", desc) if desc else None

        for ident in meta.findall("dc:identifier", NS):
            value = _text(ident) or ""
            data["isbns"].extend(i for i in isbn_utils.find_isbns(value) if i not in data["isbns"])
            doi = DOI_RE.search(value)
            if doi and not data["doi"]:
                data["doi"] = doi.group(1)

        for m in meta.findall("opf:meta", NS):
            if m.attrib.get("name") == "calibre:series":
                data["series"] = m.attrib.get("content")
            elif m.attrib.get("name") == "calibre:series_index":
                data["series_index"] = m.attrib.get("content")

        # Locate the cover image: EPUB3 properties="cover-image", else EPUB2 <meta name="cover">.
        manifest = opf.find("opf:manifest", NS)
        items = list(manifest.findall("opf:item", NS)) if manifest is not None else []
        cover_item = next((i for i in items if "cover-image" in i.attrib.get("properties", "")), None)
        if cover_item is None:
            cover_id = next(
                (m.attrib.get("content") for m in meta.findall("opf:meta", NS) if m.attrib.get("name") == "cover"),
                None,
            )
            cover_item = next((i for i in items if i.attrib.get("id") == cover_id), None)
        if cover_item is not None and cover_item.attrib.get("media-type", "").startswith("image/"):
            href = posixpath.normpath(posixpath.join(posixpath.dirname(opf_path), cover_item.attrib["href"]))
            try:
                cover = (zf.read(href), cover_item.attrib["media-type"])
            except KeyError:
                pass
    return data, cover


def _extract_pdf(path: Path) -> dict:
    from pypdf import PdfReader

    data = _empty()
    reader = PdfReader(str(path))
    info = reader.metadata or {}
    title = (info.get("/Title") or "").strip()
    # Many PDFs carry junk titles like "Microsoft Word - draft.doc"; ignore those.
    if title and not re.search(r"(microsoft word|untitled|\.docx?$|\.indd$)", title, re.I):
        data["title"] = title
    author = (info.get("/Author") or "").strip()
    if author:
        data["authors"] = [a.strip() for a in re.split(r"\s*(?:;|&| and )\s*", author) if a.strip()]

    text = ""
    for page in reader.pages[:15]:
        try:
            text += (page.extract_text() or "") + "\n"
        except Exception:  # pypdf can fail on odd encodings; keep going
            continue
    isbn_context = re.findall(r"ISBN[^\n]{0,40}", text, re.I)
    data["isbns"] = isbn_utils.find_isbns(" ".join(isbn_context)) or isbn_utils.find_isbns(text)
    doi = DOI_RE.search(text)
    if doi:
        data["doi"] = doi.group(1)
    return data


def extract(path: Path, original_filename: str) -> Tuple[dict, Optional[Tuple[bytes, str]]]:
    """Return (hints, embedded_cover). Never raises for malformed files."""
    fmt = Path(original_filename).suffix.lower().lstrip(".")
    data: dict = _empty()
    cover = None
    try:
        if fmt == "epub":
            data, cover = _extract_epub(path)
        elif fmt == "pdf":
            data = _extract_pdf(path)
    except Exception as exc:
        log.warning("Metadata extraction failed for %s: %s", original_filename, exc)

    # Fill gaps from the filename.
    guess = parse_filename(original_filename)
    for key in ("title", "published_date"):
        data[key] = data.get(key) or guess[key]
    data["authors"] = data.get("authors") or guess["authors"]
    data["isbns"] = data.get("isbns") or guess["isbns"]
    return data, cover
