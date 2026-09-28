import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { WelcomeForm } from '@/components/WelcomeForm';
import { getViewer } from '@/lib/viewer';

export const metadata: Metadata = { title: 'ユーザー名を決める' };

function safeNext(v: unknown): string {
  return typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : '/';
}

export default async function Welcome({ searchParams }: PageProps<'/welcome'>) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const viewer = await getViewer();
  if (!viewer.userId) redirect('/');
  if (viewer.username) redirect(next);
  return <WelcomeForm next={next} />;
}
