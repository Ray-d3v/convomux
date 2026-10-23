# ConvoMux

**Teams と Slack を、ひとつのコマンド `cmx` から読む。**

認証・非公式APIは既存クライアントに任せ、会話一覧、履歴、登録した会話の横断検索を共通JSONで扱うローカルCLIです。AI、常駐サーバー、送信・編集・削除はありません。

> **v0.1.0 / experimental** — 上流ソースの契約と合成データで検証した初期版です。実アカウントでの認証・取得は未検証です。CIの成功もサービスへの接続成功を意味しません。

## 構成

```text
cmx
 ├─ Teams adapter → msteams の teams CLI
 └─ Slack adapter → osodevops/slack-cli の slk
```

TypeScript / Node.js 22以上。**実行時のnpm依存はありません**。開発用のTypeScriptとNode型定義はバージョン・lockfileを固定しています。バックエンドのインストールは別途必要です。

上流の確認対象は以下です。固定した参照先は `backend-contracts.json` に記録しています。外部実行ファイルのバージョンを自動強制する機能はありません。

| Backend | 確認したソース | 利用する機能 |
|---|---|---|
| [nakasyou/teams-api](https://github.com/nakasyou/teams-api) | package 0.2.1 / `04721b476a200e71e0da8d4958e27385d4787e7b` | `me`、会話・チャネル履歴、`login` |
| [osodevops/slack-cli](https://github.com/osodevops/slack-cli) | package 0.2.0 / `66c0f26492cb049ea287f6463d8a19eb97ec7cb9` | `auth.test`、`conversations.list/history`、スレッド、`auth login` |

上流READMEの配布・導入手順を使い、`teams` と `slk` をPATHに配置してください。npmで配布される別名の `slack` CLIではなく、上記の **`slk`** が対象です。配布物と上流ソースが一致すること、特に社用端末での利用が許可されていることを確認してください。

## 導入

```sh
git clone https://github.com/Ray-d3v/convomux.git
cd convomux
npm ci --ignore-scripts
npm run check
node dist/cli.js --help
```

短いコマンドを登録できる環境では、ビルド後に `npm link` を実行すると `cmx` を利用できます。npmのグローバルprefixに書き込めない端末では管理者権限を要求せず、以下の `cmx` を **`node dist/cli.js` に置き換えて**利用してください。リポジトリ直下で実行します。

### 1. 認証と接続先登録

まだ認証していない場合。`work` はcmx内の別名、`company` はSlackのワークスペースのサブドメインです。

```sh
cmx login teams --name work --profile work
# テナントを明示する場合:
# cmx login teams --name work --profile work --tenant example.onmicrosoft.com
cmx login slack --name work --workspace company
```

ログイン操作は上流CLIに委譲します。Teamsのセッション値が必要になった場合も、手元の上流CLIの対話プロンプトにだけ入力してください。ChatGPT、Issue、コマンド引数には貼らないでください。ログインは対話端末限定で、`--json`・CIからの実行を拒否します。

既に上流ツールでログイン済みなら、再認証せずマッピングを登録できます。

```sh
cmx account add teams --name work --profile work
cmx account add slack --name work --workspace company
cmx doctor --json
```

`account add` は登録だけです。資格情報が有効かは `doctor` で確認します。Teams/Slackそれぞれに同じ `work` という別名を付けても衝突しません。追加アカウントには別名を使ってください。

### 2. 会話を見つけて登録

```sh
cmx channels --source all --json
cmx chats --source teams --json
```

一覧の `ref` をコピーします。ネイティブIDはURLエンコードされます。異なるサービス・アカウントの同名チャネルを勝手に同一視しません。

```sh
# 以下は形式例。実際には一覧に返ったrefをそのまま使う
cmx track add "teams/work/channel/19%3Aexample%40thread.tacv2"
cmx track add "slack/work/channel/C123"
cmx track list
```

登録時にメッセージを保存することはありません。`track remove <ref>` もローカル設定の変更だけで、サービス上の会話は削除しません。

### 3. 取得・検索

```sh
cmx messages "slack/work/channel/C123" --limit 50 --json
cmx search "障害対応" --since 7d --json
cmx search "release" --source slack --account work --limit 200 --json
cmx thread "slack/work/channel/C123" "1700000000.000001" --json
```

**`search` は全ワークスペース検索ではありません。** 登録した各会話から最大 `--limit` 件のページを取得し、その取得範囲に文字列・日時フィルターをかけます。`--since 7d` を指定しても7日分すべてを遡って取得するわけではありません。デフォルト100、最大500件／会話です。添付ファイルの内容や画像は検索しません。文字列はNFKC正規化＋大文字小文字を無視した部分一致で、正規表現やSlack検索構文ではありません。

### ページ送りとスレッド

Slack履歴・一覧は `coverage[].nextCursor` を返します。同じアカウント・会話で次ページを指定できます。自動全件走査はしません。

```sh
cmx messages "slack/work/channel/C123" --cursor "<nextCursor>" --json
cmx channels --source slack --account work --cursor "<nextCursor>" --json
```

Teams CLIは履歴カーソルを公開していないため、`--cursor` は明示的に未対応エラーになります。チャネル履歴は上流がスレッドを平坦化したページで、`--limit` が上流の投稿チェーン数として作用する場合もあるため、cmx側でも返却件数に上限を付けます。

Slack通常履歴では返信を自動展開しません。`thread` は親投稿を含む最初のページだけです。上流のスレッドコマンドがページ情報を落とすため、続きの有無は `null` です。Teams専用のスレッド取得は未対応です。

## 出力契約

`--json` はstdoutへ1つのJSONを出力します。ヘルプはテキストです。診断はstderrへ出します。

```json
{
  "schemaVersion": 1,
  "ok": false,
  "status": "partial",
  "data": [],
  "coverage": [],
  "errors": [
    { "code": "AUTHENTICATION", "message": "...", "source": "slack", "account": "work" }
  ]
}
```

上記は形式の例です。実際の部分成功では成功したサービスのデータ・coverageを保持します。成功件数がゼロでも、正常な検索結果ゼロと取得失敗を混同しません。

| フィールド | 意味 |
|---|---|
| `source`, `account`, `ref` | 出典サービス、接続先別名、元の会話 |
| `id`, `conversationId` | メッセージIDと会話ID。Slackの時刻IDは文字列のまま保持 |
| `createdAt` | 取得できればUTCのISO日時、不明なら `null` |
| `url` | 上流が実際に返したHTTPSリンクだけ。不明なら `null`。URLを推測生成しない |
| `coverage.fetched` / `returned` | 上流ページの取得件数と、重複除去・上限・フィルター後の件数 |
| `coverage.hasMore` | 続きあり `true`、明示的になし `false`、確認できない `null` |
| `coverage.complete` | 要求範囲を取り切れた根拠がある場合のみtrue。履歴・検索はfalse |
| `coverage.limitations` | スレッド未展開、ページ限定、日時不明の除外など |

日時フィルターがある場合、日時不明の投稿は除外して件数をcoverageへ記録します。Teams HTMLは検索用の簡易テキスト変換で、完全なHTMLレンダラーではありません。Slackのユーザーメンション等はネイティブ表記を保持し、ユーザー名の追加照会はしません。

| 終了コード | 意味 |
|---|---|
| 0 | 呼び出し成功。検索範囲が完全とは限らないのでcoverageを見る |
| 1 | バックエンド失敗、未対応など |
| 2 | 引数・設定エラー |
| 3 | 部分成功。成功データと失敗情報の両方を返す |
| 130 | 中断。途中に取得済みデータがあっても130 |

JSON出力だけを読んで終了コードを無視しないでください。レート制限・認証失敗後は同一アカウントへの追加取得を止め、他のサービスは継続します。

## 設定と安全性

`cmx config path` で保存先を確認できます。Windowsは `%LOCALAPPDATA%/convomux/config.json`、それ以外は `$XDG_CONFIG_HOME/convomux/config.json` または `~/.config/convomux/config.json`。`--config` または `CMX_CONFIG` で変更できます。

```json
{
  "schemaVersion": 1,
  "accounts": [
    { "source": "teams", "name": "work", "profile": "work" },
    { "source": "slack", "name": "work", "profile": "company" }
  ],
  "tracked": []
}
```

cmxに保存するのは上記のマッピングとrefだけです。資格情報の保護は上流ツールに依存し、特にTeamsのプロファイルJSONをcmxが暗号化するわけではありません。[SECURITY.md](SECURITY.md) を確認してください。会社での利用許可と管理者権限の不要性は別問題です。

環境変数のトークンは上流で指定プロファイルを上書きするため、cmxからは渡しません。名前付き保存済みプロファイルを使用します。取得結果をファイルにリダイレクトすれば、そのファイルには社内情報が含まれ得ます。cmxは汎用DLPではありません。

各バックエンド呼び出しは標準30秒（`--timeout` はミリ秒）、最大8 MiB。集約結果は最大32 MiB。アカウント32個、追跡会話100個まで。常駐処理、メッセージキャッシュ、テレメトリーはありません。同一コマンド内では上流呼び出しを直列化しています。Teamsの同一プロファイルを複数cmxプロセスや上流CLIから同時使用するのは避けてください。

### トラブルシューティング

- `DEPENDENCY_MISSING`: `teams` / `slk` がPATHにあるか確認。信頼した絶対パスを `account add ... --executable PATH` で指定可能。
- Windowsのnpm `teams.cmd` はシェル実行せず、隣接する `node_modules/msteams/dist/cli/index.mjs` に解決します。配置が違う場合はその `.mjs` の絶対パスを指定してください。任意の `.cmd` / `.bat` / `.ps1` は実行しません。
- `AUTHENTICATION`: 手元で再ログイン。トークンやプロファイルをIssueへ添付しないでください。
- `FORBIDDEN`: アカウント／組織の制約を確認。cmxは回避しません。
- `INVALID_RESPONSE`: 上流版や出力契約の変更を確認。生の応答・認証情報は自動表示しません。
- `CONFIG_LOCKED`: 同時編集または権限を確認。クラッシュ後にロックが残った場合は、cmxが実行されていないことを確認してから、表示した設定ファイルに隣接する `.lock` ファイルだけを手動で削除します。
- 既存の別名を別プロファイルへ付け替える操作は拒否します。別の接続先には新しい `--name` を使ってください。

## 開発・検証

```sh
npm ci --ignore-scripts
npm run check
npm pack
```

36件のテストはすべて合成データです。引数順、共通データ化、Unicode、タイムアウト、出力上限、設定更新、部分失敗、シェル文字、実プロセスからのCLI起動、npm形式のシンボリックリンク起動を検証します。CIはWindows/macOS/Linux × Node 22/24で実行します。**未検証**: 実ユーザーの認証、実サービスの応答差、SSO・条件付きアクセス、上流ツール自体のWindows資格情報ストレージ。

実環境の確認順は `doctor` → 各サービスの会話一覧 → 各1会話の履歴 → その2会話をtrackして検索です。成功した場合も全社検索・全期間取得を確認したことにはなりません。

公開前にライセンスと配布方針を決めるため、現在は `private: true` / `UNLICENSED` としています。npmには公開していません。
