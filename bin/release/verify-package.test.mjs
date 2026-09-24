/**
 * Proof that bin/release/verify-package.sh rejects a broken ZIP.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const VERIFY = path.join(SCRIPT_DIR, 'verify-package.sh');
const LIB = path.join(SCRIPT_DIR, 'lib.sh');

const FIXTURE_VERSION = '9.9.9';

function libArray(name) {
  const result = spawnSync(
    'bash',
    ['-c', `source "${LIB}"; printf '%s\\n' "\${${name}[@]}"`],
    { encoding: 'utf8' }
  );

  if (result.status !== 0) {
    throw new Error(`Could not read ${name} from lib.sh: ${result.stderr}`);
  }

  return result.stdout.split('\n').filter(Boolean);
}

const SLUG = spawnSync(
  'bash',
  ['-c', `source "${LIB}"; printf '%s' "$AA_PLUGIN_SLUG"`],
  { encoding: 'utf8' }
).stdout;

const REQUIRED = libArray('AA_PACKAGE_REQUIRED');

const PLUGIN_HEADER = `<?php
/**
 * Plugin Name:       Aggressive Blocks
 * Version:           ${FIXTURE_VERSION}
 * Requires at least: 6.7
 * Requires PHP:      8.2
 * Text Domain:       aggressive-blocks
 * @package Aggressive_Blocks
 */
`;

const workspaces = [];

after(() => {
  for (const dir of workspaces) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function write(root, relative, contents) {
  const target = path.join(root, SLUG, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

function buildPackage(mutate = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-verify-'));
  workspaces.push(root);

  for (const required of REQUIRED) {
    write(
      root,
      required,
      required === 'aggressive-blocks.php' ? PLUGIN_HEADER : `${required}\n`
    );
  }

  mutate(root);

  const zipPath = path.join(root, `${SLUG}.zip`);
  const zipped = spawnSync('zip', ['-qrX', zipPath, SLUG], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(zipped.status, 0, `zip failed: ${zipped.stderr}`);

  return zipPath;
}

function verify(zipPath, expectedVersion = FIXTURE_VERSION) {
  const result = spawnSync('bash', [VERIFY, zipPath, expectedVersion], {
    encoding: 'utf8',
  });

  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

test('accepts a complete, correctly versioned package', () => {
  const { status, output } = verify(buildPackage());

  assert.equal(status, 0, `a valid package must pass:\n${output}`);
  assert.match(output, /Package verified/u);
});

test('rejects a package missing a required file', () => {
  const zipPath = buildPackage(root => {
    fs.rmSync(path.join(root, SLUG, 'aggressive-blocks.php'));
  });

  const { status, output } = verify(zipPath);

  assert.equal(status, 1);
  assert.match(
    output,
    /Missing required path: aggressive-blocks\/aggressive-blocks\.php/u
  );
});

test('rejects development directories', () => {
  const zipPath = buildPackage(root => {
    write(root, 'src/blocks/copyright/index.ts', 'export {};\n');
  });

  const { status, output } = verify(zipPath);

  assert.equal(status, 1);
  assert.match(output, /Forbidden path present: src\//u);
});

test('rejects a package whose plugin version is not the released version', () => {
  const { status, output } = verify(buildPackage(), '1.0.0');

  assert.equal(status, 1);
  assert.match(output, /Packaged version 9\.9\.9 does not match 1\.0\.0/u);
});

test('rejects a package whose text domain drifted', () => {
  const zipPath = buildPackage(root => {
    write(
      root,
      'aggressive-blocks.php',
      PLUGIN_HEADER.replace('aggressive-blocks', 'wrong-domain')
    );
  });

  const { status, output } = verify(zipPath);

  assert.equal(status, 1);
  assert.match(output, /text domain is not aggressive-blocks/u);
});
