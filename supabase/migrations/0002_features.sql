-- ゆめ掲示板：追加機能
-- 閲覧注意・タグ・見た日・「私も見た」・編集・検索・ミュート・通知・管理（通報の確認、非表示の取り消し、書き込み停止、NGワード）
-- 0001_init.sql のあとに実行する。

create extension if not exists pg_trgm;

-- =========================================================
-- タグ（画面側の src/lib/tags.ts と同じ並びにする）
-- =========================================================

create function allowed_tags() returns text[]
language sql immutable as $$
  select array[
    '追いかけられる', '空を飛ぶ', '落ちる', '学校', '家族', '知らない場所',
    '乗り物', '明晰夢', '何度も見る夢', '怖い夢', '不思議な夢', '幸せな夢'
  ]::text[]
$$;

create function valid_tags(t text[]) returns boolean
language sql immutable as $$
  select coalesce(array_length(t, 1), 0) <= 3 and t <@ allowed_tags()
$$;

-- =========================================================
-- 列の追加
-- =========================================================

alter table posts
  add column sensitive boolean not null default false,          -- 閲覧注意
  add column tags text[] not null default '{}' check (valid_tags(tags)),
  add column dreamed_on date check (dreamed_on >= date '1900-01-01'),  -- 見た日
  add column edited_at timestamptz,
  add column same_count int not null default 0,                  -- 「私も見た」の数
  add column moderated_ok boolean not null default false;        -- 管理者が確認済み（通報で自動非表示にしない）

alter table comments
  add column moderated_ok boolean not null default false;

create index posts_tags_idx on posts using gin (tags);
create index posts_title_trgm_idx on posts using gin (title gin_trgm_ops);
create index posts_body_trgm_idx on posts using gin (body gin_trgm_ops);
create index posts_same_idx on posts (same_count desc, created_at desc);
create index posts_client_idx on posts (client_id);
create index comments_client_idx on comments (client_id);
create index comments_author_idx on comments (author_id);

-- =========================================================
-- 新しいテーブル
-- =========================================================

-- 「私も見た」
create table post_sames (
  post_id uuid references posts(id) on delete cascade,
  voter_key text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, voter_key)
);
create index post_sames_voter_idx on post_sames (voter_key);

-- ミュート。target_key は 'u:<profile id>'（登録ユーザー）か 'c:<client_id>'（匿名）
create table mutes (
  id uuid not null default gen_random_uuid() unique,
  muter_key text not null,
  target_key text not null,
  label text not null,            -- 画面に出す名前（「名無しさん ID:xxxxxx」など）
  created_at timestamptz not null default now(),
  primary key (muter_key, target_key)
);

-- 書き込み停止。key は 'u:<profile id>' か 'c:<client_id>'
create table bans (
  id uuid not null default gen_random_uuid() unique,
  key text primary key,
  label text not null,
  created_at timestamptz not null default now()
);

-- NGワード（管理画面で追加・削除する）
create table ng_words (
  word text primary key check (char_length(word) between 1 and 50),
  created_at timestamptz not null default now()
);

-- 通知（登録ユーザーだけ）
create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('comment', 'reply', 'mention')),
  post_id uuid not null references posts(id) on delete cascade,
  comment_id uuid references comments(id) on delete cascade,
  actor_name text not null,
  excerpt text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_recipient_idx on notifications (recipient_id, created_at desc);

alter table post_sames enable row level security;
alter table mutes enable row level security;
alter table bans enable row level security;
alter table ng_words enable row level security;
alter table notifications enable row level security;
revoke all on post_sames, mutes, bans, ng_words, notifications from anon, authenticated;

-- 公開してよい列を読めるようにする（client_id と moderated_ok は出さない）
grant select (sensitive, tags, dreamed_on, edited_at, same_count) on posts to anon, authenticated;

-- =========================================================
-- トリガー
-- =========================================================

