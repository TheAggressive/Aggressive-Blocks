/**
 * Proof that bin/release/sync-version.sh writes a released version into all
 * three declarations, refuses anything else, and is safe to rerun.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SYNC = path.join(SCRIPT_DIR, 'sync-version.sh');
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');

const roots = [];
after(() => {
  for (const root of roots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/** A copy of the real plugin header and readme to sync. */
function checkout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-sync-'));
  roots.push(root);
  for (const file of ['aggressive-blocks.php', 'readme.txt']) {
    fs.copyFileSync(path.join(REPO_ROOT, file), path.join(root, file));
  }
  return root;
}

function sync(root, version) {
  const result = spawnSync('bash', [SYNC, version], {
    encoding: 'utf8',
    env: { ...process.env, AA_SYNC_ROOT: root },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

const read = (root, file) => fs.readFileSync(path.join(root, file), 'utf8');

test('writes the header, the constant, and the Stable tag', () => {
  const root = checkout();

  const { status, output } = sync(root, '12.34.56');

  assert.equal(status, 0, output);
  const plugin = read(root, 'aggressive-blocks.php');
  assert.match(plugin, /^ \* Version: {11}12\.34\.56$/mu);
  assert.match(
    plugin,
    /^define\( 'AGGRESSIVE_BLOCKS_VERSION', '12\.34\.56' \);$/mu
  );
  assert.match(read(root, 'readme.txt'), /^Stable tag: 12\.34\.56$/mu);
});

test('changes nothing else in either file', () => {
  const root = checkout();
  const before = ['aggressive-blocks.php', 'readme.txt'].map(file =>
    read(root, file)
  );

  sync(root, '12.34.56');

  const after = ['aggressive-blocks.php', 'readme.txt'].map(file =>
    read(root, file)
  );
  const differing = (a, b) =>
    a.split('\n').filter((line, index) => line !== b.split('\n')[index]);
  assert.equal(differing(before[0], after[0]).length, 2);
  assert.equal(differing(before[1], after[1]).length, 1);
});

test('is a no-op when the version is already in place', () => {
  const root = checkout();
  sync(root, '12.34.56');
  const stamped = read(root, 'aggressive-blocks.php');

  const { status, output } = sync(root, '12.34.56');

  assert.equal(status, 0);
  assert.match(output, /already declares 12\.34\.56/u);
  assert.equal(read(root, 'aggressive-blocks.php'), stamped);
});

test('refuses anything but a bare release version, writing nothing', () => {
  for (const version of ['', '2.0', 'v2.0.0', '2.0.0-rc.1', "2.0.0' );"]) {
    const root = checkout();
    const before = read(root, 'aggressive-blocks.php');

    const { status } = sync(root, version);

    assert.equal(status, 2, `accepted ${JSON.stringify(version)}`);
    assert.equal(read(root, 'aggressive-blocks.php'), before);
  }
});
