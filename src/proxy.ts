import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const CLIENT_ID_COOKIE = 'yume_cid';
const CLIENT_ID_RE = /^[A-Za-z0-9_-]{32,64}$/;

function newClientId(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * 1. 匿名のブラウザ識別（client_id）を httpOnly Cookie で発行する
 * 2. Supabase のログインセッションを更新する
 */
export async function proxy(request: NextRequest) {
  const current = request.cookies.get(CLIENT_ID_COOKIE)?.value;
  const issued = current && CLIENT_ID_RE.test(current) ? null : newClientId();
  if (issued) request.cookies.set(CLIENT_ID_COOKIE, issued);

  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    // セッションの期限が近ければ、ここで更新される
    await supabase.auth.getClaims();
  }

  if (issued) {
    response.cookies.set(CLIENT_ID_COOKIE, issued, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 400,
    });
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
