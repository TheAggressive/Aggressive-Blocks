/**
 * Frontend asset budgets for the production build.
 *
 * Every script module and stylesheet a visitor can download must have a gzip
 * budget in bin/bundle-budgets.json, and stay within it. An asset with no
 * budget fails (a new block cannot skip one), and so does a budgeted file the
 * build no longer emits (a rename cannot slip past). View modules may import
 * only the Interactivity API and the plugin's own modules: pulling in React or
 * another @wordpress package costs far more than any byte budget allows.
 *
 * Usage: node bin/check-bundle-size.mjs [repository root]
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

/** Build outputs a visitor's browser can load. Editor bundles are excluded. */
const FRONTEND_ASSET =
  /^build\/(?:.+\/view\.js|.+\/style-index(?:-rtl)?\.css|interactivity\/[^/]+\.js|styles\/[^/]+\.css|blocks-interactivity\/[^/]+\.js)$/u;

function walk(directory, root, found = []) {
  if (!fs.existsSync(directory)) {
    return found;
  }
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolute, root, found);
    } else {
      found.push(path.relative(root, absolute).split(path.sep).join('/'));
    }
  }
  return found;
}

function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`^${escaped.replaceAll('*', '[^/]*')}$`, 'u');
}

/** Dependencies a view module's *.asset.php declares, read by PHP itself. */
function moduleDependencies(assetFile) {
  const output = execFileSync(
    'php',
    [
      '-r',
      '$asset = require $argv[1]; echo json_encode($asset["dependencies"] ?? array());',
      assetFile,
    ],
    { encoding: 'utf8' }
  );
  return JSON.parse(output).map(dependency =>
    typeof dependency === 'string' ? dependency : dependency.id
  );
}

/**
 * Check a build against its budgets.
 *
 * @param {string} root Repository root containing build/.
 * @param {{files: Record<string, number>, lazyChunks: {pattern: string, budget: number}, moduleDependencies: string[]}} budgets
 * @returns {{errors: string[], rows: {file: string, gzip: number, budget: number}[]}}
 */
export function checkBundles(root, budgets) {
  const errors = [];
  const rows = [];
  const assets = walk(path.join(root, 'build'), root).filter(file =>
    FRONTEND_ASSET.test(file)
  );
  const chunkPattern = globToRegExp(budgets.lazyChunks.pattern);

  if (assets.length === 0) {
    errors.push('build/ has no frontend assets. Run pnpm build first.');
    return { errors, rows };
  }

  for (const file of Object.keys(budgets.files)) {
    if (!assets.includes(file)) {
      errors.push(`${file} has a budget but the build no longer emits it.`);
    }
  }

  for (const file of assets) {
    const budget =
      budgets.files[file] ??
      budgets.files[file.replace(/-rtl\.css$/u, '.css')] ??
      (chunkPattern.test(file) ? budgets.lazyChunks.budget : undefined);
    const gzip = gzipSync(fs.readFileSync(path.join(root, file)), {
      level: 9,
    }).length;

    if (budget === undefined) {
      errors.push(
        `${file} (${gzip} B gzip) has no budget in bin/bundle-budgets.json.`
      );
      continue;
    }

    rows.push({ file, gzip, budget });
    if (gzip > budget) {
      errors.push(`${file} is ${gzip} B gzip, over its ${budget} B budget.`);
    }
  }

  const allowed = budgets.moduleDependencies.map(globToRegExp);
  for (const file of assets.filter(asset => asset.endsWith('/view.js'))) {
    const assetFile = path.join(root, file.replace(/\.js$/u, '.asset.php'));
    if (!fs.existsSync(assetFile)) {
      errors.push(`${file} has no .asset.php beside it.`);
      continue;
    }
    for (const dependency of moduleDependencies(assetFile)) {
      if (!allowed.some(pattern => pattern.test(dependency))) {
        errors.push(`${file} imports ${dependency} on the front end.`);
      }
    }
  }

  return { errors, rows };
}

function main() {
  const root = path.resolve(process.argv[2] ?? '.');
  const budgets = JSON.parse(
    fs.readFileSync(
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        'bundle-budgets.json'
      ),
      'utf8'
    )
  );
  const { errors, rows } = checkBundles(root, budgets);

  for (const { file, gzip, budget } of rows) {
    const share = Math.round((gzip / budget) * 100);
    console.log(
      `${String(gzip).padStart(6)} / ${String(budget).padStart(6)} B  ${String(share).padStart(3)}%  ${file}`
    );
  }

  if (errors.length > 0) {
    console.error(
      `\nFrontend asset budget check failed:\n- ${errors.join('\n- ')}`
    );
    process.exitCode = 1;
    return;
  }
  console.log(`\nFrontend asset budgets passed (${rows.length} files, gzip).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
