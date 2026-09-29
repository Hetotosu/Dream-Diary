'use client';

import { useEffect, useRef, useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/browser';

const GOOGLE = process.env.NEXT_PUBLIC_GOOGLE_LOGIN === 'true';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const googleBtn = useRef<HTMLButtonElement>(null);
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [gErr, setGErr] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (open && !d.open) {
      setErr('');
      setGErr('');
      setSent(false);
      d.showModal();
      // 一番上の選択肢にフォーカスする
      (GOOGLE ? googleBtn.current : input.current)?.focus();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  function redirectTo() {
    const next = window.location.pathname + window.location.search;
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = email.trim();
    if (!v) {
      setErr('メールアドレスを入力してください。');
      input.current?.focus();
      return;
    }
    if (!EMAIL_RE.test(v)) {
      setErr('メールアドレスの形が正しくありません。「name@example.com」のように入力してください。');
      input.current?.focus();
      return;
    }
    setBusy(true);
    setErr('');
    const { error } = await createBrowserSupabase().auth.signInWithOtp({
      email: v,
      options: { emailRedirectTo: redirectTo() },
    });
    setBusy(false);
    if (error) {
      const limited = error.status === 429 || /rate limit/i.test(error.message);
      setErr(
        limited
          ? 'メールの送信回数の上限に達しました。1時間ほど待ってから、もう一度試してください。すでに届いているメールがあれば、そのリンクを使えます。'
          : 'メールを送れませんでした。少し時間をおいてから、もう一度試してください。',
      );
      return;
    }
    setSent(true);
  }

  async function google() {
    setBusy(true);
    setGErr('');
    const { error } = await createBrowserSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo() },
    });
    if (error) {
      setBusy(false);
      setGErr('Google でログインできませんでした。もう一度試してください。');
    }
  }

  return (
    <dialog
      ref={dlg}
      aria-labelledby="loginTitle"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dlg.current) onClose();
      }}
    >
      <div className="dlg-in">
        <h3 id="loginTitle">ログイン</h3>
        {sent ? (
          <>
            <p className="sent">
              {email.trim()} にログイン用のリンクを送りました。メールを開いてリンクを押してください。
              リンクは、このブラウザで開いてください。
            </p>
            <div className="form-actions">
              <button type="button" className="btn primary" onClick={onClose}>
                閉じる
              </button>
            </div>
          </>
        ) : (
          <>
            {GOOGLE ? (
              <>
                <p>Google アカウントか、メールアドレスでログインします。パスワードはいりません。初めての人は、そのまま登録になります。</p>
                <button
                  type="button"
                  ref={googleBtn}
                  className="btn primary wide"
                  onClick={google}
                  disabled={busy}
                  aria-describedby="gErr"
                >
                  Google でログイン
                </button>
                <p className="err" id="gErr" role="alert">
                  {gErr}
                </p>
                <p className="or">または、メールアドレスに届くリンクでログイン</p>
              </>
            ) : (
              <p>メールアドレスに届くリンクからログインします。パスワードはいりません。初めての人は、そのまま登録になります。</p>
            )}
            <form onSubmit={submit} noValidate>
              <div className="field">
                <label htmlFor="lEmail">メールアドレス</label>
                <input
                  ref={input}
                  type="email"
                  id="lEmail"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={err ? true : undefined}
                  aria-describedby="lErr"
                />
                <p className="err" id="lErr" role="alert">
                  {err}
                </p>
              </div>
              <div className="form-actions">
                <button type="submit" className={GOOGLE ? 'btn' : 'btn primary'} disabled={busy}>
                  リンクを送る
                </button>
                <button type="button" className="btn" onClick={onClose}>
                  キャンセル
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </dialog>
  );
}
