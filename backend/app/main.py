import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import or_, select

from . import __version__
from .auth import hash_password
from .config import get_settings
from .db import Base, SessionLocal, engine
from .models import Upload, UploadStatus, User
from .routers import auth, books, metadata, uploads, users

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("shelfwise")
settings = get_settings()


def bootstrap() -> None:
    for d in (settings.library_dir, settings.upload_dir, settings.cover_dir):
        d.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if settings.admin_username and settings.admin_password:
            exists = db.scalar(
                select(User).where(
                    or_(User.username == settings.admin_username, User.email == settings.admin_email)
                )
            )
            if not exists:
                db.add(
                    User(
                        username=settings.admin_username,
                        email=settings.admin_email or f"{settings.admin_username}@localhost",
                        hashed_password=hash_password(settings.admin_password),
                        is_admin=True,
                    )
                )
                log.info("Created admin user %s", settings.admin_username)
        # Uploads interrupted by a restart would otherwise stay "processing" forever.
        for upload in db.scalars(select(Upload).where(Upload.status == UploadStatus.processing)):
            upload.status = UploadStatus.review
        db.commit()
    if settings.secret_key == "change-me":
        log.warning("SHELFWISE_SECRET_KEY is not set; using an insecure default")


@asynccontextmanager
async def lifespan(app: FastAPI):
    bootstrap()
    yield


app = FastAPI(title="Shelfwise", version=__version__, lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")
for r in (auth.router, users.router, books.router, uploads.router, metadata.router):
    app.include_router(r)


@app.get("/api/health", include_in_schema=False)
def health():
    return {"status": "ok", "version": __version__}


# Serve the built single-page frontend, falling back to index.html for client-side routes.
static = settings.static_dir
if (static / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=static / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404)
        candidate = (static / path).resolve()
        if path and candidate.is_file() and static.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(static / "index.html")
