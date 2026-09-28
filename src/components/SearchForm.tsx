'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TAGS } from '@/lib/tags';

function href(q: string, tag: string | null) {
  const sp = new URLSearchParams();
  if (q) sp.set('q', q);
  if (tag) sp.set('tag', tag);
  const s = sp.toString();
  return s ? `/search?${s}` : '/search';
}

export function SearchForm({ query, tag }: { query: string; tag: string | null }) {
  const router = useRouter();
  const [q, setQ] = useState(query);

  return (
    <div className="search">
      <form
        role="search"
        className="search-row"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(href(q.trim().slice(0, 50), tag), { scroll: false });
        }}
      >
        <label htmlFor="sq" className="sr">
          キーワード
        </label>
        <input
          id="sq"
          type="search"
          value={q}
          maxLength={50}
          placeholder="タイトルや本文の言葉で探す"
          onChange={(e) => setQ(e.target.value)}
          enterKeyHint="search"
        />
        <button type="submit" className="btn primary small">
          検索
        </button>
      </form>
      <nav className="tag-pick" aria-label="タグで絞り込む">
        {TAGS.map((t) => (
          <Link
            key={t}
            href={href(query, tag === t ? null : t)}
            aria-current={tag === t ? 'page' : undefined}
            scroll={false}
            replace
          >
            #{t}
          </Link>
        ))}
      </nav>
    </div>
  );
}
