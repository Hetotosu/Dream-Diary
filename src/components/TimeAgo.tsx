'use client';

import { useEffect, useState } from 'react';

function ago(ts: number, now: number): string {
  const s = Math.max(0, (now - ts) / 1000);
  if (s < 60) return 'たった今';
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}分前`;
  const hr = m / 60;
  if (hr < 24) return `${Math.floor(hr)}時間前`;
  const d = hr / 24;
  if (d < 30) return `${Math.floor(d)}日前`;
  const dt = new Date(ts);
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`;
}

/** 「3時間前」のような相対時刻。1分ごとに更新する */
export function TimeAgo({ iso }: { iso: string }) {
  const ts = new Date(iso).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return (
    <time
      dateTime={iso}
      title={new Date(ts).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
      suppressHydrationWarning
    >
      {ago(ts, now)}
    </time>
  );
}
