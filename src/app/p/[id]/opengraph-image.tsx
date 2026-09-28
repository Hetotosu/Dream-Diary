import { ImageResponse } from 'next/og';
import { getPublicPost } from '@/lib/data';
import { isUuid } from '@/lib/validate';

export const alt = 'ゆめ掲示板の投稿';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** 画像に使う文字だけを含んだフォントを Google Fonts から取る */
async function loadFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@700&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(url)).text();
    const src = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!src) return null;
    return await (await fetch(src)).arrayBuffer();
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = isUuid(id) ? await getPublicPost(id) : null;
  const title = !post ? '見た夢を、そのまま置いていく場所。' : post.sensitive ? '閲覧注意の夢' : post.title;
  const sub = post ? `${post.name} さんが見た夢` : '';
  const brand = 'ゆめ掲示板';
  const font = await loadFont(title + sub + brand);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: '#15122A',
          color: '#ECE8F8',
          fontFamily: font ? 'Shippori Mincho' : 'serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 40, color: '#F2C14E' }}>
          <svg width="56" height="56" viewBox="0 0 24 24">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="#F2C14E" />
          </svg>
          <span style={{ color: '#ECE8F8' }}>{brand}</span>
        </div>
        <div style={{ display: 'flex', fontSize: title.length > 24 ? 60 : 76, lineHeight: 1.35 }}>{title}</div>
        <div style={{ display: 'flex', fontSize: 32, color: '#A29BBF' }}>{sub}</div>
      </div>
    ),
    {
      ...size,
      fonts: font ? [{ name: 'Shippori Mincho', data: font, weight: 700, style: 'normal' }] : undefined,
    },
  );
}
