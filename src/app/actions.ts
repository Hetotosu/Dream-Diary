'use server';

import { adminDb } from '@/lib/supabase/admin';
import { createAuthClient } from '@/lib/supabase/server';
import { getViewer, type Viewer } from '@/lib/viewer';
import { anonTag } from '@/lib/anon';
import { rateLimit } from '@/lib/rateLimit';
import { findProfile, getPost, listComments, listPosts, toComment } from '@/lib/data';
import {
  checkBody,
  checkComment,
  checkName,
  checkTitle,
  checkUsername,
  clean,
  isUuid,
} from '@/lib/validate';
import { ANON_NAME, parsePeriod, type ActionResult, type Comment, type Post } from '@/lib/types';

const NO_COOKIE = 'Cookie が使えないため書き込めません。ブラウザの設定で Cookie を有効にしてから、ページを読み込み直してください。';
const FAILED = 'うまく保存できませんでした。時間をおいてもう一度試してください。';
const NOT_FOUND = '対象が見つかりませんでした。すでに削除されたか、非表示になっています。';

/** 書き込む人の名前と匿名ID。ログイン中（ユーザー名あり）はユーザー名、それ以外は匿名 */
function authorFields(viewer: Viewer, anonName: string) {
  if (viewer.userId && viewer.username) {
    return { author_id: viewer.userId, display_name: viewer.username, anon_tag: null };
  }
  return {
    author_id: null,
    display_name: anonName || ANON_NAME,
    anon_tag: viewer.clientId ? anonTag(viewer.clientId) : null,
  };
}

/** 自分の行か（ログイン中は author_id、匿名は Cookie の client_id が一致するか） */
function owns(viewer: Viewer, row: { author_id: string | null; client_id: string | null }) {
  if (row.author_id) return row.author_id === viewer.userId;
  return !!viewer.clientId && row.client_id === viewer.clientId;
}

/* ---------------- 投稿 ---------------- */

export async function createPost(input: {
  name?: string;
  title: string;
  body: string;
}): Promise<ActionResult<{ post: Post }>> {
  const viewer = await getViewer();
  if (!viewer.clientId) return { ok: false, error: NO_COOKIE };

  const name = clean(input.name);
  const title = clean(input.title);
  const body = clean(input.body, { multiline: true });
  const e1 = checkTitle(title);
  if (e1) return { ok: false, error: e1, field: 'title' };
  const e2 = checkBody(body);
  if (e2) return { ok: false, error: e2, field: 'body' };
  const e3 = checkName(name);
  if (e3) return { ok: false, error: e3, field: 'name' };

  const limited = await rateLimit('post', viewer);
  if (limited) return { ok: false, error: limited };

  const { data, error } = await adminDb()
    .from('posts')
    .insert({ ...authorFields(viewer, name), client_id: viewer.clientId, title, body })
    .select('id')
    .single();
  if (error || !data) {
    console.error('createPost', error);
    return { ok: false, error: FAILED };
  }
  const post = await getPost(viewer, data.id);
  if (!post) return { ok: false, error: FAILED };
  return { ok: true, post };
}

export async function deletePost(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: NOT_FOUND };
  const viewer = await getViewer();
  const db = adminDb();
  const { data: row } = await db.from('posts').select('author_id, client_id').eq('id', id).maybeSingle();
  if (!row) return { ok: false, error: NOT_FOUND };
  if (!owns(viewer, row) && !viewer.isAdmin) {
    return { ok: false, error: '自分の投稿だけ削除できます。' };
  }
  const { error } = await db.from('posts').delete().eq('id', id);
  if (error) {
    console.error('deletePost', error);
    return { ok: false, error: FAILED };
  }
  return { ok: true };
}

