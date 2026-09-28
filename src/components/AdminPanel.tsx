'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  addNgWord,
  adminBan,
  adminDelete,
  adminHide,
  adminRestore,
  adminUnban,
  removeNgWord,
} from '@/app/admin/actions';
import { TimeAgo } from '@/components/TimeAgo';
import { useToast } from '@/components/Toast';
import type { BanEntry, QueueItem } from '@/lib/types';

type Props = {
  tab: 'reported' | 'hidden' | 'bans' | 'ng';
  queue: QueueItem[];
  bans: BanEntry[];
  words: string[];
};

const HELP: Record<Props['tab'], string> = {
  reported: '通報された書き込みです（まだ表示中のもの）。問題なければ「問題なし」で一覧から外します。以後、通報が3件たまっても自動では隠しません。',
  hidden: '非表示になっている書き込みです（通報3件による自動非表示と、管理者が隠したもの）。誤りなら「表示に戻す」を押してください。',
  bans: '書き込みを止めている人です。止められた人は、投稿もコメントもできません（読むことはできます）。',
  ng: 'NGワードを含む書き込みは受け付けません。全角・半角、大文字・小文字、空白の違いは同じとみなします。',
};

export function AdminPanel({ tab, queue: q0, bans: b0, words: w0 }: Props) {
  const toast = useToast();
  const [queue, setQueue] = useState(q0);
  const [bans, setBans] = useState(b0);
  const [words, setWords] = useState(w0);
  const [word, setWord] = useState('');
  const [armed, setArmed] = useState<string | null>(null);

  /** 取り返しのつかない操作は2回押しで確かめる */
  function confirm(key: string): boolean {
    if (armed === key) {
      setArmed(null);
      return true;
    }
    setArmed(key);
    setTimeout(() => setArmed((k) => (k === key ? null : k)), 4000);
    return false;
  }

  function drop(it: QueueItem) {
    setQueue((l) => l.filter((x) => x.targetId !== it.targetId));
  }

  async function run(p: Promise<{ ok: boolean; error?: string }>, done: string, after?: () => void) {
    const res = await p;
    if (!res.ok) return toast(res.error ?? 'うまくいきませんでした');
    after?.();
    toast(done);
  }

  return (
    <div className="admin-panel">
      <p className="help">{HELP[tab]}</p>

      {(tab === 'reported' || tab === 'hidden') &&
        (queue.length === 0 ? (
          <p className="empty-c">ありません。</p>
        ) : (
          <ul className="queue">
            {queue.map((it) => {
              const k = `${it.targetType}:${it.targetId}`;
              return (
                <li key={k}>
                  <p className="q-meta">
                    <span className="q-kind">{it.targetType === 'post' ? '投稿' : 'コメント'}</span>
                    <span>{it.name}</span>
                    {it.anonTag && <span>ID:{it.anonTag}</span>}
                    <TimeAgo iso={it.createdAt} />
                    <span>通報 {it.reports}件</span>
                  </p>
                  {it.title && <p className="q-title">{it.title}</p>}
                  <p className="q-body">{it.body}</p>
                  <div className="q-actions">
                    {!it.hidden && (
                      <Link href={`/p/${it.postId}${it.targetType === 'comment' ? `?post=${it.postId}` : ''}`} className="linkbtn">
                        開く
                      </Link>
                    )}
                    {tab === 'reported' ? (
                      <>
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => run(adminRestore(it.targetType, it.targetId), '問題なしにしました', () => drop(it))}
                        >
                          問題なし
                        </button>
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => run(adminHide(it.targetType, it.targetId), '非表示にしました', () => drop(it))}
                        >
                          非表示にする
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => run(adminRestore(it.targetType, it.targetId), '表示に戻しました', () => drop(it))}
                      >
                        表示に戻す
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn small danger"
                      onClick={() => {
                        if (!confirm(`del:${k}`)) return;
                        run(adminDelete(it.targetType, it.targetId), '削除しました', () => drop(it));
                      }}
                    >
                      {armed === `del:${k}` ? 'もう一度押すと削除' : '削除'}
                    </button>
                    <button
                      type="button"
                      className="btn small danger"
                      onClick={async () => {
                        if (!confirm(`ban:${k}`)) return;
                        const res = await adminBan(it.targetType, it.targetId, true);
                        if (!res.ok) return toast(res.error);
                        drop(it);
                        toast(`書き込みを止め、これまでの書き込み ${res.hidden}件を非表示にしました`);
                      }}
                    >
                      {armed === `ban:${k}` ? 'もう一度押すと実行' : 'この人を止めて全部隠す'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ))}

      {tab === 'bans' &&
        (bans.length === 0 ? (
          <p className="empty-c">書き込みを止めている人はいません。</p>
        ) : (
          <ul className="plain-list">
            {bans.map((b) => (
              <li key={b.id}>
                <span>
                  {b.label} <span className="fine">（<TimeAgo iso={b.createdAt} />）</span>
                </span>
                <button
                  type="button"
                  className="btn small"
                  onClick={() =>
                    run(adminUnban(b.id), '書き込み停止を解除しました', () =>
                      setBans((l) => l.filter((x) => !(x.label === b.label && x.createdAt === b.createdAt))),
                    )
                  }
                >
                  解除
                </button>
              </li>
            ))}
          </ul>
        ))}

      {tab === 'ng' && (
        <>
          <form
            className="search-row"
            onSubmit={async (e) => {
              e.preventDefault();
              const w = word.trim();
              const res = await addNgWord(w);
              if (!res.ok) return toast(res.error);
              setWords((l) => (l.includes(w) ? l : [w, ...l]));
              setWord('');
              toast(`「${w}」を追加しました`);
            }}
          >
            <label htmlFor="ngw" className="sr">
              NGワード
            </label>
            <input
              id="ngw"
              type="text"
              maxLength={50}
              value={word}
              placeholder="追加する言葉"
              onChange={(e) => setWord(e.target.value)}
            />
            <button type="submit" className="btn primary small" disabled={!word.trim()}>
              追加
            </button>
          </form>
          {words.length === 0 ? (
            <p className="empty-c">NGワードはまだありません。</p>
          ) : (
            <ul className="plain-list">
              {words.map((w) => (
                <li key={w}>
                  <span>{w}</span>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() =>
                      run(removeNgWord(w), `「${w}」を外しました`, () => setWords((l) => l.filter((x) => x !== w)))
                    }
                  >
                    外す
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
