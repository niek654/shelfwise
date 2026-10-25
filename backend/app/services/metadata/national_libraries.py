"""National library catalogues via SRU (no key needed).

- KB, Koninklijke Bibliotheek (Netherlands): Dublin Core records from the GGC catalogue.
- DNB, Deutsche Nationalbibliothek (Germany): MARC21 records.
"""

import re
from typing import List, Optional
from xml.etree import ElementTree as ET

import httpx

from ...schemas import BookMetadata
from .base import Provider, fill_isbns, split_title

LANGUAGES = {
    "dut": "nl", "nld": "nl", "ger": "de", "deu": "de", "eng": "en", "fre": "fr", "fra": "fr",
    "spa": "es", "ita": "it", "por": "pt", "swe": "sv", "dan": "da", "nor": "no", "pol": "pl",
}
# MARC non-sorting markers (e.g. "\x98Das\x9c Lied") and ISBD punctuation at field ends.
_NONSORT = re.compile("[\x88\x89\x98\x9c]")
_TRAILING = re.compile(r"[\s/:;,.=]+$")


def _clean(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    value = _TRAILING.sub("", _NONSORT.sub("", value)).strip()
    return value or None


def _title(value: Optional[str]) -> Optional[str]:
    """Drop the statement of responsibility: 'Title / transl. by X' -> 'Title'."""
    return _clean((value or "").split(" / ", 1)[0])


def _invert(name: str) -> str:
    """'Koch, Herman' -> 'Herman Koch'."""
    name = re.sub(r"\s*\[[^\]]*\]$", "", name).strip()
    if name.count(",") == 1:
        last, first = (p.strip() for p in name.split(","))
        return f"{first} {last}".strip()
    return name


def _year(value: Optional[str]) -> Optional[str]:
    match = re.search(r"\b(1[5-9]\d\d|20\d\d)\b", value or "")
    return match.group(1) if match else None


def _quote(value: str) -> str:
    return '"' + value.replace('"', "") + '"'


class KB(Provider):
    name = "kb"
    label = "KB (Dutch national library)"
    API = "https://jsru.kb.nl/sru/sru"
    NS = {
        "srw": "http://www.loc.gov/zing/srw/",
        "dc": "http://purl.org/dc/elements/1.1/",
        "dcterms": "http://purl.org/dc/terms/",
    }

    async def _query(self, client: httpx.AsyncClient, cql: str, limit: int) -> List[BookMetadata]:
        resp = await client.get(
            self.API,
            params={
                "version": "1.2", "operation": "searchRetrieve", "x-collection": "GGC",
                "recordSchema": "dc", "maximumRecords": str(limit), "query": cql,
            },
        )
        resp.raise_for_status()
        root = ET.fromstring(resp.content)
        return [self._parse(r) for r in root.iterfind(".//srw:recordData", self.NS)]

    def _parse(self, rec: ET.Element) -> BookMetadata:
        def all_(tag: str) -> List[str]:
            return [e.text.strip() for e in rec.iterfind(tag, self.NS) if e.text and e.text.strip()]

        titles = all_("dc:title")
        main, sub = split_title(_title(titles[0] if titles else "") or "")
        publisher = next(iter(all_("dc:publisher")), "")
        languages = [LANGUAGES[l] for l in all_("dc:language") if l in LANGUAGES]
        identifiers = all_("dc:identifier")
        extents = (re.search(r"(\d+)\s*(?:p|pagina|blz|S)\b", e) for e in all_("dcterms:extent"))
        pages = next((m for m in extents if m), None)
        return fill_isbns(
            BookMetadata(
                title=_title(main) or "",
                subtitle=_title(sub),
                authors=[_invert(a) for a in all_("dc:creator")],
                # "Amsterdam : Rubinstein" -> "Rubinstein"
                publisher=_clean(publisher.split(" : ", 1)[-1]),
                published_date=_year(next(iter(all_("dc:date")), None)),
                language=languages[0] if languages else None,
                page_count=int(pages.group(1)) if pages else None,
                categories=[s for s in all_("dc:subject") if not s.isdigit()][:6],
                source=self.name,
                source_id=next((i.rsplit(":", 1)[-1] for i in identifiers if "resolver.kb.nl" in i), None),
                source_url=next((i for i in identifiers if i.startswith("http")), None),
            ),
            identifiers,
        )

    async def by_isbn(self, client, isbn):
        return await self._query(client, f"dc.identifier={isbn}", 3)

    async def search(self, client, title, author: Optional[str] = None, limit: int = 5):
        cql = f"dc.title={_quote(title)} and dc.type=boek"
        if author:
            cql += f" and dc.creator={_quote(author)}"
        return await self._query(client, cql, limit)


class DNB(Provider):
    name = "dnb"
    label = "DNB (German national library)"
    API = "https://services.dnb.de/sru/dnb"
    MARC = "{http://www.loc.gov/MARC21/slim}"

    async def _query(self, client: httpx.AsyncClient, cql: str, limit: int) -> List[BookMetadata]:
        resp = await client.get(
            self.API,
            params={
                "version": "1.1", "operation": "searchRetrieve", "recordSchema": "MARC21-xml",
                "maximumRecords": str(limit), "query": cql,
            },
        )
        resp.raise_for_status()
        root = ET.fromstring(resp.content)
        return [self._parse(r) for r in root.iter(f"{self.MARC}record")]

    def _parse(self, rec: ET.Element) -> BookMetadata:
        def fields(tag: str) -> List[ET.Element]:
            return [f for f in rec.iterfind(f"{self.MARC}datafield") if f.get("tag") == tag]

        def sub(field: Optional[ET.Element], code: str) -> Optional[str]:
            if field is None:
                return None
            el = next((s for s in field.iterfind(f"{self.MARC}subfield") if s.get("code") == code), None)
            return el.text if el is not None else None

        def first(tag: str) -> Optional[ET.Element]:
            return next(iter(fields(tag)), None)

        idn = next((c.text for c in rec.iterfind(f"{self.MARC}controlfield") if c.get("tag") == "001"), None)
        t245 = first("245")
        title, part_number, part_title = _title(sub(t245, "a")), _clean(sub(t245, "n")), _title(sub(t245, "p"))
        series = series_index = None
        if part_title:
            # Multi-volume works: "Das Lied von Eis und Feuer ; 1. Die Herren von Winterfell"
            series, series_index, title = title, (part_number or "").rstrip(".") or None, part_title
        title, subtitle = split_title(title or "")

        authors = [_invert(sub(f, "a") or "") for f in fields("100")]
        authors += [
            _invert(sub(f, "a") or "") for f in fields("700") if (sub(f, "4") or "") == "aut" or sub(f, "e") == "Verfasser"
        ]
        pub = first("264") or first("260")
        pages = re.search(r"\d+", sub(first("300"), "a") or "")
        language = sub(first("041"), "a")
        return fill_isbns(
            BookMetadata(
                title=title or "",
                subtitle=_title(sub(t245, "b")) or subtitle,
                authors=[a for a in authors if a],
                publisher=_clean(sub(pub, "b")),
                published_date=_year(sub(pub, "c")),
                language=LANGUAGES.get(language or "", language),
                page_count=int(pages.group(0)) if pages else None,
                series=series,
                series_index=series_index,
                source=self.name,
                source_id=idn,
                source_url=f"https://d-nb.info/{idn}" if idn else None,
            ),
            [sub(f, "a") or "" for f in fields("020")],
        )

    async def by_isbn(self, client, isbn):
        return await self._query(client, f"num={isbn}", 3)

    async def search(self, client, title, author: Optional[str] = None, limit: int = 5):
        cql = f"tit={_quote(title)} and mat=books"
        if author:
            cql += f" and per={_quote(author)}"
        return await self._query(client, cql, limit)