create function trg_post_sames_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update posts set same_count = same_count + 1 where id = new.post_id;
  else
    update posts set same_count = greatest(same_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;

create trigger post_sames_count after insert or delete on post_sames
  for each row execute function trg_post_sames_count();

-- 通報3件で非表示。ただし管理者が「問題なし」にしたものは自動で隠さない
create or replace function trg_reports_threshold() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  select count(*) into n from reports
    where target_type = new.target_type and target_id = new.target_id;
  if n >= 3 then
    if new.target_type = 'post' then
      update posts set hidden = true where id = new.target_id and not hidden and not moderated_ok;
    else
      update comments set hidden = true where id = new.target_id and not hidden and not moderated_ok;
    end if;
  end if;
  return null;
end $$;

-- コメント・返信・@名前 の通知
create function trg_comments_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p posts%rowtype;
  parent comments%rowtype;
  excerpt text := left(new.body, 80);
  mention text;
  mention_id uuid;
  notified uuid[] := '{}';
begin
  if new.hidden then
    return null;
  end if;
  select * into p from posts where id = new.post_id;

  if new.parent_id is null then
    -- 投稿へのコメント → 投稿者へ
    if p.author_id is not null
       and p.author_id is distinct from new.author_id
       and (new.author_id is not null or p.client_id is distinct from new.client_id) then
      insert into notifications (recipient_id, kind, post_id, comment_id, actor_name, excerpt)
        values (p.author_id, 'comment', p.id, new.id, new.display_name, excerpt);
      notified := notified || p.author_id;
    end if;
  else
    -- 返信 → 親コメントの人へ
    select * into parent from comments where id = new.parent_id;
    if parent.author_id is not null
       and parent.author_id is distinct from new.author_id
       and (new.author_id is not null or parent.client_id is distinct from new.client_id) then
      insert into notifications (recipient_id, kind, post_id, comment_id, actor_name, excerpt)
        values (parent.author_id, 'reply', p.id, new.id, new.display_name, excerpt);
      notified := notified || parent.author_id;
    end if;
    -- 「@名前 」で始まる返信 → そのスレッドに書いた登録ユーザーへ
    mention := substring(new.body from '^@(\S+)\s');
    if mention is not null then
      select pr.id into mention_id from profiles pr where pr.username = mention;
      if mention_id is not null
         and mention_id is distinct from new.author_id
         and not (mention_id = any(notified))
         and exists (
           select 1 from comments c
           where (c.id = new.parent_id or c.parent_id = new.parent_id) and c.author_id = mention_id
         ) then
        insert into notifications (recipient_id, kind, post_id, comment_id, actor_name, excerpt)
          values (mention_id, 'mention', p.id, new.id, new.display_name, excerpt);
      end if;
    end if;
  end if;
  return null;
end $$;

create trigger comments_notify after insert on comments
  for each row execute function trg_comments_notify();

revoke execute on function trg_post_sames_count(), trg_comments_notify() from public, anon, authenticated;

-- =========================================================
-- 一覧の関数を作り直す（列と条件が増えたため）
-- =========================================================

drop function list_posts(text, text, uuid, text, uuid, text, int, int);
drop function get_post(uuid, text, uuid, text);
drop function list_comments(uuid, text, uuid, text);

-- ミュートしている相手の書き込みか
create function is_muted(p_voter text, p_author uuid, p_client text) returns boolean
language sql stable set search_path = public as $$
  select exists (
    select 1 from mutes m
    where m.muter_key = p_voter
      and (
        (p_author is not null and m.target_key = 'u:' || p_author)
        -- 匿名の相手は client_id で。登録ユーザーの書き込みには当てない（匿名と登録の結び付きを漏らさないため）
        or (p_author is null and p_client is not null and m.target_key = 'c:' || p_client)
      )
  )
$$;

create function list_posts(
  p_mode text,          -- 'new' | 'rank' | 'profile' | 'search'
  p_period text,        -- 'day' | 'week' | 'all'（ランキング）
  p_rank_by text,       -- 'likes' | 'sames'（ランキング）
  p_author uuid,        -- ユーザーページ
  p_tag text,           -- 検索：タグ
  p_query text,         -- 検索：キーワード（ILIKE 用にエスケープ済み）
  p_voter text,
  p_user uuid,
  p_client text,
  p_limit int,
  p_offset int
)
returns table (
  id uuid, author_id uuid, username text, display_name text, anon_tag text,
  title text, body text, like_count int, comment_count int, same_count int,
  sensitive boolean, tags text[], dreamed_on date, edited_at timestamptz, created_at timestamptz,
  liked boolean, samed boolean, mine boolean
)
language sql stable set search_path = public as $$
  select p.id, p.author_id, pr.username, p.display_name, p.anon_tag,
    p.title, p.body, p.like_count, p.comment_count, p.same_count,
    p.sensitive, p.tags, p.dreamed_on, p.edited_at, p.created_at,
    exists (select 1 from post_likes l where l.post_id = p.id and l.voter_key = p_voter),
    exists (select 1 from post_sames s where s.post_id = p.id and s.voter_key = p_voter),
    coalesce(case when p.author_id is not null then p.author_id = p_user else p.client_id = p_client end, false)
  from posts p
  left join profiles pr on pr.id = p.author_id
  where not p.hidden
    and (p_author is null or p.author_id = p_author)
    and (p_tag is null or p_tag = any (p.tags))
    and (p_query is null or p.title ilike '%' || p_query || '%' or p.body ilike '%' || p_query || '%')
    and not exists (
      select 1 from reports r
      where r.target_type = 'post' and r.target_id = p.id and r.reporter_key = p_voter
    )
    and (p_mode = 'profile' or not is_muted(p_voter, p.author_id, p.client_id))
    and (
      p_mode <> 'rank' or p_period = 'all'
      or p.created_at > now() - case when p_period = 'day' then interval '24 hours' else interval '7 days' end
    )
  order by
    case when p_mode = 'rank' and p_rank_by = 'sames' then p.same_count end desc nulls last,
    case when p_mode = 'rank' and p_rank_by <> 'sames' then p.like_count end desc nulls last,
    case when p_mode = 'profile' then coalesce(p.dreamed_on, (p.created_at at time zone 'Asia/Tokyo')::date) end desc nulls last,
    p.created_at desc,
    p.id
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;

create function get_post(p_id uuid, p_voter text, p_user uuid, p_client text)
returns table (
  id uuid, author_id uuid, username text, display_name text, anon_tag text,
  title text, body text, like_count int, comment_count int, same_count int,
  sensitive boolean, tags text[], dreamed_on date, edited_at timestamptz, created_at timestamptz,
  liked boolean, samed boolean, mine boolean
)
language sql stable set search_path = public as $$
  select p.id, p.author_id, pr.username, p.display_name, p.anon_tag,
    p.title, p.body, p.like_count, p.comment_count, p.same_count,
    p.sensitive, p.tags, p.dreamed_on, p.edited_at, p.created_at,
    exists (select 1 from post_likes l where l.post_id = p.id and l.voter_key = p_voter),
    exists (select 1 from post_sames s where s.post_id = p.id and s.voter_key = p_voter),
    coalesce(case when p.author_id is not null then p.author_id = p_user else p.client_id = p_client end, false)
  from posts p
  left join profiles pr on pr.id = p.author_id
  where p.id = p_id and not p.hidden
    and not exists (
      select 1 from reports r
      where r.target_type = 'post' and r.target_id = p.id and r.reporter_key = p_voter
    );
$$;

create function list_comments(p_post uuid, p_voter text, p_user uuid, p_client text)
returns table (
  id uuid, parent_id uuid, author_id uuid, username text, display_name text, anon_tag text,
  body text, like_count int, created_at timestamptz, liked boolean, mine boolean
)
language sql stable set search_path = public as $$
  select c.id, c.parent_id, c.author_id, pr.username, c.display_name, c.anon_tag,
    c.body, c.like_count, c.created_at,
    exists (select 1 from comment_likes l where l.comment_id = c.id and l.voter_key = p_voter),
    coalesce(case when c.author_id is not null then c.author_id = p_user else c.client_id = p_client end, false)
  from comments c
  left join profiles pr on pr.id = c.author_id
  where c.post_id = p_post and not c.hidden
    and not exists (
      select 1 from reports r
      where r.target_type = 'comment' and r.target_id = c.id and r.reporter_key = p_voter
    )
    and not is_muted(p_voter, c.author_id, c.client_id)
  order by c.created_at desc
  limit 1000;
$$;

-- 「私も見た」。新しい数を返す
create function set_post_same(p_post uuid, p_voter text, p_same boolean)
returns int
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from posts where id = p_post and not hidden) then
    raise exception 'post not found';
  end if;
  if p_same then
    insert into post_sames (post_id, voter_key) values (p_post, p_voter) on conflict do nothing;
  else
    delete from post_sames where post_id = p_post and voter_key = p_voter;
  end if;
  return (select same_count from posts where id = p_post);
