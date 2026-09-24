#!/usr/bin/env node
/**
 * Dry-run semantic-release planning. Writes should_release / next_version
 * to GITHUB_OUTPUT when present.
 */

import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const output = process.env.GITHUB_OUTPUT;
let shouldRelease = false;
let releaseType = '';
let nextVersion = '';

try {
  const stdout = execFileSync(
    'pnpm',
    ['exec', 'semantic-release', '--dry-run'],
    { encoding: 'utf8' }
  );
  const match = stdout.match(
    /The next release version is ([0-9]+\.[0-9]+\.[0-9]+)/u
  );
  if (match) {
    shouldRelease = true;
    nextVersion = match[1];
    releaseType = 'planned';
  }
} catch {
  shouldRelease = false;
}

if (output) {
  appendFileSync(
    output,
    `should_release=${shouldRelease}\nrelease_type=${releaseType}\nnext_version=${nextVersion}\n`
  );
}

console.log(
  `should_release=${shouldRelease} next_version=${nextVersion || 'none'}`
);
