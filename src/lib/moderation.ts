import 'server-only';
import { adminDb } from '@/lib/supabase/admin';
import type { Viewer } from '@/lib/viewer';

/** 比べやすい形にする（全角→半角、大文字→小文字、空白を除く） */
export function normalizeForMatch(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

const URL_RE =
  /(https?:\/\/|hxxps?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|jp|io|co|me|xyz|info|biz|ly|gl|to|cc|tk|ru|cn|top|site|online|app|dev|link|click|shop|fun|live)\b)/i;

export function containsUrl(s: string): boolean {
  return URL_RE.test(s.normalize('NFKC'));
}

let ngCache: { words: string[]; at: number } | null = null;

export function clearNgCache() {
  ngCache = null;
}

async function ngWords(): Promise<string[]> {
  if (ngCache && Date.now() - ngCache.at < 60_000) return ngCache.words;
  const { data } = await adminDb().from('ng_words').select('word');
  const words = (data ?? []).map((r: { word: string }) => normalizeForMatch(r.word)).filter(Boolean);
  ngCache = { words, at: Date.now() };
  return words;
}

/**
 * 書き込みの中身をチェックする。問題があれば、直し方を含めたメッセージを返す。
 * - 匿名は URL を書けない（スパム対策）
 * - NGワードを含む書き込みは受け付けない
 */
export async function checkContent(viewer: Viewer, ...texts: string[]): Promise<string | null> {
  const loggedIn = !!(viewer.userId && viewer.username);
  if (!loggedIn && texts.some(containsUrl)) {
    return '匿名では URL を書き込めません。URL を消すか、ログインしてから書き込んでください。';
  }
  const words = await ngWords();
  if (words.length) {
    const joined = normalizeForMatch(texts.join('\n'));
    if (words.some((w) => joined.includes(w))) {
      return '使えない言葉が含まれています。表現を変えてから、もう一度送ってください。';
    }
  }
  return null;
}

/** 書き込み停止中か */
export async function isBanned(viewer: Viewer): Promise<boolean> {
  const keys = [viewer.userId && `u:${viewer.userId}`, viewer.clientId && `c:${viewer.clientId}`].filter(
    Boolean,
  ) as string[];
  if (!keys.length) return false;
  const { data } = await adminDb().from('bans').select('key').in('key', keys).limit(1);
  return !!data?.length;
}

export const BANNED_MESSAGE =
  'このアカウントまたは端末からの書き込みは、管理者によって止められています。';
