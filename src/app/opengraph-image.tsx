import { ImageResponse } from 'next/og';
import { loadOgFont, MOON_PATH, OG_SIZE, OG_STARS } from '@/lib/og';

export const alt = 'ゆめ掲示板 見た夢を、そのまま置いていく場所。';
export const size = OG_SIZE;
export const contentType = 'image/png';

const TITLE = 'ゆめ掲示板';
const TAGLINE = '見た夢を、そのまま置いていく場所。';
const SUB = '怖い夢・不思議な夢・何度も見る夢。匿名で書けます';

/** サイト全体の共有用の画像（投稿ページは p/[id]/opengraph-image.tsx が優先される） */
export default async function Image() {
  const [serif, sans] = await Promise.all([
    loadOgFont(TITLE + TAGLINE),
    loadOgFont(SUB, 'Zen+Kaku+Gothic+New', 500),
  ]);
  const fonts = [
    serif && { name: 'Shippori Mincho', data: serif, weight: 700 as const, style: 'normal' as const },
    sans && { name: 'Zen Kaku Gothic New', data: sans, weight: 500 as const, style: 'normal' as const },
  ].filter((f): f is NonNullable<typeof f> => !!f);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: 'linear-gradient(165deg, #15122A 0%, #1E1A38 55%, #2E2950 85%, #4a3f7a 100%)',
        }}
      >
        {OG_STARS.map(([x, y, r, a], i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: r,
              height: r,
              borderRadius: r,
              background: `rgba(236,232,248,${a.toFixed(2)})`,
            }}
          />
        ))}
        <svg width="250" height="250" viewBox="0 0 24 24" style={{ position: 'absolute', right: 90, top: 70 }}>
          <path d={MOON_PATH} fill="#F2C14E" />
        </svg>
        <div
          style={{
            position: 'absolute',
            left: 90,
            top: 205,
            display: 'flex',
            flexDirection: 'column',
            color: '#ECE8F8',
          }}
        >
          <div style={{ fontFamily: 'Shippori Mincho', fontSize: 120, letterSpacing: 10, lineHeight: 1.1 }}>{TITLE}</div>
          <div style={{ fontFamily: 'Shippori Mincho', fontSize: 40, marginTop: 26, color: '#D9D3EE' }}>{TAGLINE}</div>
          <div style={{ fontFamily: 'Zen Kaku Gothic New', fontSize: 28, marginTop: 30, color: '#A29BBF' }}>{SUB}</div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
