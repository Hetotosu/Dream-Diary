'use client';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page">
      <h2>読み込めませんでした</h2>
      <p>通信が不安定か、サーバーが混み合っています。少し待ってから、もう一度試してください。</p>
      <button type="button" className="btn small" onClick={reset}>
        もう一度読み込む
      </button>
    </main>
  );
}
