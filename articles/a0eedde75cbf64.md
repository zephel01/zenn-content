---
title: "壊れ方には家系がある — 6 モデル×修復器 3 世代の実測で tool call 修復の限界に触れた話"
emoji: "👏"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["\"llm\"", "\"ollama\"", "\"claudecode\"", "\"python\"", "\"toolcalling\""]
published: false
---

# 壊れ方には家系がある — 6 モデル×修復器 3 世代の実測で tool call 修復の限界に触れた話

> **TL;DR**: 前話（zenn-09）で作った tool call 修復ベンチを、今度は「壊れやすい」と評判のモデル群に横断適用した。6 モデル × 直結/経由 × 100 リクエスト。結果、**0%→100% がさらに 2 例**（qwen2.5-coder:1.5b、mistral:7b）、phi4-mini は **0%→80%**。しかも途中でやらかした「古い CLI で serve していた」事故のおかげで、**修復器 3 世代（v2.7.0 / v2.7.1 / R4）の効果が 1 段ずつ単離された A/B データ**が手に入った。観測した未対応の失敗形は Gemma / Mistral / phi4 の 3 ファミリーで独立に出現する「**呼び出し構文族**」── `echo(message: 'demo')` のような関数呼び出し風テキスト ── で、これを 1 機構で吸収する R4 修復器を実装（敵対レビュー 2 巡で実装バグ 2 件と偽陽性反例 8 件を潰した）。オフライン recall **78.0% → 100%**、偽陽性 **0/25 維持**。修復では原理的に救えない gemma4 の空応答 20% は、**per-request 空応答フォールバック**で 80%→100% に。すべて同日に **v2.7.2 / v2.7.3** としてリリース済み。数値の一次データは[リポジトリの benchmarks/tool-repair/results/](https://github.com/zephel01/CodeRouter/tree/main/benchmarks/tool-repair) にある。Zenn 連作第 10 話。

---

## あらすじ — Zenn 第 10 話です

| 話 | 内容 |
|---|---|
| 第 1 話 | 同じモデルで動く/動かないが分かれる理由（失敗モード 6 分類） |
| 第 2 話 | CodeRouter アーキテクチャの内側 |
| 第 3 話 | ログを観測の単一ソースにする（observability） |
| 第 4 話 | auto-router の rule-based 分類器設計 |
| 第 5 話 | PyPI 公開で名前を取られた話 |
| 第 6 話 | v1.10.0 を 2 日で出した話 |
| 第 7 話 | v2.1.0 で 6 系統障害を 4 つ潰した話 |
| 第 8 話 | Ollama v0.23.1 の Anthropic API 互換を実機検証した話 |
| 第 9 話 | 壊れた tool call はどこまで直せるか ── 修復器の定量カバレッジを測る |
| **第 10 話 (本記事)** | **壊れ方には家系がある ── 6 モデル×修復器 3 世代で限界を測る** |

本記事は note 版（v1-saga 第 24 話）の技術詳細版です。note 版が「直せる壊れ方と直してはいけない壊れ方」の考察に重点を置くのに対し、本記事は**モデルマトリクスの設計、版数 A/B の顛末、失敗形の解剖、R4 修復器の実装と敵対レビュー 2 巡、空応答フォールバックの設計**を書きます。

前話（zenn-09）の宿題は 3 つでした。①gemma4 の空応答 20% を per-request フォールバックで救う。②残り 1% の失敗形（`<tools><function name=.../>` ネスト）のコーパス化と対応。③実例の収集。本話で①②を回収し、③は予想外の形で果たされます ── **壊れやすいモデルを自分で集めて、壊させた**。

---

## 検証環境

| 項目 | 値 |
|---|---|
| 実機 | M3 Max (Apple Silicon) |
| バックエンド | Ollama（`localhost:11434`、OpenAI 互換エンドポイント） |
| 経由 | CodeRouter v2.7.0 / v2.7.1 / feature/tool-repair-r4（順に付け替え） |
| プロトコル | 直結 = OpenAI wire、経由 = Anthropic wire（`/v1/messages`） |
| 条件 | temperature=0、5 プロンプト × 20 反復 = 各セル 100 リクエスト、エラー 0 |
| 検証日 | 2026-07-05 |
| 一次データ | `benchmarks/tool-repair/results/`（版数別は `archive-v2.7.0/`, `archive-v2.7.1/`） |

## 検証の構造 — 3 つの問いに答える

L3 と呼んでいるこの計測は、前話の L2（3 モデル）を「壊れやすい」と評判のモデル群へ拡張したものです。答えたい問いは 3 つ。

1. **修復層の一般化**: qwen2.5-coder:7b で実証した 0→100 は、他系統（Llama / Mistral / phi4）でも成立するか
2. **修復不能クラスの定量化**: 空応答のような「直すテキストが無い」失敗はどれだけあり、fallback で救えるか
3. **偽陽性ゲートの実地検証**: 修復層は壊れたモデル相手でも「拾ってはいけないもの」を拾わないか

モデル選定はコミュニティの評判ベース（text-JSON 癖の Llama 系、コマンド風テキストの Mistral 系、restraint 失敗の phi4-mini、既知の空応答持ち gemma4）。**評判は仮説であって結果ではない**ことが、後で効いてきます。

---

## 罠 1 — gemma3:27b は tools capability を持っていなかった

最初の脱落者は計測開始前に出ました。gemma3:27b は直結・経由とも **100/100 リクエスト全部エラー**（直結 400 / 経由 502）。

```
$ ollama show gemma3:27b
  Capabilities
    completion
    vision        # ← tools が無い
```

Ollama の gemma3 ビルドは tools capability 非対応で、`tools` フィールド付きリクエストを 400 で弾く。経由側の 502 はその 400 の包み直しで、ルーターの故障ではない。**モデル選定時は `ollama show` の Capabilities を先に見る**。gemma 系の比較対象は tools 対応の gemma4:26b に切り替えました。

副産物として設計課題も 1 個見つかっています ──「provider がツール非対応 → 400 → 502 を 100 回素通し」は、後述の空応答フォールバック（空の 200 が対象）でも救えない。capability の事前検知 or 4xx フォールバックは次の承認単位です。

## 罠 2 — 古い CLI で serve していた（そして事故が A/B データになった）

初回の経由計測で妙な結果が出ました。phi4-mini の `simple_echo`、応答本文はこう:

```
```json
{"name": "echo", "parameters": {"message": "probe"}}
```
```

`parameters` は R2（v2.7.1 の修復器強化）で対応済みの別名キーで、**repo の main なら確実に修復できる形**です。サンドボックスで同じ文字列を `repair_tool_calls_in_text` に直接通すと修復 OK。なのにライブでは素通しされている。

原因は serve していたバイナリでした。

```
$ which coderouter
/Users/.../.local/bin/coderouter    # → uv tool 版
$ coderouter --version
coderouter 2.7.0                     # ← R1-R3 が入る前
```

`uv tool install` した CLI は `uv tool upgrade` するまで古いままです。repo は 2.7.1 なのに、ベンチは 2.7.0 で走っていた。

ここで全部捨てて再計測 ── とはしませんでした。**v2.7.0 の結果は「旧修復器の実測」としてラベルを付け直し、v2.7.1 で再計測して並べる**。すると版数間の差分が、修復器の強化段階（R2 の別名キー対応）だけに帰属する A/B データになる。事故は事故ですが、ラベリングさえ正しければ証拠になります。以後ベンチの手順書は `uv run coderouter serve`（repo のコードで起動）を必須にしました。

---

## 結果 — 修復器 3 世代 × 6 モデル

経由（CodeRouter）の native 率。直結は修復器を持たないクライアントから見た「使える tool call」の率です。

| model | 直結 | v2.7.0 | v2.7.1 (R1-R3) | **v2.7.2 (R4)** |
|---|:-:|:-:|:-:|:-:|
| qwen2.5-coder:7b | 0% | **100%** | 100% | 100% |
| qwen2.5-coder:1.5b | 0% | **100%** | 100% | 100% |
| mistral:7b | 0% | 80% | 80% | **100%** |
| phi4-mini:3.8b | 0% | 20% | **40%** | **80%** |
| llama3.2:3b / llama3.1:8b | 100% | 100% | 100% | 100% |
| qwen3-coder:30b | 100% | 100% | 100% | 100% |
| gemma4:26b | 80% | 80% | 80% | 80% |

出典: `benchmarks/tool-repair/results/`（`archive-v2.7.0/`, `archive-v2.7.1/`, `*_coderouter-r4.*`）

読みどころは 4 つ。

1. **0→100 の一般化**: qwen2.5-coder:1.5b は 100/100 リクエスト全部が ```json フェンスの text-JSON。修復無しでは完全に使用不能、経由で全回収。7b と合わせて 0→100 はサイズ非依存になった
2. **phi4-mini の階段**: 20% → 40%（R2 の別名キー）→ 80%（R4 の呼び出し構文族）。**各強化が +20pt / +40pt として単離**されている。罠 2 の事故が無ければこの表は書けなかった
3. **負の結果も結果**: llama3.2:3b / 3.1:8b は temperature=0・単 turn では全く壊れない。「壊れやすい」の評判はこの条件では再現しなかった。壊すにはデフォルト温度・multi-turn・低 quant が要る（次の計測軸）
4. **gemma4 の 80% は世代不変**: 残り 20% は空応答で、修復器の世代をいくら上げても動かない。ここは修復の外の話 ── 後述

## 失敗形の解剖 — 「呼び出し構文族」の発見

R4 前に残っていた fail の本文を並べます。

mistral:7b（`no_tool_temptation` 20/20、両経路とも）:

```
The `echo` function echoes back the provided message.

```
echo(message: 'demo')
```
```

phi4-mini（`complex_args` 20/20）:

```
write_note({"path":"notes/日本語.txt","text":"line1\ndefine("quotes", 1234) and a comma, plus {braces}\n"})
```

事前予想（Mistral はコマンド風 `echo --message probe` を吐くはず）は外れました。実際に出たのはコロン区切りの**関数呼び出し風テキスト**。そして気づきます ── これ、既に 2 回見ている。Gemma 系の ```tool_code フェンス（`print(default_api.echo(message="probe"))`）、そして phi4 の `write_note({JSON})`。

- Gemma: `echo(message="probe")` ── Python kwargs
- Mistral: `echo(message: 'demo')` ── コロン区切り（Ruby/Swift 風）
- phi4: `write_note({"path": ...})` ── JSON オブジェクト引数（JS 風）

**3 つの独立したモデルファミリーが、同じ「ツール名 + 括弧 + 引数リスト」の変種を吐いている。** 特定モデルの癖ではなく、学習データに大量にある呼び出し構文が滲み出る LLM 共通のイディオムと見るべきで、モデル別対応を 3 個作るのではなく**1 つの形クラス**として実装するのが正解 ── これが R4 の設計判断です。

もう 1 つ、phi4 の例は中身をよく見ると **内部 JSON 自体が壊れている**（引用符のネスト崩壊）うえに、指示した文字列 `with "quotes"` が `define("quotes", 1234)` に**改変**されている。形は直せても意味が壊れている。これは後で効いてくる境界です。

---

## R4 修復器 — 3 クラスを追加し、偽陽性 0% を守る

既存の設計原則は前話から不変です: **偽陽性 0% を recall より優先。allowed_tool_names の名前一致を必須とし、許可リストに無い名前は何があっても修復しない。**

追加した 3 クラス（`coderouter/translation/tool_repair.py`、stdlib のみ、シグネチャ不変）:

- **R4a — nested-XML 名前属性形**: `<tools><function name="echo" arguments='{...}'/></tools>`。タグ名でなく `name` 属性を allow-list 照合。呼びタグは既知の固定集合に限定
- **R4b — JSON エンベロープ形**: `{"tool_calls": [...]}` / 旧 `{"function_call": {...}}`（文字列 arguments は二重パース）。**内部要素が 1 つでも allow-list 外なら全体拒否**（all-or-nothing）
- **R4c — 呼び出し構文族**: フェンス内 or 独立行の `name(...)` を 1 パーサで。引数 3 スタイル（`key=value` / `key: value` / `{JSON}`）、`print()` / `default_api.` ラッパー許容。**引数の完全パース成功が必須** ── phi4 の壊れた内部 JSON は修復しない。形だけ直して壊れた引数でツールが実行される方が有害だから

コーパスは 55→76 件に拡張してから実装（テストファースト）。「例示 cue が付いた同じ表面形」（negative）と「実データのコロン形」（positive）を両方置き、**両立できなければ negative が勝つ**ルールも先に決めておきました。

## 敵対レビュー 2 巡 — ベンチが green でも穴はある

実装は Opus サブエージェント、レビューは Sonnet サブエージェントに敵対的にやらせました。これが 2 回とも実弾を当ててきます。

**1 巡目（APPROVE with nits）**: 例示 cue ガードが固定フレーズ辞書のみで、言い換えに弱い。実証された偽陽性反例が 5 件 ──「The calling convention is as follows:」「Here's a sample response payload you might receive:」等は辞書に無いので素通しで修復されてしまう。加えて cue 検出窓が直前 80 文字しかなく、長い前置き行で cue が窓から外れる。→ 反例 6 件を negative としてコーパスに固定し、語彙拡充+窓 200 文字化で対応。

**2 巡目（REQUEST CHANGES）**: 修正版に対して、さらに深い実装バグを 2 件実証してきました。

```
"Here is a sample payload:\n{...}"      → 抑止される(正常)
"Here is a sample payload:\n\n{...}"    → 修復される(バグ)  # 空行 1 本で FP 判定が反転
```

原因は 2 つ。cue 正規表現の末尾アンカーが文字列末尾固定で、prefix が空行で終わると照合部が 0 文字に潰れる。さらに「直前非空行チェック」の `lines.pop()` が無条件実行で、オブジェクトが行頭にある場合に **cue 行そのものを捨てていた**（off-by-one）。**ベンチの negative が全部「改行 1 本」で書かれていたため、この欠陥は green の陰に隠れていた** ── ベンチ自体のカバレッジ不足でもあります。空行バリアントを negative に追加してから修正しました。

最終形の数値:

| 指標 | before (R1-R3) | **after (R4)** |
|---|:-:|:-:|
| L1 総合 recall | 46/59 = 78.0% | **59/59 = 100%** |
| nested_xml / json_wrappers / python_call | 0/5・1/4・0/5 | **5/5・4/4・5/5** |
| 偽陽性（negative 25 件、レビュー反例 8 件込み） | 0 | **0** |
| pytest | 1503 passed | **1553 passed**（+50、回帰ゼロ） |

出典: `benchmarks/tool-repair/results/results_offline.md`（84 件コーパス）

既知のトレードオフも 1 つ明記しておきます。コロン終端のリード文（「I'll call it now:」のような正当な宣言）+ フェンス呼び形も抑止されます。偽陽性 0% 優先の意図的な判断で、docstring に書いてあります。

## R4 後のライブ再計測 — 設計境界がそのまま数字に出た

- **mistral:7b: 80% → 100%**。コロン形 20/20 を R4c が回収。0→100 の 3 例目
- **phi4-mini: 40% → 80%**。R4c が呼び出し構文形 +40pt を回収。**残り 20% は全件、例の「内部 JSON 崩壊+引数改変」ケース** ── 意図的に修復しないと決めた境界そのもの

phi4 の per-prompt 表は象徴的です。形が直せるプロンプトは 20/20 native、意味が壊れるプロンプトは 20/20 fail。**中間がない**。修復層は「形」の層であって「意味」の層ではない、という設計境界が、そのままライブデータに描かれました。

---

## 空応答は fallback の仕事 — 三層構図の完成

gemma4:26b の残り 20% は `no_tool_temptation` での**空の 200 応答**（20/20、直結でも経由でも）。直すテキストが存在しないので、修復器の世代をいくら上げても 80% から動きません。既存の drift guard（`empty_response_rate`）は窓集計なので、単発の空ターンを in-flight では救えない。

そこで `FallbackChain.empty_response_action: off | warn | fallback`（デフォルト off、完全後方互換）を実装しました。**コンテンツ基準**（tool_use 無し・非空白テキスト無し。`usage.output_tokens` は backend により信頼できないので使わない）で空を判定し、検出した瞬間に同一リクエストを chain の次 provider へ再ディスパッチ。streaming は最初の実コンテンツまでイベントをバッファし、非観測のまま終端したら破棄して次へ。

gemma4:26b → qwen3-coder:30b の chain で実測:

| model | 直結 | 経由(単一 provider) | **経由(chain + fallback)** |
|---|:-:|:-:|:-:|
| gemma4:26b | 80% | 80% | **100%** |

空応答 20/20 を全回収、エラー 0。出典: `results/results_live_gemma4_26b_anthropic_chain.md`

これで前話から積み上げてきた**三層構図**が、全部実測で埋まりました。

1. **壊れた形は修復で救う** ── qwen2.5-coder 1.5b/7b・mistral 0→100、phi4 0→80
2. **健全なモデルは劣化させない** ── qwen3-30b・llama3.2/3.1 で 100→100
3. **修復不能（空応答・意味崩壊）は fallback の領分** ── gemma4 chain 80→100

同日に **v2.7.2**（R4 修復器 + コーパス 84 件）と **v2.7.3**（空応答フォールバック + L3 ベンチ資産）としてリリースしました。CHANGELOG に数値ごと載っています。

---

## メタ教訓

連作の教訓（抜粋）: diagnostic ツール自身も diagnostic され続ける必要がある（2 話）/「対応している」の中身を分解しないと正しい道具を選べない（10 話）/ 自分のコア機能ほど体感でなく数字で疑え（9 話）。

第 10 話の教訓:

> **壊れ方はモデル単位ではなく「形クラス」単位で対応せよ。3 ファミリーが独立に同じイディオムを吐くなら、それは個体の癖ではなく族の性質。そしてベンチが green でも、ベンチのカバレッジ自体を敵対的に疑え ── 空行 1 本の盲点は、レビューに実弾を撃たせて初めて見つかった。**

## 追試のしかた

ベンチ一式（84 件コーパス・L1/L2 ハーネス・全結果・版数アーカイブ・CI ゲート）は公開済み: https://github.com/zephel01/CodeRouter/tree/main/benchmarks/tool-repair

```bash
git clone https://github.com/zephel01/CodeRouter && cd CodeRouter

# L1(オフライン・決定的)
python benchmarks/tool-repair/run_offline.py

# L3 マトリクス一括(Ollama + CodeRouter を起動してから)
uv run coderouter serve --port 8088 --config benchmarks/tool-repair/providers.bench.yaml
bash benchmarks/tool-repair/bench_l3_p1.sh          # REPS=5 でスモーク、P2=1 で拡張
```

本体は Python 3.12+、ランタイム依存 5 個（fastapi / uvicorn / httpx / pydantic / pyyaml）、今回も依存追加ゼロ。

## 次の話

残る計測軸は「llama を壊す条件」── デフォルト温度・multi-turn（tool result 後の崩壊）・低 quant。ハーネス側に `--stream` / `--multi-turn` を足してからになります。あとは capability 事前検知（gemma3 の 400 素通し問題）。数字が出たら、良かろうが悪かろうがそのまま書きます。

---

CodeRouter 本体: https://github.com/zephel01/CodeRouter

```bash
uvx --from coderouter-cli coderouter serve --port 8088
ANTHROPIC_BASE_URL=http://localhost:8088 ANTHROPIC_AUTH_TOKEN=dummy claude
```
