'use server';

import { adminDb } from '@/lib/supabase/admin';
import { createAuthClient } from '@/lib/supabase/server';
import { getViewer, type Viewer } from '@/lib/viewer';
import { anonTag } from '@/lib/anon';
import { rateLimit } from '@/lib/rateLimit';
import { BANNED_MESSAGE, checkContent, isBanned } from '@/lib/moderation';
import { findProfile, getPost, listComments, listPosts, toComment } from '@/lib/data';
import { MAX_TAGS, TAGS, isTag } from '@/lib/tags';
import {
  checkBody,
  checkComment,
  checkDreamedOn,
  checkName,
  checkTitle,
  checkUsername,
  clean,
  cleanTags,
  isUuid,
} from '@/lib/validate';
import {
  ANON_NAME,
  EDIT_WINDOW_MS,
  parsePeriod,
  parseRankBy,
  type ActionResult,
  type Comment,
  type Mode,
  type Post,
} from '@/lib/types';

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

type PostInput = {
  name?: string;
  title: string;
  body: string;
  tags?: string[];
  sensitive?: boolean;
  dreamedOn?: string;
};

type CleanPost = { name: string; title: string; body: string; tags: string[]; sensitive: boolean; dreamedOn: string };

function validatePost(input: PostInput): { ok: true; value: CleanPost } | { ok: false; error: string; field?: string } {
  const name = clean(input.name);
  const title = clean(input.title);
  const body = clean(input.body, { multiline: true });
  const dreamedOn = clean(input.dreamedOn);
  const e1 = checkTitle(title);
  if (e1) return { ok: false, error: e1, field: 'title' };
  const e2 = checkBody(body);
  if (e2) return { ok: false, error: e2, field: 'body' };
  const e3 = checkName(name);
  if (e3) return { ok: false, error: e3, field: 'name' };
  const e4 = checkDreamedOn(dreamedOn);
  if (e4) return { ok: false, error: e4, field: 'dreamedOn' };
  const tags = cleanTags(input.tags, TAGS, MAX_TAGS);
  if (!tags) return { ok: false, error: `タグは一覧から${MAX_TAGS}つまで選んでください。`, field: 'tags' };
  return { ok: true, value: { name, title, body, tags, sensitive: input.sensitive === true, dreamedOn } };
}

/* ---------------- 投稿 ---------------- */

