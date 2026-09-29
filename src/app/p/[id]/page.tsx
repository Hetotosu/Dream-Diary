import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Board } from '@/components/Board';
import { getPost, getPublicPost } from '@/lib/data';
import { getViewer, toViewerInfo } from '@/lib/viewer';
import { isUuid } from '@/lib/validate';

export async function generateMetadata({ params }: PageProps<'/p/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const post = isUuid(id) ? await getPublicPost(id) : null;
  if (!post) return { title: '投稿が見つかりません' };
  // 検索結果に出る説明文。閲覧注意の投稿は本文を載せない
  const excerpt = post.body.replace(/\s+/g, ' ').slice(0, 110);
  const description = post.sensitive
    ? `${post.name} さんが見た夢（閲覧注意）｜ゆめ掲示板`
    : `${excerpt}${post.body.length > 110 ? '…' : ''}`;
  return {
    title: post.title,
    description,
    alternates: { canonical: `/p/${id}` },
    openGraph: { title: post.title, description, type: 'article', siteName: 'ゆめ掲示板' },
    twitter: { card: 'summary_large_image', title: post.title, description },
  };
}

/** 1件の投稿のページ（共有用のリンク先） */
export default async function PostPage({ params, searchParams }: PageProps<'/p/[id]'>) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const sp = await searchParams;
  const viewer = await getViewer();
  const info = toViewerInfo(viewer);
  const post = await getPost(viewer, id);
  if (!post) notFound();
  return (
    <Board
      key={`post|${id}|${info.username ?? ''}|${info.loggedIn}`}
      mode="post"
      viewer={info}
      initialPosts={[post]}
      hasMore={false}
      openPostId={sp.post === id ? id : null}
    />
  );
}
