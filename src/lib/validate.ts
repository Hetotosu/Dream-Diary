/** Postgres の char_length と同じ数え方（コードポイント数） */
export function charLen(s: string): number {
  return Array.from(s).length;
}

/** 前後の空白を落とし、改行をそろえ、制御文字（改行・タブ以外）を取り除く */
export function clean(input: unknown, { multiline = false } = {}): string {
  if (typeof input !== 'string') return '';
  let s = input.replace(/\r\n?/g, '\n');
  s = multiline
    ? s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    : s.replace(/[\u0000-\u001F\u007F]/g, ' ');
  return s.trim();
}

export const LIMITS = {
  name: 20,
  title: 40,
  body: 2000,
  comment: 500,
  username: 20,
} as const;

export function checkTitle(title: string): string | null {
  if (!title) return 'タイトルを入力してください。';
  if (charLen(title) > LIMITS.title) return `タイトルは${LIMITS.title}文字以内にしてください（いま${charLen(title)}文字）。`;
  return null;
}

export function checkBody(body: string): string | null {
  if (!body) return '夢の内容を入力してください。';
  if (charLen(body) > LIMITS.body) return `夢の内容は${LIMITS.body}文字以内にしてください（いま${charLen(body)}文字）。`;
  return null;
}

export function checkName(name: string): string | null {
  if (charLen(name) > LIMITS.name) return `名前は${LIMITS.name}文字以内にしてください。`;
  return null;
}

export function checkComment(text: string): string | null {
  if (!text) return 'コメントを入力してください。';
  if (charLen(text) > LIMITS.comment) return `コメントは${LIMITS.comment}文字以内にしてください（いま${charLen(text)}文字）。`;
  return null;
}

const RESERVED = new Set(['名無しさん', 'admin', 'administrator', '管理者', '運営']);

export function checkUsername(name: string): string | null {
  if (!name) return 'ユーザー名を入力してください。';
  if (charLen(name) > LIMITS.username) return `ユーザー名は${LIMITS.username}文字以内にしてください。`;
  if (/[\s/\\?#%&<>"'`@]/.test(name)) return 'ユーザー名に空白や記号（/ \\ ? # % & < > " \' ` @）は使えません。';
  if (RESERVED.has(name.toLowerCase())) return 'このユーザー名は使えません。別の名前にしてください。';
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}
