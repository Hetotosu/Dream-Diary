import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Shippori_Mincho, Zen_Kaku_Gothic_New } from 'next/font/google';
import { getViewer, toViewerInfo } from '@/lib/viewer';
import { ToastProvider } from '@/components/Toast';
import { AuthBox } from '@/components/AuthBox';
import { MoonLogo } from '@/components/icons';
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

export const metadata: Metadata = {
  title: { default: 'ゆめ掲示板', template: '%s | ゆめ掲示板' },
  description: '見た夢を、そのまま置いていく場所。',
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
  const viewer = toViewerInfo(await getViewer());
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
              <AuthBox viewer={viewer} />
            </header>
            {children}
            <footer>
              <p>夢の内容には、怖い描写や生々しい描写が含まれることがあります。見たくない投稿は「通報」で非表示にできます。</p>
              <p>実名・住所など、個人が特定できる情報は書かないでください。</p>
            </footer>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
