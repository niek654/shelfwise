export interface User {
  id: number;
  username: string;
  email: string;
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Token {
  access_token: string;
  token_type: string;
}

export interface BookMetadata {
  title: string;
  subtitle?: string | null;
  authors: string[];
  publisher?: string | null;
  published_date?: string | null;
  isbn10?: string | null;
  isbn13?: string | null;
  doi?: string | null;
  language?: string | null;
  description?: string | null;
  page_count?: number | null;
  categories: string[];
  series?: string | null;
  series_index?: string | null;
  cover_url?: string | null;
  source?: string | null;
  source_id?: string | null;
  source_url?: string | null;
}

export interface Book extends BookMetadata {
  id: number;
  owner_id: number;
  metadata_source: string | null;
  has_cover: boolean;
  file_name: string;
  original_filename: string;
  file_format: string;
  file_size: number;
  created_at: string;
  updated_at: string;
}

export interface BookPage {
  items: Book[];
  total: number;
  page: number;
  page_size: number;
}

export interface Extracted {
  title?: string | null;
  authors?: string[];
  publisher?: string | null;
  published_date?: string | null;
  language?: string | null;
  description?: string | null;
  isbns?: string[];
  doi?: string | null;
  series?: string | null;
  series_index?: string | null;
  embedded_cover?: string;
  lookup?: ProviderStatus[];
}

export interface Upload {
  id: number;
  original_filename: string;
  file_format: string;
  file_size: number;
  status: "processing" | "review" | "completed" | "failed";
  extracted: Extracted;
  candidates: BookMetadata[];
  error: string | null;
  duplicate_of: number | null;
  book_id: number | null;
  created_at: string;
}

export interface FacetValue {
  value: string;
  count: number;
}

export interface Facets {
  languages: FacetValue[];
  formats: FacetValue[];
  authors: FacetValue[];
  series: FacetValue[];
  categories: FacetValue[];
  publishers: FacetValue[];
  years: { min: number; max: number } | null;
  missing: Record<string, number>;
}

export interface SeriesSummary {
  name: string;
  count: number;
  authors: string[];
  covers: { book_id: number; version: string }[];
  next_index: string | null;
}

export interface ProviderStatus {
  name: string;
  label: string;
  status: "ok" | "no_results" | "error" | "disabled";
  message: string | null;
}

export interface LookupResult {
  candidates: BookMetadata[];
  providers: ProviderStatus[];
}

export interface Provider {
  name: string;
  label: string;
  /** Configured: required API keys are present. */
  enabled: boolean;
  /** Configured and not switched off by an administrator. */
  active: boolean;
  switched_off: boolean;
  note: string | null;
}

export interface AppConfig {
  version: string;
  allow_registration: boolean;
  needs_setup: boolean;
  providers: Provider[];
  filename_template: string;
}

const TOKEN_KEY = "shelfwise-token";

export const token = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function errorMessage(body: unknown, fallback: string): string {
  const detail = (body as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d: { loc?: string[]; msg?: string }) => `${d.loc?.slice(-1)[0] ?? ""}: ${d.msg}`).join(", ");
  }
  return fallback;
}

export async function api<T = unknown>(path: string, options: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const t = token.get();
  if (t) headers.set("Authorization", `Bearer ${t}`);
  let body = options.body;
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.json);
  }
  const res = await fetch(path, { ...options, headers, body });
  if (res.status === 401 && t) {
    token.clear();
    window.dispatchEvent(new Event("shelfwise:logout"));
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, errorMessage(data, res.statusText));
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** Upload files with progress reporting (fetch has no upload progress). */
export function uploadFiles(files: File[], onProgress: (fraction: number) => void): Promise<Upload[]> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    const t = token.get();
    if (t) xhr.setRequestHeader("Authorization", `Bearer ${t}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error page */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as Upload[]);
      else reject(new ApiError(xhr.status, errorMessage(data, xhr.statusText || "Upload failed")));
    };
    xhr.onerror = () => reject(new ApiError(0, "Network error"));
    xhr.send(form);
  });
}

/** URL for authenticated assets used in <img>/<a> where headers can't be set. */
export function authUrl(path: string): string {
  const t = token.get();
  return t ? `${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(t)}` : path;
}

/** A book's cover URL. `version` (the book's updated_at) changes whenever the cover does,
 * so browsers never show a stale cached cover. */
export function coverUrl(bookId: number, version: string): string {
  return authUrl(`/api/books/${bookId}/cover?v=${encodeURIComponent(version)}`);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let i = -1;
  do {
    n /= 1024;
    i++;
  } while (n >= 1024 && i < units.length - 1);
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}

export function year(date?: string | null): string {
  return date?.match(/\d{4}/)?.[0] ?? "";
}

export const SOURCE_LABELS: Record<string, string> = {
  google_books: "Google Books",
  open_library: "Open Library",
  worldcat: "WorldCat",
  crossref: "Crossref",
  hardcover: "Hardcover",
  apple_books: "Apple Books",
  kb: "KB",
  dnb: "DNB",
  openalex: "OpenAlex",
  combined: "Combined",
  file: "From file",
};
