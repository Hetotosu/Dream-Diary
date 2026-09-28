# ゆめ掲示板

見た夢を、タイトルと本文で投稿する日本語の掲示板です。匿名でも書けて、アカウントを作ると名前とユーザーページが付きます。

- 見本（デモ）：`reference/yume-board.html`
- 依頼書（仕様）：`docs/spec.md`

## 技術構成

- Next.js 16（App Router）＋ TypeScript
- Supabase（Postgres・Auth・Row Level Security）
- デプロイ先は Vercel を想定

## セットアップ

1. Supabase でプロジェクトを作る
2. **SQL Editor** で `supabase/migrations/0001_init.sql` を実行する（テーブル・トリガー・RLS・関数がまとめて作られます）
3. 開発用のサンプルが欲しければ `supabase/seed.sql` も実行する（本番では実行しない）
4. **Authentication → URL Configuration** で
   - Site URL：`http://localhost:3000`（本番では本番の URL）
   - Redirect URLs：`http://localhost:3000/auth/callback` と本番の `https://<ドメイン>/auth/callback`
5. Google ログインも使うなら **Authentication → Providers → Google** を設定し、`.env.local` で `NEXT_PUBLIC_GOOGLE_LOGIN=true` にする
6. `.env.example` を `.env.local` にコピーして値を入れる（`.env.local` はコミットしない）

   | 変数 | 内容 |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API の URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon（publishable）キー |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role（secret）キー。サーバー専用 |
   | `ANON_ID_SALT` | 匿名IDを作る秘密のソルト。`openssl rand -base64 32` などで作る |
   | `ADMIN_EMAILS` | 管理者のメールアドレス（カンマ区切り） |
   | `NEXT_PUBLIC_GOOGLE_LOGIN` | Google ログインのボタンを出すなら `true` |

7. 起動する

   ```bash
   npm install
   npm run dev
   ```

   http://localhost:3000 を開く。

## Vercel へのデプロイ

1. リポジトリを Vercel に取り込む
2. Environment Variables に上の表の変数をすべて入れる
3. Supabase の Site URL と Redirect URLs に本番の URL を足す

## 仕組み

### 書き込みはすべてサーバー経由

投稿・コメント・いいね・通報・削除は Server Actions（`src/app/actions.ts`）で受け、
サーバーが本人確認・入力チェック・レート制限をしてから service role で保存します。
ブラウザからテーブルに直接書くことはできません。

### 匿名まわり

- 初回アクセス時に `src/proxy.ts` が推測されにくい `client_id` を httpOnly Cookie（`yume_cid`）で発行します
- 匿名ID は `HMAC(ANON_ID_SALT, client_id + 日本時間の日付)` の先頭6文字です。同じブラウザなら同じ日は同じ ID、日付が変わると変わります。ID から client_id は逆算できません
- 匿名の削除は、Cookie の client_id が一致する行だけ許可します
- いいね・通報の重複防止キーは、ログイン中なら `u:<user id>`、匿名なら `c:<client_id>` です

### RLS と権限

- `posts` と `comments` は `hidden = false` の行だけ誰でも読めます。`client_id` の列は anon / authenticated キーでは読めません（列単位の権限）
- ログイン中のユーザーは自分の行だけ削除できます
- `post_likes` `comment_likes` `reports` `rate_events` はブラウザ側のキーでは読み書きできません
- 一覧などの関数（`list_posts` など）は service role だけが実行できます

### 件数・通報・返信

- `like_count` と `comment_count` はトリガーで増減します（コメント数は返信を含み、非表示のものは数えません）
- 同じ対象への通報が3件たまると、トリガーが `hidden = true` にします。通報した本人には、その場で非表示になります
- 返信は1階層だけです。返信への返信はトリガーでも弾きます。親コメントを消すと返信も消えます

### ランキング

「その期間に投稿された投稿を、いいねが多い順（同数なら新しい順）」で並べます（試作品と同じ方式）。
日間は24時間、週間は7日です。

### レート制限

`src/lib/rateLimit.ts` で設定しています。同じ client_id（ログイン中はユーザーも）と同じ IP の両方で数えます。
IP は学校や携帯回線で共有されやすいので、上限を client_id の3倍にしています。

| 操作 | client_id / ユーザー | IP |
| --- | --- | --- |
| 投稿 | 1分に1件 | 1分に3件 |
| コメント | 1分に5件 | 1分に15件 |
| いいね | 1分に30回 | 1分に90回 |
| 通報 | 1分に10件 | 1分に30件 |

### 管理者

`ADMIN_EMAILS` に入れたメールアドレスでログインすると、すべての投稿・コメントに
「削除（管理者）」と「非表示（管理者）」が出ます。非表示は全員に対して隠します。

## ページ

| URL | 内容 |
| --- | --- |
| `/` | 新着 |
| `/ranking?period=day\|week\|all` | ランキング |
| `/u/[username]` | ユーザーページ |
| `?post=<id>` | コメントのポップアップを開いた状態（どのページにも付けられる） |
| `/welcome` | ログイン後、ユーザー名を決めるページ |
| `/auth/callback` | マジックリンク・Google ログインの戻り先 |

## 動作確認のしかた

1. **投稿**：「夢を書く」から匿名で投稿 → 名前と `ID:xxxxxx` が付く。空で送るとエラーが出る。続けてもう1件送ると「1分に1件まで」と出る
2. **共有**：別のブラウザ（またはシークレットウィンドウ）で開くと、同じ投稿が見える。自分の投稿には「削除」、他人の投稿には「通報」が出る
3. **いいね**：月のマークを押す → 数が増えて塗りつぶされる。再読み込みしても保たれる。もう一度押すと取り消せる
4. **ランキング**：タブを切り替えると URL が `/ranking?period=week` などになり、再読み込みしても保たれる
5. **コメント**：吹き出しを押すとポップアップ（スマホ幅では下から出るシート）が開き、URL に `?post=` が付く。コメント・返信・返信への返信（`@名前` が付く）・いいね・並び替え・2回押しの削除を試す。Esc か背景を押すと閉じ、吹き出しにフォーカスが戻る
6. **ログイン**：「ログイン」→ メールアドレス → 届いたリンクを開く → ユーザー名を決める → 名前がリンクになり `/u/<名前>` が開く
7. **通報**：別のブラウザで通報すると、そのブラウザからだけ消える。3つのブラウザから通報すると全員から消える
8. **管理者**：`ADMIN_EMAILS` のアドレスでログインすると、他人の投稿も削除・非表示にできる
9. **表示**：幅 360px 前後で横スクロールが出ないこと、OS のダークモードで配色が切り替わることを確かめる

## コマンド

```bash
npm run dev        # 開発サーバー
npm run build      # 本番ビルド
npm run typecheck  # 型チェック
```
