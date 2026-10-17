import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

// pnpm's transitive dependency links, rather than an unpatched registry copy.
const require = createRequire(
  new URL('../node_modules/.pnpm/node_modules/', import.meta.url)
);
const braces = require('braces');
const { sprintf } = require('sprintf-js');

test('braces bounds brace and parenthesis nesting before recursive traversal', () => {
  for (const [open, close] of [
    ['{', '}'],
    ['(', ')'],
  ]) {
    const pattern = open.repeat(4000) + 'a,b' + close.repeat(4000);
    for (const operation of [
      braces.parse,
      braces.compile,
      braces.expand,
      braces.stringify,
    ]) {
      assert.throws(() => operation(pattern), /braces nesting exceeds limit/u);
    }
  }
  assert.equal(
    braces.compile('src/{blocks,utils}/**/*.{ts,tsx}'),
    'src/(blocks|utils)/**/*.(ts|tsx)'
  );
  assert.deepEqual(braces.expand('file-{1..3}.ts'), [
    'file-1.ts',
    'file-2.ts',
    'file-3.ts',
  ]);
});

test('braces also guards caller-supplied ASTs', () => {
  let ast = { type: 'text', value: 'x' };
  for (let i = 0; i < 200; i++) ast = { type: 'root', nodes: [ast] };
  for (const operation of [braces.compile, braces.expand, braces.stringify]) {
    assert.throws(() => operation(ast), /braces nesting exceeds limit/u);
  }
});

test('sprintf bounds width and precision before formatting', () => {
  for (const format of [
    '%10001s',
    '%.101f',
    '%999999999999999999999s',
    '%.999999999999999999999s',
  ]) {
    assert.throws(
      () => sprintf(format, 1),
      /width or precision exceeds limit/u
    );
  }
  assert.equal(sprintf('%04d %s %.2f', 12, 'ok', 1.25), '0012 ok 1.25');
  assert.equal(sprintf('%(name)s', { name: 'named' }), 'named');
});
