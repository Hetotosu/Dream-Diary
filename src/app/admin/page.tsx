import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminPanel } from '@/components/AdminPanel';
import { adminQueue, listBans, listNgWords } from '@/lib/data';
import { getViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: '管理', robots: { index: false } };

export default async function Admin({ searchParams }: PageProps<'/admin'>) {
  const viewer = await getViewer();
  // 管理者以外には、ページがあること自体を見せない
  if (!viewer.isAdmin) notFound();
  const sp = await searchParams;
  const tab = sp.tab === 'hidden' || sp.tab === 'bans' || sp.tab === 'ng' ? sp.tab : 'reported';
  const [queue, bans, words] = await Promise.all([
    tab === 'reported' || tab === 'hidden' ? adminQueue(tab) : Promise.resolve([]),
    tab === 'bans' ? listBans() : Promise.resolve([]),
    tab === 'ng' ? listNgWords() : Promise.resolve([]),
  ]);
  return (
    <main className="page admin">
      <Link href="/" className="linkbtn">
        掲示板に戻る
      </Link>
      <h2>管理</h2>
      <nav className="seg" aria-label="管理メニュー">
        {(
          [
            ['reported', '通報'],
            ['hidden', '非表示'],
            ['bans', '書き込み停止'],
            ['ng', 'NGワード'],
          ] as const
        ).map(([k, label]) => (
          <Link key={k} href={`/admin?tab=${k}`} aria-current={tab === k ? 'page' : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      <AdminPanel key={tab} tab={tab} queue={queue} bans={bans} words={words} />
    </main>
  );
}