export async function setPostLike(id: string, like: boolean): Promise<ActionResult<{ likeCount: number }>> {
  if (!isUuid(id)) return { ok: false, error: NOT_FOUND };
  const viewer = await getViewer();
  if (!viewer.voterKey) return { ok: false, error: NO_COOKIE };
  const limited = await rateLimit('like', viewer);
  if (limited) return { ok: false, error: limited };
  const { data, error } = await adminDb().rpc('set_post_like', {
    p_post: id,
    p_voter: viewer.voterKey,
    p_like: like,
  });
  if (error) return { ok: false, error: NOT_FOUND };
  return { ok: true, likeCount: Number(data) };
}

/* ---------------- コメント ---------------- */

export async function fetchComments(postId: string): Promise<ActionResult<{ post: Post; comments: Comment[] }>> {
  if (!isUuid(postId)) return { ok: false, error: NOT_FOUND };
  const viewer = await getViewer();
  const post = await getPost(viewer, postId);
  if (!post) return { ok: false, error: NOT_FOUND };
  const comments = await listComments(viewer, postId);
  return { ok: true, post, comments };
}

export async function createComment(input: {
  postId: string;
  parentId?: string | null;
  body: string;
}): Promise<ActionResult<{ comment: Comment }>> {
  if (!isUuid(input.postId) || (input.parentId && !isUuid(input.parentId))) {
    return { ok: false, error: NOT_FOUND };
  }
  const viewer = await getViewer();
  if (!viewer.clientId) return { ok: false, error: NO_COOKIE };
  const body = clean(input.body, { multiline: true });
  const err = checkComment(body);
  if (err) return { ok: false, error: err, field: 'body' };

  const db = adminDb();
  const { data: post } = await db.from('posts').select('id').eq('id', input.postId).eq('hidden', false).maybeSingle();
  if (!post) return { ok: false, error: NOT_FOUND };
  if (input.parentId) {
    const { data: parent } = await db
      .from('comments')
      .select('post_id, parent_id')
      .eq('id', input.parentId)
      .eq('hidden', false)
      .maybeSingle();
    if (!parent || parent.post_id !== input.postId) return { ok: false, error: NOT_FOUND };
    if (parent.parent_id) return { ok: false, error: '返信への返信はできません。' };
  }

  const limited = await rateLimit('comment', viewer);
  if (limited) return { ok: false, error: limited };

  const { data, error } = await db
    .from('comments')
    .insert({
      ...authorFields(viewer, ''),
      client_id: viewer.clientId,
      post_id: input.postId,
      parent_id: input.parentId ?? null,
      body,
    })
    .select('id, parent_id, author_id, display_name, anon_tag, body, like_count, created_at')
    .single();
  if (error || !data) {
    console.error('createComment', error);
    return { ok: false, error: FAILED };
  }
  return {
    ok: true,
    comment: toComment({ ...data, username: viewer.username && data.author_id ? viewer.username : null, liked: false, mine: true }),
  };
}

export async function deleteComment(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: NOT_FOUND };
  const viewer = await getViewer();
  const db = adminDb();
  const { data: row } = await db.from('comments').select('author_id, client_id').eq('id', id).maybeSingle();
  if (!row) return { ok: false, error: NOT_FOUND };
  if (!owns(viewer, row) && !viewer.isAdmin) {
    return { ok: false, error: '自分のコメントだけ削除できます。' };
  }
  // 親コメントを消すと、返信も on delete cascade で消える
  const { error } = await db.from('comments').delete().eq('id', id);
  if (error) {
    console.error('deleteComment', error);
    return { ok: false, error: FAILED };
  }
  return { ok: true };
}

export async function setCommentLike(id: string, like: boolean): Promise<ActionResult<{ likeCount: number }>> {
  if (!isUuid(id)) return { ok: false, error: NOT_FOUND };
  const viewer = await getViewer();
  if (!viewer.voterKey) return { ok: false, error: NO_COOKIE };
  const limited = await rateLimit('like', viewer);
  if (limited) return { ok: false, error: limited };
  const { data, error } = await adminDb().rpc('set_comment_like', {
    p_comment: id,
    p_voter: viewer.voterKey,
    p_like: like,
  });
  if (error) return { ok: false, error: NOT_FOUND };
  return { ok: true, likeCount: Number(data) };
}

