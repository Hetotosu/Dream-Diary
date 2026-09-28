import 'server-only';
import { createHmac } from 'node:crypto';
import { env } from '@/lib/env';

const CHARS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 日本時間の日付（YYYY-MM-DD） */
export function jstDate(d = new Date()): string {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

/**
 * 5ch 風の匿名ID。HMAC(秘密のソルト, client_id + 日付) の先頭6文字。
 * 同じブラウザなら同じ日は同じ ID、日付が変わると変わる。ID から client_id は逆算できない。
 */
export function anonTag(clientId: string, date = new Date()): string {
  const digest = createHmac('sha256', env.anonSalt).update(`${clientId}|${jstDate(date)}`).digest();
  let out = '';
  for (let i = 0; i < 6; i++) out += CHARS[digest[i] % CHARS.length];
  return out;
}
