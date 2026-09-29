import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Shippori_Mincho, Zen_Kaku_Gothic_New } from 'next/font/google';
import { getViewer, toViewerInfo } from '@/lib/viewer';
import { unreadCount } from '@/lib/data';
import { ToastProvider } from '@/components/Toast';
import { AuthBox } from '@/components/AuthBox';
import { MoonLogo } from '@/components/icons';
import { SITE, siteUrl } from '@/lib/site';
import './globals.css';

const serif = Shippori_Mincho({
  weight: ['500', '700'],
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-serif',
});
const sans = Zen_Kaku_Gothic_New({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-sans',
});

const DESCRIPTION =
  '見た夢を、そのまま置いていく場所。怖い夢、不思議な夢、何度も見る夢を、匿名でも気軽に投稿できる夢の掲示板です。';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: 'ゆめ掲示板｜見た夢を投稿する掲示板', template: '%s | ゆめ掲示板' },
  description: DESCRIPTION,
  applicationName: 'ゆめ掲示板',
  keywords: ['夢', '夢日記', '掲示板', '怖い夢', '不思議な夢', '明晰夢', '夢の話'],
  openGraph: {
    type: 'website',
    siteName: 'ゆめ掲示板',
    title: 'ゆめ掲示板',
    description: DESCRIPTION,
    locale: 'ja_JP',
  },
  twitter: { card: 'summary_large_image' },
  // Google Search Console の所有権確認（HTML タグ方式）。値は Vercel の環境変数に入れる
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#EEEBF5' },
    { media: '(prefers-color-scheme: dark)', color: '#15122A' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const v = await getViewer();
  const viewer = toViewerInfo(v);
  const unread = await unreadCount(v).catch(() => 0);
  return (
    <html lang="ja" className={`${serif.variable} ${sans.variable}`}>
      <body>
        <ToastProvider>
          <div className="wrap">
            <header className="top">
              <div>
                <Link href="/" className="brand brand-link">
                  <MoonLogo />
                  <h1>ゆめ掲示板</h1>
                </Link>
                <p className="tagline">見た夢を、そのまま置いていく場所。</p>
              </div>
              <AuthBox viewer={viewer} unread={unread} />
            </header>
            {children}
            <footer>
              <p>夢の内容には、怖い描写や生々しい描写が含まれることがあります。閲覧注意の投稿は、押すまで本文を隠しています。見たくない人の書き込みは「その他」からミュートや通報ができます。</p>
              <p>実名・住所など、個人が特定できる情報は書かないでください。</p>
              <nav className="foot-links" aria-label="サイトの情報">
                <Link href="/terms">利用規約</Link>
                <Link href="/privacy">プライバシーポリシー</Link>
                <Link href="/mutes">ミュート中の人</Link>
                <a href={SITE.contactUrl} target="_blank" rel="noopener noreferrer">
                  お問い合わせ
                </a>
              </nav>
            </footer>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
