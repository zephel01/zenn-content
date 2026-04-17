#!/usr/bin/env node
/**
 * Zenn 記事下書き取り込みツール
 *
 * 別途用意した原稿ファイル (.md / .txt) を読み込み、
 * 対話形式で front matter を付与して articles/ 配下に保存する。
 *
 * 実行:
 *   npm run article:from-draft
 *   または
 *   node scripts/new-from-draft.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ARTICLES_DIR = path.join(ROOT, 'articles');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: process.stdin.isTTY === true,
});

// 非TTY（パイプ入力）の場合、readlineは入力行を先読みするため
// rl.question や rl.once('line') では取りこぼしが発生する。
// line イベントをキューに溜め、ask() が消費する形にしておく。
const lineQueue = [];
const waiters = [];
let rlClosed = false;

rl.on('line', (line) => {
  if (waiters.length > 0) {
    const resolve = waiters.shift();
    resolve(line);
  } else {
    lineQueue.push(line);
  }
});
rl.on('close', () => {
  rlClosed = true;
  while (waiters.length > 0) {
    const resolve = waiters.shift();
    resolve('');
  }
});

function ask(q) {
  process.stdout.write(q);
  if (lineQueue.length > 0) {
    return Promise.resolve(lineQueue.shift());
  }
  if (rlClosed) {
    return Promise.resolve('');
  }
  return new Promise((resolve) => waiters.push(resolve));
}

// ------------------------------------------------------------------
// ヘルパ
// ------------------------------------------------------------------

/**
 * Zenn の slug (ファイル名) 規則: a-z, 0-9, -, _ の 12〜50 文字。
 * ランダムな 14 文字 hex を生成 (CLI の `zenn new:article` と同等)。
 */
function generateSlug() {
  return crypto.randomBytes(7).toString('hex');
}

/**
 * ユーザー入力の slug を Zenn 規則に合わせて整形・検証。
 * 合致しない場合は null を返す。
 */
function sanitizeSlug(input) {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
  if (s.length < 12 || s.length > 50) return null;
  return s;
}

/**
 * "a, b, c" -> '["a", "b", "c"]'
 */
function toYamlArray(str) {
  const items = str
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  if (items.length === 0) return '[]';
  return '[' + items.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(', ') + ']';
}

/**
 * チルダ (~) を展開してパスを解決。
 */
