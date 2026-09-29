'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { deletePost, loadMorePosts, mute, report, setPostLike, setPostSame } from '@/app/actions';
import { adminHide, adminSetSensitive } from '@/app/admin/actions';
import { Avatar } from '@/components/Avatar';
import { CommentSheet } from '@/components/CommentSheet';
import { Composer } from '@/components/Composer';
import { PostItem } from '@/components/PostItem';
import { SearchForm } from '@/components/SearchForm';
import { useToast } from '@/components/Toast';
import type { Mode, Period, Post, ProfileInfo, RankBy, ViewerInfo } from '@/lib/types';

type Props = {
  mode: Mode;
  period?: Period;
  rankBy?: RankBy;
  tag?: string | null;
  query?: string | null;
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

function rankHref(period: Period, rankBy: RankBy) {
  return `/ranking?period=${period}${rankBy === 'sames' ? '&by=sames' : ''}`;
}

/** ユーザーページの「夢日記」用：見た日（なければ投稿日）の年月 */
function monthOf(p: Post): string {
  const d = p.dreamedOn ?? new Date(new Date(p.createdAt).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  const [y, m] = d.split('-').map(Number);
  return `${y}年${m}月`;
}

export function Board({
  mode,
  period = 'day',
  rankBy = 'likes',
  tag = null,
  query = null,
  viewer,
  initialPosts,
  hasMore: initialHasMore,
  profile,
  openPostId,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [posts, setPosts] = useState(initialPosts);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState<string | null>(null);
  const [sheetPost, setSheetPost] = useState<string | null>(openPostId ?? null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listTop = useRef<HTMLElement>(null);
  const busy = useRef<Set<string>>(new Set());

  useEffect(
    () => () => {
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
    },
    [],
  );

  const patchPost = useCallback((id: string, patch: Partial<Post>) => {
    setPosts((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);
  const dropPost = useCallback((id: string) => {
    setPosts((list) => list.filter((x) => x.id !== id));
  }, []);

  /** 2回押し方式の確認。1回目は false を返し、4秒で元に戻る */
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
    const key = `like:${p.id}`;
    if (busy.current.has(key)) return;
    busy.current.add(key);
    const next = !p.liked;
    patchPost(p.id, { liked: next, likeCount: Math.max(0, p.likeCount + (next ? 1 : -1)) });
    const res = await setPostLike(p.id, next);
    busy.current.delete(key);
    if (res.ok) patchPost(p.id, { liked: next, likeCount: res.likeCount });
    else {
      patchPost(p.id, { liked: p.liked, likeCount: p.likeCount });
      toast(res.error);
    }
  }

  async function same(p: Post) {
    const key = `same:${p.id}`;
    if (busy.current.has(key)) return;
    busy.current.add(key);
    const next = !p.samed;
    patchPost(p.id, { samed: next, sameCount: Math.max(0, p.sameCount + (next ? 1 : -1)) });
    const res = await setPostSame(p.id, next);
    busy.current.delete(key);
    if (res.ok) patchPost(p.id, { samed: next, sameCount: res.sameCount });
    else {
      patchPost(p.id, { samed: p.samed, sameCount: p.sameCount });
      toast(res.error);
    }
  }

  async function remove(p: Post) {
    if (!confirmTwice(`del:${p.id}`)) return;
    const res = await deletePost(p.id);
    if (!res.ok) return toast(res.error);
    dropPost(p.id);
    toast('削除しました');
    if (mode === 'post') router.push('/');
  }

  async function hide(p: Post) {
    if (!confirmTwice(`hide:${p.id}`)) return;
    const res = await adminHide('post', p.id);
    if (!res.ok) return toast(res.error);
    dropPost(p.id);
    toast('全員に対して非表示にしました');
  }

  async function toggleSensitive(p: Post) {
    const res = await adminSetSensitive(p.id, !p.sensitive);
    if (!res.ok) return toast(res.error);
    patchPost(p.id, { sensitive: !p.sensitive });
    toast(p.sensitive ? '閲覧注意を外しました' : '閲覧注意にしました');
  }

  async function reportPost(p: Post) {
    const before = posts;
    dropPost(p.id);
    const res = await report('post', p.id);
    if (!res.ok) {
      setPosts(before);
      return toast(res.error);
    }
    toast('通報しました。この投稿は表示されなくなります。');
  }

  async function mutePost(p: Post) {
    const res = await mute('post', p.id);
    if (!res.ok) return toast(res.error);
    // 同じ人の投稿をまとめて消す（匿名は同じ日の ID が同じものだけ画面から消し、残りは再読み込みで消える）
    setPosts((list) =>
      list.filter((x) => {
        if (x.id === p.id) return false;
        if (p.username) return x.username !== p.username;
        return !(p.anonTag && !x.username && x.anonTag === p.anonTag);
      }),
    );
    toast(`${res.label} をミュートしました。フッターの「ミュート中の人」から解除できます。`);
  }

  async function share(p: Post) {
    const url = `${window.location.origin}/p/${p.id}`;
    const data = { title: `${p.title} | ゆめ掲示板`, url };
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share(data);
        return;
      } catch {
        // キャンセルされたらコピーに切り替えない
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('リンクをコピーしました');
    } catch {
      window.prompt('このリンクをコピーしてください', url);
    }
  }

  async function more() {
    setLoadingMore(true);
    const res = await loadMorePosts({
      mode,
      period,
      rankBy,
      username: profile?.username ?? null,
      tag,
      query,
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
      setFresh((s) => new Set(s).add(p.id));
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

  function item(p: Post, i: number) {
    return (
      <PostItem
        key={p.id}
        post={p}
        rank={ranked ? i + 1 : null}
        full={mode === 'post'}
        fresh={fresh.has(p.id)}
        expanded={expanded.has(p.id)}
        revealed={revealed.has(p.id)}
        pending={pending}
        isAdmin={viewer.isAdmin}
        onLike={() => like(p)}
        onSame={() => same(p)}
        onToggleExpand={() =>
          setExpanded((s) => {
            const n = new Set(s);
            if (n.has(p.id)) n.delete(p.id);
            else n.add(p.id);
            return n;
          })
        }
        onReveal={() => setRevealed((s) => new Set(s).add(p.id))}
        onOpenComments={() => openComments(p.id)}
        onShare={() => share(p)}
        onEdited={(np) => patchPost(p.id, np)}
        onDelete={() => remove(p)}
        onReport={() => reportPost(p)}
        onMute={() => mutePost(p)}
        onHide={() => hide(p)}
        onToggleSensitive={() => toggleSensitive(p)}
      />
    );
  }

  function list() {
    if (mode !== 'profile') {
      return <ol className="posts">{posts.map(item)}</ol>;
    }
    // ユーザーページは見た日の月ごとに区切って、夢日記のように見せる
    const groups: { month: string; items: Post[] }[] = [];
    for (const p of posts) {
      const m = monthOf(p);
      const last = groups[groups.length - 1];
      if (last && last.month === m) last.items.push(p);
      else groups.push({ month: m, items: [p] });
    }
    return groups.map((g) => (
      <section key={g.month} className="month" aria-label={g.month}>
        <h3 className="month-head">{g.month}</h3>
        <ol className="posts">{g.items.map(item)}</ol>
      </section>
    ));
  }

  function empty() {
    if (mode === 'rank') {
      return (
        <>
          <p>この期間の投稿はまだありません。</p>
          {period !== 'all' && (
            <Link href={rankHref('all', rankBy)} className="btn small" scroll={false} replace>
              全期間を見る
            </Link>
          )}
        </>
      );
    }
    if (mode === 'profile') return <p>このユーザーの投稿はまだありません。</p>;
    if (mode === 'search') {
      return tag || query ? (
        <p>見つかりませんでした。言葉を短くするか、別のタグで探してみてください。</p>
      ) : (
        <p>キーワードを入れるか、タグを選んでください。</p>
      );
    }
    if (mode === 'post') return <p>この投稿は削除されたか、非表示になっています。</p>;
    return <p>まだ投稿がありません。最初の夢を書いてみましょう。</p>;
  }

  return (
    <>
      {(mode === 'new' || mode === 'rank') && <Composer viewer={viewer} onPosted={onPosted} />}

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

      {mode === 'post' && (
        <div className="single-head">
          <Link href="/" className="linkbtn">
            掲示板に戻る
          </Link>
        </div>
      )}

      {(mode === 'new' || mode === 'rank' || mode === 'search') && (
        <section className="controls" aria-label="表示の切り替え" ref={listTop}>
          <nav className="seg" aria-label="表示">
            <Link href="/" aria-current={mode === 'new' ? 'page' : undefined} scroll={false}>
              新着
            </Link>
            <Link href={rankHref(period, rankBy)} aria-current={mode === 'rank' ? 'page' : undefined} scroll={false}>
              ランキング
            </Link>
            <Link href="/search" aria-current={mode === 'search' ? 'page' : undefined} scroll={false}>
              検索
            </Link>
          </nav>
          {ranked && (
            <div className="rank-opts">
              <nav className="periods" aria-label="ランキングの期間">
                {PERIOD_LABELS.map(([key, label]) => (
                  <Link
                    key={key}
                    href={rankHref(key, rankBy)}
                    aria-current={period === key ? 'page' : undefined}
                    scroll={false}
                    replace
                  >
                    {label}
                  </Link>
                ))}
              </nav>
              <nav className="periods" aria-label="ランキングの基準">
                <Link
                  href={rankHref(period, 'likes')}
                  aria-current={rankBy === 'likes' ? 'page' : undefined}
                  scroll={false}
                  replace
                >
                  いいね順
                </Link>
                <Link
                  href={rankHref(period, 'sames')}
                  aria-current={rankBy === 'sames' ? 'page' : undefined}
                  scroll={false}
                  replace
                >
                  私も見た順
                </Link>
              </nav>
            </div>
          )}
          {mode === 'search' && <SearchForm query={query ?? ''} tag={tag} />}
        </section>
      )}

      <main>
        {posts.length > 0 ? list() : <div className="empty">{empty()}</div>}
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
        onPostGone={dropPost}
      />
    </>
  );
}
