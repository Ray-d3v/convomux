# ConvoMux

**Slack は検証済みの修正版だけを実行します。** Windows x64 / macOS arm64・x64 は同梱 slk `0.2.0+cmx.1` の由来・バイナリSHAを照合し、平文保存・読込と別activeアカウントへの fallback を禁止します。検証できない部品・override は `CREDENTIAL_STORAGE_BLOCKED`、永続保存に未対応の Linux は認証・読込を `UNSUPPORTED` で停止します。Teams、help/version、設定登録、オフライン診断は維持します。[パッチとビルドの根拠](docs/PATCHED_BACKENDS.md)を参照してください。

Teams / Slack をひとつのコマンド `cmx` から読む、ローカルの読み取り専用CLIです。認証・非公式APIは既存の msteams / slk に委譲します。AI、BYOK、Copilot、MCP、メッセージ送信・編集・削除は提供しません。

**v0.1.0 / experimental、npm未公開。** Node.js 22 / 24 と npm が必要です。本体ライセンスは所有者承認済みの MIT です。npmアカウントは未作成、公開名・scope は未確定で、公開は別途承認が必要です。公開までは以下の検証済みローカルtgzを使います。実アカウントのログイン・SSO・MFAは本人が行う前提で、CIの成功は実ログイン成功を意味しません。

## 導入と更新

配布用tgzには、固定版のTeams CLIと5環境分のSlackバイナリを含めます。利用者による teams / slk の別途インストール、Rust / Bun / Git、ビルド、バックエンド用PATH設定は不要です。インストールスクリプトを無効にしても利用できます。初回実行時の部品取得も行いません。

```sh
# 公開前: 開発・CIで生成して検証したファイルを指定
npm install -g --ignore-scripts ./ray-d3v-convomux-0.1.0.tgz
cmx --help
cmx --version
```

更新も新しい検証済みtgzを同じ方法で導入します。本体と内部部品を一括で入れ替え、アカウント設定・ログイン情報は利用者領域に保持します。グローバルprefixの書込権限がない場合は、[ユーザー領域prefixの手順](docs/RELEASING.md)を使ってください。

所有者が npmアカウントを作成し、公開名・scope の権利を確認して公開を承認・実施した後は、`npm install -g <confirmed-package-name>@latest` で導入・更新できます。package.json の `@ray-d3v/convomux` は現在の候補名で、権利・登録・利用可能性は未確認です。公開リポジトリや MIT の採用は、npm公開の実施承認とは別です。

