# ゆめ掲示板：Claude Code 用の依頼書

## 使い方

1. 空のプロジェクトフォルダを作る
2. 試作品の `yume-board.html` をそのフォルダに `reference/yume-board.html` として置く（見た目と動きの見本になる）
3. Claude Code を開いて、下の「プロンプト」をまるごと貼り付ける
4. 最初は「手順1だけやって」と区切って進めると、確認しながら作れる

---

## プロンプト（ここから貼る）

`reference/yume-board.html` は、動く試作品（デモ）です。データはブラウザ内にしか保存されません。これを見本にして、**みんなで共有できる本物の掲示板**を作ってください。見た目と動きは見本にそろえ、データの保存・認証・安全対策を本物にします。

### 1. サービスの概要

- 名前：ゆめ掲示板
- 内容：見た夢を、タイトルと本文で投稿する日本語の掲示板
- 構造：5ch のように匿名でも書ける。アカウントを作ると名前が付き、自分のページで過去の投稿を見せられる
- コメントの構造は YouTube と同じ（人気順／新しい順、いいね、返信は1階層）

### 2. 技術スタック

- Next.js（App Router）＋ TypeScript
- Supabase（Postgres と Auth）。Row Level Security を有効にする
- スタイルは CSS 変数ベース（Tailwind を使ってもよいが、下の「デザイン」のトークンは崩さない）
- デプロイは Vercel を想定

### 3. 機能

**投稿**
- タイトル（1〜40文字）と本文（1〜2000文字）
- 匿名でも投稿できる。匿名のときは名前欄に好きな名前（20文字まで）を書けて、空欄なら「名無しさん」
- 匿名の投稿には、5ch のような6文字の ID を付ける。同じブラウザなら同じ日は同じ ID、日付が変わると変わる
- ログイン中は名前欄を出さず、「◯◯ として投稿します」と表示する
- 一覧では本文を4行に切り詰め、長い投稿には「続きを読む」を出す

**表示**
- 「新着」と「ランキング」を切り替える
- ランキングは「日間（24時間）・週間（7日）・全期間」を切り替える。いいねが多い順で、同数なら新しい順。順位の数字を左に出す
- 投稿者が登録ユーザーなら、名前が押せるリンクになり、そのユーザーのページ（`/u/[username]`）に移動する。匿名の名前は押せない

**いいね**
- 月のマークを押すといいね、もう一度押すと取り消し
- 1人1回まで。ログイン中はユーザー単位、匿名はブラウザ単位（Cookie の client_id）で重複を防ぐ
- 投稿にもコメントにも付けられる

**ユーザーページ `/u/[username]`**
- アイコン（名前の頭文字の丸）、名前、投稿数、もらったいいねの合計、そのユーザーの投稿一覧（新しい順）
- 自分のページには「あなたのページです」と出す
- 「掲示板に戻る」ボタンを置く

**コメント（ポップアップ）**
- 各投稿に吹き出しマークとコメント数を置く。押すとポップアップが開く。スマホでは画面下から出るボトムシートにする
- ポップアップの中身：見出し「コメント N件」（N は返信を含む数）、閉じるボタン、投稿タイトル、人気順／新しい順の切り替え、コメント入力欄、コメント一覧
- コメント入力：空のときは「コメントする」ボタンを押せなくする。最大500文字。匿名なら「名無しさんとして投稿します」と出す
- 各コメント：アイコン、名前（登録ユーザーなら押せる）、匿名なら ID、投稿時刻、本文、いいね、返信ボタン、自分のコメントなら削除ボタン
- 返信は1階層だけ。「返信 N件を表示／非表示」で開閉する。返信への返信は、同じ階層に「@名前 」を付けて追加する
- 人気順はいいねが多い順、同数なら新しい順。返信は古い順
- 自分のコメントを新しく追加したら、並び順を「新しい順」に切り替えて先頭に見せる
- 削除は2回押し方式（1回目で「もう一度押すと削除します」に変わり、4秒で元に戻る）。親コメントを消したら返信も消える

