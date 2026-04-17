# Zenn 投稿スタートガイド

このリポジトリで Zenn の記事を書いて公開するまでの流れを、初めての人向けに順番にまとめたメモです。

---

## 0. 前提と全体像

このリポジトリは「Zenn と GitHub 連携で記事を管理する」構成になっています。
記事の実体は `articles/<slug>.md` で、GitHub に push すると Zenn 側が自動で取り込み・公開してくれます。

```
┌──────────────┐   1. 原稿を作る     ┌──────────────┐
│   手元のメモ  │ ───────────────▶│ articles/     │
│ (md, txt…)   │   補助CLIで変換    │  *.md         │
└──────────────┘                    └──────┬───────┘
                                           │ 2. git push
                                           ▼
                                    ┌──────────────┐
                                    │   GitHub      │
                                    └──────┬───────┘
                                           │ 3. Zennが自動取込
                                           ▼
                                    ┌──────────────┐
                                    │   zenn.dev    │
                                    └──────────────┘
```

必要なもの:

- Node.js 18 以上
- このリポジトリを `git clone` 済みであること
- Zenn のアカウントと GitHub 連携設定が済んでいること（初回だけ）

> GitHub 連携のやり方は公式: <https://zenn.dev/zenn/articles/connect-to-github>

---

## 1. 初回セットアップ（最初の 1 回だけ）

```bash
# リポジトリのルートで
npm install
```

これで `zenn-cli` と `textlint` が使えるようになります。

動作確認:

```bash
npm run preview
```

ブラウザで `http://localhost:8000` が開けば OK。`Ctrl+C` で終了。

---

## 2. 記事を 1 本書く（推奨ルート：補助 CLI を使う）

下書きはお好きなエディタ（VS Code、メモアプリ、ChatGPT、Obsidian など）で
`.md` か `.txt` のファイルに書いてください。Zenn 固有の front matter は不要です。

書けたらリポジトリのルートで:

```bash
npm run article:from-draft
```

対話形式で以下を聞かれるので、順に答えます。

| 聞かれる項目 | 例 / 補足 |
|-------------|-----------|
| 原稿ファイルのパス | `/Users/you/Desktop/draft.md` または相対パス。`~` も使える |
| タイトル | 記事のタイトル（日本語OK） |
| emoji | 記事アイコン（1つ）。空Enterで 👏 |
| type | `tech`(技術記事) か `idea`(アイデア)。空Enterで `tech` |
| topics | カンマ区切り。例: `nextjs, react, typescript` |
| published | `y` で公開、空Enterで下書き |
| ファイル名 slug | 空Enterでランダム14文字を自動生成（推奨） |

答え終わると `articles/<slug>.md` が作られ、続けて

- `textlint` を実行しますか？ → 文章チェックが走る（任意で `--fix`）
- `zenn preview` を起動しますか？ → ブラウザで仕上がり確認

という流れまで 1 コマンドで完結します。

> CLI の細かい仕様は [`scripts/README.md`](../scripts/README.md) を参照。

---

## 3. 記事を 1 本書く（最小ルート：zenn-cli 純正）

下書きがなく、ゼロから書き始めたいときはこっち。

```bash
npm run new:article
```

で `articles/<ランダムslug>.md` が作られ、中は空の front matter + 空本文です。
あとは好きなエディタで中身を書くだけ。front matter の項目は以下:

```yaml
---
title: ""                  # タイトル
emoji: "👏"                # 絵文字1つ
type: "tech"               # tech: 技術記事 / idea: アイデア
topics: []                 # ["nextjs", "react"] のような配列
published: false           # true にすると公開
---
```

書きながら `npm run preview` しておくと、保存の度にブラウザが自動更新されます。

---

## 4. 文章チェックを走らせる

```bash
# 全記事に対して
npm run lint

# 自動修正できるものを直す
npm run lint:fix

# 特定の記事だけ
npx textlint articles/abcd1234ef5678.md
```

よく出る指摘と対処:

- 「二重否定は読みづらい」→ 素直な表現に書き換える
- 「弱い表現（〜かもしれない）は避けた方がよい」→ 断定 or 根拠を添える
- 「句読点の後にスペースがある」→ 全角文中は詰める

---

## 5. プレビューで見た目を確認する

```bash
npm run preview
```

- 画像・コードブロック・数式・埋め込み（YouTube/Twitter等）が本番に近い形で見える
- 保存すると自動リロード
- 複数記事あるときは左メニューで切り替え

---

## 6. 公開する

Zenn の GitHub 連携が設定済みなら、**push するだけで Zenn が自動取り込みしてくれます**。

```bash
git add articles/<slug>.md
git commit -m "新しい記事: <タイトル>"
git push origin main
```

確認ポイント:

- front matter の `published: true` になっていること（`false` のままだと Zenn 上に出ません）
- GitHub 上でコミットが反映されていること
- 数十秒〜数分で zenn.dev 側に記事が現れます

あとから直したいときは同じファイルを編集して、もう一度 `git push` すればOK。
Zenn 側も差分で更新してくれます。

---

## 7. よくあるハマりどころ

| 症状 | 原因 / 解決 |
|------|-------------|
| `zenn: command not found` | `npm install` をまだ実行していない。ルートで実行する |
| プレビューに記事が出ない | ファイル名が Zenn の slug 規則違反。補助CLIを使うか `zenn new:article` で作り直す |
| 画像が表示されない | `articles/` と同階層の `images/<slug>/xxx.png` に置き、`![](/images/<slug>/xxx.png)` で参照 |
| 公開されない | front matter `published: false` のまま / push し忘れ |
| textlint の指摘が大量に出る | まず `npm run lint:fix` で自動修正、残りは優先度の高いものだけ直す |
| slug を変えたい | ファイル名（`<slug>.md`）を rename するだけでOK。ただし公開済みの場合 URL が変わるので注意 |

---

## 8. 参考リンク

- Zenn 公式 CLI ガイド: <https://zenn.dev/zenn/articles/zenn-cli-guide>
- Markdown 記法: <https://zenn.dev/zenn/articles/markdown-guide>
- GitHub 連携: <https://zenn.dev/zenn/articles/connect-to-github>
- textlint: <https://github.com/textlint/textlint>
