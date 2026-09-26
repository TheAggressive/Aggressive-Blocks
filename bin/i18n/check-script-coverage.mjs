#!/usr/bin/env node
/**
 * Fail when a built editor script's strings are missing from the POT.
 *
 * The POT drift check compares the committed POT with a regenerated one, so
 * it passes whenever both are wrong the same way. It passed for months with
 * no script strings at all, because make-pot never scanned build/. This check
 * measures the outcome instead: every built script that calls an i18n
 * function with the plugin text domain must be referenced by the POT, and
 * every script the POT references must still exist.
 *
 * Usage:
 *   node bin/i18n/check-script-coverage.mjs [pot-file]
 *
 * Defaults to languages/aggressive-blocks.pot. Run after `pnpm build`.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import fg from 'fast-glob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DOMAIN = 'aggressive-blocks';

/**
 * Whether minified script source passes the plugin domain to an i18n call.
 *
 * Built output keeps the domain as the call's last argument, e.g.
 * `(0,o.__)("Close","aggressive-blocks")`. Block names such as
 * "aggressive-blocks/modal" do not match because the quote must close.
 *
 * @param {string} source Built script source.
 * @returns {boolean}
 */
export function usesPluginDomain(source) {
  return new RegExp(`["'\`]${DOMAIN}["'\`]\\s*\\)`).test(source);
}

/**
 * Script paths referenced by `#:` lines in a POT.
 *
 * @param {string} pot POT source.
 * @returns {Set<string>} Repository-relative paths ending in .js.
 */
export function referencedScripts(pot) {
  const scripts = new Set();
  for (const line of pot.split('\n')) {
    if (!line.startsWith('#: ')) continue;
    for (const ref of line.slice(3).trim().split(/\s+/u)) {
      const file = ref.replace(/:\d+$/u, '');
      if (file.endsWith('.js')) scripts.add(file);
    }
  }
  return scripts;
}

/**
 * Coverage problems between built scripts and a POT.
 *
 * @param {Record<string, string>} scripts Built script path → source.
 * @param {string} pot POT source.
 * @returns {string[]} Human-readable problems.
 */
export function findCoverageProblems(scripts, pot) {
  const referenced = referencedScripts(pot);
  const problems = [];

  for (const [file, source] of Object.entries(scripts)) {
    if (usesPluginDomain(source) && !referenced.has(file)) {
      problems.push(`${file} calls i18n functions but has no POT entries.`);
    }
  }

  for (const file of referenced) {
    if (!(file in scripts)) {
      problems.push(`POT references ${file}, which the build did not emit.`);
    }
  }

  return problems;
}

function main() {
  const potPath = path.resolve(
    process.argv[2] ?? path.join(ROOT, 'languages', `${DOMAIN}.pot`)
  );
  const files = fg.sync('build/**/*.js', { cwd: ROOT });

  if (files.length === 0) {
    console.error('i18n: ERROR: build/ has no scripts. Run: pnpm build');
    process.exit(1);
  }

  const scripts = Object.fromEntries(
    files.map(file => [file, fs.readFileSync(path.join(ROOT, file), 'utf8')])
  );
  const problems = findCoverageProblems(
    scripts,
    fs.readFileSync(potPath, 'utf8')
  );

  if (problems.length > 0) {
    for (const problem of problems) console.error(`i18n: ERROR: ${problem}`);
    process.exit(1);
  }

  const covered = files.filter(file => usesPluginDomain(scripts[file]));
  console.log(`i18n: POT covers all ${covered.length} translated scripts.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
