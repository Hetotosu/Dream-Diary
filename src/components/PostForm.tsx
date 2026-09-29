'use client';

import { useRef, useState } from 'react';
import { charLen, checkBody, checkDreamedOn, checkName, checkTitle, clean, LIMITS, todayJst } from '@/lib/validate';
import { MAX_TAGS, TAGS } from '@/lib/tags';
import type { ActionResult, Post } from '@/lib/types';

export type PostFormValues = {
  name: string;
  title: string;
  body: string;
  tags: string[];
  sensitive: boolean;
  dreamedOn: string;
};

type Errors = Partial<Record<keyof PostFormValues | 'form', string>>;

type Props = {
  idPrefix: string;
  initial?: Partial<PostFormValues>;
  /** 名前欄を出すか（匿名で新しく投稿するときだけ） */
  showName: boolean;
  postingAs?: string | null;
  submitLabel: string;
  onSubmit: (v: PostFormValues) => Promise<ActionResult<{ post: Post }>>;
  onDone: (p: Post) => void;
  onCancel: () => void;
  /** 開いたときに最初の入力欄へフォーカスする */
  autoFocus?: boolean;
  footnote?: React.ReactNode;
};

export function PostForm({
  idPrefix: id,
  initial,
  showName,
  postingAs,
  submitLabel,
  onSubmit,
  onDone,
  onCancel,
  autoFocus,
  footnote,
}: Props) {
  const [v, setV] = useState<PostFormValues>({
    name: initial?.name ?? '',
    title: initial?.title ?? '',
    body: initial?.body ?? '',
    tags: initial?.tags ?? [],
    sensitive: initial?.sensitive ?? false,
    dreamedOn: initial?.dreamedOn ?? '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const refs = {
    name: useRef<HTMLInputElement>(null),
    title: useRef<HTMLInputElement>(null),
    body: useRef<HTMLTextAreaElement>(null),
    dreamedOn: useRef<HTMLInputElement>(null),
    tags: useRef<HTMLFieldSetElement>(null),
  };

  function set<K extends keyof PostFormValues>(k: K, val: PostFormValues[K]) {
    setV((o) => ({ ...o, [k]: val }));
  }

  function toggleTag(t: string) {
    setV((o) => {
      if (o.tags.includes(t)) return { ...o, tags: o.tags.filter((x) => x !== t) };
      if (o.tags.length >= MAX_TAGS) return o;
      return { ...o, tags: [...o.tags, t] };
    });
  }

  function focusField(f: string | undefined) {
    const r = refs[f as keyof typeof refs];
    if (r?.current) (r.current as HTMLElement).focus();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const title = clean(v.title);
    const body = clean(v.body, { multiline: true });
    const name = clean(v.name);
    const next: Errors = {
      title: checkTitle(title) ?? undefined,
      body: checkBody(body) ?? undefined,
      name: showName ? checkName(name) ?? undefined : undefined,
      dreamedOn: checkDreamedOn(v.dreamedOn) ?? undefined,
    };
    setErrors(next);
    const first = (['title', 'body', 'name', 'dreamedOn'] as const).find((k) => next[k]);
    if (first) return focusField(first);

    setBusy(true);
    const res = await onSubmit({ ...v, name: showName ? name : '', title, body });
    setBusy(false);
    if (!res.ok) {
      if (res.field && res.field in refs) {
        setErrors({ [res.field]: res.error });
        focusField(res.field);
      } else {
        setErrors({ form: res.error });
      }
      return;
    }
    setErrors({});
    onDone(res.post);
  }

  return (
    <form className="compose-form" noValidate onSubmit={submit}>
      {postingAs && <p className="posting-as">{postingAs} として投稿します。</p>}
      {showName && (
        <div className="field">
          <label htmlFor={`${id}Name`}>
            名前 <span className="hint">（空欄なら「名無しさん」）</span>
          </label>
          <input
            ref={refs.name}
            type="text"
            id={`${id}Name`}
            maxLength={LIMITS.name}
            autoComplete="off"
            value={v.name}
            onChange={(e) => set('name', e.target.value)}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={`${id}NameErr`}
          />
          <p className="err" id={`${id}NameErr`} role="alert">
            {errors.name}
          </p>
        </div>
      )}
      <div className="field">
        <label htmlFor={`${id}Title`}>タイトル</label>
        <input
          ref={refs.title}
          type="text"
          id={`${id}Title`}
          maxLength={LIMITS.title}
          autoComplete="off"
          autoFocus={autoFocus}
          value={v.title}
          onChange={(e) => set('title', e.target.value)}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={`${id}TitleErr`}
        />
        <p className="err" id={`${id}TitleErr`} role="alert">
          {errors.title}
        </p>
      </div>
      <div className="field">
        <label htmlFor={`${id}Body`}>
          夢の内容 <span className="hint">（実名・住所など、個人が特定できる情報は書かないでください）</span>
        </label>
        <textarea
          ref={refs.body}
          id={`${id}Body`}
          maxLength={LIMITS.body}
          value={v.body}
          onChange={(e) => set('body', e.target.value)}
          aria-invalid={errors.body ? true : undefined}
          aria-describedby={`${id}BodyErr ${id}Counter`}
        />
        <div className="count-line">
          <p className="err" id={`${id}BodyErr`} role="alert">
            {errors.body}
          </p>
          <p className="counter" id={`${id}Counter`}>
            {charLen(v.body)} / {LIMITS.body}
          </p>
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor={`${id}Date`}>
            見た日 <span className="hint">（任意）</span>
          </label>
          <input
            ref={refs.dreamedOn}
            type="date"
            id={`${id}Date`}
            min="1900-01-01"
            max={todayJst()}
            value={v.dreamedOn}
            onChange={(e) => set('dreamedOn', e.target.value)}
            aria-invalid={errors.dreamedOn ? true : undefined}
            aria-describedby={`${id}DateErr`}
          />
          {/* スマホの日付入力は空欄に戻せないことが多いので、ボタンでも選べるようにする */}
          <div className="date-quick">
            <button type="button" onClick={() => set('dreamedOn', todayJst())} aria-pressed={v.dreamedOn === todayJst()}>
              今日
            </button>
            <button
              type="button"
              onClick={() => set('dreamedOn', todayJst(Date.now() - 86_400_000))}
              aria-pressed={v.dreamedOn === todayJst(Date.now() - 86_400_000)}
            >
              昨日
            </button>
            {v.dreamedOn && (
              <button type="button" onClick={() => set('dreamedOn', '')}>
                日付を消す
              </button>
            )}
          </div>
          <p className="err" id={`${id}DateErr`} role="alert">
            {errors.dreamedOn}
          </p>
        </div>
        <div className="field">
          <span className="label">閲覧注意</span>
          <label className="check" htmlFor={`${id}Sensitive`}>
            <input
              type="checkbox"
              id={`${id}Sensitive`}
              checked={v.sensitive}
              onChange={(e) => set('sensitive', e.target.checked)}
            />
            怖い・生々しい内容を含む
          </label>
        </div>
      </div>
      <fieldset className="field tags-field" ref={refs.tags} tabIndex={-1}>
        <legend>
          タグ <span className="hint">（{MAX_TAGS}つまで・{v.tags.length}つ選択中）</span>
        </legend>
        <div className="tag-pick">
          {TAGS.map((t) => {
            const on = v.tags.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                disabled={!on && v.tags.length >= MAX_TAGS}
                onClick={() => toggleTag(t)}
              >
                {t}
              </button>
            );
          })}
        </div>
        {errors.tags && (
          <p className="err" role="alert">
            {errors.tags}
          </p>
        )}
      </fieldset>
      {errors.form && (
        <p className="form-err" role="alert">
          {errors.form}
        </p>
      )}
      {footnote}
      <div className="form-actions">
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? '送信中…' : submitLabel}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </form>
  );
}
