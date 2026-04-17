# scripts/

Zenn 記事執筆を補助するローカル用スクリプト集です。

---

## `new-from-draft.js` — 原稿ファイルから記事を作る対話型CLI

別の場所（VS Code・メモアプリ・ChatGPT・Obsidian など）で書いた下書き `.md` / `.txt` を
読み込み、対話形式で front matter を付けて `articles/<slug>.md` として保存します。
そのまま textlint → zenn preview まで一気通貫で走らせられます。

### TL;DR

```bash
npm run article:from-draft
```

聞かれる項目に答えるだけ。できあがったファイルを `git push` すれば Zenn に公開されます。

---

### 実行例（一問一答のログ）

```console
$ npm run article:from-draft

===========================================
 Zenn 記事下書き取り込みツール
===========================================

原稿ファイルのパス (.md / .txt): ~/Desktop/drafts/nextjs-tips.md
  → 読み込み成功 (4,321 文字)

タイトル: Next.js 15 で地味に便利になった3つのこと
emoji (絵文字1つ、空で 👏): 🧩
type [tech/idea] (空で tech): tech
topics (カンマ区切り、例: nextjs, react, typescript): nextjs, react, frontend
published (y=公開 / N=下書き、空でN): y
ファイル名 slug (空で自動生成 / a-z0-9-_ で12〜50文字):
  → 自動生成: 8f2a1b9c0e3d4f

✅ 保存しました: articles/8f2a1b9c0e3d4f.md

textlint を実行しますか？(Y/n): y

--- textlint ---
textlint: 問題なし ✨

zenn preview を起動しますか？(Y/n): y

--- zenn preview を起動します（Ctrl+C で終了）---
👀 Preview on http://localhost:8000
```

---

### 入力項目リファレンス

| 項目 | 型 / 制約 | 空入力時 | 備考 |
|------|-----------|---------|------|
| 原稿ファイルのパス | 存在するファイル | 再質問 | `~` 展開 / 相対・絶対 / クオート除去に対応 |
| タイトル | 任意文字列 | 空のまま保存 | YAMLにそのまま `"..."` 形式で書き出し |
| emoji | 絵文字1つ | `👏` | Zenn のアイコン表示に使われる |
| type | `tech` or `idea` | `tech` | それ以外は再質問 |
| topics | カンマ区切り文字列 | `[]` | 各要素は `"..."` で囲まれた YAML 配列になる |
| published | `y` / それ以外 | `false` | `y` のみ `true` |
| slug | `a-z0-9-_` で 12〜50文字 | 自動生成（14桁hex） | 違反入力は再質問 |

---

### 既存の front matter 付き原稿

原稿の先頭に既に `---` で囲まれた front matter がある場合は、
**自動で剥がしてから新しい front matter を付け直します**。

例えばこんな原稿でも:

```markdown
---
title: "古いタイトル"
emoji: "🧪"
type: "tech"
topics: []
published: false
---

# 本文スタート
```

CLI 対話で入力した内容で上書きされ、本文だけが引き継がれます。

---

### 既存ファイルとの衝突

同名の `articles/<slug>.md` がすでにある場合は、上書き確認プロンプトが出ます:

```
  → articles/my-article.md は既に存在します。上書きしますか？(y/N):
```

デフォルトは「上書きしない（キャンセル）」なので安全です。

---

### textlint の扱い

保存後に `npm run lint` 相当を対象ファイルだけに対して走らせます。

- 警告なし → `textlint: 問題なし ✨` と表示して次へ
- 警告あり → `--fix で自動修正を試みますか？(y/N)` を聞かれる
  - `y` → `npx textlint --fix <file>` が走る（機械的に直せるものだけ修正）
  - `N` → そのまま次へ

> textlint の設定は `.textlintrc` に依存します。ルールが未設定だと
> `No rules found` と出ますが、処理は継続します。

---

### zenn preview の扱い

最後に `zenn preview` を起動するかを聞かれます。

- `y` (デフォルト) → `npx zenn preview` が立ち上がり、ブラウザで確認できる
- `n` → CLI終了

プレビューを終わらせるときは通常通り `Ctrl+C` です。

---

### コマンドライン引数

現状は引数なしで対話モードのみ。将来、`--title` や `--published` をフラグで
渡せるようにする要望があれば追加予定です。

---

### ファイル構造（参考）

このスクリプトが生成する front matter のテンプレート:

```yaml
---
title: "（入力したタイトル）"
emoji: "（入力した絵文字）"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["（入力したトピック群）"]
published: false
---

（原稿本文）
```

---

### 内部挙動メモ（トラブル時に読む）

- **slug バリデーション**: 半角英小文字・数字・ハイフン・アンダースコアのみ。12〜50文字。
  大文字や空白を含めた場合は自動的に小文字化・ハイフン置換される。
- **slug 自動生成**: `crypto.randomBytes(7).toString('hex')` による14文字hex。
  Zenn 公式の `zenn new:article` と同等。
- **パス展開**: `~` はホームディレクトリに展開。両端のシングル/ダブルクオートは除去。
- **非TTYでの挙動**: stdinパイプ実行でも動くよう、行をキュー消費する形に実装。

---

### よくある質問

**Q. 画像も取り込んでほしい**
今はテキストだけ対応。`images/<slug>/` に手動で画像を置いて、本文中で
`![](/images/<slug>/foo.png)` のように参照してください。将来的にドラッグ&ドロップ取込を
追加することも可能です。

**Q. 間違えたやり直したい**
生成された `articles/<slug>.md` を削除（または edit）して、再度 `npm run article:from-draft`。
slug を変えずに上書きしたければ同じ slug を入力すれば上書き確認が出ます。

**Q. published を true にするのが怖い**
最初は空Enter（下書き）で作って、プレビューで確認してから front matter を直接書き換えて
`true` にするのが安全です。GitHub に push したタイミングで Zenn に公開されます。

**Q. 毎回 preview を開きたくない**
最後のプロンプトで `n` を入力すれば起動せずに終了します。

**Q. CLI そのものをカスタマイズしたい**
本体は `scripts/new-from-draft.js`（300行ほどの単一ファイル）。
追加依存は無く、Node.js 標準モジュールだけで動きます。

---

## 他の既存スクリプト（`package.json`）

| コマンド                      | 用途                                       |
|------------------------------|--------------------------------------------|
| `npm run preview`            | `zenn preview` を起動（ローカルプレビュー）|
| `npm run new:article`        | 空のテンプレ記事を作成（zenn-cli 純正）    |
| `npm run new:book`           | 空のテンプレ本を作成（zenn-cli 純正）      |
| `npm run article:from-draft` | ← このドキュメントの対話型CLI              |
| `npm run lint`               | 全記事に textlint をかける                 |
| `npm run lint:fix`           | 自動修正可能な箇所を直す                   |

より広い使い方（初回セットアップ〜GitHub連携での公開まで）は
[`docs/getting-started.md`](../docs/getting-started.md) を参照してください。
