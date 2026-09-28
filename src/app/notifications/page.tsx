import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TimeAgo } from '@/components/TimeAgo';
import { listNotifications, markNotificationsRead } from '@/lib/data';
import { getViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: 'お知らせ' };

const KIND: Record<string, string> = {
  comment: 'があなたの投稿にコメントしました',
  reply: 'があなたのコメントに返信しました',
  mention: 'があなたの名前を付けて返信しました',
};

export default async function Notifications() {
  const viewer = await getViewer();
  if (!viewer.userId) redirect('/');
  const items = await listNotifications(viewer);
  // 開いたら既読にする（この表示では、まだ読んでいなかったものに印を付ける）
  await markNotificationsRead(viewer);

  return (
    <main className="page">
      <Link href="/" className="linkbtn">
        掲示板に戻る
      </Link>
      <h2>お知らせ</h2>
      {items.length === 0 ? (
        <p>まだお知らせはありません。あなたの投稿やコメントに返信が付くと、ここに届きます。</p>
      ) : (
        <ul className="notices">
          {items.map((n) => (
            <li key={n.id} className={n.read ? undefined : 'unread'}>
              <Link href={`/p/${n.postId}?post=${n.postId}`}>
                <span className="notice-line">
                  {!n.read && <span className="new-dot">新着</span>}
                  <strong>{n.actorName}</strong> さん{KIND[n.kind]}
                </span>
                <span className="notice-post">「{n.postTitle}」</span>
                <span className="notice-excerpt">{n.excerpt}</span>
              </Link>
              <TimeAgo iso={n.createdAt} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
