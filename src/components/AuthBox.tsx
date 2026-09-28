'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from '@/app/actions';
import { useToast } from '@/components/Toast';
import { LoginDialog } from '@/components/LoginDialog';
import type { ViewerInfo } from '@/lib/types';

export function AuthBox({ viewer }: { viewer: ViewerInfo }) {
  const router = useRouter();
  const toast = useToast();
  const [loginOpen, setLoginOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const loginBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('login') === 'failed') {
      toast('ログインできませんでした。リンクの期限が切れている可能性があります。もう一度ログインしてください。');
      url.searchParams.delete('login');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
  }, [toast]);

  async function logout() {
    setBusy(true);
    await signOut();
    setBusy(false);
    toast('ログアウトしました');
    router.refresh();
  }

  if (viewer.loggedIn) {
    return (
      <div className="auth">
        {viewer.username ? (
          <Link href={`/u/${encodeURIComponent(viewer.username)}`} className="namebtn who" title="自分のページを開く">
            {viewer.username}
          </Link>
        ) : (
          <Link href="/welcome" className="btn small primary">
            ユーザー名を決める
          </Link>
        )}
        <button type="button" className="btn small" onClick={logout} disabled={busy}>
          ログアウト
        </button>
      </div>
    );
  }

  return (
    <div className="auth">
      <button type="button" className="btn small" ref={loginBtn} onClick={() => setLoginOpen(true)}>
        ログイン
      </button>
      <LoginDialog
        open={loginOpen}
        onClose={() => {
          setLoginOpen(false);
          loginBtn.current?.focus();
        }}
      />
    </div>
  );
}
