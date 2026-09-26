import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findCoverageProblems,
  referencedScripts,
  usesPluginDomain,
} from './check-script-coverage.mjs';

const MODAL = 'build/blocks-interactivity/modal/index.js';

test('detects the plugin domain in minified i18n calls', () => {
  assert.equal(usesPluginDomain('(0,o.__)("Close","aggressive-blocks")'), true);
  assert.equal(
    usesPluginDomain('(0,o._n)("%d item","%d items",n,"aggressive-blocks")'),
    true
  );
  assert.equal(
    usesPluginDomain('registerBlockType("aggressive-blocks/modal")'),
    false
  );
  assert.equal(
    usesPluginDomain('(0,o.__)("Close","aggressive-apparel")'),
    false
  );
});

test('reads script references from POT source lines', () => {
  const pot = [
    `#: includes/Blocks/class-copyright.php:73`,
    `#: ${MODAL}:1 build/blocks/copyright/index.js:3`,
    'msgid "Close"',
  ].join('\n');

  assert.deepEqual([...referencedScripts(pot)].sort(), [
    MODAL,
    'build/blocks/copyright/index.js',
  ]);
});

test('a translated script missing from the POT is a problem', () => {
  const problems = findCoverageProblems(
    { [MODAL]: '(0,o.__)("Close","aggressive-blocks")' },
    '#: includes/Blocks/class-copyright.php:73\nmsgid "Close"\n'
  );

  assert.equal(problems.length, 1);
  assert.match(problems[0], /modal\/index\.js calls i18n functions/);
});

test('a POT reference to a script the build no longer emits is a problem', () => {
  const problems = findCoverageProblems({}, `#: ${MODAL}:1\nmsgid "Close"\n`);

  assert.equal(problems.length, 1);
  assert.match(problems[0], /did not emit/);
});

test('scripts without plugin strings need no POT entries', () => {
  assert.deepEqual(
    findCoverageProblems(
      { 'build/interactivity/scroll-lock.js': 'export const x=1;' },
      ''
    ),
    []
  );
});
