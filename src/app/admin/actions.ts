'use server';

import { revalidatePath } from 'next/cache';
import { adminDb } from '@/lib/supabase/admin';
import { getViewer } from '@/lib/viewer';
import { clearNgCache } from '@/lib/moderation';
import { clean, charLen, isUuid } from '@/lib/validate';
import type { ActionResult } from '@/lib/types';

type TargetType = 'post' | 'comment';

const DENIED = '管理者だけが使える操作です。';
const FAILED = 'うまく保存できませんでした。時間をおいてもう一度試してください。';
const NOT_FOUND = '対象が見つかりませんでした。すでに削除されています。';

function table(type: TargetType) {
  return type === 'post' ? 'posts' : 'comments';
}

function valid(type: unknown, id: unknown): type is TargetType {
  return (type === 'post' || type === 'comment') && isUuid(id);
}

async function requireAdmin(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.isAdmin ? null : DENIED;
}

/** 全員に対して非表示にする */
export async function adminHide(type: TargetType, id: string): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, error: denied };
  if (!valid(type, id)) return { ok: false, error: NOT_FOUND };
  const { error } = await adminDb().from(table(type)).update({ hidden: true }).eq('id', id);
  if (error) return { ok: false, error: FAILED };
  revalidatePath('/admin');
  return { ok: true };
}

/** 問題なしとして表示に戻す。以後は通報がたまっても自動では隠さない */
export async function adminRestore(type: TargetType, id: string): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, error: denied };
  if (!valid(type, id)) return { ok: false, error: NOT_FOUND };
  const { error } = await adminDb().from(table(type)).update({ hidden: false, moderated_ok: true }).eq('id', id);
  if (error) return { ok: false, error: FAILED };
  revalidatePath('/admin');
  return { ok: true };
}

export async function adminDelete(type: TargetType, id: string): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, error: denied };
  if (!valid(type, id)) return { ok: false, error: NOT_FOUND };
  const { error } = await adminDb().from(table(type)).delete().eq('id', id);
  if (error) return { ok: false, error: FAILED };
  revalidatePath('/admin');
  return { ok: true };
}

/** 閲覧注意の付け外し（投稿だけ） */
export async function adminSetSensitive(id: string, sensitive: boolean): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, error: denied };
  if (!isUuid(id)) return { ok: false, error: NOT_FOUND };
  const { error } = await adminDb().from('posts').update({ sensitive: sensitive === true }).eq('id', id);
  if (error) return { ok: false, error: FAILED };
  return { ok: true };
}

/**
 * 書き込んだ人の書き込みを止める。
 * alsoHide が true なら、その人のこれまでの投稿とコメントもまとめて非表示にする。
 */
export async function adminBan(type: TargetType, id: string, alsoHide: boolean): Promise<ActionResult<{ hidden: number }>> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, error: denied };
  if (!valid(type, id)) return { ok: false, error: NOT_FOUND };
  const db = adminDb();
  const { data: row } = await db
    .from(table(type))
    .select('author_id, client_id, display_name, anon_tag')
    .eq('id', id)
    .maybeSingle();
  if (!row) return { ok: false, error: NOT_FOUND };

  const label = row.author_id
    ? row.display_name
    : `${row.display_name}${row.anon_tag ? ` ID:${row.anon_tag}` : ''}（匿名）`;
  const keys: { key: string; label: string }[] = [];
  if (row.author_id) keys.push({ key: `u:${row.author_id}`, label });
  if (row.client_id) keys.push({ key: `c:${row.client_id}`, label });
  if (!keys.length) return { ok: false, error: 'この書き込みの人は特定できないため、止められません。' };

  const { error } = await db.from('bans').upsert(keys, { onConflict: 'key', ignoreDuplicates: true });
  if (error) return { ok: false, error: FAILED };

  let hidden = 0;
  if (alsoHide) {
    for (const t of ['posts', 'comments'] as const) {
      const byAuthor = row.author_id
        ? await db.from(t).update({ hidden: true }, { count: 'exact' }).eq('author_id', row.author_id).eq('hidden', false)
        : null;
      const byClient = row.client_id
        ? await db.from(t).update({ hidden: true }, { count: 'exact' }).eq('client_id', row.client_id).eq('hidden', false)
        : null;
      hidden += (byAuthor?.count ?? 0) + (byClient?.count ?? 0);
    }
  }
  revalidatePath('/admin');
  return { ok: true, hidden };
}

export async function adminUnban(banId: string): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, error: denied };
  if (!isUuid(banId)) return { ok: false, error: NOT_FOUND };
  const { data: ban } = await adminDb().from('bans').select('label, created_at').eq('id', banId).maybeSingle();
  if (!ban) return { ok: false, error: NOT_FOUND };
  // 同じ操作で止めた登録と匿名の両方を解除する
  const { error } = await adminDb().from('bans').delete().eq('label', ban.label).eq('created_at', ban.created_at);
  if (error) return { ok: false, error: FAILED };
  revalidatePath('/admin');
  return { ok: true };
}

export async function addNgWord(word: string): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, error: denied };
  const w = clean(word);
  if (!w) return { ok: false, error: 'NGワードを入力してください。' };
  if (charLen(w) > 50) return { ok: false, error: 'NGワードは50文字以内にしてください。' };
  const { error } = await adminDb().from('ng_words').upsert({ word: w }, { onConflict: 'word', ignoreDuplicates: true });
  if (error) return { ok: false, error: FAILED };
  clearNgCache();
  revalidatePath('/admin');
  return { ok: true };
}

export async function removeNgWord(word: string): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, error: denied };
  const { error } = await adminDb().from('ng_words').delete().eq('word', word);
  if (error) return { ok: false, error: FAILED };
  clearNgCache();
  revalidatePath('/admin');
  return { ok: true };
}