**安全対策**
- 他人の投稿・コメントには「通報」ボタン。押した人には即座に非表示にする。同じ対象への通報が3件たまったら全員に非表示（`hidden = true`）にする
- 自分の投稿・コメントは削除できる
- 管理者（環境変数でメールアドレスを指定）は、どの投稿・コメントも削除・非表示にできる
- 本文は必ずエスケープして表示する（HTML として解釈しない）。`dangerouslySetInnerHTML` は使わない
- 連投を防ぐため、投稿・コメント・いいねにレート制限をかける（例：同じ client_id または IP から、投稿は1分に1件、コメントは1分に5件）
- 入力の長さと空文字は、画面側とサーバー側の両方で検証する
- フッターに、怖い描写や生々しい描写が含まれることがある旨の注意書きを置く。投稿フォームには「実名・住所など個人が特定できる情報は書かないでください」と添える

### 4. アカウント

- Supabase Auth を使う（メールのマジックリンク、または Google ログイン）
- 登録時に `username`（1〜20文字、重複不可）を決める。試作品のログインはパスワードなしのデモだったので、そこを本物の認証に置き換える
- `profiles` テーブルにユーザー名を持つ

### 5. データベース

```sql
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null check (char_length(username) between 1 and 20),
  created_at timestamptz not null default now()
);

create table posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references profiles(id) on delete set null,  -- 匿名なら null
  client_id text,                                             -- 匿名のブラウザ識別（Cookie）
  display_name text not null default '名無しさん',
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
  display_name text not null default '名無しさん',
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
```

- `like_count` と `comment_count` は、トリガーか RPC（関数）で増減させる
- 返信は `parent_id` で親につなぐ。返信の返信は作らない（サーバー側でも弾く）
- 一覧用に `posts (created_at desc)`、`posts (like_count desc, created_at desc)`、`comments (post_id, parent_id)` にインデックスを張る

### 6. 匿名まわりの設計（重要）

- 匿名ユーザーは Supabase Auth を通らないので、**匿名の書き込みは Route Handler か Server Action 経由**にして、サーバー側（service role）で保存する。ブラウザから直接テーブルに書かせない
- 初回アクセス時に、推測されにくいランダムな `client_id` を httpOnly Cookie で発行する
- 匿名 ID（`anon_tag`）は、`HMAC(秘密のソルト, client_id + 日付)` の先頭6文字にする。ソルトは環境変数に置く。これで ID から client_id を逆算できない
- RLS の方針：`posts` と `comments` は `hidden = false` の行だけ誰でも読める。書き込み・更新・削除は、ログイン中なら自分の行だけ、匿名の操作はサーバー経由のみ
- 匿名の削除は、Cookie の `client_id` が一致する行だけ許可する

### 7. ページ構成

- `/` 新着、`/ranking?period=day|week|all` ランキング（タブで切り替え。URL に反映してリロードしても保てるようにする）
- `/u/[username]` ユーザーページ
- コメントのポップアップは、ページ遷移なしで開く（`?post=<id>` を URL に反映すると共有しやすい）
- 初回表示はサーバーコンポーネントで取得し、いいね・コメントの操作は楽観的更新にする

### 8. デザイン（試作品にそろえる）

