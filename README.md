# 余白 — AI日記Webアプリ

スマートフォンで今日のコンディションを記録し、MarkdownとJSONをコピーしてChatGPTに渡せる日記アプリです。React / Vite製の静的サイトで、バックエンドやAPIキーは不要です。

## 使い方

1. 日付、睡眠時間、体調、気分を入力します。日付は端末の今日の日付、睡眠時間は0〜24時間・0.5時間刻みです。
2. 「気づき」「できたこと」を自由に書きます。この2項目は空欄でも使えます。
3. 「ChatGPT用にコピー」を押し、ChatGPTのチャットに貼り付けます。「コピーしました！」が表示されたらコピー成功です。
4. 履歴を残す場合は「日記を保存」を押します。同じ日付の記録は更新されます。

下書きは自動保存され、再読み込み後も復元されます。履歴では検索、編集、コピー、削除、JSONの書き出しができます。ブラウザがコピーを許可しない場合には、手動コピー用の画面を表示します。

日記と下書きは**この端末・ブラウザのlocalStorage**に保存します。外部への自動送信、端末間の同期、ChatGPTへの自動蓄積は行いません。ブラウザデータの削除やシークレットモードによって記録が消える場合があるので、大切な日記はJSONで書き出して保管してください。保存容量が不足してもコピー機能は使えます。

## 開発

Node.js 22.12以降（クラウド環境ではNode.js 24）を使用します。

```sh
cd /workspace/life
npm ci
npm run dev -- --port 5173 --strictPort
```

ビルド・テスト:

```sh
npm test
npm run build
```

本番成果物は `dist/` に生成されます。日本語フォントも同梱しており、フォント配信サービスへの通信は不要です。フォントのライセンスは `public/font-licenses/` に含めています。

ブラウザテストはChromiumで、スマートフォンの画面・タッチ操作を再現します。

```sh
# 初回のみ、Playwrightのブラウザを用意
npx playwright install chromium
npm run test:e2e
```

このクラウド環境にはChromiumが導入済みです。追加ダウンロードなしで実行できます。

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

コピーした実際のクリップボード内容、保存・復元・同日更新・削除・JSON出力、入力エラー、コピー権限や保存容量の不足、保存データの破損、画面幅320〜1440pxを検証します。ブラウザテストは日記データを隔離した一時ブラウザで実行します。

## Vercelへのデプロイ

GitHubにコードをpushした後、Vercelでこのリポジトリをインポートし、以下を指定します。

| 設定             | 値              |
| ---------------- | --------------- |
| Framework Preset | Vite            |
| Install Command  | `npm ci`        |
| Build Command    | `npm run build` |
| Output Directory | `dist`          |

環境変数やAPIキーは必要ありません。Node.jsは24.xを使用します。`vercel.json` にビルド設定を同梱しています。VercelのHTTPSでクリップボードAPIを使用できます。

公開後は **Project → Deployments → 最新のProductionデプロイ → Visit** で本番URLを開きます。プロジェクトの **Settings → Domains** でも `https://（プロジェクトのドメイン）.vercel.app` を確認できます。そのURLをスマートフォンのSafariやChromeで開いてください。一般公開する場合は、**Settings → Deployment Protection** でProductionがVercelログインを要求しないことを確認し、ログインしていないブラウザでも動作を確認します。

CLIを使う場合は、PCのターミナルで以下を実行できます。

```sh
cd /path/to/life
npx vercel login
npx vercel --prod
```

初回のセットアップで自分のアカウント（またはチーム）を選び、このディレクトリを新規プロジェクトとして登録します。GitHub連携による自動デプロイも使う場合は、Vercelの **Project → Settings → Git → Connect Git Repository** からPush先のリポジトリを接続してください。CLIのログイン情報やアクセストークンをGitやチャットに記載しないでください。

## GitHub Pagesへのデプロイ

`.github/workflows/deploy-pages.yml` を同梱しています。

1. コードをGitHubの `main` ブランチにpushします。
2. リポジトリの **Settings → Pages → Source** を **GitHub Actions** に設定します。
3. Actionsの **Deploy to GitHub Pages** を実行します。以降は `main` へのpushで再デプロイします。

Viteの `base: './'` により、リポジトリ名を含むサブパスでも動作します。画面切り替えにサーバーのルーティングは必要ありません。GitHub PagesのHTTPSでコピー機能を使用できます。

## コピー形式

````markdown
【日記データ記録】

- 日付: 2026-10-14
- 睡眠時間: 7.5時間
- 体調: 4/5
- 気分: 5/5
- 気づき: 散歩で気分がすっきりした。
- できたこと: 本を読めた。

```json
{
  "date": "2026-10-14",
  "sleep": 7.5,
  "condition": 4,
  "mood": 5,
  "insights": "散歩で気分がすっきりした。",
  "achievements": "本を読めた。"
}
```
````

改行や引用符もJSONとして正しくエスケープします。自由記述にバッククォートが含まれる場合は、JSONのコードフェンスを安全な長さに調整します。
