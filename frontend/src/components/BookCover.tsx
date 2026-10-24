import { useState } from "react";

const PALETTES = [
  "from-indigo-500 to-purple-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-sky-500 to-blue-600",
  "from-slate-500 to-zinc-700",
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

interface Props {
  src?: string | null;
  title: string;
  author?: string;
  className?: string;
}

/** A cover image with a generated typographic fallback. */
export default function BookCover({ src, title, author, className = "" }: Props) {
  const [failed, setFailed] = useState(false);
  const base = `relative aspect-[2/3] overflow-hidden rounded-md shadow-md ring-1 ring-black/5 dark:ring-white/10 ${className}`;

  if (src && !failed) {
    return (
      <div className={`${base} bg-ink-200 dark:bg-ink-800`}>
        <img src={src} alt={`Cover of ${title}`} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div className={`${base} flex flex-col justify-between bg-gradient-to-br p-3 text-white ${PALETTES[hash(title) % PALETTES.length]}`}>
      <span className="line-clamp-4 font-serif text-sm font-semibold leading-tight sm:text-base">{title || "Untitled"}</span>
      {author && <span className="line-clamp-2 text-[11px] opacity-80">{author}</span>}
      <span className="absolute inset-y-0 left-0 w-1.5 bg-black/15" />
    </div>
  );
}