export async function createPost(input: PostInput): Promise<ActionResult<{ post: Post }>> {
  const viewer = await getViewer();
  if (!viewer.clientId) return { ok: false, error: NO_COOKIE };

  const v = validatePost(input);
  if (!v.ok) return v;
  const { name, title, body, tags, sensitive, dreamedOn } = v.value;

  if (await isBanned(viewer)) return { ok: false, error: BANNED_MESSAGE };
  const bad = await checkContent(viewer, name, title, body);
  if (bad) return { ok: false, error: bad };
  const limited = await rateLimit('post', viewer);
  if (limited) return { ok: false, error: limited };

  const { data, error } = await adminDb()
    .from('posts')
    .insert({
      ...authorFields(viewer, name),
      client_id: viewer.clientId,
      title,
      body,
      tags,
      sensitive,
      dreamed_on: dreamedOn || null,
    })
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

/** 投稿から5分以内なら、本人が編集できる */
export async function editPost(id: string, input: PostInput): Promise<ActionResult<{ post: Post }>> {
  if (!isUuid(id)) return { ok: false, error: NOT_FOUND };
  const viewer = await getViewer();
  const v = validatePost({ ...input, name: '' });
  if (!v.ok) return v;
  const { title, body, tags, sensitive, dreamedOn } = v.value;

  const db = adminDb();
  const { data: row } = await db
    .from('posts')
    .select('author_id, client_id, created_at, hidden')
    .eq('id', id)
    .maybeSingle();
  if (!row || row.hidden) return { ok: false, error: NOT_FOUND };
  if (!owns(viewer, row)) return { ok: false, error: '自分の投稿だけ編集できます。' };
  // 画面を開いたまま送信が少し遅れても通るよう、30秒だけ余裕を持たせる
  if (Date.now() - new Date(row.created_at).getTime() > EDIT_WINDOW_MS + 30_000) {
    return { ok: false, error: '編集できるのは投稿から5分以内です。直したいときは、削除してから投稿し直してください。' };
  }
  if (await isBanned(viewer)) return { ok: false, error: BANNED_MESSAGE };
  const bad = await checkContent(viewer, title, body);
  if (bad) return { ok: false, error: bad };

  const { error } = await db
    .from('posts')
    .update({ title, body, tags, sensitive, dreamed_on: dreamedOn || null, edited_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    console.error('editPost', error);
    return { ok: false, error: FAILED };
  }
  const post = await getPost(viewer, id);
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

/** 「私も見た」 */
export async function setPostSame(id: string, same: boolean): Promise<ActionResult<{ sameCount: number }>> {
  if (!isUuid(id)) return { ok: false, error: NOT_FOUND };
  const viewer = await getViewer();
  if (!viewer.voterKey) return { ok: false, error: NO_COOKIE };
  const limited = await rateLimit('like', viewer);
  if (limited) return { ok: false, error: limited };
  const { data, error } = await adminDb().rpc('set_post_same', {
    p_post: id,
    p_voter: viewer.voterKey,
    p_same: same,
  });
  if (error) return { ok: false, error: NOT_FOUND };
  return { ok: true, sameCount: Number(data) };
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

  if (await isBanned(viewer)) return { ok: false, error: BANNED_MESSAGE };
  const bad = await checkContent(viewer, body);
  if (bad) return { ok: false, error: bad, field: 'body' };
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

/* ---------------- 通報・ミュート ---------------- */

type TargetType = 'post' | 'comment';

async function findTarget(type: TargetType, id: string) {
  const { data } = await adminDb()
    .from(type === 'post' ? 'posts' : 'comments')
    .select('author_id, client_id, display_name, anon_tag')
    .eq('id', id)
    .maybeSingle();
  return data as { author_id: string | null; client_id: string | null; display_name: string; anon_tag: string | null } | null;
}

export async function report(type: TargetType, id: string): Promise<ActionResult> {
  if ((type !== 'post' && type !== 'comment') || !isUuid(id)) return { ok: false, error: NOT_FOUND };
  const viewer = await getViewer();
  if (!viewer.voterKey) return { ok: false, error: NO_COOKIE };
  const row = await findTarget(type, id);
  if (!row) return { ok: false, error: NOT_FOUND };
  if (owns(viewer, row)) return { ok: false, error: '自分の書き込みは通報できません。削除を使ってください。' };

  const limited = await rateLimit('report', viewer);
  if (limited) return { ok: false, error: limited };

  const { error } = await adminDb()
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

/** 書き込んだ人をミュートする。自分の画面から、その人の投稿とコメントが消える */
export async function mute(type: TargetType, id: string): Promise<ActionResult<{ label: string }>> {
  if ((type !== 'post' && type !== 'comment') || !isUuid(id)) return { ok: false, error: NOT_FOUND };
  const viewer = await getViewer();
  if (!viewer.voterKey) return { ok: false, error: NO_COOKIE };
  const row = await findTarget(type, id);
  if (!row) return { ok: false, error: NOT_FOUND };
  if (owns(viewer, row)) return { ok: false, error: '自分はミュートできません。' };

  let targetKey: string;
  let label: string;
  if (row.author_id) {
    const { data: pr } = await adminDb().from('profiles').select('username').eq('id', row.author_id).maybeSingle();
    targetKey = `u:${row.author_id}`;
    label = pr?.username ?? row.display_name;
  } else if (row.client_id) {
    targetKey = `c:${row.client_id}`;
    label = `${row.display_name}${row.anon_tag ? ` ID:${row.anon_tag}` : ''}`;
  } else {
    return { ok: false, error: 'この書き込みの人はミュートできません。' };
  }

  const limited = await rateLimit('report', viewer);
  if (limited) return { ok: false, error: limited };

  const { error } = await adminDb()
    .from('mutes')
    .upsert(
      { muter_key: viewer.voterKey, target_key: targetKey, label },
      { onConflict: 'muter_key,target_key', ignoreDuplicates: true },
    );
  if (error) {
    console.error('mute', error);
    return { ok: false, error: FAILED };
  }
  return { ok: true, label };
}

export async function unmute(muteId: string): Promise<ActionResult> {
  if (!isUuid(muteId)) return { ok: false, error: NOT_FOUND };
  const viewer = await getViewer();
  if (!viewer.voterKey) return { ok: false, error: NO_COOKIE };
  const { error } = await adminDb().from('mutes').delete().eq('id', muteId).eq('muter_key', viewer.voterKey);
  if (error) return { ok: false, error: FAILED };
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
  const bad = await checkContent({ ...viewer, username }, username);
  if (bad) return { ok: false, error: 'このユーザー名は使えません。別の名前にしてください。', field: 'username' };

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
  mode: Mode;
  period: string;
  rankBy?: string;
  username?: string | null;
  tag?: string | null;
  query?: string | null;
  offset: number;
}): Promise<ActionResult<{ posts: Post[]; hasMore: boolean }>> {
  const viewer = await getViewer();
  let authorId: string | null = null;
  if (input.mode === 'profile') {
    const profile = input.username ? await findProfile(input.username) : null;
    if (!profile) return { ok: false, error: NOT_FOUND };
    authorId = profile.id;
  }
  if (input.mode === 'post') return { ok: true, posts: [], hasMore: false };
  const offset = Math.max(0, Math.floor(Number(input.offset) || 0));
  const query = clean(input.query).slice(0, 50) || null;
  const res = await listPosts(viewer, {
    mode: input.mode,
    period: parsePeriod(input.period),
    rankBy: parseRankBy(input.rankBy),
    authorId,
    tag: isTag(input.tag) ? input.tag : null,
    query,
    offset,
  });
  return { ok: true, ...res };
}