/* ---------------- 通報・管理 ---------------- */

export async function report(type: 'post' | 'comment', id: string): Promise<ActionResult> {
  if ((type !== 'post' && type !== 'comment') || !isUuid(id)) return { ok: false, error: NOT_FOUND };
  const viewer = await getViewer();
  if (!viewer.voterKey) return { ok: false, error: NO_COOKIE };
  const db = adminDb();
  const { data: row } = await db
    .from(type === 'post' ? 'posts' : 'comments')
    .select('author_id, client_id')
    .eq('id', id)
    .maybeSingle();
  if (!row) return { ok: false, error: NOT_FOUND };
  if (owns(viewer, row)) return { ok: false, error: '自分の書き込みは通報できません。削除を使ってください。' };

  const limited = await rateLimit('report', viewer);
  if (limited) return { ok: false, error: limited };

  const { error } = await db
    .from('reports')
    .upsert(
      { target_type: type, target_id: id, reporter_key: viewer.voterKey },
      { onConflict: 'target_type,target_id,reporter_key', ignoreDuplicates: true },
    );
  if (error) {
    console.error('report', error);
    return { ok: false, error: FAILED };
  }
  return { ok: true };
}

/** 管理者だけ：全員に対して非表示にする */
export async function adminHide(type: 'post' | 'comment', id: string): Promise<ActionResult> {
  if ((type !== 'post' && type !== 'comment') || !isUuid(id)) return { ok: false, error: NOT_FOUND };
  const viewer = await getViewer();
  if (!viewer.isAdmin) return { ok: false, error: '管理者だけが使える操作です。' };
  const { error } = await adminDb()
    .from(type === 'post' ? 'posts' : 'comments')
    .update({ hidden: true })
    .eq('id', id);
  if (error) {
    console.error('adminHide', error);
    return { ok: false, error: FAILED };
  }
  return { ok: true };
}

/* ---------------- アカウント ---------------- */

export async function chooseUsername(input: { username: string }): Promise<ActionResult<{ username: string }>> {
  const viewer = await getViewer();
  if (!viewer.userId) return { ok: false, error: 'ログインが切れました。もう一度ログインしてください。' };
  if (viewer.username) return { ok: true, username: viewer.username };

  const username = clean(input.username).normalize('NFC');
  const err = checkUsername(username);
  if (err) return { ok: false, error: err, field: 'username' };

  const limited = await rateLimit('signup', viewer);
  if (limited) return { ok: false, error: limited };

  const { error } = await adminDb().from('profiles').insert({ id: viewer.userId, username });
  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'このユーザー名はすでに使われています。別の名前にしてください。', field: 'username' };
    }
    console.error('chooseUsername', error);
    return { ok: false, error: FAILED };
  }
  return { ok: true, username };
}

export async function signOut(): Promise<ActionResult> {
  const supabase = await createAuthClient();
  await supabase.auth.signOut();
  return { ok: true };
}

/* ---------------- 一覧の続き ---------------- */

export async function loadMorePosts(input: {
  mode: 'new' | 'rank' | 'profile';
  period: 'day' | 'week' | 'all';
  username?: string | null;
  offset: number;
}): Promise<ActionResult<{ posts: Post[]; hasMore: boolean }>> {
  const viewer = await getViewer();
  let authorId: string | null = null;
  if (input.mode === 'profile') {
    const profile = input.username ? await findProfile(input.username) : null;
    if (!profile) return { ok: false, error: NOT_FOUND };
    authorId = profile.id;
  }
  const offset = Math.max(0, Math.floor(Number(input.offset) || 0));
  const res = await listPosts(viewer, {
    mode: input.mode === 'rank' ? 'rank' : 'new',
    period: parsePeriod(input.period),
    authorId,
    offset,
  });
  return { ok: true, ...res };
}