- コンセプト：夜の静けさと、朝の淡い紫。月のモチーフを、ロゴといいねのアイコンにだけ使う
- 色（ライト）：背景 `#EEEBF5`、面 `#F8F6FC`、文字 `#231B3A`、補助文字 `#645C7E`、罫線 `#D2CBE3`、入力欄の枠 `#8A82A6`、月・いいね `#B87700`、ボタン背景 `#231B3A`、フォーカス `#4B3FA8`、警告 `#A82B47`
- 色（ダーク）：背景 `#15122A`、面 `#1E1A38`、文字 `#ECE8F8`、補助文字 `#A29BBF`、罫線 `#2E2950`、入力欄の枠 `#6D6690`、月・いいね `#F2C14E`、ボタン背景 `#ECE8F8`、フォーカス `#B4A9FF`、警告 `#FF8FA6`
- ダークモードは `prefers-color-scheme` に従い、`data-theme="light|dark"` でも上書きできるようにする
- フォント：見出し・タイトルは Shippori Mincho（500/700）、本文は Zen Kaku Gothic New（400/500/700）。Google Fonts から読み込み、フォールバックも指定する
- アイコン：いいね＝三日月（押すと塗りつぶし）、コメント＝吹き出し（線のみ）。どちらも SVG
- アイコン（丸）：名前の頭文字を白文字で表示。背景色は `#5B4FC4 #2F7D6B #B5482F #8A3F8F #2C6FA8 #8C6A12` から、名前のハッシュで決める
- レイアウト：最大幅 44rem の1カラム。投稿はカードにせず、罫線で区切る。左にいいね、右にタイトル・名前・時刻・本文・操作
- ランキングでは、順位の数字を最左列に置く（上位3位は文字色を濃く）
- 装飾は控えめにし、月のアイコン以外は飾らない。ふわっと出る動きなどは付けない。`prefers-reduced-motion` を守る

### 9. アクセシビリティと操作性

- スマホで使いやすいこと（タップ領域は最低 2.25rem 以上）。iPhone のセーフエリア（`env(safe-area-inset-*)`）に対応する
- キーボード操作でき、フォーカスの見える枠を出す
- ポップアップは `<dialog>` を使い、開いたら見出しにフォーカス、閉じたら開いたボタンにフォーカスを戻す。開いている間は背景のスクロールを止める。Esc と背景タップで閉じる
- 再描画のあとも、押したボタンにフォーカスを戻す（いいね、返信の開閉など）
- いいねボタンは `aria-pressed` と `aria-label`（例：「いいね（14）」）を付ける
- エラーは入力欄の下に、何が問題かと直し方を書く。トーストは `role="status"` で読み上げる

### 10. 進め方

1. プロジェクトの作成、Supabase の接続、上のスキーマとRLSの作成
2. 投稿の作成・一覧・新着・ランキング（匿名投稿とサーバー経由の書き込みまで）
3. いいね（投稿・コメント）と重複防止
4. コメントのポップアップ（返信、並び替え、削除）
5. ログインとユーザーページ
6. 通報、管理者の削除、レート制限
7. デザインの仕上げ、ダークモード、アクセシビリティの確認

各手順のあとに、動作確認の方法を教えてください。環境変数（Supabase の URL・キー、ソルト、管理者メール）は `.env.local` に置き、コミットしないでください。

### 11. 完成の条件

- 別のブラウザから見ても、投稿・いいね・コメントが共有されている
- 匿名でもログインでも投稿とコメントができ、いいねが二重に付かない
- 名前を押すとユーザーページが開き、過去の投稿が見られる
- コメントのポップアップで、並び替え、返信、いいね、削除ができる
- 通報した投稿が自分の画面から消える
- スマホ幅（幅 360px 前後）でも崩れない

（ここまで）

---

## 補足：試作品との違い（作るときの注意）

- 試作品のランキングは「その期間に投稿された投稿を、いいね数で並べる」方式です。本物では、`post_likes.created_at` を使って「その期間にもらったいいねの数」で並べる方式にもできます。どちらにするか、Claude Code に選ばせても構いません
- 試作品のログインはパスワードなしのデモで、同じ名前を誰でも名乗れます。本物では認証を必ず入れてください
- 試作品には管理画面、通報の集計、レート制限がありません。手順6で作ります
- 試作品のサンプル投稿（ねむり、よふかし など）は、開発中の確認用として `seed.sql` にすると便利です
