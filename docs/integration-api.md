# 外部参照API

別リポジトリのサーバー処理から、D1へ同期済みの家計集計を読み取るためのAPI。D1の保存形式と`/api/sync`は外部へ公開せず、家計簿側が既存画面と同じ計算規則を適用する。

初期利用者は`life`のローカルMCPを想定する。月次の費目別実績では対象月と収支種別に限定した個別明細を返す。書き込みとブラウザからの直接呼び出しは対象外。

## 認証

`life` MCPがリクエストごとにEd25519で署名した短命JWTを発行し、Bearer tokenとして送る。Cloudflare Zero TrustおよびService Tokenは使用しない。

```http
Authorization: Bearer <signed JWT>
```

Workerは、環境別に登録した公開JWKSだけを使って次を検証する。

- `alg`が`EdDSA`、公開鍵が`Ed25519`で、`kid`が登録済みJWKS内の鍵と一致すること
- `typ`が`JWT`であること
- `iss`が環境別の設定値と一致すること
- `aud`が環境別のhousehold API識別子と一致すること
- `sub`が`life-mcp`であること
- `scope`に`household:read`が含まれること
- `iat`から`exp`までが60秒以内で、許容する時計ずれが5秒以内であること
- `jti`が16〜128文字であること
- `htm`が実際のHTTPメソッド、`htu`がクエリを含む完全なリクエストURLと一致すること

秘密鍵は`life`側だけで保管し、本リポジトリ、Worker設定、ログへ保存しない。Workerには次の値を環境別に設定する。

| 名前 | 内容 |
| --- | --- |
| `INTEGRATION_JWKS` | `life`のEd25519公開鍵だけを含むJWKS JSON。秘密鍵パラメータ`d`を含めない |
| `INTEGRATION_JWT_ISSUER` | 環境別issuer。ステージングは`life-staging`、本番は`life-production` |
| `INTEGRATION_JWT_AUDIENCE` | 環境別audience。ステージングは`household-staging-integrations`、本番は`household-production-integrations` |
| `INTEGRATION_USER_ID` | APIが参照する家計簿利用者の固定ID |

値はステージングと本番で別々に設定する。

```bash
npx wrangler secret put INTEGRATION_JWKS --env staging
npx wrangler secret put INTEGRATION_JWT_ISSUER --env staging
npx wrangler secret put INTEGRATION_JWT_AUDIENCE --env staging
npx wrangler secret put INTEGRATION_USER_ID --env staging
```

本番は`--env staging`を外して設定する。`INTEGRATION_USER_ID`は対象環境の`sync_epochs.user_id`と一致させる。ステージングでは架空データの利用者だけを指定する。

### 資格情報のライフサイクル

- 発行: `life`側で環境ごとにEd25519鍵ペアを生成する。秘密鍵はGit管理外の保護された保存先へ直接登録し、公開JWKだけをhousehold側へ渡す。
- 保管: 秘密鍵をIssue、チャット、シェル履歴、本リポジトリへコピーしない。household側のJWKSは公開鍵だけを含む。
- 利用: `life` MCPは各HTTPリクエストの直前に新しい`jti`を持つJWTを生成する。JWTを永続保存しない。
- ローテーション: 新旧の公開鍵を一時的にJWKSへ併記し、`life`側を新しい`kid`へ切り替え、疎通確認後に旧公開鍵をJWKSから削除する。ステージングで先に実施する。
- 緊急失効: 対象公開鍵をWorkerの`INTEGRATION_JWKS`から削除する。全連携を止める場合は`INTEGRATION_JWKS`を削除し、`503 integration_unavailable`へ戻す。
- 定期確認: D1の`integration_api_audit`を確認し、使われていない公開鍵を削除する。

## 共通仕様

- `GET`のみ
- 通貨は`JPY`
- タイムゾーンは`Asia/Tokyo`
- 金額は整数円
- 成功・エラーとも`Cache-Control: no-store`
- CORSを許可しない
- 1資格情報あたり1分30リクエストまで
- 監査記録は呼び出し元、操作、対象月または日、HTTPステータス、時刻だけを90日間保持
- 認証失敗はD1へ記録せず、資格情報やJWTをWorkerログへ出力しない
- `dataUpdatedAt`は関連するD1同期レコードの最終更新時刻であり、別端末に残る未同期変更がないことは保証しない

エラーは`{"error":"<code>"}`形式で返す。

| HTTP | code | 意味 |
| --- | --- | --- |
| 400 | `invalid_month`, `invalid_date` | パラメータが不正、重複、余分、または未来 |
| 400 | `invalid_type` | 収支種別が`expense`または`income`ではない |
| 401 | `unauthorized` | 署名JWTがない、無効、期限切れ、scope不足、またはリクエストと不一致 |
| 404 | `not_found` | 未定義のパス |
| 405 | `method_not_allowed` | `GET`以外 |
| 409 | `data_unavailable` | 必須の同期データがまだない |
| 429 | `rate_limited` | 1分あたりの上限超過。`Retry-After: 60`を返す |
| 500 | `internal_error` | 内部データまたは処理の異常 |
| 503 | `integration_unavailable` | Workerの連携設定が未完了 |

