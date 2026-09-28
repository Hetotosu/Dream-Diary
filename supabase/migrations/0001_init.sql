-- ゆめ掲示板：スキーマ・トリガー・RLS・RPC
-- Supabase の SQL Editor に貼り付けるか、`supabase db push` で適用する。

create extension if not exists pgcrypto;

-- =========================================================
-- テーブル
-- =========================================================

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null check (char_length(username) between 1 and 20),
  created_at timestamptz not null default now()
);

create table posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references profiles(id) on delete set null,  -- 匿名なら null
  client_id text,                                             -- 匿名のブラウザ識別（Cookie）
  display_name text not null default '名無しさん' check (char_length(display_name) between 1 and 20),
  anon_tag text,                                              -- 匿名の6文字ID
  title text not null check (char_length(title) between 1 and 40),
  body text not null check (char_length(body) between 1 and 2000),
  like_count int not null default 0,
  comment_count int not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  parent_id uuid references comments(id) on delete cascade,   -- null なら親コメント
  author_id uuid references profiles(id) on delete set null,
  client_id text,
  display_name text not null default '名無しさん' check (char_length(display_name) between 1 and 20),
  anon_tag text,
  body text not null check (char_length(body) between 1 and 500),
  like_count int not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

-- voter_key は ログイン中なら 'u:<user id>'、匿名なら 'c:<client_id>'
create table post_likes (
  post_id uuid references posts(id) on delete cascade,
  voter_key text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, voter_key)
);

create table comment_likes (
  comment_id uuid references comments(id) on delete cascade,
  voter_key text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, voter_key)
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post', 'comment')),
  target_id uuid not null,
  reporter_key text not null,
  created_at timestamptz not null default now(),
  unique (target_type, target_id, reporter_key)
);

-- レート制限の記録（サーバーからのみ使う）
create table rate_events (
  id bigserial primary key,
  bucket text not null,
  created_at timestamptz not null default now()
);

-- =========================================================
-- インデックス
-- =========================================================

create index posts_created_idx on posts (created_at desc);
create index posts_likes_idx on posts (like_count desc, created_at desc);
create index posts_author_idx on posts (author_id, created_at desc);
create index comments_post_parent_idx on comments (post_id, parent_id);
create index comments_parent_idx on comments (parent_id);
create index post_likes_voter_idx on post_likes (voter_key);
create index comment_likes_voter_idx on comment_likes (voter_key);
create index reports_reporter_idx on reports (reporter_key, target_type);
create index rate_events_bucket_idx on rate_events (bucket, created_at desc);

-- =========================================================
-- トリガー：件数の増減・返信の階層・通報の集計
-- =========================================================

-- いいね数（投稿）
create function trg_post_likes_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update posts set like_count = like_count + 1 where id = new.post_id;
  else
    update posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;

create trigger post_likes_count after insert or delete on post_likes
  for each row execute function trg_post_likes_count();

-- いいね数（コメント）
create function trg_comment_likes_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update comments set like_count = like_count + 1 where id = new.comment_id;
  else
    update comments set like_count = greatest(like_count - 1, 0) where id = old.comment_id;
  end if;
  return null;
end $$;

create trigger comment_likes_count after insert or delete on comment_likes
  for each row execute function trg_comment_likes_count();

-- コメント数（表示中のコメントと返信だけを数える）
create function trg_comments_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not new.hidden then
      update posts set comment_count = comment_count + 1 where id = new.post_id;
    end if;
  elsif tg_op = 'DELETE' then
    if not old.hidden then
      update posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
    end if;
  elsif new.hidden is distinct from old.hidden then
    update posts
      set comment_count = greatest(comment_count + case when new.hidden then -1 else 1 end, 0)
      where id = new.post_id;
  end if;
  return null;
end $$;

create trigger comments_count after insert or delete or update of hidden on comments
  for each row execute function trg_comments_count();

-- 返信は1階層まで。返信の返信と、別の投稿への返信を弾く
create function trg_comments_check_parent() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  parent comments%rowtype;
begin
  if new.parent_id is null then
    return new;
  end if;
  select * into parent from comments where id = new.parent_id;
  if not found then
    raise exception 'parent comment not found';
  end if;
  if parent.parent_id is not null then
    raise exception 'replies can only be one level deep';
  end if;
  if parent.post_id <> new.post_id then
    raise exception 'parent comment belongs to another post';
  end if;
  return new;
