import type { MetadataRoute } from 'next';
import { adminDb } from '@/lib/supabase/admin';
import { siteUrl } from '@/lib/site';

// 1時間ごとに作り直す
export const revalidate = 3600;

/** 検索エンジンに知らせるページの一覧（公開中の投稿とユーザーページを含む） */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const pages: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'hourly', priority: 1 },
    { url: `${base}/ranking?period=week`, changeFrequency: 'daily', priority: 0.6 },
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.1 },
    { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.1 },
  ];

  try {
    const db = adminDb();
    const [{ data: posts }, { data: profiles }] = await Promise.all([
      db
        .from('posts')
        .select('id, created_at, edited_at')
        .eq('hidden', false)
        .order('created_at', { ascending: false })
        .limit(5000),
      db.from('profiles').select('username, created_at').limit(5000),
    ]);
    for (const p of posts ?? []) {
      pages.push({
        url: `${base}/p/${p.id}`,
        lastModified: p.edited_at ?? p.created_at,
        changeFrequency: 'weekly',
        priority: 0.7,
      });
    }
    for (const u of profiles ?? []) {
      pages.push({ url: `${base}/u/${encodeURIComponent(u.username)}`, changeFrequency: 'weekly', priority: 0.4 });
    }
  } catch (e) {
    // データベースに届かなくても、固定のページだけは返す
    console.error('sitemap', e);
  }
  return pages;
}
