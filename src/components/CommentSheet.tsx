'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createComment, deleteComment, fetchComments, mute, report, setCommentLike } from '@/app/actions';
import { adminHide } from '@/app/admin/actions';
import { Avatar, avatarKey } from '@/components/Avatar';
import { CloseIcon, MoonIcon } from '@/components/icons';
import { TimeAgo } from '@/components/TimeAgo';
import { useToast } from '@/components/Toast';
import { pop } from '@/lib/pop';
import { clean, LIMITS } from '@/lib/validate';
import { ANON_NAME, type Comment, type ViewerInfo } from '@/lib/types';

type Props = {
  postId: string | null;
  viewer: ViewerInfo;
  onClose: (returnFocus: boolean) => void;
  onCountChange: (postId: string, count: number) => void;
  onPostGone: (postId: string) => void;
};

type Sort = 'top' | 'new';
type ReplyTo = { rootId: string; fromId: string; mention: string | null };

const byTop = (a: Comment, b: Comment) =>
  b.likeCount - a.likeCount || b.createdAt.localeCompare(a.createdAt);
const byNew = (a: Comment, b: Comment) => b.createdAt.localeCompare(a.createdAt);
const byOld = (a: Comment, b: Comment) => a.createdAt.localeCompare(b.createdAt);

export function CommentSheet({ postId, viewer, onClose, onCountChange, onPostGone }: Props) {
  const toast = useToast();
  const dlg = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const skipFocusReturn = useRef(false);

  const [title, setTitle] = useState('');
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [sort, setSort] = useState<Sort>('top');
  const [text, setText] = useState('');
  const [inputErr, setInputErr] = useState('');
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);
  const [replyText, setReplyText] = useState('');
  const [openReplies, setOpenReplies] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState<string | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const likeBusy = useRef<Set<string>>(new Set());
  const replyInput = useRef<HTMLTextAreaElement>(null);

  const myName = viewer.username ?? ANON_NAME;
  const myKey = viewer.username ? `u:${viewer.username}` : `a:${viewer.anonTag ?? ANON_NAME}`;

  // 親から渡される関数は描画のたびに変わるので、ref 経由で呼ぶ
  const callbacks = useRef({ onCountChange, onPostGone });
  useEffect(() => {
    callbacks.current = { onCountChange, onPostGone };
  });
  const currentId = useRef<string | null>(null);

  const load = useCallback(async (id: string) => {
    const res = await fetchComments(id);
    if (currentId.current !== id) return;
    if (!res.ok) {
      setLoadError(res.error);
      setComments([]);
      callbacks.current.onPostGone(id);
      return;
    }
    setTitle(res.post.title);
    setComments(res.comments);
  }, []);

  // 開く・閉じる
  useEffect(() => {
    const d = dlg.current;
    currentId.current = postId;
    if (!d) return;
    if (postId) {
      setTitle('');
      setComments(null);
      setLoadError('');
      setSort('top');
      setText('');
      setInputErr('');
      setReplyTo(null);
      setOpenReplies(new Set());
      setPending(null);
      skipFocusReturn.current = false;
      if (!d.open) d.showModal();
      document.body.classList.add('lock');
      if (bodyRef.current) bodyRef.current.scrollTop = 0;
      heading.current?.focus();
      load(postId);
    } else if (d.open) {
      d.close();
    }
  }, [postId, load]);

  // ページを離れるときに背景のスクロール止めを外す
  useEffect(
    () => () => {
      document.body.classList.remove('lock');
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
    },
    [],
  );

  function handleClosed() {
    document.body.classList.remove('lock');
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    if (postId) onClose(!skipFocusReturn.current);
  }

  function close() {
    dlg.current?.close();
  }

  // コメント数（返信を含む）を一覧にも反映する
  const count = comments?.length ?? 0;
  useEffect(() => {
    if (postId && comments && !loadError) callbacks.current.onCountChange(postId, comments.length);
  }, [postId, comments, loadError]);

  const { roots, replies } = useMemo(() => {
    const list = comments ?? [];
    const roots = list.filter((c) => !c.parentId).sort(sort === 'top' ? byTop : byNew);
    const replies = new Map<string, Comment[]>();
    for (const c of list) {
      if (!c.parentId) continue;
      const arr = replies.get(c.parentId) ?? [];
      arr.push(c);
      replies.set(c.parentId, arr);
    }
    replies.forEach((arr) => arr.sort(byOld));
    return { roots, replies };
  }, [comments, sort]);

  function patch(id: string, p: Partial<Comment>) {
    setComments((list) => list && list.map((c) => (c.id === id ? { ...c, ...p } : c)));
  }

  function confirmTwice(key: string): boolean {
    if (pending === key) {
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
      setPending(null);
      return true;
    }
    setPending(key);
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = setTimeout(() => setPending(null), 4000);
    return false;
  }

  function tempComment(body: string, parentId: string | null): Comment {
    return {
      id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      parentId,
      name: myName,
      username: viewer.username,
      anonTag: viewer.username ? null : viewer.anonTag,
      body,
      likeCount: 0,
      createdAt: new Date().toISOString(),
      liked: false,
      mine: true,
    };
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!postId) return;
    const body = clean(text, { multiline: true });
    if (!body) return;
    const tmp = tempComment(body, null);
    setComments((list) => [tmp, ...(list ?? [])]);
    setSort('new');
    setText('');
    setInputErr('');
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    const res = await createComment({ postId, body });
    if (!res.ok) {
      setComments((list) => list && list.filter((c) => c.id !== tmp.id));
      setText(body);
      setInputErr(res.error);
      return;
    }
    setComments((list) => list && list.map((c) => (c.id === tmp.id ? res.comment : c)));
    toast('コメントしました');
  }

  function startReply(root: Comment, from: Comment) {
    const mention = from.parentId ? from.name : null;
    setReplyTo({ rootId: root.id, fromId: from.id, mention });
    setReplyText(mention ? `@${mention} ` : '');
    setOpenReplies((s) => new Set(s).add(root.id));
    requestAnimationFrame(() => {
      const ta = replyInput.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    });
  }

  function cancelReply() {
    const from = replyTo?.fromId;
    setReplyTo(null);
    if (from) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-fk="rp:${from}"]`)?.focus());
  }

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    if (!postId || !replyTo) return;
    const prefix = replyTo.mention ? `@${replyTo.mention}` : '';
    const body = clean(replyText, { multiline: true });
    if (!body || body === prefix) return;
    const rootId = replyTo.rootId;
    const tmp = tempComment(body, rootId);
    setComments((list) => [...(list ?? []), tmp]);
    setReplyTo(null);
    setReplyText('');
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-fk="rt:${rootId}"]`)?.focus());
    const res = await createComment({ postId, parentId: rootId, body });
    if (!res.ok) {
      setComments((list) => list && list.filter((c) => c.id !== tmp.id));
      toast(res.error);
      return;
    }
    setComments((list) => list && list.map((c) => (c.id === tmp.id ? res.comment : c)));
    toast('返信しました');
  }

  async function like(c: Comment) {
    if (c.id.startsWith('tmp-') || likeBusy.current.has(c.id)) return;
    likeBusy.current.add(c.id);
    const next = !c.liked;
    patch(c.id, { liked: next, likeCount: Math.max(0, c.likeCount + (next ? 1 : -1)) });
    const res = await setCommentLike(c.id, next);
    likeBusy.current.delete(c.id);
    if (res.ok) patch(c.id, { liked: next, likeCount: res.likeCount });
    else {
      patch(c.id, { liked: c.liked, likeCount: c.likeCount });
      toast(res.error);
    }
  }

  async function remove(c: Comment) {
    if (c.id.startsWith('tmp-') || !confirmTwice(`del:${c.id}`)) return;
    const before = comments;
    // 親コメントを消したら返信も消える
    setComments((list) => list && list.filter((x) => x.id !== c.id && x.parentId !== c.id));
    heading.current?.focus();
    const res = await deleteComment(c.id);
    if (!res.ok) {
      setComments(before);
      return toast(res.error);
    }
    toast('削除しました');
  }

  async function hide(c: Comment) {
    if (!confirmTwice(`hide:${c.id}`)) return;
    const res = await adminHide('comment', c.id);
    if (!res.ok) return toast(res.error);
    setComments((list) => list && list.filter((x) => x.id !== c.id && x.parentId !== c.id));
    heading.current?.focus();
    toast('全員に対して非表示にしました');
  }

  async function reportComment(c: Comment) {
    const before = comments;
    setComments((list) => list && list.filter((x) => x.id !== c.id && x.parentId !== c.id));
    heading.current?.focus();
    const res = await report('comment', c.id);
    if (!res.ok) {
      setComments(before);
      return toast(res.error);
    }
    toast('通報しました。このコメントは表示されなくなります。');
  }

  async function muteAuthor(c: Comment) {
    const res = await mute('comment', c.id);
    if (!res.ok) return toast(res.error);
    // 同じ人（登録ユーザーは名前、匿名は同じ ID）のコメントを画面から消す
    setComments(
      (list) =>
        list &&
        list.filter((x) => {
          const same =
            x.id === c.id || (c.username ? x.username === c.username : !!c.anonTag && !x.username && x.anonTag === c.anonTag);
          return !same;
        }),
    );
    setComments((list) => {
      if (!list) return list;
      const roots = new Set(list.filter((x) => !x.parentId).map((x) => x.id));
      return list.filter((x) => !x.parentId || roots.has(x.parentId));
    });
    heading.current?.focus();
    toast(`${res.label} をミュートしました`);
  }

  function renderComment(c: Comment, root: Comment) {
    const isReply = !!c.parentId;
    const kids = !isReply ? replies.get(c.id) ?? [] : [];
    const isOpen = openReplies.has(c.id);
    const tmp = c.id.startsWith('tmp-');
    const prefix = replyTo?.mention ? `@${replyTo.mention}` : '';
    const replyMeaningful = !!clean(replyText) && clean(replyText) !== prefix;

    return (
      <li className={`cm${tmp ? ' enter' : ''}`} key={c.id}>
        <Avatar name={c.name} colorKey={avatarKey(c)} size={isReply ? 'sm' : undefined} />
        <div className="cm-main">
          <div className="cm-meta">
            {c.username ? (
              <Link
                href={`/u/${encodeURIComponent(c.username)}`}
                className="namebtn cname"
                title={`${c.name} のページを開く`}
                onClick={() => {
                  skipFocusReturn.current = true;
                }}
              >
                {c.name}
              </Link>
            ) : (
              <span className="cname">{c.name}</span>
            )}
            {!c.username && c.anonTag && <span>ID:{c.anonTag}</span>}
            {tmp ? <span>送信中…</span> : <TimeAgo iso={c.createdAt} />}
          </div>
          <p className="cm-text">{c.body}</p>
          <div className="cm-actions">
            <button
              type="button"
              className="clike"
              aria-pressed={c.liked}
              aria-label={`いいね（${c.likeCount}）`}
              onClick={(e) => {
                if (!c.liked) pop(e.currentTarget);
                like(c);
              }}
              disabled={tmp}
            >
              <MoonIcon />
              <span className="num">{c.likeCount}</span>
            </button>
            <button
              type="button"
              className="linkbtn"
              data-fk={`rp:${c.id}`}
              onClick={() => startReply(root, c)}
              disabled={tmp || root.id.startsWith('tmp-')}
            >
              返信
            </button>
            {(c.mine || viewer.isAdmin) && !tmp && (
              <button type="button" className="linkbtn warn" onClick={() => remove(c)}>
                {pending === `del:${c.id}` ? 'もう一度押すと削除します' : c.mine ? '削除' : '削除（管理者）'}
              </button>
            )}
            {!c.mine && !tmp && (
              <>
                <button type="button" className="linkbtn" onClick={() => muteAuthor(c)}>
                  ミュート
                </button>
                <button type="button" className="linkbtn" onClick={() => reportComment(c)}>
                  通報
                </button>
              </>
            )}
            {viewer.isAdmin && !tmp && (
              <button type="button" className="linkbtn warn" onClick={() => hide(c)}>
                {pending === `hide:${c.id}` ? 'もう一度押すと全員に非表示' : '非表示（管理者）'}
              </button>
            )}
          </div>

          {replyTo?.fromId === c.id && (
            <form className="cform rform" noValidate onSubmit={submitReply}>
              <Avatar name={myName} colorKey={myKey} size="sm" />
              <div className="cform-main">
                <textarea
                  ref={replyInput}
                  maxLength={LIMITS.comment}
                  rows={2}
                  aria-label="返信を追加"
                  placeholder="返信を追加…"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                />
                <div className="cform-foot">
                  <button type="button" className="btn small" onClick={cancelReply}>
                    キャンセル
                  </button>
                  <button type="submit" className="btn primary small" disabled={!replyMeaningful}>
                    返信する
                  </button>
                </div>
              </div>
            </form>
          )}

          {!isReply && kids.length > 0 && (
            <>
              <button
                type="button"
                className="reply-toggle"
                aria-expanded={isOpen}
                data-fk={`rt:${c.id}`}
                onClick={() =>
                  setOpenReplies((s) => {
                    const n = new Set(s);
                    if (n.has(c.id)) n.delete(c.id);
                    else n.add(c.id);
                    return n;
                  })
                }
              >
                返信 {kids.length}件を{isOpen ? '非表示' : '表示'}
              </button>
              {isOpen && <ul className="replies">{kids.map((r) => renderComment(r, c))}</ul>}
            </>
          )}
        </div>
      </li>
    );
  }

  return (
    <dialog
      ref={dlg}
      className="sheet"
      aria-labelledby="cTitle"
      onClose={handleClosed}
      onClick={(e) => {
        if (e.target === dlg.current) close();
      }}
    >
      <div className="sheet-head">
        <h3 id="cTitle" tabIndex={-1} ref={heading}>
          {comments ? `コメント ${count}件` : 'コメント'}
        </h3>
        <button type="button" className="iconbtn" aria-label="閉じる" onClick={close}>
          <CloseIcon />
        </button>
      </div>
      <div className="sheet-body" ref={bodyRef}>
        {title && <p className="sheet-ctx">「{title}」</p>}
        {loadError ? (
          <p className="empty-c">{loadError}</p>
        ) : comments === null ? (
          <p className="loading">読み込み中…</p>
        ) : (
          <>
            <div className="csort" role="group" aria-label="コメントの並び順">
              <button type="button" aria-pressed={sort === 'top'} onClick={() => setSort('top')}>
                人気順
              </button>
              <button type="button" aria-pressed={sort === 'new'} onClick={() => setSort('new')}>
                新しい順
              </button>
            </div>
            <form className="cform" noValidate onSubmit={submitComment}>
              <Avatar name={myName} colorKey={myKey} />
              <div className="cform-main">
                <label htmlFor="cInput" className="sr">
                  コメントを追加
                </label>
                <textarea
                  id="cInput"
                  maxLength={LIMITS.comment}
                  rows={2}
                  placeholder="コメントを追加…"
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    if (inputErr) setInputErr('');
                  }}
                  aria-invalid={inputErr ? true : undefined}
                  aria-describedby="cHint cErr"
                />
                <p className="err" id="cErr" role="alert">
                  {inputErr}
                </p>
                <div className="cform-foot">
                  <p className="hint" id="cHint">
                    {viewer.username
                      ? `${viewer.username} として投稿します`
                      : '名無しさんとして投稿します（ログインすると名前が付きます）'}
                  </p>
                  <button type="submit" className="btn primary small" disabled={!clean(text)}>
                    コメントする
                  </button>
                </div>
              </div>
            </form>
            {roots.length > 0 ? (
              <ul className="clist">{roots.map((c) => renderComment(c, c))}</ul>
            ) : (
              <p className="empty-c">まだコメントがありません。最初のコメントを書いてみましょう。</p>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}
