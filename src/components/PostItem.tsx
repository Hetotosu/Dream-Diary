'use client';

import Link from 'next/link';
import { Avatar, avatarKey } from '@/components/Avatar';
import { BubbleIcon, MoonIcon } from '@/components/icons';
import { TimeAgo } from '@/components/TimeAgo';
import type { Post } from '@/lib/types';

type Props = {
  post: Post;
  rank: number | null;
  expanded: boolean;
  pending: string | null;
  isAdmin: boolean;
  onLike: () => void;
  onToggleExpand: () => void;
  onOpenComments: () => void;
  onDelete: () => void;
  onReport: () => void;
  onHide: () => void;
};

export function PostItem({
  post: p,
  rank,
  expanded,
  pending,
  isAdmin,
  onLike,
  onToggleExpand,
  onOpenComments,
  onDelete,
  onReport,
  onHide,
}: Props) {
  const long = p.body.length > 110 || p.body.split('\n').length > 4;
  const canDelete = p.mine || isAdmin;

  return (
    <li className={`post${rank !== null ? ' ranked' : ''}`}>
      {rank !== null && (
        <div className={`rank${rank <= 3 ? ' top' : ''}`} aria-label={`${rank}位`}>
          {rank}
        </div>
      )}
      <button
        type="button"
        className="like"
        aria-pressed={p.liked}
        aria-label={`いいね（${p.likeCount}）`}
        title={p.liked ? 'いいねを取り消す' : 'いいね'}
        onClick={onLike}
      >
        <MoonIcon />
        <span className="num">{p.likeCount}</span>
      </button>
      <div className="post-main">
        <h2>{p.title}</h2>
        <div className="meta">
          <Avatar name={p.name} colorKey={avatarKey(p)} size="sm" />
          {p.username ? (
            <Link
              href={`/u/${encodeURIComponent(p.username)}`}
              className="namebtn"
              title={`${p.name} のページを開く`}
            >
              {p.name}
            </Link>
          ) : (
            <span className="name">{p.name}</span>
          )}
          {!p.username && p.anonTag && <span>ID:{p.anonTag}</span>}
          <TimeAgo iso={p.createdAt} />
        </div>
        <p className={`body${long && !expanded ? ' clamped' : ''}`}>{p.body}</p>
        <div className="actions">
          <button
            type="button"
            className="cbtn"
            data-fk={`cm:${p.id}`}
            aria-label={`コメント ${p.commentCount}件を見る`}
            onClick={onOpenComments}
          >
            <BubbleIcon />
            <span>{p.commentCount}</span>
          </button>
          {long && (
            <button type="button" className="linkbtn" aria-expanded={expanded} onClick={onToggleExpand}>
              {expanded ? '閉じる' : '続きを読む'}
            </button>
          )}
          {canDelete && (
            <button type="button" className="linkbtn warn" onClick={onDelete}>
              {pending === `del:${p.id}` ? 'もう一度押すと削除します' : p.mine ? '削除' : '削除（管理者）'}
            </button>
          )}
          {!p.mine && (
            <button type="button" className="linkbtn" onClick={onReport}>
              通報
            </button>
          )}
          {isAdmin && (
            <button type="button" className="linkbtn warn" onClick={onHide}>
              {pending === `hide:${p.id}` ? 'もう一度押すと全員に非表示' : '非表示（管理者）'}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
