'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { createPost } from '@/app/actions';
import { PostForm } from '@/components/PostForm';
import type { Post, ViewerInfo } from '@/lib/types';

export function Composer({ viewer, onPosted }: { viewer: ViewerInfo; onPosted: (p: Post) => void }) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const named = !!viewer.username;

  function close() {
    setOpen(false);
    requestAnimationFrame(() => toggleRef.current?.focus());
  }

  return (
    <section className="compose" aria-label="夢を投稿する">
      <button
        type="button"
        className="btn primary"
        ref={toggleRef}
        aria-expanded={open}
        aria-controls="postFormWrap"
        hidden={open}
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => document.getElementById('fTitle')?.focus());
        }}
      >
        夢を書く
      </button>
      <div id="postFormWrap" hidden={!open}>
        <PostForm
          key={formKey}
          idPrefix="f"
          showName={!named}
          postingAs={viewer.username}
          submitLabel="投稿する"
          onSubmit={(v) => createPost(v)}
          onDone={(p) => {
            setOpen(false);
            setFormKey((k) => k + 1);
            onPosted(p);
          }}
          onCancel={close}
          footnote={
            <p className="fine">
              投稿すると<Link href="/terms">利用規約</Link>に同意したことになります。
              {!named && ' 匿名の投稿には URL を書けません。'}
            </p>
          }
        />
      </div>
    </section>
  );
}
