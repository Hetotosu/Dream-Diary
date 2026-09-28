export type Mode = 'new' | 'rank' | 'profile' | 'search' | 'post';
export type RankBy = 'likes' | 'sames';
export type Period = 'day' | 'week' | 'all';

export const PERIODS: Period[] = ['day', 'week', 'all'];
export const PAGE_SIZE = 30;
export const ANON_NAME = '名無しさん';

export type Post = {
  id: string;
  title: string;
  body: string;
  name: string;
  /** 登録ユーザーの投稿なら username（ユーザーページへのリンクに使う） */
  username: string | null;
  anonTag: string | null;
  likeCount: number;
  commentCount: number;
  /** 「私も見た」の数 */
  sameCount: number;
  /** 閲覧注意 */
  sensitive: boolean;
  tags: string[];
  /** 見た日（YYYY-MM-DD） */
  dreamedOn: string | null;
  editedAt: string | null;
  createdAt: string;
  liked: boolean;
  samed: boolean;
  mine: boolean;
};

/** 投稿してからこの時間までは編集できる */
export const EDIT_WINDOW_MS = 5 * 60 * 1000;

export type Comment = {
  id: string;
  parentId: string | null;
  name: string;
  username: string | null;
  anonTag: string | null;
  body: string;
  likeCount: number;
  createdAt: string;
  liked: boolean;
  mine: boolean;
};

/** 画面に渡してよい、閲覧者についての情報 */
export type ViewerInfo = {
  loggedIn: boolean;
  username: string | null;
  needsUsername: boolean;
  isAdmin: boolean;
  /** 今日の匿名ID（アイコンの色に使う） */
  anonTag: string | null;
};

export type ProfileInfo = {
  username: string;
  postCount: number;
  likeTotal: number;
  self: boolean;
};

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; field?: string };

export function parseRankBy(v: unknown): RankBy {
  return v === 'sames' ? 'sames' : 'likes';
}

export type Notice = {
  id: string;
  kind: 'comment' | 'reply' | 'mention';
  postId: string;
  postTitle: string;
  actorName: string;
  excerpt: string;
  createdAt: string;
  read: boolean;
};

export type MuteEntry = { id: string; label: string; createdAt: string };

export type QueueItem = {
  targetType: 'post' | 'comment';
  targetId: string;
  postId: string;
  reports: number;
  lastReported: string | null;
  hidden: boolean;
  title: string | null;
  body: string;
  name: string;
  anonTag: string | null;
  username: string | null;
  createdAt: string;
};

export type BanEntry = { id: string; label: string; createdAt: string };

export function parsePeriod(v: unknown): Period {
  return v === 'week' || v === 'all' ? v : 'day';
}
