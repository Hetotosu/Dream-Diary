import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Board } from '@/components/Board';
import { findProfile, listPosts, profileInfo } from '@/lib/data';
import { getViewer, toViewerInfo } from '@/lib/viewer';
import { isUuid } from '@/lib/validate';

function decode(v: string): string {
  try {
    return decodeURIComponent(v).normalize('NFC');
  } catch {
    return v;
  }
}

export async function generateMetadata({ params }: PageProps<'/u/[username]'>): Promise<Metadata> {
  const { username } = await params;
  return { title: `${decode(username)} さんのページ` };
}

export default async function UserPage({ params, searchParams }: PageProps<'/u/[username]'>) {
  const { username: raw } = await params;
  const sp = await searchParams;
  const username = decode(raw);
  const profile = await findProfile(username);
  if (!profile) notFound();

  const viewer = await getViewer();
  const info = toViewerInfo(viewer);
  const [stats, { posts, hasMore }] = await Promise.all([
    profileInfo(viewer, profile),
    listPosts(viewer, { mode: 'new', authorId: profile.id }),
  ]);
  const post = typeof sp.post === 'string' && isUuid(sp.post) ? sp.post : null;
  return (
    <Board
      key={`profile|${profile.id}|${info.username ?? ''}|${info.loggedIn}`}
      mode="profile"
      period="all"
      viewer={info}
      initialPosts={posts}
      hasMore={hasMore}
      profile={stats}
      openPostId={post}
    />
  );
}
