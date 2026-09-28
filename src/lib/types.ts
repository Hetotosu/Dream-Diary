export type Mode = 'new' | 'rank' | 'profile';
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
  createdAt: string;
  liked: boolean;
  mine: boolean;
};

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

export function parsePeriod(v: unknown): Period {
  return v === 'week' || v === 'all' ? v : 'day';
}
