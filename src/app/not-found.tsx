import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="page">
      <h2>ページが見つかりません</h2>
      <p>URL が間違っているか、ユーザーがいなくなった可能性があります。</p>
      <Link href="/" className="btn small">
        掲示板に戻る
      </Link>
    </main>
  );
}
