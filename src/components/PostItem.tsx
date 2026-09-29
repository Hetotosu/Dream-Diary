'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { editPost } from '@/app/actions';
import { Avatar, avatarKey } from '@/components/Avatar';
import { BubbleIcon, MoonIcon } from '@/components/icons';
import { PostForm } from '@/components/PostForm';
import { TimeAgo } from '@/components/TimeAgo';
import { pop } from '@/lib/pop';
import { EDIT_WINDOW_MS, type Post } from '@/lib/types';

type Props = {
  post: Post;
  rank: number | null;
  /** 本文を最初から全部出す（投稿ページ） */
  full?: boolean;
  /** いま投稿されたばかり（出てくる動きを付ける） */
  fresh?: boolean;
  expanded: boolean;
  revealed: boolean;
  pending: string | null;
  isAdmin: boolean;
  onLike: () => void;
  onSame: () => void;
  onToggleExpand: () => void;
  onReveal: () => void;
  onOpenComments: () => void;
  onShare: () => void;
  onEdited: (p: Post) => void;
  onDelete: () => void;
  onReport: () => void;
  onMute: () => void;
  onHide: () => void;
  onToggleSensitive: () => void;
};

function formatDreamed(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return `${y}年${m}月${day}日`;
}

/** 投稿から5分以内かどうか。時間が過ぎたら自動で編集ボタンを消す */
function useEditable(post: Post): boolean {
  const deadline = new Date(post.createdAt).getTime() + EDIT_WINDOW_MS;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!post.mine) return;
    const left = deadline - Date.now();
    if (left <= 0) return;
    const t = setTimeout(() => setNow(Date.now()), left + 50);
    return () => clearTimeout(t);
  }, [post.mine, deadline]);
  return post.mine && now < deadline;
}

export function PostItem(props: Props) {
  const { post: p, rank, full, fresh, expanded, revealed, pending, isAdmin } = props;
  const [editing, setEditing] = useState(false);
  const editable = useEditable(p);
  const long = !full && (p.body.length > 110 || p.body.split('\n').length > 4);
  const covered = p.sensitive && !revealed;

  return (
    <li className={`post${rank !== null ? ' ranked' : ''}${fresh ? ' enter' : ''}`}>
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
        onClick={(e) => {
          if (!p.liked) pop(e.currentTarget);
          props.onLike();
        }}
      >
        <MoonIcon />
        <span className="num">{p.likeCount}</span>
      </button>
      <div className="post-main">
        {editing ? (
          <PostForm
            idPrefix={`e${p.id.slice(0, 8)}`}
            initial={{ ...p, dreamedOn: p.dreamedOn ?? '' }}
            showName={false}
            submitLabel="保存する"
            autoFocus
            onSubmit={(v) => editPost(p.id, v)}
            onDone={(np) => {
              setEditing(false);
              props.onEdited(np);
            }}
            onCancel={() => setEditing(false)}
            footnote={<p className="fine">編集できるのは投稿から5分以内です。</p>}
          />
        ) : (
          <>
            <h2>
              {p.sensitive && <span className="cw-badge">閲覧注意</span>}
              {p.title}
            </h2>
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
              <Link href={`/p/${p.id}`} className="permalink" title="この投稿のページを開く">
                <TimeAgo iso={p.createdAt} />
              </Link>
              {p.editedAt && <span>（編集済み）</span>}
            </div>
            {p.dreamedOn && <p className="dreamed">{formatDreamed(p.dreamedOn)}に見た夢</p>}
            {covered ? (
              <div className="cw">
                <p>怖い・生々しい内容を含む夢です。</p>
                <button type="button" className="btn small" onClick={props.onReveal}>
                  内容を表示する
                </button>
              </div>
            ) : (
              <p className={`body${long && !expanded ? ' clamped' : ''}${p.sensitive ? ' reveal' : ''}`}>{p.body}</p>
            )}
            {p.tags.length > 0 && (
              <ul className="tags" aria-label="タグ">
                {p.tags.map((t) => (
                  <li key={t}>
                    <Link href={`/search?tag=${encodeURIComponent(t)}`}>#{t}</Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <div className="actions">
          <button
            type="button"
            className="cbtn"
            data-fk={`cm:${p.id}`}
            aria-label={`コメント ${p.commentCount}件を見る`}
            onClick={props.onOpenComments}
          >
            <BubbleIcon />
            <span>{p.commentCount}</span>
          </button>
          <button
            type="button"
            className="same"
            aria-pressed={p.samed}
            aria-label={`私も見た（${p.sameCount}）`}
            title={p.samed ? '「私も見た」を取り消す' : '同じような夢を見たことがある'}
            onClick={(e) => {
              if (!p.samed) pop(e.currentTarget);
              props.onSame();
            }}
          >
            私も見た <span className="num">{p.sameCount}</span>
          </button>
          {long && !covered && (
            <button type="button" className="linkbtn" aria-expanded={expanded} onClick={props.onToggleExpand}>
              {expanded ? '閉じる' : '続きを読む'}
            </button>
          )}
          <button type="button" className="linkbtn" onClick={props.onShare}>
            共有
          </button>
          {editable && !editing && (
            <button type="button" className="linkbtn" onClick={() => setEditing(true)}>
              編集
            </button>
          )}
          {p.mine && (
            <button type="button" className="linkbtn warn" onClick={props.onDelete}>
              {pending === `del:${p.id}` ? 'もう一度押すと削除します' : '削除'}
            </button>
          )}
          {(!p.mine || isAdmin) && (
            <details className="more-menu">
              <summary className="linkbtn">その他</summary>
              <div className="menu">
                {!p.mine && (
                  <>
                    <button type="button" className="linkbtn" onClick={props.onMute}>
                      この人をミュート
                    </button>
                    <button type="button" className="linkbtn" onClick={props.onReport}>
                      通報
                    </button>
                  </>
                )}
                {isAdmin && (
                  <>
                    <button type="button" className="linkbtn" onClick={props.onToggleSensitive}>
                      {p.sensitive ? '閲覧注意を外す（管理者）' : '閲覧注意にする（管理者）'}
                    </button>
                    <button type="button" className="linkbtn warn" onClick={props.onHide}>
                      {pending === `hide:${p.id}` ? 'もう一度押すと全員に非表示' : '非表示（管理者）'}
                    </button>
                    {!p.mine && (
                      <button type="button" className="linkbtn warn" onClick={props.onDelete}>
                        {pending === `del:${p.id}` ? 'もう一度押すと削除します' : '削除（管理者）'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </details>
          )}
        </div>
      </div>
    </li>
  );
}
