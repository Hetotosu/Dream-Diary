'use client';

import Link, { useLinkStatus } from 'next/link';
import type { ComponentProps } from 'react';

/** 押した直後から「読み込み中」の印を付ける（.is-pending を CSS で使う） */
function PendingMark() {
  const { pending } = useLinkStatus();
  return <span aria-hidden="true" className={`pending-mark${pending ? ' is-pending' : ''}`} />;
}

/** タブや絞り込み用のリンク。押したらすぐ選ばれた見た目になり、一覧が薄くなる */
export function NavLink({ children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link {...props}>
      {children}
      <PendingMark />
    </Link>
  );
}
