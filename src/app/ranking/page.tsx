import type { Metadata } from 'next';
import { Board } from '@/components/Board';
import { listPosts } from '@/lib/data';
import { parsePeriod, parseRankBy } from '@/lib/types';
import { getViewer, toViewerInfo } from '@/lib/viewer';
import { isUuid } from '@/lib/validate';

export const metadata: Metadata = {
  title: '夢のランキング',
  description: 'ゆめ掲示板で、いいねや「私も見た」が多かった夢のランキングです。',
};

export default async function Ranking({ searchParams }: PageProps<'/ranking'>) {
  const sp = await searchParams;
  const period = parsePeriod(sp.period);
  const rankBy = parseRankBy(sp.by);
  const viewer = await getViewer();
  const info = toViewerInfo(viewer);
  const { posts, hasMore } = await listPosts(viewer, { mode: 'rank', period, rankBy });
  const post = typeof sp.post === 'string' && isUuid(sp.post) ? sp.post : null;
  return (
    <Board
      key={`rank|${period}|${rankBy}|${info.username ?? ''}|${info.loggedIn}`}
      mode="rank"
      period={period}
      rankBy={rankBy}
      viewer={info}
      initialPosts={posts}
      hasMore={hasMore}
      openPostId={post}
    />
  );
}
