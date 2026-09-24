/**
 * Toolchain contracts: pinned versions and runners.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';

import {
  betaWorkflow,
  check,
  composerBootstrap,
  i18nLibrary,
  jestConfiguration,
  nodeBootstrap,
  nodeVersion,
  packageJson,
  pnpmWorkspace,
  phpLane,
  phpcsConfiguration,
  phpunitConfiguration,
  playwrightConfiguration,
  releaseWorkflow,
  repositoryRoot,
} from '../lib/contract-inputs.mjs';

check(
  packageJson.scripts['test:tools']?.includes('bin/ci/contracts.test.mjs'),
  'test:tools must run bin/ci/contracts.test.mjs.'
);

check(
  packageJson.scripts['test:tools']?.includes(
    'bin/release/verify-package.test.mjs'
  ),
  'test:tools must run bin/release/verify-package.test.mjs.'
);

const PINNED_TOOLCHAIN = [
  ['package.json packageManager', packageJson.packageManager, 'pnpm@11.21.0'],
  ['package.json engines.node', packageJson.engines?.node, '>=24 <25'],
  ['package.json engines.pnpm', packageJson.engines?.pnpm, '>=11 <12'],
  ['.node-version', nodeVersion, '24.18.0'],
];

for (const [source, actual, expected] of PINNED_TOOLCHAIN) {
  check(
    actual === expected,
    `${source} must be pinned to "${expected}" for CI parity (found "${actual}").`
  );
}

const EXACT_SCRIPTS = [
  ['qa', 'bash bin/ci/node.sh qa:local:pinned'],
  ['qa:local:pinned', 'bash bin/ci/verify.sh'],
  ['test:e2e:ci', 'bash bin/ci/node.sh test:e2e:pinned'],
  [
    'test:e2e:pinned',
    'pnpm ci:build && pnpm ci:browser:install && pnpm ci:e2e',
  ],
];

for (const [name, expected] of EXACT_SCRIPTS) {
  check(
    packageJson.scripts[name] === expected,
    `package.json script "${name}" must be exactly "${expected}" (found ` +
      `"${packageJson.scripts[name]}").`
  );
}

check(
  packageJson.scripts['qa:dev'],
  'package.json must keep a "qa:dev" script.'
);

check(
  nodeBootstrap.includes("readonly NODE_VERSION='24.18.0'"),
  'bin/ci/node.sh must pin NODE_VERSION to 24.18.0, matching .node-version.'
);

check(
  nodeBootstrap.includes(
    "readonly NODE_SHA256='55aa7153f9d88f28d765fcdad5ae6945b5c0f98a36881703817e4c450fa76742'"
  ),
  'bin/ci/node.sh must keep the checksum for the pinned Node tarball.'
);

check(
  releaseWorkflow.includes("NODE_VERSION: '24.18.0'"),
  'ci.yml must declare NODE_VERSION 24.18.0, matching bin/ci/node.sh.'
);

check(
  betaWorkflow.includes("NODE_VERSION: '24.18.0'"),
  'wordpress-beta-compatibility.yml must declare NODE_VERSION 24.18.0.'
);

check(
  /PHP_VERSION: '8\.2\.\d+'/u.test(betaWorkflow),
  'wordpress-beta-compatibility.yml must provision a PHP 8.2.x runner.'
);

check(
  phpLane.includes('composer validate --strict --no-interaction'),
  'bin/ci/php.sh must run `composer validate --strict`.'
);

check(
  phpLane.includes('AA_CI_XDEBUG_MODE=coverage'),
  'bin/ci/php.sh must start the parity container with Xdebug in coverage mode.'
);

check(
  phpLane.includes('test -s coverage-unit.xml.tmp'),
  'bin/ci/php.sh must reject an empty Clover artifact before publishing it.'
);

check(
  /^readonly COMPOSER_VERSION='\d+\.\d+\.\d+'$/mu.test(composerBootstrap),
  'bin/ci/install-composer.sh must pin an exact COMPOSER_VERSION.'
);

check(
  /^readonly COMPOSER_SHA256='[0-9a-f]{64}'$/mu.test(composerBootstrap),
  'bin/ci/install-composer.sh must verify the Composer PHAR against a SHA-256.'
);

check(
  phpLane.includes('install-composer.sh'),
  'bin/ci/php.sh must install the pinned Composer before using it.'
);

check(
  phpLane.includes('PATH=\\"\\$PWD/bin/ci:\\$PATH\\"'),
  'bin/ci/php.sh must put bin/ci first on PATH.'
);

check(
  jestConfiguration.includes("'<rootDir>/bin/ci/jest-no-skips-reporter.cjs'"),
  'jest.config.js must register bin/ci/jest-no-skips-reporter.cjs.'
);

check(
  playwrightConfiguration.includes("'./tests/e2e/no-skips-reporter.ts'"),
  'playwright.config.ts must register tests/e2e/no-skips-reporter.ts.'
);

for (const setting of [
  'failOnWarning',
  'failOnRisky',
  'failOnSkipped',
  'failOnIncomplete',
]) {
  check(
    phpunitConfiguration.includes(`${setting}="true"`),
    `phpunit.xml.dist must set ${setting}="true".`
  );
}

const GENERATED_TREE_EXCLUSIONS = [
  [
    'phpcs.xml.dist',
    phpcsConfiguration,
    '<exclude-pattern>*/.wp-env-ci/*</exclude-pattern>',
  ],
  [
    'phpcs.xml.dist',
    phpcsConfiguration,
    '<exclude-pattern>*/.cache/*</exclude-pattern>',
  ],
  ['bin/i18n/lib.sh', i18nLibrary, '.wp-env-ci'],
  ['bin/i18n/lib.sh', i18nLibrary, '.cache'],
];

for (const [source, contents, exclusion] of GENERATED_TREE_EXCLUSIONS) {
  check(contents.includes(exclusion), `${source} must exclude "${exclusion}".`);
}

const resolvedJestConfig = JSON.parse(
  execFileSync(
    path.join(repositoryRoot, 'node_modules/.bin/wp-scripts'),
    ['test-unit-js', '--showConfig'],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }
  )
);
const expectedJestRoot = path.join(repositoryRoot, 'src');
const resolvedJestRoots = resolvedJestConfig.configs?.[0]?.roots;
const resolvedJestReporters = resolvedJestConfig.globalConfig?.reporters ?? [];

check(
  JSON.stringify(resolvedJestRoots) === JSON.stringify([expectedJestRoot]),
  `wp-scripts resolved Jest roots to ${JSON.stringify(resolvedJestRoots)}, ` +
    `expected ${JSON.stringify([expectedJestRoot])}.`
);

check(
  resolvedJestReporters.some(
    (/** @type {[string, unknown]} */ [reporter]) =>
      reporter ===
      path.join(repositoryRoot, 'bin/ci/jest-no-skips-reporter.cjs')
  ),
  'wp-scripts did not resolve the no-skips reporter.'
);

check(
  packageJson.pnpm?.overrides === undefined,
  'package.json must not declare pnpm.overrides — declare them in pnpm-workspace.yaml.'
);

check(
  /^overrides:/mu.test(pnpmWorkspace) || /^allowBuilds:/mu.test(pnpmWorkspace),
  'pnpm-workspace.yaml must keep its workspace configuration.'
);
