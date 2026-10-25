import { FormEvent, useEffect, useState } from "react";
import { Loader2, Search, X } from "lucide-react";

export interface LookupQuery {
  isbn: string;
  title: string;
  author: string;
}

interface Props {
  initial: LookupQuery;
  onSearch: (query: { isbn?: string; title?: string; author?: string }) => Promise<void>;
  className?: string;
}

function ClearableInput({
  value,
  onChange,
  className = "",
  ...rest
}: { value: string; onChange: (v: string) => void; className?: string; placeholder: string; inputMode?: "numeric" }) {
  return (
    <div className="relative">
      <input className={`input pr-8 ${className}`} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={`Clear ${rest.placeholder}`}
          className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-ink-400 hover:text-ink-700 dark:hover:text-ink-200"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Search box for online metadata: by ISBN, or by title and author. */
export default function LookupPanel({ initial, onSearch, className = "" }: Props) {
  const [query, setQuery] = useState(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => setQuery(initial), [initial.isbn, initial.title, initial.author]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      // Send everything that is filled in: an ISBN and a typed title are both searched.
      await onSearch({
        isbn: query.isbn.trim() || undefined,
        title: query.title.trim() || undefined,
        author: query.author.trim() || undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={`card space-y-3 p-4 ${className}`}>
      <p className="text-sm font-medium">Search online</p>
      <ClearableInput
        className="font-mono"
        placeholder="ISBN"
        inputMode="numeric"
        value={query.isbn}
        onChange={(isbn) => setQuery({ ...query, isbn })}
      />
      <div className="grid grid-cols-2 gap-2">
        <ClearableInput placeholder="Title" value={query.title} onChange={(title) => setQuery({ ...query, title })} />
        <ClearableInput placeholder="Author" value={query.author} onChange={(author) => setQuery({ ...query, author })} />
      </div>
      <p className="text-xs text-ink-500 dark:text-ink-400">
        Fill in an ISBN, a title, or both. Exact ISBN matches are listed first. Clear the ISBN to search by title only.
      </p>
      <button className="btn-secondary w-full" disabled={busy || !(query.isbn.trim() || query.title.trim())}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Look up
      </button>
    </form>
  );
}
