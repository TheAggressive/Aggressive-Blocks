/**
 * Tests for bin/check-bundle-size.mjs.
 *
 * A budget gate is only worth something if each way of failing actually
 * fails, so every case builds its own sandbox build/ tree rather than
 * leaning on the repository's current output.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';

import { checkBundles } from './check-bundle-size.mjs';
import { cleanup, workspace } from './lib/script-harness.mjs';

after(cleanup);

const BUDGETS = {
  files: {
    'build/blocks-interactivity/demo/view.js': 1024,
    'build/blocks-interactivity/demo/style-index.css': 1024,
  },
  lazyChunks: { pattern: 'build/blocks-interactivity/*.js', budget: 1024 },
  moduleDependencies: ['@wordpress/interactivity', '@aggressive-blocks/*'],
};

/** Incompressible bytes, so gzip size tracks the requested length. */
const noise = bytes => crypto.randomBytes(bytes).toString('base64');

function sandbox(files) {
  const root = workspace('bundle-budget');
  for (const [file, contents] of Object.entries(files)) {
    fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), contents);
  }
  return root;
}

function asset(dependencies) {
  return `<?php return array('dependencies' => array(${dependencies
    .map(name => `'${name}'`)
    .join(', ')}), 'version' => 'x', 'type' => 'module');`;
}

const healthy = {
  'build/blocks-interactivity/demo/view.js': 'export {};',
  'build/blocks-interactivity/demo/view.asset.php': asset([
    '@wordpress/interactivity',
  ]),
  'build/blocks-interactivity/demo/style-index.css': '.demo{}',
  'build/blocks-interactivity/demo/style-index-rtl.css': '.demo{}',
  'build/blocks-interactivity/demo/index.js': noise(4000),
};

test('passes a build within budget, and ignores editor bundles', () => {
  const { errors, rows } = checkBundles(sandbox(healthy), BUDGETS);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 3);
});

test('fails an asset over its budget, RTL stylesheets included', () => {
  const { errors } = checkBundles(
    sandbox({
      ...healthy,
      'build/blocks-interactivity/demo/view.js': noise(2000),
      'build/blocks-interactivity/demo/style-index-rtl.css': noise(2000),
    }),
    BUDGETS
  );
  assert.equal(errors.length, 2);
  assert.match(
    errors[0],
    /demo\/style-index-rtl\.css is \d+ B gzip, over its 1024 B budget/u
  );
  assert.match(
    errors[1],
    /demo\/view\.js is \d+ B gzip, over its 1024 B budget/u
  );
});

test('fails a frontend asset that has no budget', () => {
  const { errors } = checkBundles(
    sandbox({
      ...healthy,
      'build/blocks/new-block/style-index.css': '.new{}',
    }),
    BUDGETS
  );
  assert.deepEqual(errors, [
    'build/blocks/new-block/style-index.css (26 B gzip) has no budget in bin/bundle-budgets.json.',
  ]);
});

test('fails a budgeted file the build no longer emits', () => {
  const files = { ...healthy };
  delete files['build/blocks-interactivity/demo/style-index.css'];
  const { errors } = checkBundles(sandbox(files), BUDGETS);
  assert.ok(
    errors.includes(
      'build/blocks-interactivity/demo/style-index.css has a budget but the build no longer emits it.'
    )
  );
});

test('holds lazy chunks to the shared chunk budget', () => {
  const { errors } = checkBundles(
    sandbox({ ...healthy, 'build/blocks-interactivity/311.js': noise(2000) }),
    BUDGETS
  );
  assert.equal(errors.length, 1);
  assert.match(
    errors[0],
    /^build\/blocks-interactivity\/311\.js is \d+ B gzip, over its 1024 B budget\.$/u
  );
});

test('fails a view module that imports beyond the Interactivity API', () => {
  const { errors } = checkBundles(
    sandbox({
      ...healthy,
      'build/blocks-interactivity/demo/view.asset.php': asset([
        '@wordpress/interactivity',
        '@aggressive-blocks/helpers',
        'react',
      ]),
    }),
    BUDGETS
  );
  assert.deepEqual(errors, [
    'build/blocks-interactivity/demo/view.js imports react on the front end.',
  ]);
});

test('fails an empty build instead of passing vacuously', () => {
  const { errors } = checkBundles(sandbox({}), BUDGETS);
  assert.deepEqual(errors, [
    'build/ has no frontend assets. Run pnpm build first.',
  ]);
});
