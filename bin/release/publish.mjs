#!/usr/bin/env node
/**
 * Publish a GitHub release from the already-verified plugin ZIP.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const zips = readdirSync('.').filter(name =>
  /^aggressive-blocks-.+\.zip$/u.test(name)
);
if (zips.length === 0) {
  throw new Error('No verified plugin ZIP found in the workspace.');
}

const version = process.env.AA_RELEASE_VERSION;
if (!version) {
  throw new Error('AA_RELEASE_VERSION is required to publish.');
}

execFileSync(
  'gh',
  [
    'release',
    'create',
    `v${version}`,
    ...zips,
    ...zips.map(name => `${name}.sha256`).filter(Boolean),
    '--title',
    `Aggressive Blocks ${version}`,
    '--generate-notes',
  ],
  { stdio: 'inherit' }
);