end $$;

-- 管理画面：通報された・非表示の書き込み
create function admin_queue(p_filter text, p_limit int)   -- p_filter: 'reported' | 'hidden'
returns table (
  target_type text, target_id uuid, post_id uuid, reports int, last_reported timestamptz,
  hidden boolean, moderated_ok boolean, title text, body text,
  display_name text, anon_tag text, username text, created_at timestamptz
)
language sql stable set search_path = public as $$
  with r as (
    select target_type, target_id, count(*)::int as n, max(created_at) as last_at
    from reports group by target_type, target_id
  ),
  items as (
    select 'post'::text as target_type, p.id as target_id, p.id as post_id,
      coalesce(r.n, 0) as reports, r.last_at as last_reported, p.hidden, p.moderated_ok,
      p.title, p.body, p.display_name, p.anon_tag, pr.username, p.created_at
    from posts p
    left join r on r.target_type = 'post' and r.target_id = p.id
    left join profiles pr on pr.id = p.author_id
    where (p_filter = 'hidden' and p.hidden) or (p_filter = 'reported' and r.n > 0 and not p.moderated_ok and not p.hidden)
    union all
    select 'comment', c.id, c.post_id,
      coalesce(r.n, 0), r.last_at, c.hidden, c.moderated_ok,
      null, c.body, c.display_name, c.anon_tag, pr.username, c.created_at
    from comments c
    left join r on r.target_type = 'comment' and r.target_id = c.id
    left join profiles pr on pr.id = c.author_id
    where (p_filter = 'hidden' and c.hidden) or (p_filter = 'reported' and r.n > 0 and not c.moderated_ok and not c.hidden)
  )
  select * from items
  order by coalesce(last_reported, created_at) desc
  limit least(greatest(p_limit, 1), 200);
$$;

revoke execute on function
  allowed_tags(), valid_tags(text[]),
  is_muted(text, uuid, text),
  list_posts(text, text, text, uuid, text, text, text, uuid, text, int, int),
  get_post(uuid, text, uuid, text),
  list_comments(uuid, text, uuid, text),
  set_post_same(uuid, text, boolean),
  admin_queue(text, int)
from public, anon, authenticated;

grant execute on function
  allowed_tags(), valid_tags(text[]),
  is_muted(text, uuid, text),
  list_posts(text, text, text, uuid, text, text, text, uuid, text, int, int),
  get_post(uuid, text, uuid, text),
  list_comments(uuid, text, uuid, text),
  set_post_same(uuid, text, boolean),
  admin_queue(text, int)
to service_role;
