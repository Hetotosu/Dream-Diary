import 'server-only';
import { adminDb } from '@/lib/supabase/admin';
import type { Viewer } from '@/lib/viewer';
import {
  ANON_NAME,
  PAGE_SIZE,
  type BanEntry,
  type Comment,
  type MuteEntry,
  type Notice,
  type Period,
  type Post,
  type ProfileInfo,
  type QueueItem,
  type RankBy,
} from '@/lib/types';

type PostRow = {
  id: string;
  author_id: string | null;
  username: string | null;
  display_name: string;
  anon_tag: string | null;
  title: string;
  body: string;
  like_count: number;
  comment_count: number;
  same_count: number;
  sensitive: boolean;
  tags: string[] | null;
  dreamed_on: string | null;
  edited_at: string | null;
  created_at: string;
  liked: boolean;
  samed: boolean;
  mine: boolean;
};

type CommentRow = {
  id: string;
  parent_id: string | null;
  author_id: string | null;
  username: string | null;
  display_name: string;
  anon_tag: string | null;
  body: string;
  like_count: number;
  created_at: string;
  liked: boolean;
  mine: boolean;
};

export function toPost(r: PostRow): Post {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    name: r.username ?? r.display_name ?? ANON_NAME,
    username: r.username,
    anonTag: r.username ? null : r.anon_tag,
    likeCount: r.like_count,
    commentCount: r.comment_count,
    sameCount: r.same_count,
    sensitive: r.sensitive,
    tags: r.tags ?? [],
    dreamedOn: r.dreamed_on,
    editedAt: r.edited_at,
    createdAt: r.created_at,
    liked: r.liked,
    samed: r.samed,
    mine: r.mine,
  };
}

export function toComment(r: CommentRow): Comment {
  return {
    id: r.id,
    parentId: r.parent_id,
    name: r.username ?? r.display_name ?? ANON_NAME,
    username: r.username,
    anonTag: r.username ? null : r.anon_tag,
    body: r.body,
    likeCount: r.like_count,
    createdAt: r.created_at,
    liked: r.liked,
    mine: r.mine,
  };
}

function who(v: Viewer) {
  return {
    p_voter: v.voterKey ?? '',
    p_user: v.userId,
    p_client: v.clientId,
  };
}

/** ILIKE の特殊文字をエスケープする */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export type ListOptions = {
  mode: 'new' | 'rank' | 'profile' | 'search';
  period?: Period;
  rankBy?: RankBy;
  authorId?: string | null;
  tag?: string | null;
  query?: string | null;
  offset?: number;
};

export async function listPosts(viewer: Viewer, opts: ListOptions): Promise<{ posts: Post[]; hasMore: boolean }> {
  const { data, error } = await adminDb().rpc('list_posts', {
    p_mode: opts.mode,
    p_period: opts.period ?? 'all',
    p_rank_by: opts.rankBy ?? 'likes',
    p_author: opts.authorId ?? null,
    p_tag: opts.tag ?? null,
    p_query: opts.query ? escapeLike(opts.query) : null,
    ...who(viewer),
    p_limit: PAGE_SIZE + 1,
    p_offset: opts.offset ?? 0,
  });
  if (error) throw new Error(`投稿を読み込めませんでした: ${error.message}`);
  const rows = (data ?? []) as PostRow[];
  return { posts: rows.slice(0, PAGE_SIZE).map(toPost), hasMore: rows.length > PAGE_SIZE };
}

export async function getPost(viewer: Viewer, id: string): Promise<Post | null> {
  const { data, error } = await adminDb().rpc('get_post', { p_id: id, ...who(viewer) });
  if (error) throw new Error(`投稿を読み込めませんでした: ${error.message}`);
  const row = (data as PostRow[] | null)?.[0];
  return row ? toPost(row) : null;
}

/** 共有用の画像やタイトル用。閲覧者に関係なく、公開されている投稿だけ */
export async function getPublicPost(id: string): Promise<{ title: string; name: string; sensitive: boolean } | null> {
  const { data } = await adminDb()
    .from('posts')
    .select('title, display_name, sensitive')
    .eq('id', id)
    .eq('hidden', false)
    .maybeSingle();
  return data ? { title: data.title, name: data.display_name, sensitive: data.sensitive } : null;
}

