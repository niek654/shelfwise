from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import get_current_user
from ..schemas import LookupResult
from ..services import metadata

router = APIRouter(prefix="/api/metadata", tags=["metadata"], dependencies=[Depends(get_current_user)])


@router.get("/lookup", response_model=LookupResult)
async def lookup(
    isbn: Optional[str] = None,
    doi: Optional[str] = None,
    title: Optional[str] = None,
    author: Optional[str] = None,
):
    if not any([isbn, doi, title]):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Provide an ISBN, DOI or title")
    outcome = await metadata.lookup(isbn=isbn, doi=doi, title=title, author=author, title_search=True)
    return LookupResult(candidates=outcome.candidates, providers=outcome.providers)
