'use client';

import { useState } from 'react';
import { unmute } from '@/app/actions';
import { useToast } from '@/components/Toast';
import type { MuteEntry } from '@/lib/types';

export function MuteList({ initial }: { initial: MuteEntry[] }) {
  const [items, setItems] = useState(initial);
  const toast = useToast();

  if (!items.length) return <p className="empty-c">ミュートしている人はいません。</p>;

  return (
    <ul className="plain-list">
      {items.map((m) => (
        <li key={m.id}>
          <span>{m.label}</span>
          <button
            type="button"
            className="btn small"
            onClick={async () => {
              const res = await unmute(m.id);
              if (!res.ok) return toast(res.error);
              setItems((l) => l.filter((x) => x.id !== m.id));
              toast(`${m.label} のミュートを解除しました`);
            }}
          >
            解除
          </button>
        </li>
      ))}
    </ul>
  );
}
