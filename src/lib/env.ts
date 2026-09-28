function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません。.env.local を確認してください。`);
  }
  return value;
}

export const env = {
  get supabaseUrl() {
    return required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get supabaseAnonKey() {
    return required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  },
  get serviceRoleKey() {
    return required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY);
  },
  get anonSalt() {
    return required('ANON_ID_SALT', process.env.ANON_ID_SALT);
  },
  get adminEmails(): string[] {
    return (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  },
};

export const CLIENT_ID_COOKIE = 'yume_cid';
