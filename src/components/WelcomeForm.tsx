'use client';

import { useEffect, useRef, useState } from 'react';
import { chooseUsername } from '@/app/actions';
import { checkUsername, clean, LIMITS } from '@/lib/validate';

export function WelcomeForm({ next }: { next: string }) {
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = clean(name);
    const problem = checkUsername(v);
    if (problem) {
      setErr(problem);
      input.current?.focus();
      return;
    }
    setBusy(true);
    const res = await chooseUsername({ username: v });
    if (!res.ok) {
      setBusy(false);
      setErr(res.error);
      input.current?.focus();
      return;
    }
    // ヘッダーも含めて読み込み直す
    window.location.assign(next);
  }

  return (
    <main className="page">
      <h2>ユーザー名を決める</h2>
      <p>掲示板に表示される名前です。あとから変えることはできません。</p>
      <p className="fine">
        始めると<a href="/terms">利用規約</a>と<a href="/privacy">プライバシーポリシー</a>に同意したことになります。
      </p>
      <form className="compose-form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="uName">
            ユーザー名 <span className="hint">（1〜{LIMITS.username}文字。空白と一部の記号は使えません）</span>
          </label>
          <input
            ref={input}
            type="text"
            id="uName"
            maxLength={LIMITS.username}
            autoComplete="username"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={err ? true : undefined}
            aria-describedby="uErr"
          />
          <p className="err" id="uErr" role="alert">
            {err}
          </p>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? '保存中…' : 'この名前で始める'}
          </button>
        </div>
      </form>
    </main>
  );
}
