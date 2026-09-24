#!/usr/bin/env node
/**
 * Fail closed when the local toolchain does not match the CI contract.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const composer = JSON.parse(
  readFileSync(path.join(root, 'composer.json'), 'utf8')
);
const plugin = readFileSync(path.join(root, 'aggressive-blocks.php'), 'utf8');

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor !== 24) {
  console.error(
    `CI doctor: Node 24 is required, found ${process.versions.node}.`
  );
  process.exit(1);
}

if (pkg.packageManager !== 'pnpm@11.21.0') {
  console.error(`CI doctor: packageManager must stay pnpm@11.21.0.`);
  process.exit(1);
}

if (composer.require?.php !== '>=8.2') {
  console.error('CI doctor: composer.json require.php must be >=8.2.');
  process.exit(1);
}

if (!/Requires PHP:\s*8\.2/u.test(plugin)) {
  console.error('CI doctor: plugin header Requires PHP must be 8.2.');
  process.exit(1);
}

if (!/Requires at least:\s*6\.7/u.test(plugin)) {
  console.error('CI doctor: plugin header Requires at least must be 6.7.');
  process.exit(1);
}

console.log('CI doctor: toolchain contract holds.');