| 内部部品 | 固定版 | 配布方式 |
|---|---|---|
| [msteams](https://github.com/nakasyou/teams-api) | npm 0.2.1 | npm依存ツリーをtgzに同梱し、Nodeの実行パスから `dist/cli/index.mjs` を直接起動 |
| [slk](https://github.com/osodevops/slack-cli) | v0.2.0 / `f8ce5c0d3ecb12602cbeb0469c555ce47eeccbf1` + 管理パッチ `0.2.0+cmx.1` | CIで固定ソース・パッチからWindows/macOS版をビルドし、由来とSHAを検証して同梱。Linuxは固定musl版のhelp/versionのみ |

Slack の認証・読込に対応するのは Windows x64、macOS arm64 / x64 です。Linux x64 / arm64 の同梱musl版はhelp/versionのみで、揮発性kernel keyringが永続保存要件を満たさないため認証を停止します。Windows arm64等の未対応CPUも明確に診断し、別アーキテクチャへ切り替えません。実vault・実ログイン・最小OS条件は別途の許可された端末検証が必要です。[検証記録](docs/VALIDATION.md)を参照してください。

Windows上流バイナリには `VCRUNTIME140.dll` / Windows UCRT の実行要件があります。MSIや標準CIでの起動確認と、ポータブルNodeだけを置いた最小Windowsでの動作は別です。所有者による前提確認または再配布権を確認したランタイム同梱が公開前の残課題です。

明示的な `--executable ABSOLUTE` 設定は保持します。Slackは対象OSの検証済みネイティブバイナリと同じSHAのコピーだけを実行し、任意のJS/旧版/未検証部品は拒否します。Teamsは従来の信頼されたローカル指定を維持します。標準ではPATH上のteams/slkやWindowsの.cmdシムに依存しません。子プロセスは引数配列・shell:falseで起動します。

出典・アーカイブと展開後バイナリのSHA-256・確認した契約は [backend-contracts.json](backend-contracts.json)、著作権・ライセンスは [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) にあります。

レビュー候補の取得・SHA-256確認・導入・更新は [候補版の手順](docs/INSTALL_CANDIDATE.md) を参照してください。PRが示すActions artifactにはtgz、SHA256SUMS、導入手順と配布資料が含まれます。最初に未補完とした12依存の公開資料調査・表記補完は完了し、[依存表記の根拠](docs/DEPENDENCY_NOTICES.md)に所有者の決定事項と分けて記録しています。

## 初回ログインと前提条件

Slack を検討する前に `cmx doctor --storage --json` で同梱版の由来・SHA・対応条件を確認してください。これはユーザー設定・アカウント・資格情報・OS 保存庫を読まず、通信やバックエンド起動もしない診断です。**終了コード1は意図した結果**で、実際のOS保存庫や本人のアカウントを確認した意味ではありません。修正版の fallback 禁止と、別途必要な端末の保存庫利用可否・組織方針の確認を区別してください。[保存仕様](docs/CREDENTIAL_STORAGE.md)、[パッチとビルド](docs/PATCHED_BACKENDS.md)を参照し、未対応・未検証の部品は使わないでください。

```sh
cmx login teams --name work --profile work
# テナントを指定する場合
cmx login teams --name work --profile work --tenant example.onmicrosoft.com
# 検証済み修正版を同梱するWindows/macOSのみ。実ログインは本人が別途許可された端末で行う
cmx login slack --name work --workspace company
cmx doctor --json
```

ログインは対話端末で本人が完了します。`--json` / 非対話実行では拒否します。組織の利用許可・SSO・MFA・端末制限はそのまま適用されます。セッショントークン等をコマンド引数、チャット、Issue、テストへ貼らないでください。Teamsで追加のセッション入力が必要な場合は、手元の上流CLIが示す対話手順を使用します。

Slackのブラウザーログインには、上流が検出できるChrome/Chromiumと対話デスクトップが必要です。cmxはブラウザーを追加取得しません。上流はブラウザーのタイトル等から保存ワークスペース名を決めるため、サブドメインと異なる場合があります。cmxはログインのJSON応答で返された安全な保存名を登録します。既存の別アカウントへの付替えは拒否します。

Teamsの資格情報は従来どおり `~/.teams-cli/` のJSONで、cmxは暗号化や移行を追加しません。Slackの修正版は既存keyringの安全な永続OS保存を要求し、Windows Credential Manager / macOS Keychainの保存・読込エラーで失敗します。平文ファイルの読込・書込や別activeアカウントへの暗黙切替は行いません。古い平文情報の移行・削除・再ログインは自動実行しません。Linuxのkernel-only構成は未対応です。[安全性とパッチの詳細](docs/PATCHED_BACKENDS.md)、[SECURITY.md](SECURITY.md)を参照してください。

すでに上流の保存プロファイルがある場合は、再認証せず登録できます。

```sh
cmx account add teams --name work --profile work
cmx account add slack --name work --workspace "Example Workspace"
cmx doctor --json
```

`account add` は登録のみです。Teams/Slackそれぞれで同じ別名を使えます。追加アカウントには別の `--name` を使ってください。

## 会話の一覧・取得・検索

```sh
cmx channels --source all --json
cmx chats --source teams --json
# 一覧が返したrefをそのまま使用（以下は形式例）
cmx track add "teams/work/channel/19%3Aexample%40thread.tacv2"
cmx track add "slack/work/channel/C123"
cmx track list
cmx messages "slack/work/channel/C123" --limit 50 --json
cmx search "障害対応" --since 7d --json
cmx search "release" --source slack --account work --limit 200 --json
cmx thread "slack/work/channel/C123" "1700000000.000001" --json
```

`track remove <ref>` はローカルの検索対象登録を外すだけで、サービス側の会話を削除しません。メッセージ本文は設定に保存しません。

**searchは全ワークスペース検索ではありません。** 明示登録した会話ごとに最大 `--limit` 件の1ページだけ取得し、取得範囲へ文字列・日時のローカルフィルターを適用します。デフォルト100、最大500件/会話です。`--since 7d` でも7日分を遡り切る保証はありません。NFKC正規化と大文字小文字を無視した部分一致で、正規表現やSlack検索構文ではありません。添付ファイル本文・画像は検索しません。メンション等は上流表記を保持し、追加照会しません。

Slackは `coverage[].nextCursor` を返した場合、同じアカウント・会話へ明示的に次ページを要求できます。

```sh
cmx messages "slack/work/channel/C123" --cursor "<nextCursor>" --json
cmx channels --source slack --account work --cursor "<nextCursor>" --json
```

全件の自動走査はしません。Teamsの履歴カーソル・専用スレッド取得は未対応です。Teamsチャネルは上流がスレッドを平坦化するため、cmxでも返却件数を制限します。Slackの通常履歴は返信を自動展開せず、threadは親投稿を含む最初の1ページだけです。上流がthreadのページ情報を落とすため継続有無は `null` です。

## JSONと取得範囲

`--json` のstdoutは1つのJSONオブジェクトです（helpを除く）。診断はstderrです。スキーマ、部分失敗、範囲制限は既存契約を維持しています。

```json
{"schemaVersion":1,"ok":false,"status":"partial","data":[],"coverage":[],"errors":[{"code":"AUTHENTICATION","message":"...","source":"slack","account":"work"}]}
```

| フィールド | 意味 |
|---|---|
| source / account / ref | 出所、アカウント別名、ネイティブIDをURLエンコードした会話識別子 |
| id / conversationId | ネイティブID。Slackの時刻IDは文字列を維持 |
| createdAt / url | 確認できたUTC ISO時刻とHTTPSリンクのみ。不明ならnull |
| coverage.fetched / returned | 上流ページ件数と重複排除・制限・フィルター後の件数 |
| hasMore / nextCursor | 継続ありtrue、明示的にないfalse、不明null |
| complete / limitations | 要求範囲を取り切れた根拠がある場合のみtrue。検索・履歴はfalse |

成功した他サービスのデータは部分失敗でも保持します。レート制限・認証失敗後は同じアカウントへの追加取得を止めます。日時不明のデータは日時フィルターから除外してcoverageに記録します。Teams HTMLは簡易テキスト変換です。

終了コード: 0=呼出成功、1=バックエンド失敗/未対応、2=引数/設定、3=部分失敗、130=中断。0でも全件取得を意味しません。JSONだけでなく終了コードとcoverageを確認してください。

## 更新通知

対話実行では公開npmの `latest` を最大1日1回、別プロセスで確認します。通常処理は通信を待ちません。通知は次回以降の起動でキャッシュからstderrに出し、`npm install -g <package.jsonの公開名>@latest` を案内します。適切なSemVer比較を行い、プレリリース候補の通知やダウングレードはしません。プレリリース利用者へ新しい安定版を案内する場合があります。プログラムは自動変更しません。

`--json`、CI、非対話実行では、通知・キャッシュ操作・更新通信をすべて無効化します。環境変数 `CMX_NO_UPDATE_NOTIFIER=1` または `NO_UPDATE_NOTIFIER=1` で完全に無効化できます。未公開、通信失敗、タイムアウト、書込権限不足でも本処理を失敗させません。失敗した確認も1日キャッシュします。

送るのは固定した公開npm URLへのパッケージ名によるGETだけです。メッセージ本文・資格情報・アカウント情報・npm認証は送信しません。受信サイズ64KiB、ワーカー寿命4秒です。更新キャッシュはWindowsの `%LOCALAPPDATA%/convomux/updates.json`、他環境の `$XDG_CACHE_HOME/convomux/updates.json` または `~/.cache/convomux/updates.json` に保存します。

## 設定・制限・診断

`cmx config path` で保存場所を確認できます。設定はWindowsの `%LOCALAPPDATA%/convomux/config.json`、他環境の `$XDG_CONFIG_HOME/convomux/config.json` または `~/.config/convomux/config.json`。`--config` / `CMX_CONFIG` で変更できます。インストール先には保存しません。設定更新は原子的・ロック付きです。

環境資格情報 `SLK_TOKEN` / `SLK_COOKIE` / `SLK_WORKSPACE` / `ESTSAUTHPERSISTENT` / `REFRESH_TOKEN` と `SLK_API_BASE_URL` はバックエンドに渡さず、`SLK_ALLOW_WRITE=false` を強制します。同じTeamsプロファイルの更新競合を避けるため、1呼出内のバックエンド操作は直列です。複数cmx/上流CLIで同じプロファイルを同時使用しないでください。

各バックエンド呼出は標準30秒（`--timeout` はミリ秒、最大300000）、出力最大8MiB。集約最大32MiB、32アカウント・100追跡会話までです。常駐同期・メッセージキャッシュはありません。人間向け出力は端末エスケープを除去しますが、JSON利用側は会話本文を信頼できないデータとして扱ってください。

- `DEPENDENCY_MISSING`: 正しいtgzを再導入するか、明示指定の絶対パスを確認。
- `CREDENTIAL_STORAGE_BLOCKED` / `CREDENTIAL_STORAGE_UNAVAILABLE` / `CREDENTIAL_PROFILE_UNAVAILABLE`: 未検証・改ざんされた部品、OS保存エラー、要求profileの読込失敗を拒否します。平文や別activeアカウントへは fallback しません。`doctor --storage` はOS保存庫を調べないため、診断自体は意図して非ゼロを返します。[保存仕様](docs/CREDENTIAL_STORAGE.md)を参照してください。
- `UNSUPPORTED`: 同梱対象OS/CPUまたは機能の範囲を確認。アーキテクチャの自動代替はしません。
- `AUTHENTICATION` / `FORBIDDEN`: 本人の端末で再ログイン、または組織・アカウントの権限確認。制限は回避しません。
- `INVALID_RESPONSE`: 固定バックエンドとの契約を確認。生の認証・応答情報はIssueへ貼らないでください。
- `CONFIG_LOCKED`: 並行実行や権限を確認。クラッシュ後の設定lockは、実行中プロセスがないことを確認してから隣接する `.lock` だけを手動確認してください。更新通知のlockが残る場合も通知だけが無効になり、本処理は続きます。

## 開発・配布検証

```sh
npm ci --ignore-scripts
npm run check
# 上流取得工程をオフラインテストから分離
npm run backends:prepare
npm run backends:verify
npm pack
npm run package:smoke
```

単体・結合テストは合成データでオフラインです。パッケージ検証は空のnpmキャッシュ、隔離ホーム、NodeだけのPATH、空白・日本語を含むパスで `--offline --ignore-scripts` によるローカル/一時グローバル導入を行い、実cmxシムと本物のTeams help / slk help・versionを起動します。ライセンス・部品の梱包漏れも検出します。モックだけで導入成功とは判定しません。

汎用tgzの生成はLinux CIで行います。Windowsの `npm pack` はUnix部品の実行権限を失うためprepackで拒否し、配布検証でもtgz内の権限を確認します。Windows開発環境ではbuild/checkを実行し、CIから取得したtgzを `npm run package:smoke -- PATH` で検証してください。

既存のWindows/macOS/Linux × Node22/24テストを維持し、別ジョブで5環境 × Node22/24の同一tgzのネイティブ起動を確認します。未実行・失敗・実ログイン未確認は [検証記録](docs/VALIDATION.md) に区別します。公開手順・Trusted Publishing・所有者の残作業は [RELEASING.md](docs/RELEASING.md) を参照してください。`private:true` / `UNLICENSED` は所有者判断まで維持しています。

## ライセンスと公開状態

ConvoMux 本体は [MIT License](LICENSE) です（2026-10-25 所有者承認）。著作権表記 `Ray` は初期コミットの既存 author 名に基づきます。msteams、slk、同梱する依存の権利・ライセンスはそれぞれの [第三者表記](THIRD_PARTY_NOTICES.md) と vendor/licenses/ に従い、本体の MIT へ置き換えません。

`private: true` は維持しています。npmアカウントは未作成、公開名・scope は未確定です。公開・tag・Release・merge・アカウント登録・権限設定はこの変更では行いません。[公開準備の残作業](docs/RELEASING.md) を参照してください。実保管庫、実ログイン・SSO/MFA、最小Windows runtime の未検証事項も引き続き残ります。
