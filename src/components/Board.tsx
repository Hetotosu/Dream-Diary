'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminHide, deletePost, loadMorePosts, report, setPostLike } from '@/app/actions';
import { Avatar } from '@/components/Avatar';
import { CommentSheet } from '@/components/CommentSheet';
import { Composer } from '@/components/Composer';
import { PostItem } from '@/components/PostItem';
import { useToast } from '@/components/Toast';
import type { Mode, Period, Post, ProfileInfo, ViewerInfo } from '@/lib/types';

type Props = {
  mode: Mode;
  period: Period;
  viewer: ViewerInfo;
  initialPosts: Post[];
  hasMore: boolean;
  profile?: ProfileInfo;
  openPostId?: string | null;
};

const PERIOD_LABELS: [Period, string][] = [
  ['day', '日間'],
  ['week', '週間'],
  ['all', '全期間'],
];

function setPostParam(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('post', id);
  else url.searchParams.delete('post');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
}

export function Board({ mode, period, viewer, initialPosts, hasMore: initialHasMore, profile, openPostId }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [posts, setPosts] = useState(initialPosts);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState<string | null>(null);
  const [sheetPost, setSheetPost] = useState<string | null>(openPostId ?? null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listTop = useRef<HTMLElement>(null);
  const likeBusy = useRef<Set<string>>(new Set());

  useEffect(() => () => {
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
  }, []);

  const patchPost = useCallback((id: string, patch: Partial<Post>) => {
    setPosts((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  /** 2回押し方式の確認。1回目は true を返さず、4秒で元に戻る */
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

  async function like(p: Post) {
    if (likeBusy.current.has(p.id)) return;
    likeBusy.current.add(p.id);
    const next = !p.liked;
    patchPost(p.id, { liked: next, likeCount: Math.max(0, p.likeCount + (next ? 1 : -1)) });
    const res = await setPostLike(p.id, next);
    likeBusy.current.delete(p.id);
    if (res.ok) {
      patchPost(p.id, { liked: next, likeCount: res.likeCount });
    } else {
      patchPost(p.id, { liked: p.liked, likeCount: p.likeCount });
      toast(res.error);
    }
  }

  async function remove(p: Post) {
    if (!confirmTwice(`del:${p.id}`)) return;
    const res = await deletePost(p.id);
    if (!res.ok) return toast(res.error);
    setPosts((list) => list.filter((x) => x.id !== p.id));
    toast('削除しました');
  }

  async function hide(p: Post) {
    if (!confirmTwice(`hide:${p.id}`)) return;
    const res = await adminHide('post', p.id);
    if (!res.ok) return toast(res.error);
    setPosts((list) => list.filter((x) => x.id !== p.id));
    toast('全員に対して非表示にしました');
  }

  async function reportPost(p: Post) {
    const before = posts;
    setPosts((list) => list.filter((x) => x.id !== p.id));
    const res = await report('post', p.id);
    if (!res.ok) {
      setPosts(before);
      return toast(res.error);
    }
    toast('通報しました。この投稿は表示されなくなります。');
  }

  async function more() {
    setLoadingMore(true);
    const res = await loadMorePosts({
      mode,
      period,
      username: profile?.username ?? null,
      offset: posts.length,
    });
    setLoadingMore(false);
    if (!res.ok) return toast(res.error);
    setPosts((list) => {
      const seen = new Set(list.map((p) => p.id));
      return [...list, ...res.posts.filter((p) => !seen.has(p.id))];
    });
    setHasMore(res.hasMore);
  }

  function onPosted(p: Post) {
    toast('投稿しました');
    if (mode === 'new') {
      setPosts((list) => [p, ...list]);
      requestAnimationFrame(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        listTop.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      });
    } else {
      router.push('/');
    }
  }

  function openComments(id: string) {
    setSheetPost(id);
    setPostParam(id);
  }

  function closeComments(returnFocus: boolean) {
    const id = sheetPost;
    setSheetPost(null);
    setPostParam(null);
    if (returnFocus && id) {
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`[data-fk="cm:${id}"]`)?.focus();
      });
    }
  }

  const ranked = mode === 'rank';

  return (
    <>
      {mode !== 'profile' && <Composer viewer={viewer} onPosted={onPosted} />}

      {mode === 'profile' && profile && (
        <section className="profile" aria-label="ユーザーのページ">
          <Link href="/" className="linkbtn">
            掲示板に戻る
          </Link>
          <div className="profile-head">
            <Avatar name={profile.username} colorKey={`u:${profile.username}`} size="lg" />
            <div>
              <h2 id="profileName">{profile.username}</h2>
              <p className="stats">
                <span>投稿 {profile.postCount}件</span>
                <span>もらったいいね {profile.likeTotal}</span>
              </p>
              {profile.self && <p className="self-note">あなたのページです</p>}
            </div>
          </div>
        </section>
      )}

      {mode !== 'profile' && (
        <section className="controls" aria-label="表示の切り替え" ref={listTop}>
          <nav className="seg" aria-label="並び順">
            <Link href="/" aria-current={mode === 'new' ? 'page' : undefined} scroll={false}>
              新着
            </Link>
            <Link
              href={`/ranking?period=${period}`}
              aria-current={mode === 'rank' ? 'page' : undefined}
              scroll={false}
            >
              ランキング
            </Link>
          </nav>
          {ranked && (
            <nav className="periods" aria-label="ランキングの期間">
              {PERIOD_LABELS.map(([key, label]) => (
                <Link
                  key={key}
                  href={`/ranking?period=${key}`}
                  aria-current={period === key ? 'page' : undefined}
                  scroll={false}
                  replace
                >
                  {label}
                </Link>
              ))}
            </nav>
          )}
        </section>
      )}

      <main>
        {posts.length > 0 ? (
          <ol className="posts">
            {posts.map((p, i) => (
              <PostItem
                key={p.id}
                post={p}
                rank={ranked ? i + 1 : null}
                expanded={expanded.has(p.id)}
                pending={pending}
                isAdmin={viewer.isAdmin}
                onLike={() => like(p)}
                onToggleExpand={() =>
                  setExpanded((s) => {
                    const n = new Set(s);
                    if (n.has(p.id)) n.delete(p.id);
                    else n.add(p.id);
                    return n;
                  })
                }
                onOpenComments={() => openComments(p.id)}
                onDelete={() => remove(p)}
                onReport={() => reportPost(p)}
                onHide={() => hide(p)}
              />
            ))}
          </ol>
        ) : (
          <div className="empty">
            {mode === 'rank' ? (
              <>
                <p>この期間の投稿はまだありません。</p>
                {period !== 'all' && (
                  <Link href="/ranking?period=all" className="btn small" scroll={false} replace>
                    全期間を見る
                  </Link>
                )}
              </>
            ) : mode === 'profile' ? (
              <p>このユーザーの投稿はまだありません。</p>
            ) : (
              <p>まだ投稿がありません。最初の夢を書いてみましょう。</p>
            )}
          </div>
        )}
        {hasMore && (
          <div className="more">
            <button type="button" className="btn" onClick={more} disabled={loadingMore}>
              {loadingMore ? '読み込み中…' : 'もっと見る'}
            </button>
          </div>
        )}
      </main>

      <CommentSheet
        postId={sheetPost}
        viewer={viewer}
        onClose={closeComments}
        onCountChange={(id, n) => patchPost(id, { commentCount: n })}
        onPostGone={(id) => setPosts((list) => list.filter((x) => x.id !== id))}
      />
    </>
  );
}
