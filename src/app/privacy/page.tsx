import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE } from '@/lib/site';

export const metadata: Metadata = { title: 'プライバシーポリシー' };

export default function Privacy() {
  return (
    <main className="page doc">
      <Link href="/" className="linkbtn">
        掲示板に戻る
      </Link>
      <h2>プライバシーポリシー</h2>
      <p>
        {SITE.operator}（以下「運営者」）は、「{SITE.name}」（以下「本サービス」）で扱う情報について、次のとおり取り扱います。
      </p>

      <h3>1. 集める情報</h3>
      <table className="doc-table">
        <thead>
          <tr>
            <th scope="col">情報</th>
            <th scope="col">集めるとき</th>
            <th scope="col">使いみち</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>メールアドレス</td>
            <td>ログインしたとき</td>
            <td>ログイン用のリンクを送る・本人確認</td>
          </tr>
          <tr>
            <td>Google アカウントの基本情報（名前・メールアドレス）</td>
            <td>Google でログインしたとき</td>
            <td>本人確認</td>
          </tr>
          <tr>
            <td>ユーザー名</td>
            <td>アカウントを作ったとき</td>
            <td>書き込みに表示する</td>
          </tr>
          <tr>
            <td>ブラウザの識別子（Cookie）</td>
            <td>初めて開いたとき</td>
            <td>匿名の書き込みの本人確認（削除・編集）、匿名ID の作成、いいね等の重複防止、ミュート</td>
          </tr>
          <tr>
            <td>IP アドレス</td>
            <td>書き込み・いいね・通報をしたとき</td>
            <td>連投やいたずらの防止（約1日で消します）</td>
          </tr>
          <tr>
            <td>書き込んだ内容と日時</td>
            <td>投稿・コメントしたとき</td>
            <td>掲示板に表示する</td>
          </tr>
        </tbody>
      </table>
      <p>匿名ID は、ブラウザの識別子と日付から作った文字列です。匿名ID からブラウザの識別子を知ることはできません。</p>

      <h3>2. ほかの人に渡すこと</h3>
      <p>次の場合を除き、集めた情報を本人の同意なく第三者に渡しません。</p>
      <ul>
        <li>法律にもとづいて、警察・裁判所などから求められた場合</li>
        <li>人の生命・身体・財産を守るために必要で、本人の同意を得るのが難しい場合</li>
      </ul>

      <h3>3. 使っている外部サービス</h3>
      <p>本サービスは、次のサービスを使って動いています。情報はこれらのサービスのサーバーに保存・処理されます。</p>
      <ul>
        <li>Supabase（データベース・ログイン）</li>
        <li>Vercel（サイトの配信）</li>
        <li>Google Fonts（文字の表示）、Google（Google でログインする場合）</li>
      </ul>

      <h3>4. Cookie</h3>
      <p>
        本サービスは、ログイン状態の保持と、匿名の書き込みの本人確認のために Cookie を使います。
        Cookie を無効にすると、書き込みやいいねができません。広告や行動の追跡のための Cookie は使っていません。
      </p>

      <h3>5. 削除や開示の依頼</h3>
      <p>
        自分の書き込みは、画面から削除できます。アカウントの削除や、自分の情報の開示・訂正・利用停止を希望するときは、下の問い合わせ先に連絡してください。
      </p>

      <h3>6. このポリシーの変更</h3>
      <p>必要に応じてこのポリシーを変更します。変更後の内容は、このページに載せた時点から効力を持ちます。</p>

      <h3>問い合わせ</h3>
      <p>
        次のフォームから送ってください。
        <br />
        <a href={SITE.contactUrl} target="_blank" rel="noopener noreferrer">
          お問い合わせフォーム
        </a>
      </p>

      <p className="fine">{SITE.effectiveDate} 制定</p>
    </main>
  );
}
