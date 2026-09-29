/** 利用規約・プライバシーポリシー・フッターに出す運営者の情報 */
export const SITE = {
  name: 'ゆめ掲示板',
  operator: 'ゆめ掲示板 運営',
  /** お問い合わせフォーム（Google フォーム） */
  contactUrl: 'https://forms.gle/wWdj4F9mS87XqU7Z8',
  effectiveDate: '2026年10月1日',
};

/**
 * サイトの URL（末尾の / なし）。
 * NEXT_PUBLIC_SITE_URL があればそれを、なければ Vercel が自動で入れる本番の URL を使う。
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return 'http://localhost:3000';
}
