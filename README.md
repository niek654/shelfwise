# Shelfwise

Shelfwise is a self-hosted book manager. You upload e-book files, it finds their metadata online, you confirm it, and it files each book in your library under a consistent name. It runs on Docker and PostgreSQL, works on phones, has light and dark themes, and supports multiple users.

## Features

- **Upload pipeline**: Upload → Process → Load metadata (automatic) → Confirm → Rename → Store
  - Reads embedded metadata and covers from **EPUB** files and scans **PDF** text for ISBNs and DOIs; other formats fall back to the file name
  - Looks up metadata by **ISBN**, then DOI, then title and author
  - You review the matches side by side, edit any field and confirm
  - Files get a standard name, e.g. `Frank Herbert/Frank Herbert - Dune (1965).epub`, and you can change the template
  - Flags files that are already in your library
- **Metadata sources**: Google Books, Hardcover, Open Library, Apple Books, KB (Dutch national library), DNB (German national library), WorldCat (OCLC), Crossref and OpenAlex. Records for the same book are merged into one "Combined" result. The review screen shows what each source returned, or why it failed
- **ISBN tools**: checksum validation, conversion between ISBN-10 and ISBN-13, ISBN search
- **Library**: search by title, author, ISBN, series or publisher; sort and filter by format; grid or list view; edit metadata, replace covers, download
- **Multiple users**: each user has their own library. The first account becomes the administrator, and admins can manage users. Registration can be turned off
- **Modern UI**: built with React and Tailwind. Responsive with mobile bottom navigation, and a light/dark/system theme
- **Formats**: EPUB, PDF, MOBI, AZW/AZW3, FB2, DJVU, CBZ/CBR, TXT, RTF, DOCX

## Quick start (Docker)

```bash
git clone https://github.com/niek654/shelfwise.git
cd shelfwise
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD and SHELFWISE_SECRET_KEY (openssl rand -hex 32)
docker compose up -d --build
```

Open <http://localhost:8000> and create the first account. That account becomes the administrator.

Data is kept in two Docker volumes: `db-data` holds PostgreSQL and `library` holds the book files, covers and pending uploads. To keep the files in a host folder instead, see the comment in `docker-compose.yml`.

### Updating

```bash
git pull && docker compose up -d --build
```

## Configuration

Set all options with environment variables in `.env`. See [`.env.example`](.env.example) for the full list.

| Variable | Default | Description |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | — | Database password (**required**) |
| `SHELFWISE_SECRET_KEY` | — | Key for signing login tokens (**required**) |
| `SHELFWISE_PORT` | `8000` | Port on the host |
| `SHELFWISE_ALLOW_REGISTRATION` | `true` | Let visitors create accounts |
| `SHELFWISE_FILENAME_TEMPLATE` | `{author}/{author} - {title} ({year})` | Name of each stored file. Fields: `{author} {authors} {title} {subtitle} {year} {isbn} {publisher} {series}`. A `/` creates a folder |
| `SHELFWISE_MAX_UPLOAD_MB` | `500` | Largest file you can upload |
| `SHELFWISE_ADMIN_USERNAME` / `_EMAIL` / `_PASSWORD` | — | Creates an admin account on startup |
| `SHELFWISE_GOOGLE_BOOKS_API_KEY` | — | Recommended. Without a key, Google limits requests heavily |
| `SHELFWISE_WORLDCAT_CLIENT_ID` / `_SECRET` | — | OCLC WSKey with the `wcapi` scope. WorldCat is off without it |
| `SHELFWISE_CROSSREF_MAILTO` | — | Contact email for the faster "polite" pools of Crossref and OpenAlex |
| `SHELFWISE_HARDCOVER_API_TOKEN` | — | Free token from hardcover.app (account → API). Adds series details. Hardcover is off without it |
| `SHELFWISE_OPENALEX_API_KEY` | — | Optional free key. Without one, OpenAlex uses a small budget shared by everyone on your IP address |
| `SHELFWISE_APPLE_BOOKS_COUNTRY` | `us` | Apple Books store to search, e.g. `nl` or `de` |

## Development

The backend uses Python 3.12, FastAPI and SQLAlchemy. The frontend uses React 18, Vite, TypeScript and Tailwind.

```bash
# database
docker compose up -d db

# backend (http://localhost:8000, API docs at /api/docs)
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt pytest
export SHELFWISE_DATABASE_URL=postgresql+psycopg://shelfwise:<password>@localhost:5432/shelfwise SHELFWISE_DATA_DIR=./data
uvicorn app.main:app --reload
pytest   # runs against SQLite, no database needed

# frontend (http://localhost:5173, proxies /api to :8000)
cd frontend
npm install
npm run dev
```

The compose file does not publish the database port. To reach PostgreSQL from your machine, add `ports: ["5432:5432"]` to the `db` service.

### Project layout

```
backend/app/
  main.py              app setup, static frontend
  models.py            User, Book, Upload
  routers/             auth, users, books, uploads, metadata
  services/extract.py  EPUB/PDF/file-name metadata extraction
  services/isbn.py     ISBN validation and conversion
  services/metadata/   one module per metadata source, plus ranking/merging
  services/storage.py  file naming and library storage
frontend/src/
  pages/               Library, BookDetail, Upload, Review, Admin, Settings, Login
  components/          Layout, BookCover, MetadataForm
```

## Contributing

Issues and pull requests are welcome. Run `pytest` and `npm run build` before you open a pull request.

## License

[MIT](LICENSE)

## Continuous integration

[`contrib/github-ci.yml`](contrib/github-ci.yml) is a GitHub Actions workflow. It runs the tests and publishes multi-arch images to `ghcr.io/niek654/shelfwise`. To turn it on, move it to `.github/workflows/ci.yml`.
