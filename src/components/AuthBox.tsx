'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from '@/app/actions';
import { useToast } from '@/components/Toast';
import { LoginDialog } from '@/components/LoginDialog';
import { BellIcon } from '@/components/icons';
import type { ViewerInfo } from '@/lib/types';

const LOGIN_ERRORS: Record<string, string> = {
  browser:
    'ログインできませんでした。メールのリンクは、ログインを始めたのと同じブラウザで開いてください（メールアプリの中のブラウザでは失敗することがあります）。',
  expired: 'ログインのリンクの期限が切れているか、すでに使われています。もう一度「ログイン」からメールを送ってください。',
  failed: 'ログインできませんでした。もう一度「ログイン」からメールを送ってください。',
};

export function AuthBox({ viewer, unread }: { viewer: ViewerInfo; unread: number }) {
  const router = useRouter();
  const toast = useToast();
  const [loginOpen, setLoginOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const loginBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const login = url.searchParams.get('login');
    // Supabase がリンクの期限切れなどを #error_code=... で返すこともある
    const hashError =
      url.searchParams.get('error_code') ?? new URLSearchParams(url.hash.slice(1)).get('error_code');
    const reason = login ?? (hashError ? (hashError === 'otp_expired' ? 'expired' : 'failed') : null);
    if (reason) {
      toast(LOGIN_ERRORS[reason] ?? LOGIN_ERRORS.failed);
      for (const k of ['login', 'error', 'error_code', 'error_description']) url.searchParams.delete(k);
      window.history.replaceState(window.history.state, '', url.pathname + url.search);
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
        {viewer.isAdmin && (
          <Link href="/admin" className="linkbtn">
            管理
          </Link>
        )}
        {viewer.username && (
          <Link
            href="/notifications"
            className="bell"
            aria-label={unread ? `お知らせ（未読 ${unread}件）` : 'お知らせ'}
            title="お知らせ"
          >
            <BellIcon />
            {unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
          </Link>
        )}
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
