import type { Metadata } from 'next';
import { Board } from '@/components/Board';
import { listPosts } from '@/lib/data';
import { isTag } from '@/lib/tags';
import { getViewer, toViewerInfo } from '@/lib/viewer';
import { clean, isUuid } from '@/lib/validate';

export const metadata: Metadata = { title: '検索' };

export default async function Search({ searchParams }: PageProps<'/search'>) {
  const sp = await searchParams;
  const query = clean(typeof sp.q === 'string' ? sp.q : '').slice(0, 50) || null;
  const tag = isTag(sp.tag) ? sp.tag : null;
  const viewer = await getViewer();
  const info = toViewerInfo(viewer);
  const { posts, hasMore } =
    query || tag ? await listPosts(viewer, { mode: 'search', query, tag }) : { posts: [], hasMore: false };
  const post = typeof sp.post === 'string' && isUuid(sp.post) ? sp.post : null;
  return (
    <Board
      key={`search|${query ?? ''}|${tag ?? ''}|${info.username ?? ''}|${info.loggedIn}`}
      mode="search"
      query={query}
      tag={tag}
      viewer={info}
      initialPosts={posts}
      hasMore={hasMore}
      openPostId={post}
    />
  );
}
