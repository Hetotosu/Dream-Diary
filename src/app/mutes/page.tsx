import type { Metadata } from 'next';
import Link from 'next/link';
import { MuteList } from '@/components/MuteList';
import { listMutes } from '@/lib/data';
import { getViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: 'ミュート中の人' };

export default async function Mutes() {
  const viewer = await getViewer();
  const mutes = await listMutes(viewer);
  return (
    <main className="page">
      <Link href="/" className="linkbtn">
        掲示板に戻る
      </Link>
      <h2>ミュート中の人</h2>
      <p>
        ミュートした人の投稿とコメントは、あなたの画面にだけ表示されません。相手には知らされません。
        {!viewer.userId && ' ログインしていないときは、このブラウザにだけ効きます。'}
      </p>
      <MuteList initial={mutes} />
    </main>
  );
}
