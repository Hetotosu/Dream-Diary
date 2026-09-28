import type { Metadata } from 'next';
import { Board } from '@/components/Board';
import { listPosts } from '@/lib/data';
import { parsePeriod } from '@/lib/types';
import { getViewer, toViewerInfo } from '@/lib/viewer';
import { isUuid } from '@/lib/validate';

export const metadata: Metadata = { title: 'ランキング' };

export default async function Ranking({ searchParams }: PageProps<'/ranking'>) {
  const sp = await searchParams;
  const period = parsePeriod(sp.period);
  const viewer = await getViewer();
  const info = toViewerInfo(viewer);
  const { posts, hasMore } = await listPosts(viewer, { mode: 'rank', period });
  const post = typeof sp.post === 'string' && isUuid(sp.post) ? sp.post : null;
  return (
    <Board
      key={`rank|${period}|${info.username ?? ''}|${info.loggedIn}`}
      mode="rank"
      period={period}
      viewer={info}
      initialPosts={posts}
      hasMore={hasMore}
      openPostId={post}
    />
  );
}
