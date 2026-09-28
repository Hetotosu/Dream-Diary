const PALETTE = ['#5B4FC4', '#2F7D6B', '#B5482F', '#8A3F8F', '#2C6FA8', '#8C6A12'];

function colorFor(key: string): string {
  let n = 0;
  for (let i = 0; i < key.length; i++) n = (n * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[n % PALETTE.length];
}

/** 登録ユーザーは名前、匿名は ID でアイコンの色を決める */
export function avatarKey(o: { username: string | null; anonTag: string | null; name: string }): string {
  return o.username ? `u:${o.username}` : `a:${o.anonTag ?? o.name}`;
}

export function Avatar({ name, colorKey, size }: { name: string; colorKey: string; size?: 'sm' | 'lg' }) {
  return (
    <span
      className={`avatar${size ? ` ${size}` : ''}`}
      aria-hidden="true"
      style={{ background: colorFor(colorKey) }}
    >
      {Array.from(name || '?')[0]}
    </span>
  );
}