## 月次収支

```http
GET /api/integrations/summary?month=2026-10
```

対象月は2000年1月から当月まで。当月は日本時間の当日まで、過去月は暦月全体を集計する。カレンダーの初期表示と同じく`normal`だけを含め、`settled`、`special`、資金移動、表示用の投資損益を除外する。

```json
{
  "currency": "JPY",
  "timeZone": "Asia/Tokyo",
  "calculationVersion": "household-integration-v1",
  "generatedAt": "2026-10-22T12:00:00.000Z",
  "dataUpdatedAt": "2026-10-22T11:59:00.000Z",
  "period": {
    "month": "2026-10",
    "start": "2026-10-01",
    "end": "2026-10-22",
    "complete": false
  },
  "inclusion": {
    "classifications": ["normal"],
    "transactionTypes": ["income", "expense"],
    "investmentProfit": false
  },
  "income": 300000,
  "expense": 120000,
  "net": 180000
}
```

## 月次費目別実績・明細

```http
GET /api/integrations/categories?month=2026-10&type=expense
```

`type`は`expense`または`income`だけを受け付ける。対象期間と集計区分は月次収支と同じで、当月は日本時間の当日まで、過去月は暦月全体、区分は`normal`だけとする。支出の費目合計はグラフ画面と同じ外税配賦を適用し、収入は取引金額を費目ごとに合計する。投資損益、資金移動、除外区分は含めない。

各費目には対象明細を日付の降順で含める。明細は日付、摘要、表示金額、口座、メモ、および同一月内で明細を識別するIDだけに限定し、内部の関連IDやシステム情報は返さない。外税取引では費目合計を正とし、明細ごとの表示金額は個別に端数処理するため、その単純合計と費目合計が端数分だけ異なる場合がある。

```json
{
  "currency": "JPY",
  "timeZone": "Asia/Tokyo",
  "calculationVersion": "household-integration-v1",
  "generatedAt": "2026-10-23T12:00:00.000Z",
  "dataUpdatedAt": "2026-10-23T11:59:00.000Z",
  "period": {
    "month": "2026-10",
    "start": "2026-10-01",
    "end": "2026-10-23",
    "complete": false
  },
  "inclusion": {
    "classifications": ["normal"],
    "transactionType": "expense",
    "investmentProfit": false
  },
  "total": 120000,
  "categories": [
    {
      "name": "食料品費",
      "total": 30000,
      "transactionCount": 1,
      "transactions": [
        {
          "id": "example-transaction-id",
          "date": "2026-10-20",
          "name": "買い物",
          "amount": 30000,
          "source": "銀行",
          "memo": ""
        }
      ]
    }
  ]
}
```

## 残高

```http
GET /api/integrations/balances?asOf=2026-10-22
```

対象日は2000年1月1日から日本時間の当日まで。総資産はカレンダーと同じく通常口座と投資評価額を含み、クレジットカード未払額は差し引かない。流動資産は現金、銀行、電子マネーの合計。クレジットカード未払額は正の値で別に返す。

```json
{
  "currency": "JPY",
  "timeZone": "Asia/Tokyo",
  "calculationVersion": "household-integration-v1",
  "generatedAt": "2026-10-22T12:00:00.000Z",
  "dataUpdatedAt": "2026-10-22T11:59:00.000Z",
  "asOf": "2026-10-22",
  "breakdownAvailable": true,
  "totalAssets": 1500000,
  "liquidAssets": 800000,
  "creditCardOutstanding": 50000,
  "accounts": [
    {
      "id": "bank",
      "name": "銀行",
      "kind": "bank",
      "balance": 800000,
      "outstanding": null,
      "includedInTotalAssets": true
    },
    {
      "id": "card",
      "name": "カード",
      "kind": "credit_card",
      "balance": null,
      "outstanding": 50000,
      "includedInTotalAssets": false
    }
  ]
}
```

開始基準日より前はアプリと同じ逆算総資産だけを返す。口座別内訳を正確に復元できないため、`breakdownAvailable`を`false`、`accounts`を空配列、`liquidAssets`と`creditCardOutstanding`を`null`にする。

無効化済み口座は、指定日時点で有効だった場合だけ内訳へ含める。

## ステージング確認

### 署名JWT構成

Cloudflare Zero Trustの初期設定は、カード登録と無料枠超過分の継続課金許可を必要とするため採用しない。Zero Trust organization、Access application、Service Tokenは作成しない。

ステージングAPI URLは`https://household-staging.ozw1504.workers.dev/api/integrations/*`、issuerは`life-staging`、audienceは`household-staging-integrations`とする。本番のissuer、audience、鍵ペアはステージングと分離する。

2026-10-22時点でステージングWorkerには4設定を投入済み。公開JWKSは`kid=life-staging-c26fe63b-723f-44db-a37e-47c362b57ab2`のEd25519公開鍵だけを含み、秘密鍵パラメータ`d`を含まないことを投入前に確認した。JWTなし、不正JWT、対象外パス、書き込みメソッドはいずれも認証段階で`401`となり、`Cache-Control: no-store`が付くことをレスポンス本文を記録せず確認済み。正規署名JWTによる結合試験は`life`側で実施する。

