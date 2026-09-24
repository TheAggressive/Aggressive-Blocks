/**
 * Shared inputs for the CI contracts.
 *
 * Every file the contracts assert against is read once here and exported, so a
 * contract module states what it depends on in its import list rather than
 * re-reading the repository.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Assert one condition with one message naming the thing that broke.
 *
 * @param {unknown} condition Truthy when the contract holds.
 * @param {string} message What broke, and where to fix it.
 */
export function check(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(scriptDirectory, '../../..');
/** @param {string} relativePath @return {any} */
export const readJson = relativePath =>
  JSON.parse(readFileSync(path.join(repositoryRoot, relativePath), 'utf8'));
/** @param {string} relativePath @return {string} */
export const readText = relativePath =>
  readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

export const packageJson = readJson('package.json');
export const composerJson = readJson('composer.json');
export const wpEnv = readJson('bin/ci/.wp-env.json');
export const artifactWpEnv = readJson('bin/ci/artifact/.wp-env.json');
export const releaseWorkflow = readText('.github/workflows/ci.yml');
export const releaseSummaryScript = readText('bin/ci/release-summary.mjs');
export const betaWorkflow = readText(
  '.github/workflows/wordpress-beta-compatibility.yml'
);
export const phpForwardWorkflow = readText(
  '.github/workflows/php-forward-compatibility.yml'
);
export const phpForwardLane = readText('bin/ci/php-forward.sh');
export const prPolicyWorkflow = readText('.github/workflows/pr-policy.yml');
export const rulesetDriftWorkflow = readText(
  '.github/workflows/ruleset-drift.yml'
);
export const rulesetDriftScript = readText('bin/ci/ruleset-drift.mjs');
export const prPolicyScript = readText('bin/ci/pr-policy.mjs');
export const prPolicyGithubScript = readText('bin/ci/pr-policy-github.mjs');
export const dependabotConfiguration = readText('.github/dependabot.yml');
export const rulesetConfiguration = readJson(
  '.github/rulesets/default-branch.json'
);
export const nodeVersion = readText('.node-version').trim();
export const nodeBootstrap = readText('bin/ci/node.sh');
export const phpLane = readText('bin/ci/php.sh');
export const packageLane = readText('bin/ci/package.sh');
export const composerBootstrap = readText('bin/ci/install-composer.sh');
export const verifyScript = readText('bin/ci/verify.sh');
export const verifyFastScript = readText('bin/ci/verify-fast.sh');
export const prePushHook = readText('.husky/pre-push');
export const releaseLib = readText('bin/release/lib.sh');
export const pluginHeader = readText('aggressive-blocks.php');
export const phpstanConfiguration = readText('phpstan.neon');
export const jestConfiguration = readText('jest.config.js');
export const playwrightConfiguration = readText('playwright.config.ts');
export const phpunitConfiguration = readText('phpunit.xml.dist');
export const phpcsConfiguration = readText('phpcs.xml.dist');
export const i18nLibrary = readText('bin/i18n/lib.sh');
export const betaUpdater = readText('bin/wp-env/update-beta-channel.sh');
export const pnpmWorkspace = readText('pnpm-workspace.yaml');