end $$;

create trigger comments_check_parent before insert or update of parent_id, post_id on comments
  for each row execute function trg_comments_check_parent();

-- 親コメントを非表示にしたら返信も非表示にする
create function trg_comments_hide_replies() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.parent_id is null and new.hidden and not old.hidden then
    update comments set hidden = true where parent_id = new.id and not hidden;
  end if;
  return null;
end $$;

create trigger comments_hide_replies after update of hidden on comments
  for each row execute function trg_comments_hide_replies();

-- 同じ対象への通報が3件たまったら、全員に非表示
create function trg_reports_threshold() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  select count(*) into n from reports
    where target_type = new.target_type and target_id = new.target_id;
  if n >= 3 then
    if new.target_type = 'post' then
      update posts set hidden = true where id = new.target_id and not hidden;
    else
      update comments set hidden = true where id = new.target_id and not hidden;
    end if;
  end if;
  return null;
end $$;

create trigger reports_threshold after insert on reports
  for each row execute function trg_reports_threshold();

-- =========================================================
-- Row Level Security と列の権限
-- =========================================================
-- ・posts / comments は hidden = false の行だけ誰でも読める
-- ・client_id（匿名の本人確認に使う値）は、ブラウザ側のキーでは読めない
-- ・ログイン中のユーザーは自分の行だけ削除できる
-- ・書き込みは基本的にサーバー（service role）経由。匿名の操作はサーバー経由のみ
-- ・いいね・通報・レート制限の表は、ブラウザ側のキーでは一切触れない

alter table profiles enable row level security;
alter table posts enable row level security;
alter table comments enable row level security;
alter table post_likes enable row level security;
alter table comment_likes enable row level security;
alter table reports enable row level security;
alter table rate_events enable row level security;

revoke all on profiles, posts, comments, post_likes, comment_likes, reports, rate_events from anon, authenticated;
revoke all on sequence rate_events_id_seq from anon, authenticated;

grant select on profiles to anon, authenticated;
create policy "profiles are public" on profiles for select using (true);

grant select (id, author_id, display_name, anon_tag, title, body, like_count, comment_count, hidden, created_at)
  on posts to anon, authenticated;
grant delete on posts to authenticated;
create policy "visible posts are public" on posts for select using (hidden = false);
create policy "authors delete own posts" on posts for delete to authenticated
  using (author_id is not null and author_id = auth.uid());

grant select (id, post_id, parent_id, author_id, display_name, anon_tag, body, like_count, hidden, created_at)
  on comments to anon, authenticated;
grant delete on comments to authenticated;
create policy "visible comments are public" on comments for select using (hidden = false);
create policy "authors delete own comments" on comments for delete to authenticated
  using (author_id is not null and author_id = auth.uid());

-- =========================================================
-- RPC（サーバーの service role からだけ呼ぶ）
-- =========================================================

-- 投稿の一覧。いいね済みか・自分の投稿かを一緒に返す。client_id は返さない
create function list_posts(
  p_mode text,          -- 'new' | 'rank'
  p_period text,        -- 'day' | 'week' | 'all'
  p_author uuid,        -- ユーザーページのとき
  p_voter text,         -- 'u:<id>' または 'c:<client_id>'
  p_user uuid,
  p_client text,
  p_limit int,
  p_offset int
)
returns table (
  id uuid, author_id uuid, username text, display_name text, anon_tag text,
  title text, body text, like_count int, comment_count int, created_at timestamptz,
  liked boolean, mine boolean
)
language sql stable set search_path = public as $$
  select p.id, p.author_id, pr.username, p.display_name, p.anon_tag,
    p.title, p.body, p.like_count, p.comment_count, p.created_at,
    exists (select 1 from post_likes l where l.post_id = p.id and l.voter_key = p_voter) as liked,
    coalesce(case when p.author_id is not null then p.author_id = p_user else p.client_id = p_client end, false) as mine
  from posts p
  left join profiles pr on pr.id = p.author_id
  where not p.hidden
    and (p_author is null or p.author_id = p_author)
    and not exists (
      select 1 from reports r
      where r.target_type = 'post' and r.target_id = p.id and r.reporter_key = p_voter
    )
    and (
      p_mode <> 'rank' or p_period = 'all'
      or p.created_at > now() - case when p_period = 'day' then interval '24 hours' else interval '7 days' end
    )
  order by
    case when p_mode = 'rank' then p.like_count end desc nulls last,
    p.created_at desc,
    p.id
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;

