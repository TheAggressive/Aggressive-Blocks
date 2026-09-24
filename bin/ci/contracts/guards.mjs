/**
 * Every guard must be provably able to fail.
 */

import { readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

import { check, packageJson, repositoryRoot } from '../lib/contract-inputs.mjs';

/** Guard script (repo-relative) → the test proving it can fail. */
const GUARDS = {
  'bin/check-file-length.sh': 'bin/check-file-length.test.mjs',
  'bin/check-shell.sh': 'bin/check-shell.test.mjs',
  'bin/i18n/check.sh': 'bin/i18n/validate-po.test.mjs',
  'bin/i18n/validate-po.sh': 'bin/i18n/validate-po.test.mjs',
  'bin/release/verify-package.sh': 'bin/release/verify-package.test.mjs',
  'bin/wp-env/check.sh': 'bin/wp-env/check.test.mjs',
};

const ORCHESTRATORS = {
  'bin/ci/check-wp-env.sh':
    'runs the proven bin/wp-env/check.sh guard inside the CI environment',
  'bin/ci/verify.sh': 'runs the canonical lanes; the lanes hold the assertions',
  'bin/ci/verify-fast.sh': 'pre-push subset of the same lanes',
};

const GUARD_NAME = /^(check|verify|validate).*\.sh$/u;

/** @param {string} dir @return {string[]} */
function shellScriptsUnder(dir) {
  const found = [];

  for (const entry of readdirSync(dir)) {
    const absolute = path.join(dir, entry);

    if (statSync(absolute).isDirectory()) {
      found.push(...shellScriptsUnder(absolute));
      continue;
    }

    if (GUARD_NAME.test(entry)) {
      found.push(path.relative(repositoryRoot, absolute));
    }
  }

  return found;
}

const discovered = shellScriptsUnder(path.join(repositoryRoot, 'bin')).sort();
const classified = new Set([
  ...Object.keys(GUARDS),
  ...Object.keys(ORCHESTRATORS),
]);

for (const script of discovered) {
  check(
    classified.has(script),
    `${script} looks like a guard but is not classified in ` +
      'bin/ci/contracts/guards.mjs. Register it with the test that proves it ' +
      'rejects a violation, or classify it as an orchestrator with a reason.'
  );
}

for (const script of classified) {
  check(
    discovered.includes(script),
    `bin/ci/contracts/guards.mjs registers ${script}, which no longer exists.`
  );
}

const testToolsScript = packageJson.scripts['test:tools'] ?? '';

for (const [script, testFile] of Object.entries(GUARDS)) {
  check(
    existsSync(path.join(repositoryRoot, testFile)),
    `${script} is registered as proven by ${testFile}, which does not exist.`
  );

  check(
    testToolsScript.includes(testFile),
    `${testFile} proves ${script} can fail, but "test:tools" does not run it.`
  );
}
