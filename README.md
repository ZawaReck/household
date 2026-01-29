# Household（家計簿）
（このREADMEは大部分がCodexにより作成されています．）

React + TypeScript + Vite で作成した，個人向けの家計簿アプリです．高校時代より家計簿アプリを利用していたのですが，自身の環境が変化するにつれて機能の不足を段々感じるようになってきました．もっと良いサービスに乗り換えようにもデータは引き継げないし，自分にしか刺さらないが欲しい機能があるしで自作家計簿を作りたいとずっと思っていたので，現在 AI を活用しながら作成中です．
月次の収支をダッシュボードで俯瞰しながら，支出・収入・資金移動を入力できます．PWA 対応で，オフラインでも利用可能です．データベース対応はまだしていません．

## 主な機能

- 月次カレンダー表示（当月の各日の収入/支出を表示，月切り替え対応）
- 月次サマリー（In / Out / Total）と繰越・残高の表示
- 取引履歴の一覧（日時ごとにグルーピング，スワイプで削除）
- 入力フォーム（Out / In / Move のタブ切替）
- 支出のレシート入力（仮登録 → 一括登録）
- 外税トグルと税率（0/8/10%）対応，外税の場合は自動で「外税」調整行を追加
- 日付・拠出元・移動先のホイールピッカー
- データはブラウザの `localStorage` に保存（キー: `transactions`）

## 画面構成
- カレンダー，月次サマリー
- 履歴
- 入力フォーム

## 取引データの概要

`Transaction` の内容（`src/types/Transaction.ts`）．

- `type`: `expense` | `income` | `move`
- `amount`: 金額（正の数）
- `date`: `YYYY-MM-DD`
- `name`: 摘要
- `category`: 支出/収入カテゴリ
- `source`: 拠出元（move の場合は移動元）
- `destination`: 移動先（move のみ）
- `memo`: メモ
- `groupId`: レシート入力のグルーピング
- `taxMode`: `inclusive` | `exclusive`（支出のみ）
- `taxRate`: `0 | 8 | 10`（支出のみ）
- `taxBaseAmount`: 税別の元金
- `isTaxAdjustment`: 外税調整行かどうか

## 使い方（開発）

```bash
npm install
npm run dev
```

### その他のスクリプト

```bash
npm run build
npm run preview
npm run lint
```

## 技術スタック

- React 19
- TypeScript
- Vite
- react-router-dom
- vite-plugin-pwa

## ディレクトリ構成（主要）

- `src/App.tsx`: ルーティングと状態管理（localStorage 永続化）
- `src/components/`
  - `DashboardPage.tsx`: 3カラム構成のメイン画面
  - `CalendarView.tsx`: 月次カレンダー
  - `SummaryView.tsx`: 月次集計
  - `TransactionHistory.tsx`: 履歴表示（スワイプ削除）
  - `InputForm.tsx`: 入力フォーム（外税/レシート対応）
  - `DateWheelPicker.tsx`: 日付ピッカー
  - `WheelPickerInline.tsx`: セレクト系のホイールUI
- `src/types/Transaction.ts`: 取引データ型
- `src/utils/date.ts`: 日付処理ユーティリティ
- `public/`: PWA アイコン

## 注意点

- 現時点ではデータはブラウザの `localStorage` に保存されるため，別端末や別ブラウザ間で同期されません．
- 外税モードでは，グループ内の支出を税別で保持し，表示時に税込へ換算します．必要に応じて「外税」調整行が自動作成・更新されます．