-- 1件の投稿（?post=<id> で直接開いたとき用）
create function get_post(p_id uuid, p_voter text, p_user uuid, p_client text)
returns table (
  id uuid, author_id uuid, username text, display_name text, anon_tag text,
  title text, body text, like_count int, comment_count int, created_at timestamptz,
  liked boolean, mine boolean
)
language sql stable set search_path = public as $$
  select p.id, p.author_id, pr.username, p.display_name, p.anon_tag,
    p.title, p.body, p.like_count, p.comment_count, p.created_at,
    exists (select 1 from post_likes l where l.post_id = p.id and l.voter_key = p_voter),
    coalesce(case when p.author_id is not null then p.author_id = p_user else p.client_id = p_client end, false)
  from posts p
  left join profiles pr on pr.id = p.author_id
  where p.id = p_id and not p.hidden
    and not exists (
      select 1 from reports r
      where r.target_type = 'post' and r.target_id = p.id and r.reporter_key = p_voter
    );
$$;

-- コメントと返信の一覧（並び替えは画面側）
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
  order by c.created_at desc
  limit 1000;
$$;

-- ユーザーページの集計
create function profile_stats(p_author uuid)
returns table (post_count int, like_total int)
language sql stable set search_path = public as $$
  select count(*)::int, coalesce(sum(like_count), 0)::int
  from posts where author_id = p_author and not hidden;
$$;

-- いいね（投稿）。新しいいいね数を返す
create function set_post_like(p_post uuid, p_voter text, p_like boolean)
returns int
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from posts where id = p_post and not hidden) then
    raise exception 'post not found';
  end if;
  if p_like then
    insert into post_likes (post_id, voter_key) values (p_post, p_voter) on conflict do nothing;
  else
    delete from post_likes where post_id = p_post and voter_key = p_voter;
  end if;
  return (select like_count from posts where id = p_post);
end $$;

-- いいね（コメント）。新しいいいね数を返す
create function set_comment_like(p_comment uuid, p_voter text, p_like boolean)
returns int
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from comments where id = p_comment and not hidden) then
    raise exception 'comment not found';
  end if;
  if p_like then
    insert into comment_likes (comment_id, voter_key) values (p_comment, p_voter) on conflict do nothing;
  else
    delete from comment_likes where comment_id = p_comment and voter_key = p_voter;
  end if;
  return (select like_count from comments where id = p_comment);
end $$;

-- レート制限。すべてのバケットが上限未満なら記録して true、どれかが上限なら false
create function hit_rate_limit(p_buckets text[], p_max int[], p_window_seconds int)
returns boolean
language plpgsql set search_path = public as $$
declare
  i int;
  n int;
begin
  for i in 1 .. coalesce(array_length(p_buckets, 1), 0) loop
    perform pg_advisory_xact_lock(hashtext(p_buckets[i]));
    select count(*) into n from rate_events
      where bucket = p_buckets[i] and created_at > now() - make_interval(secs => p_window_seconds);
    if n >= p_max[i] then
      return false;
    end if;
  end loop;
  insert into rate_events (bucket) select unnest(p_buckets);
  -- 古い記録をときどき掃除する
  if random() < 0.02 then
    delete from rate_events where created_at < now() - interval '1 day';
  end if;
  return true;
end $$;

revoke execute on function
  list_posts(text, text, uuid, text, uuid, text, int, int),
  get_post(uuid, text, uuid, text),
  list_comments(uuid, text, uuid, text),
  profile_stats(uuid),
  set_post_like(uuid, text, boolean),
  set_comment_like(uuid, text, boolean),
  hit_rate_limit(text[], int[], int)
from public, anon, authenticated;

grant execute on function
  list_posts(text, text, uuid, text, uuid, text, int, int),
  get_post(uuid, text, uuid, text),
  list_comments(uuid, text, uuid, text),
  profile_stats(uuid),
  set_post_like(uuid, text, boolean),
  set_comment_like(uuid, text, boolean),
  hit_rate_limit(text[], int[], int)
to service_role;

-- トリガー関数はトリガー経由でだけ動かす
revoke execute on function
  trg_post_likes_count(), trg_comment_likes_count(), trg_comments_count(),
  trg_comments_check_parent(), trg_comments_hide_replies(), trg_reports_threshold()
from public, anon, authenticated;
