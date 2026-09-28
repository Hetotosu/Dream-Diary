import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { createAuthClient } from '@/lib/supabase/server';
import { adminDb } from '@/lib/supabase/admin';
import { anonTag } from '@/lib/anon';
import { CLIENT_ID_COOKIE, env } from '@/lib/env';
import type { ViewerInfo } from '@/lib/types';

export type Viewer = {
  userId: string | null;
  email: string | null;
  username: string | null;
  isAdmin: boolean;
  /** 匿名のブラウザ識別。proxy.ts が httpOnly Cookie で発行する */
  clientId: string | null;
  /** いいね・通報の重複防止に使うキー */
  voterKey: string | null;
  ip: string | null;
};

const CLIENT_ID_RE = /^[A-Za-z0-9_-]{32,64}$/;

/** リクエストごとに1回だけ、Cookie のセッションと client_id から閲覧者を決める */
export const getViewer = cache(async (): Promise<Viewer> => {
  const cookieStore = await cookies();
  const raw = cookieStore.get(CLIENT_ID_COOKIE)?.value ?? null;
  const clientId = raw && CLIENT_ID_RE.test(raw) ? raw : null;

  const h = await headers();
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip')?.trim() || null;

  let userId: string | null = null;
  let email: string | null = null;
  try {
    const supabase = await createAuthClient();
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (claims?.sub && claims.role === 'authenticated') {
      userId = claims.sub;
      email = typeof claims.email === 'string' ? claims.email.toLowerCase() : null;
    }
  } catch {
    // セッションが壊れていたら匿名として扱う
  }

  let username: string | null = null;
  if (userId) {
    const { data } = await adminDb().from('profiles').select('username').eq('id', userId).maybeSingle();
    username = data?.username ?? null;
  }

  const voterKey = userId ? `u:${userId}` : clientId ? `c:${clientId}` : null;
  const isAdmin = !!email && env.adminEmails.includes(email);

  return { userId, email, username, isAdmin, clientId, voterKey, ip };
});

export function toViewerInfo(v: Viewer): ViewerInfo {
  return {
    loggedIn: !!v.userId,
    username: v.username,
    needsUsername: !!v.userId && !v.username,
    isAdmin: v.isAdmin,
    anonTag: v.clientId ? anonTag(v.clientId) : null,
  };
}
