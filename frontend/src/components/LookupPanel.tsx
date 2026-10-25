import { FormEvent, useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";

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

/** Search box for online metadata: by ISBN, or by title and author. */
export default function LookupPanel({ initial, onSearch, className = "" }: Props) {
  const [query, setQuery] = useState(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => setQuery(initial), [initial.isbn, initial.title, initial.author]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSearch(query.isbn.trim() ? { isbn: query.isbn.trim() } : { title: query.title.trim(), author: query.author.trim() || undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={`card space-y-3 p-4 ${className}`}>
      <p className="text-sm font-medium">Search online</p>
      <input
        className="input font-mono"
        placeholder="ISBN"
        inputMode="numeric"
        value={query.isbn}
        onChange={(e) => setQuery({ ...query, isbn: e.target.value })}
      />
      <div className="flex items-center gap-2 text-xs text-ink-400">
        <span className="h-px flex-1 bg-ink-200 dark:bg-ink-800" /> or <span className="h-px flex-1 bg-ink-200 dark:bg-ink-800" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input className="input" placeholder="Title" value={query.title} onChange={(e) => setQuery({ ...query, title: e.target.value, isbn: "" })} />
        <input className="input" placeholder="Author" value={query.author} onChange={(e) => setQuery({ ...query, author: e.target.value, isbn: "" })} />
      </div>
      <button className="btn-secondary w-full" disabled={busy || !(query.isbn.trim() || query.title.trim())}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Look up
      </button>
    </form>
  );
}