Worker側の設定は次の順序で投入する。4つすべてが揃うまでは`503 integration_unavailable`を維持する。

1. `life`側でステージング専用Ed25519鍵ペアを生成し、秘密鍵を保護された保存先へ登録する。
2. 公開JWKだけを受け取り、JWKS形式で`INTEGRATION_JWKS`へ設定する。
3. `INTEGRATION_JWT_ISSUER=life-staging`と`INTEGRATION_JWT_AUDIENCE=household-staging-integrations`を設定する。
4. ステージングD1の対象利用者IDを`INTEGRATION_USER_ID`へ設定する。

### 自動確認

検証スクリプトはステージングURL以外を拒否し、資格情報・レスポンス本文・金額・口座名を出力しない。

連携設定を意図的に不足させた環境では、閉鎖状態を確認する。

```bash
npm run test:integration:staging:closed
```

Worker設定後、ステージング用の秘密JWKをGit管理外のプロセス環境から渡す。対象月と基準日は架空データを画面で照合できる値を指定する。

```bash
HOUSEHOLD_API_BASE_URL=https://household-staging.ozw1504.workers.dev \
HOUSEHOLD_INTEGRATION_PRIVATE_JWK='<protected>' \
HOUSEHOLD_INTEGRATION_ISSUER='life-staging' \
HOUSEHOLD_INTEGRATION_AUDIENCE='household-staging-integrations' \
HOUSEHOLD_TEST_MONTH=YYYY-MM \
HOUSEHOLD_TEST_AS_OF=YYYY-MM-DD \
npm run test:integration:staging
```

レート制限は同じ資格情報を短時間ロックするため、通常確認がすべて完了した最後に一度だけ実行する。

```bash
HOUSEHOLD_TEST_RATE_LIMIT=1 npm run test:integration:staging
```

旧公開鍵をWorker JWKSから削除した後、旧秘密鍵をプロセス環境だけから渡して確認する。

```bash
npm run test:integration:staging:revoked
```

### 手動照合チェックリスト

1. `npm run db:seed:staging`でSTG接頭辞の架空データへ戻す。
2. ステージングPWAとAPIで対象月、基準日、通常区分だけを含める条件を揃える。
3. `summary`の収入、支出、収支がカレンダー初期表示と一致することを画面上で確認する。値をログやIssueへ転記しない。
4. `balances`の総資産と各口座残高が同じ基準日の資産画面と一致することを確認する。
5. 流動資産が現金・銀行・電子マネーだけの合計であること、投資が総資産に含まれること、カード未払額が総資産から差し引かれず別項目であることを確認する。
6. JWTなし、署名不正、期限切れ、scope不足、別URL用JWTが`401`、不正入力が`400`、`POST`が`405`、過剰呼び出しが`429`と`Retry-After: 60`になることを確認する。
7. Worker設定が不足する状態では`503 integration_unavailable`、旧公開鍵の削除後は旧秘密鍵で署名したJWTが`401`になることを確認する。
8. `integration_api_audit`とWorkerログに秘密鍵、JWT、レスポンス本文、金額、口座名が記録されていないことを確認する。

資格情報やレスポンス本文をシェル履歴、テストログ、Issueへ貼り付けない。

## 本番接続準備

本番ではステージングの鍵、issuer、audience、対象利用者IDを流用しない。接続契約は次の値で固定する。

| 項目 | 本番値 |
| --- | --- |
| API Base URL | `https://household.ozw1504.workers.dev` |
| issuer | `life-production` |
| audience | `household-production-integrations` |
| subject | `life-mcp` |
| scope | `household:read` |

対象APIは`GET /api/integrations/summary?month=YYYY-MM`、`GET /api/integrations/balances?asOf=YYYY-MM-DD`、`GET /api/integrations/categories?month=YYYY-MM&type=expense|income`だけとする。書き込み権限やブラウザ向けCORSは追加しない。

2026-10-23時点で、本番D1にAPIが必要とする同期済みレコードを持つ利用者が存在することを確認し、その利用者IDを外部へ開示せず`INTEGRATION_USER_ID`へ設定済み。本番専用の公開JWKSは、秘密鍵パラメータ`d`を含まず、`kid=life-production-c99f4215-4870-4fd3-8fdb-8b211af21980`のEd25519公開鍵だけを含むことを確認した。

公開JWKS、issuer、audience、対象利用者IDの4設定、D1監査テーブルのマイグレーション、連携APIの本番Worker反映は完了している。JWTなしの全対象APIが`401 unauthorized`、`Cache-Control: no-store`、CORS許可ヘッダーなしで応答することを、レスポンス本文を記録せず確認済み。残作業は`life`側からの少数回の署名付き読み取り試験だけである。本番では架空データ投入、レート制限の負荷試験、現行鍵の失効試験を行わない。
