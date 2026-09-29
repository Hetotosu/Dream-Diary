/** 共有用の画像（OGP）で使う、フォントの読み込み */
export async function loadOgFont(text: string, family = 'Shippori+Mincho', weight = 700): Promise<ArrayBuffer | null> {
  try {
    // 画像に使う文字だけを含んだフォントを Google Fonts から取る
    const url = `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(url)).text();
    const src = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!src) return null;
    return await (await fetch(src)).arrayBuffer();
  } catch {
    return null;
  }
}

export const OG_SIZE = { width: 1200, height: 630 };
export const MOON_PATH = 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z';

/** 夜空の星（位置は固定） */
export const OG_STARS: [number, number, number, number][] = Array.from({ length: 70 }, (_, i) => {
  let s = (i + 1) * 2654435761;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return [Math.floor(r() * 1200), Math.floor(r() * 630), 1 + Math.floor(r() * 3), 0.2 + r() * 0.5];
});
