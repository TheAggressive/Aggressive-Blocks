#!/usr/bin/env node
/**
 * Publish a GitHub release from the already-verified plugin ZIP.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';

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

// Written by bin/release/plan.mjs from the same commits this release tags.
const notesFile = 'release-notes.md';
if (!existsSync(notesFile)) {
  throw new Error(`${notesFile} is missing; the release plan did not run.`);
}

// Tag the commit this run built and tested. Without --target, gh tags the
// default branch as it is now, which may include commits merged since.
const target = process.env.GITHUB_SHA;
if (!target) {
  throw new Error('GITHUB_SHA is required to tag the tested commit.');
}

execFileSync(
  'gh',
  [
    'release',
    'create',
    `v${version}`,
    ...zips,
    ...zips.map(name => `${name}.sha256`).filter(Boolean),
    '--target',
    target,
    '--title',
    `v${version}`,
    '--notes-file',
    notesFile,
  ],
  { stdio: 'inherit' }
);
