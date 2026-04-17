<!--
============================================================
 Zenn チュートリアル記事テンプレート（tech）
------------------------------------------------------------
 特定のテーマを「読んだ人が手を動かして完成させられる」形式
 で解説する記事向け。
 使い方: このファイルをコピーして中身を書き換え、
         npm run article:from-draft で取り込み。
============================================================
-->

<!-- ▼ リード：何を作るのか / 完成イメージを先に見せる -->
この記事では **〇〇** をステップバイステップで作っていきます。
完成すると △△ ができるようになります。

![完成イメージ](/images/<slug>/demo.gif)
*実際に動かしたところ*

:::message
**この記事の前提**
- 所要時間: 約N分
- 対象読者: 〇〇を触ったことがある人
- 動作環境: macOS 〇〇 / Node 〇〇 / 〇〇 v〇〇
:::

## この記事のゴール

- [ ] 〇〇 をセットアップできる
- [ ] △△ を自分で拡張できる状態になる
- [ ] ×× の仕組みがなんとなく分かる

## 必要なもの

| 項目 | バージョン | 備考 |
|------|-----------|------|
| Node.js | 18.x 以上 | |
| 〇〇 CLI | 1.x | `npm i -g 〇〇` |
| アカウント | 〇〇 | 無料プランでOK |

## 完成版リポジトリ

先に結論が見たい人向け:
https://github.com/username/repo-name

---

## Step 1: プロジェクトを作る

<!-- 各Stepの書き方:
     1. やることを1行で宣言
     2. コマンド or コード
     3. 期待される結果 / スクショ
     4. 補足（ハマりやすい点があれば）
-->

プロジェクトを初期化します。

```bash
mkdir my-app && cd my-app
npm init -y
npm install 〇〇
```

成功すると `package.json` に 〇〇 が入ります:

```json:package.json
{
  "dependencies": {
    "〇〇": "^1.0.0"
  }
}
```

:::details Windows の場合
PowerShell では `mkdir` は動きますが `&&` は環境によります。`;` で繋ぐか 2 行に分けてください。
:::

## Step 2: 最小構成を動かす

`src/index.ts` を作ります:

```ts:src/index.ts
import { hello } from "〇〇";

hello("world");
```

実行:

```bash
npx tsx src/index.ts
```

期待される出力:

```
Hello, world!
```

## Step 3: 機能を追加する

ここから △△ を拡張していきます。

```diff ts:src/index.ts
  import { hello } from "〇〇";

- hello("world");
+ hello("Zenn reader");
+ hello("another user");
```

:::message alert
**注意**: `〇〇` はステートフルなので、2回目以降の呼び出しで挙動が変わります。詳しくは後のステップで解説します。
:::

## Step 4: テストを書く

```ts:src/index.test.ts
import { describe, it, expect } from "vitest";
import { hello } from "〇〇";

describe("hello", () => {
  it("returns greeting", () => {
    expect(hello("Zenn")).toBe("Hello, Zenn!");
  });
});
```

```bash
npx vitest
```

## Step 5: 仕上げ / デプロイ

<!-- ここに公開・リリース系のコマンドを書く -->

```bash
npm run build
npm run deploy
```

---

## トラブルシューティング

:::details `Cannot find module '〇〇'` と出る
`npm install 〇〇` を実行していない、もしくは Node のバージョンが古い可能性があります。`node -v` で 18 以上か確認してください。
:::

:::details 途中で動かなくなった
Step 2 まで戻って `npx tsx src/index.ts` が通るか確認してみてください。途中のコードは上の完成版リポジトリと比較できます。
:::

## まとめ

- Step1〜5 で 〇〇 を使った △△ が作れた
- 特に重要なのは **Step3 の ×× のところ**
- 次のステップとしては □□ を追加してみると面白い

## 次に読むと良い記事

https://zenn.dev/zenn/articles/〇〇

## 参考リンク

- [公式ドキュメント](https://example.com)
- [ソースコード](https://github.com/username/repo-name)

<!--
============================================================
 Zenn記法チート（必要なものだけ残して他は削除）

 :::message / :::message alert   → メッセージ/警告ボックス
 :::details タイトル              → 折りたたみ
 ```ts:filename.ts               → ファイル名付きコード
 ```diff ts                       → 差分表示
 https://... を1行で             → リンクカード
 @[youtube](ID) / @[tweet](URL)   → 埋め込み
 ![alt](path) *caption*           → 画像 + キャプション
 @[toc]                           → 目次
============================================================
-->
