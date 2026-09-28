'use client';

import { useRef, useState } from 'react';
import { createPost } from '@/app/actions';
import { charLen, checkBody, checkName, checkTitle, clean, LIMITS } from '@/lib/validate';
import type { Post, ViewerInfo } from '@/lib/types';

type Errors = { name?: string; title?: string; body?: string; form?: string };

export function Composer({ viewer, onPosted }: { viewer: ViewerInfo; onPosted: (p: Post) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const named = !!viewer.username;

  function setFormOpen(v: boolean) {
    setOpen(v);
    if (v) requestAnimationFrame(() => titleRef.current?.focus());
    else requestAnimationFrame(() => toggleRef.current?.focus());
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = clean(title);
    const b = clean(body, { multiline: true });
    const n = clean(name);
    const next: Errors = {
      title: checkTitle(t) ?? undefined,
      body: checkBody(b) ?? undefined,
      name: named ? undefined : checkName(n) ?? undefined,
    };
    setErrors(next);
    if (next.title) return titleRef.current?.focus();
    if (next.body) return bodyRef.current?.focus();
    if (next.name) return nameRef.current?.focus();

    setBusy(true);
    const res = await createPost({ name: named ? '' : n, title: t, body: b });
    setBusy(false);
    if (!res.ok) {
      if (res.field === 'title') {
        setErrors({ title: res.error });
        titleRef.current?.focus();
      } else if (res.field === 'body') {
        setErrors({ body: res.error });
        bodyRef.current?.focus();
      } else if (res.field === 'name') {
        setErrors({ name: res.error });
        nameRef.current?.focus();
      } else {
        setErrors({ form: res.error });
      }
      return;
    }
    setTitle('');
    setBody('');
    setErrors({});
    setOpen(false);
    onPosted(res.post);
  }

  return (
    <section className="compose" aria-label="夢を投稿する">
      <button
        type="button"
        className="btn primary"
        ref={toggleRef}
        aria-expanded={open}
        aria-controls="postForm"
        hidden={open}
        onClick={() => setFormOpen(true)}
      >
        夢を書く
      </button>
      <form className="compose-form" id="postForm" hidden={!open} noValidate onSubmit={submit}>
        {named ? (
          <p className="posting-as">{viewer.username} として投稿します。</p>
        ) : (
          <div className="field">
            <label htmlFor="fName">
              名前 <span className="hint">（空欄なら「名無しさん」）</span>
            </label>
            <input
              ref={nameRef}
              type="text"
              id="fName"
              maxLength={LIMITS.name}
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby="nameErr"
            />
            <p className="err" id="nameErr" role="alert">
              {errors.name}
            </p>
          </div>
        )}
        <div className="field">
          <label htmlFor="fTitle">タイトル</label>
          <input
            ref={titleRef}
            type="text"
            id="fTitle"
            maxLength={LIMITS.title}
            autoComplete="off"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={errors.title ? true : undefined}
            aria-describedby="titleErr"
          />
          <p className="err" id="titleErr" role="alert">
            {errors.title}
          </p>
        </div>
        <div className="field">
          <label htmlFor="fBody">
            夢の内容 <span className="hint">（実名・住所など、個人が特定できる情報は書かないでください）</span>
          </label>
          <textarea
            ref={bodyRef}
            id="fBody"
            maxLength={LIMITS.body}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-invalid={errors.body ? true : undefined}
            aria-describedby="bodyErr counter"
          />
          <div className="count-line">
            <p className="err" id="bodyErr" role="alert">
              {errors.body}
            </p>
            <p className="counter" id="counter">
              {charLen(body)} / {LIMITS.body}
            </p>
          </div>
        </div>
        {errors.form && (
          <p className="form-err" role="alert">
            {errors.form}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? '送信中…' : '投稿する'}
          </button>
          <button type="button" className="btn" onClick={() => setFormOpen(false)}>
            キャンセル
          </button>
        </div>
      </form>
    </section>
  );
}
