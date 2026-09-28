/** 選べるタグ。supabase/migrations/0002_features.sql の allowed_tags() と同じ並びにする */
export const TAGS = [
  '追いかけられる',
  '空を飛ぶ',
  '落ちる',
  '学校',
  '家族',
  '知らない場所',
  '乗り物',
  '明晰夢',
  '何度も見る夢',
  '怖い夢',
  '不思議な夢',
  '幸せな夢',
] as const;

export const MAX_TAGS = 3;

export function isTag(v: unknown): v is string {
  return typeof v === 'string' && (TAGS as readonly string[]).includes(v);
}
