import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createAuthClient } from '@/lib/supabase/server';
import { adminDb } from '@/lib/supabase/admin';

/** 同じサイト内のパスだけ戻り先として受け付ける */
function safeNext(v: string | null): string {
  if (!v || !v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return '/';
  return v;
}

/**
 * マジックリンク・Google ログインの戻り先。
 * - ?code=...（PKCE）と ?token_hash=...&type=...（メールテンプレートを変えた場合）の両方に対応
 * - ユーザー名が未設定なら /welcome に送る
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get('next'));
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  const supabase = await createAuthClient();
  let userId: string | null = null;

  let reason = 'failed';
  if (searchParams.get('error_code') === 'otp_expired') {
    reason = 'expired';
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) userId = data.user?.id ?? null;
    // リンクを別のブラウザで開くと、ログインを始めたときの情報（code_verifier）がなくて失敗する
    else if (/code verifier|code_verifier/i.test(error.message)) reason = 'browser';
    else console.error('exchangeCodeForSession', error.message);
  } else if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) userId = data.user?.id ?? null;
    else reason = 'expired';
  }

  if (!userId) {
    return NextResponse.redirect(new URL(`/?login=${reason}`, origin));
  }

  const { data: profile } = await adminDb().from('profiles').select('username').eq('id', userId).maybeSingle();
  if (!profile) {
    return NextResponse.redirect(new URL(`/welcome?next=${encodeURIComponent(next)}`, origin));
  }
  return NextResponse.redirect(new URL(next, origin));
}