function resolveUserPath(input) {
  let p = input.trim();
  // ドラッグ&ドロップでシングル/ダブルクオートや前後空白が付くことへの対策
  p = p.replace(/^['"]|['"]$/g, '');
  if (p.startsWith('~')) {
    p = path.join(os.homedir(), p.slice(1));
  }
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

/**
 * 既存の front matter (先頭の --- … ---) を剥がして本文だけを返す。
 */
function stripFrontMatter(body) {
  if (!/^---\s*\n/.test(body)) return { body, hadFrontMatter: false };
  // 2 つ目の --- を探す
  const match = body.match(/^---\s*\n[\s\S]*?\n---\s*(\n|$)/);
  if (!match) return { body, hadFrontMatter: false };
  return {
    body: body.slice(match[0].length).replace(/^\n+/, ''),
    hadFrontMatter: true,
  };
}

// ------------------------------------------------------------------
// メイン
// ------------------------------------------------------------------

async function main() {
  console.log('');
  console.log('===========================================');
  console.log(' Zenn 記事下書き取り込みツール');
  console.log('===========================================');
  console.log('');

  // 1. 原稿ファイル -------------------------------------------------
  let draftPath;
  while (true) {
    const input = (await ask('原稿ファイルのパス (.md / .txt): ')).trim();
    if (!input) {
      console.log('  → パスを入力してください。');
      continue;
    }
    draftPath = resolveUserPath(input);
    if (!fs.existsSync(draftPath)) {
      console.log(`  → ファイルが見つかりません: ${draftPath}`);
      continue;
    }
    if (fs.statSync(draftPath).isDirectory()) {
      console.log('  → ディレクトリではなくファイルを指定してください。');
      continue;
    }
    const ext = path.extname(draftPath).toLowerCase();
    if (ext !== '.md' && ext !== '.txt') {
      const cont = (
        await ask(`  → 拡張子が ${ext || '(なし)'} ですが続行しますか？(y/N): `)
      )
        .trim()
        .toLowerCase();
      if (cont !== 'y') continue;
    }
    break;
  }

  const raw = fs.readFileSync(draftPath, 'utf8');
  const { body: cleanBody, hadFrontMatter } = stripFrontMatter(raw);
  if (hadFrontMatter) {
    console.log('  → 既存の front matter を検出したので上書きします。');
  }
  const charCount = cleanBody.length;
  console.log(`  → 読み込み成功 (${charCount.toLocaleString()} 文字)`);
  console.log('');

  // 2. メタデータ ---------------------------------------------------
  const title = (await ask('タイトル: ')).trim();

  let emoji = (await ask('emoji (絵文字1つ、空で 👏): ')).trim();
  if (!emoji) emoji = '👏';

  let type;
  while (true) {
    const t =
      (await ask('type [tech/idea] (空で tech): ')).trim().toLowerCase() ||
      'tech';
    if (t === 'tech' || t === 'idea') {
      type = t;
      break;
    }
    console.log('  → tech か idea を入れてください。');
  }

  const topicsInput = (
    await ask('topics (カンマ区切り、例: nextjs, react, typescript): ')
  ).trim();
  const topicsYaml = toYamlArray(topicsInput);

  const pubAns = (await ask('published (y=公開 / N=下書き、空でN): '))
    .trim()
    .toLowerCase();
  const published = pubAns === 'y' ? 'true' : 'false';

  // 3. slug (ファイル名) -------------------------------------------
  let slug;
  while (true) {
    const input = (
      await ask('ファイル名 slug (空で自動生成 / a-z0-9-_ で12〜50文字): ')
    ).trim();
    if (!input) {
      slug = generateSlug();
      console.log(`  → 自動生成: ${slug}`);
      break;
    }
    const s = sanitizeSlug(input);
    if (!s) {
      console.log(
        '  → Zenn規則違反: 英小文字/数字/ハイフン/アンダースコアの 12〜50 文字にしてください。'
      );
      continue;
    }
    slug = s;
    break;
  }

  // 4. 保存 --------------------------------------------------------
  if (!fs.existsSync(ARTICLES_DIR)) {
    fs.mkdirSync(ARTICLES_DIR, { recursive: true });
  }
  const outPath = path.join(ARTICLES_DIR, `${slug}.md`);

  if (fs.existsSync(outPath)) {
    const ow = (await ask(`  → ${path.relative(ROOT, outPath)} は既に存在します。上書きしますか？(y/N): `))
      .trim()
      .toLowerCase();
    if (ow !== 'y') {
      console.log('キャンセルしました。');
      rl.close();
      return;
    }
  }

  const frontMatter =
    '---\n' +
    `title: "${title.replace(/"/g, '\\"')}"\n` +
    `emoji: "${emoji}"\n` +
    `type: "${type}" # tech: 技術記事 / idea: アイデア\n` +
    `topics: ${topicsYaml}\n` +
    `published: ${published}\n` +
    '---\n\n';

  // 本文末尾に改行を1つ保証
  const bodyWithNewline = cleanBody.endsWith('\n') ? cleanBody : cleanBody + '\n';
  fs.writeFileSync(outPath, frontMatter + bodyWithNewline);
  console.log('');
  console.log(`✅ 保存しました: ${path.relative(ROOT, outPath)}`);
  console.log('');

  // 5. textlint ----------------------------------------------------
  const lintAns = (await ask('textlint を実行しますか？(Y/n): '))
    .trim()
    .toLowerCase();
  if (lintAns !== 'n') {
    console.log('');
    console.log('--- textlint ---');
    const res = spawnSync('npx', ['textlint', outPath], {
      stdio: 'inherit',
      cwd: ROOT,
    });
    if (res.status !== 0) {
      const fixAns = (
        await ask('\n警告があります。--fix で自動修正を試みますか？(y/N): ')
      )
        .trim()
        .toLowerCase();
      if (fixAns === 'y') {
        spawnSync('npx', ['textlint', '--fix', outPath], {
          stdio: 'inherit',
          cwd: ROOT,
        });
        console.log('--fix を実行しました。残った警告は手動で確認してください。');
      }
    } else {
      console.log('textlint: 問題なし ✨');
    }
  }

  // 6. preview -----------------------------------------------------
  const prevAns = (await ask('\nzenn preview を起動しますか？(Y/n): '))
    .trim()
    .toLowerCase();
  rl.close();

  if (prevAns !== 'n') {
    console.log('');
    console.log('--- zenn preview を起動します（Ctrl+C で終了）---');
    const child = spawn('npx', ['zenn', 'preview'], {
      stdio: 'inherit',
      cwd: ROOT,
    });
    child.on('close', (code) => process.exit(code ?? 0));
  } else {
    console.log('\n完了しました。');
  }
}

main().catch((err) => {
  console.error(err);
  rl.close();
  process.exit(1);
});
