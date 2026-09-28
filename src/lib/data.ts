import 'server-only';
import { adminDb } from '@/lib/supabase/admin';
import type { Viewer } from '@/lib/viewer';
import { ANON_NAME, PAGE_SIZE, type Comment, type Period, type Post, type ProfileInfo } from '@/lib/types';

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
  created_at: string;
  liked: boolean;
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
    createdAt: r.created_at,
    liked: r.liked,
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

export async function listPosts(
  viewer: Viewer,
  opts: { mode: 'new' | 'rank'; period?: Period; authorId?: string | null; offset?: number },
): Promise<{ posts: Post[]; hasMore: boolean }> {
  const { data, error } = await adminDb().rpc('list_posts', {
    p_mode: opts.mode,
    p_period: opts.period ?? 'all',
    p_author: opts.authorId ?? null,
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

export async function listComments(viewer: Viewer, postId: string): Promise<Comment[]> {
  const { data, error } = await adminDb().rpc('list_comments', { p_post: postId, ...who(viewer) });
  if (error) throw new Error(`コメントを読み込めませんでした: ${error.message}`);
  const rows = (data ?? []) as CommentRow[];
  // 非表示の親コメントにぶら下がった返信は出さない
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