export async function listComments(viewer: Viewer, postId: string): Promise<Comment[]> {
  const { data, error } = await adminDb().rpc('list_comments', { p_post: postId, ...who(viewer) });
  if (error) throw new Error(`コメントを読み込めませんでした: ${error.message}`);
  const rows = (data ?? []) as CommentRow[];
  // 非表示やミュートの親コメントにぶら下がった返信は出さない
  const parents = new Set(rows.filter((r) => !r.parent_id).map((r) => r.id));
  return rows.filter((r) => !r.parent_id || parents.has(r.parent_id)).map(toComment);
}

export async function findProfile(username: string): Promise<{ id: string; username: string } | null> {
  const { data } = await adminDb().from('profiles').select('id, username').eq('username', username).maybeSingle();
  return data ?? null;
}

export async function profileInfo(viewer: Viewer, profile: { id: string; username: string }): Promise<ProfileInfo> {
  const { data } = await adminDb().rpc('profile_stats', { p_author: profile.id });
  const row = (data as { post_count: number; like_total: number }[] | null)?.[0];
  return {
    username: profile.username,
    postCount: row?.post_count ?? 0,
    likeTotal: row?.like_total ?? 0,
    self: viewer.userId === profile.id,
  };
}

/* ---------------- 通知 ---------------- */

export async function unreadCount(viewer: Viewer): Promise<number> {
  if (!viewer.userId || !viewer.username) return 0;
  const { count } = await adminDb()
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', viewer.userId)
    .is('read_at', null);
  return count ?? 0;
}

export async function listNotifications(viewer: Viewer): Promise<Notice[]> {
  if (!viewer.userId) return [];
  const { data } = await adminDb()
    .from('notifications')
    .select('id, kind, post_id, actor_name, excerpt, created_at, read_at, posts(title)')
    .eq('recipient_id', viewer.userId)
    .order('created_at', { ascending: false })
    .limit(100);
  type Row = {
    id: string;
    kind: Notice['kind'];
    post_id: string;
    actor_name: string;
    excerpt: string;
    created_at: string;
    read_at: string | null;
    posts: { title: string } | { title: string }[] | null;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    postId: r.post_id,
    postTitle: (Array.isArray(r.posts) ? r.posts[0]?.title : r.posts?.title) ?? '',
    actorName: r.actor_name,
    excerpt: r.excerpt,
    createdAt: r.created_at,
    read: !!r.read_at,
  }));
}

export async function markNotificationsRead(viewer: Viewer): Promise<void> {
  if (!viewer.userId) return;
  await adminDb()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', viewer.userId)
    .is('read_at', null);
}

/* ---------------- ミュート ---------------- */

export async function listMutes(viewer: Viewer): Promise<MuteEntry[]> {
  if (!viewer.voterKey) return [];
  const { data } = await adminDb()
    .from('mutes')
    .select('id, label, created_at')
    .eq('muter_key', viewer.voterKey)
    .order('created_at', { ascending: false });
  return (data ?? []).map((r: { id: string; label: string; created_at: string }) => ({
    id: r.id,
    label: r.label,
    createdAt: r.created_at,
  }));
}

/* ---------------- 管理 ---------------- */

export async function adminQueue(filter: 'reported' | 'hidden'): Promise<QueueItem[]> {
  const { data, error } = await adminDb().rpc('admin_queue', { p_filter: filter, p_limit: 100 });
  if (error) throw new Error(`管理用の一覧を読み込めませんでした: ${error.message}`);
  type Row = {
    target_type: 'post' | 'comment';
    target_id: string;
    post_id: string;
    reports: number;
    last_reported: string | null;
    hidden: boolean;
    title: string | null;
    body: string;
    display_name: string;
    anon_tag: string | null;
    username: string | null;
    created_at: string;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    targetType: r.target_type,
    targetId: r.target_id,
    postId: r.post_id,
    reports: r.reports,
    lastReported: r.last_reported,
    hidden: r.hidden,
    title: r.title,
    body: r.body,
    name: r.username ?? r.display_name,
    anonTag: r.username ? null : r.anon_tag,
    username: r.username,
    createdAt: r.created_at,
  }));
}

export async function listBans(): Promise<BanEntry[]> {
  const { data } = await adminDb().from('bans').select('id, label, created_at').order('created_at', { ascending: false });
  return (data ?? []).map((r: { id: string; label: string; created_at: string }) => ({
    id: r.id,
    label: r.label,
    createdAt: r.created_at,
  }));
}

export async function listNgWords(): Promise<string[]> {
  const { data } = await adminDb().from('ng_words').select('word').order('created_at', { ascending: false });
  return (data ?? []).map((r: { word: string }) => r.word);
}
