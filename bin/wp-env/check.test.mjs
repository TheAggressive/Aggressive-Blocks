/**
 * Proof that bin/wp-env/check.sh can fail.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'check.sh'
);

test('refuses to run outside the container', () => {
  const result = spawnSync('bash', [SCRIPT], { encoding: 'utf8' });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /CI-only/u);
});
