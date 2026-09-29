import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // 個人ごとの画面や管理画面は検索に出さない
      disallow: ['/admin', '/notifications', '/mutes', '/welcome', '/auth/'],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
