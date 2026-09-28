import 'server-only';
import { adminDb } from '@/lib/supabase/admin';
import type { Viewer } from '@/lib/viewer';

type Rule = { perClient: number; perIp: number; windowSeconds: number; message: string };

/** 同じ client_id（またはユーザー）と同じ IP からの回数を数える。IP は共有されやすいので上限を広めにする */
const RULES = {
  post: { perClient: 1, perIp: 3, windowSeconds: 60, message: '投稿は1分に1件までです。少し待ってからもう一度送ってください。' },
  comment: { perClient: 5, perIp: 15, windowSeconds: 60, message: 'コメントは1分に5件までです。少し待ってからもう一度送ってください。' },
  like: { perClient: 30, perIp: 90, windowSeconds: 60, message: 'いいねの操作が多すぎます。少し待ってからもう一度押してください。' },
  report: { perClient: 10, perIp: 30, windowSeconds: 60, message: '通報が多すぎます。少し待ってからもう一度押してください。' },
  signup: { perClient: 5, perIp: 15, windowSeconds: 600, message: '操作が多すぎます。少し待ってからもう一度試してください。' },
} satisfies Record<string, Rule>;

export type RateAction = keyof typeof RULES;

/** 上限を超えていたらエラーメッセージを返す。超えていなければ記録して null */
export async function rateLimit(action: RateAction, viewer: Viewer): Promise<string | null> {
  const rule: Rule = RULES[action];
  const buckets: string[] = [];
  const max: number[] = [];
  if (viewer.userId) {
    buckets.push(`${action}:u:${viewer.userId}`);
    max.push(rule.perClient);
  }
  if (viewer.clientId) {
    buckets.push(`${action}:c:${viewer.clientId}`);
    max.push(rule.perClient);
  }
  if (viewer.ip) {
    buckets.push(`${action}:ip:${viewer.ip}`);
    max.push(rule.perIp);
  }
  if (!buckets.length) return null;
  const { data, error } = await adminDb().rpc('hit_rate_limit', {
    p_buckets: buckets,
    p_max: max,
    p_window_seconds: rule.windowSeconds,
  });
  if (error) {
    console.error('rate limit check failed', error);
    return '混み合っています。少し待ってからもう一度試してください。';
  }
  return data === true ? null : rule.message;
}
