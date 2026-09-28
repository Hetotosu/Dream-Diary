import { Board } from '@/components/Board';
import { listPosts } from '@/lib/data';
import { getViewer, toViewerInfo } from '@/lib/viewer';
import { isUuid } from '@/lib/validate';

export default async function Home({ searchParams }: PageProps<'/'>) {
  const sp = await searchParams;
  const viewer = await getViewer();
  const info = toViewerInfo(viewer);
  const { posts, hasMore } = await listPosts(viewer, { mode: 'new' });
  const post = typeof sp.post === 'string' && isUuid(sp.post) ? sp.post : null;
  return (
    <Board
      key={`new|${info.username ?? ''}|${info.loggedIn}`}
      mode="new"
      period="day"
      viewer={info}
      initialPosts={posts}
      hasMore={hasMore}
      openPostId={post}
    />
  );
}
