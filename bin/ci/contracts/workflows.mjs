/**
 * Workflow contracts: local ↔ Actions parity, and the release path.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import {
  actionReferences,
  flowSequence,
  isNewerThan,
  isPinnedAction,
  parseJobs,
  runCommands,
} from '../lib/workflow.mjs';
import {
  artifactWpEnv,
  check,
  composerJson,
  dependabotConfiguration,
  packageJson,
  packageLane,
  phpForwardLane,
  phpForwardWorkflow,
  phpstanConfiguration,
  pluginHeader,
  prePushHook,
  prPolicyGithubScript,
  prPolicyScript,
  prPolicyWorkflow,
  releaseLib,
  releaseSummaryScript,
  releaseWorkflow,
  repositoryRoot,
  rulesetDriftScript,
  rulesetDriftWorkflow,
  rulesetConfiguration,
  verifyFastScript,
  verifyScript,
  wpEnv,
} from '../lib/contract-inputs.mjs';

const workflowsDirectory = path.join(repositoryRoot, '.github/workflows');
const workflowFiles = readdirSync(workflowsDirectory).filter(fileName =>
  /\.ya?ml$/u.test(fileName)
);

if (workflowFiles.length < 4) {
  throw new Error(
    `Expected at least 4 workflows, found ${workflowFiles.length}.`
  );
}

for (const fileName of workflowFiles) {
  const workflow = readFileSync(
    path.join(workflowsDirectory, fileName),
    'utf8'
  );

  for (const action of actionReferences(workflow)) {
    if (!isPinnedAction(action)) {
      throw new Error(
        `${fileName} contains an action that is not pinned to a full SHA: ${action}`
      );
    }
  }
}

const releaseJobs = parseJobs(releaseWorkflow);

const EXPECTED_RELEASE_JOBS = [
  'changes',
  'release-plan',
  'dependency-review',
  'lint-frontend',
  'i18n',
  'build',
  'test',
  'e2e',
  'package',
  'artifact-acceptance',
  'release',
  'summary',
];

const missingJobs = EXPECTED_RELEASE_JOBS.filter(job => !releaseJobs[job]);
if (missingJobs.length > 0) {
  throw new Error(
    `CI workflow parse is incomplete — missing ${JSON.stringify(missingJobs)}.`
  );
}

const PARITY_JOBS = {
  'lint-frontend': {
    setup: [
      'sudo apt-get update -qq && sudo apt-get install -y -qq --no-install-recommends gettext',
      'pnpm install --frozen-lockfile',
    ],
    lanes: ['pnpm ci:frontend'],
  },
  i18n: { setup: ['pnpm install --frozen-lockfile'], lanes: ['pnpm ci:i18n'] },
  build: {
    setup: ['pnpm install --frozen-lockfile'],
    lanes: ['pnpm ci:build'],
  },
  test: { setup: ['pnpm install --frozen-lockfile'], lanes: ['pnpm ci:php'] },
  e2e: {
    setup: ['pnpm install --frozen-lockfile', 'pnpm test:e2e:install'],
    lanes: ['pnpm ci:e2e'],
  },
  package: {
    setup: ['pnpm install --frozen-lockfile'],
    lanes: ['pnpm ci:package'],
  },
  'artifact-acceptance': {
    setup: ['pnpm install --frozen-lockfile', 'pnpm test:e2e:install'],
    lanes: ['pnpm ci:artifact'],
  },
};

const workflowLanes = new Set();

for (const [jobName, { setup, lanes }] of Object.entries(PARITY_JOBS)) {
  const jobBody = releaseJobs[jobName];
  if (!jobBody) {
    throw new Error(`Required CI workflow is missing the ${jobName} job.`);
  }

  const expected = [...setup, ...lanes];
  const actual = runCommands(jobBody);

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Job "${jobName}" must run exactly the canonical lanes.\n` +
        `  expected: ${JSON.stringify(expected)}\n` +
        `  actual:   ${JSON.stringify(actual)}`
    );
  }

  for (const lane of lanes) {
    workflowLanes.add(lane);
  }
}

const verifyLanes = new Set(
  [...verifyScript.matchAll(/^pnpm (ci:[a-z0-9:]+)$/gmu)]
    .map(match => `pnpm ${match[1]}`)
    .filter(
      lane => !['pnpm ci:doctor', 'pnpm ci:browser:install'].includes(lane)
    )
);

const missingLocally = [...workflowLanes].filter(
  lane => !verifyLanes.has(lane)
);
const missingInCi = [...verifyLanes].filter(lane => !workflowLanes.has(lane));

if (missingLocally.length > 0 || missingInCi.length > 0) {
  throw new Error(
    'bin/ci/verify.sh and the CI workflow must run the same lanes.\n' +
      `  in Actions but not in verify.sh: ${JSON.stringify(missingLocally)}\n` +
      `  in verify.sh but not in Actions: ${JSON.stringify(missingInCi)}`
  );
}

for (const lane of workflowLanes) {
  const scriptName = lane.replace(/^pnpm /u, '');
  if (!packageJson.scripts[scriptName]) {
    throw new Error(
      `Workflow invokes "${lane}" but package.json has no such script.`
    );
  }
}

const fastLanes = new Set(
  [...verifyFastScript.matchAll(/^pnpm (ci:[a-z0-9:]+)$/gmu)]
    .map(match => `pnpm ${match[1]}`)
    .filter(lane => lane !== 'pnpm ci:doctor')
);

const fastNotInCi = [...fastLanes].filter(lane => !workflowLanes.has(lane));

check(fastLanes.size > 0, 'bin/ci/verify-fast.sh runs no ci:* lanes.');

check(
  fastNotInCi.length === 0,
  'bin/ci/verify-fast.sh runs lanes Actions does not: ' +
    `${JSON.stringify(fastNotInCi)}.`
);

check(
  packageJson.scripts['qa:fast'] === 'bash bin/ci/node.sh qa:fast:pinned',
  'The qa:fast script must route through bin/ci/node.sh.'
);

check(
  packageJson.scripts['qa:fast:pinned'] === 'bash bin/ci/verify-fast.sh',
  'The qa:fast:pinned script must run the fast local gate.'
);

check(
  prePushHook.includes('pnpm run qa:fast'),
  '.husky/pre-push must run `pnpm run qa:fast`.'
);

const policySurface = `${prPolicyWorkflow}\n${prPolicyScript}\n${prPolicyGithubScript}`;
const AUTO_MERGE_GUARDS = [
  [
    "workflows: ['CI/CD Pipeline', 'CodeQL', 'Workflow Security']",
    're-evaluate after every required CI and security workflow',
  ],
  [
    'ref: ${{ github.event.pull_request.base.sha }}',
    'run write-capable pull-request jobs from the protected base SHA',
  ],
  [
    'dependabot/fetch-metadata@25dd0e34f4fe68f24cc83900b1fe3fe149efef98',
    'classify Dependabot updates from verified metadata at an immutable pin',
  ],
  [
    'repos/${repository}/pulls/${number}',
    're-verify authorship against the API rather than trusting the event payload',
  ],
  [
    "classification.risk === 'high'",
    'refuse major version bumps even if dependabot.yml is later loosened',
  ],
  [
    'verifiedBotCommits',
    'verify bot-authored commits again before a privileged operation',
  ],
  [
    'trustedDependabotMetadata',
    'authorize dependency updates from head-SHA-bound bot metadata, not labels',
  ],
  [
    'REQUIRED_CHECKS',
    'require the complete CI and security check set before auto-merge',
  ],
  [
    'pulls/${number}/update-branch',
    'update an eligible stale branch and require a fresh pipeline before merging',
  ],
  ['--squash', 'squash-merge rather than adding merge commits to main'],
];

for (const [needle, purpose] of AUTO_MERGE_GUARDS) {
  check(
    policySurface.includes(needle),
    `The PR policy must ${purpose}. Missing guard: "${needle}".`
  );
}

check(
  !prPolicyWorkflow.includes('github.event.pull_request.head.sha'),
  'A write-capable pull_request_target job must never check out the PR head SHA.'
);

check(
  prPolicyWorkflow.includes(
    "github.event_name == 'pull_request' && 'PR Policy' || 'PR Policy (not applicable)'"
  ),
  'Only the real pull_request title-validation job may publish the required PR Policy context.'
);

check(
  rulesetDriftWorkflow.includes('permission-administration: read'),
  'The ruleset drift workflow must mint an App token limited to read-only Administration access.'
);

check(
  rulesetDriftWorkflow.includes(
    'GH_TOKEN: ${{ steps.audit-token.outputs.token }}'
  ),
  'The ruleset drift comparison must use the short-lived GitHub App token.'
);

check(
  !rulesetDriftWorkflow.includes('RULESET_AUDIT_TOKEN'),
  'The ruleset drift workflow must not depend on a long-lived PAT.'
);

check(
  rulesetDriftScript.includes('bypassActors(first: 1)') &&
    rulesetDriftScript.includes('redacted_actor_count'),
  'The read-only ruleset audit must fail closed when GraphQL reports any bypass actor.'
);

check(
  dependabotConfiguration.includes('allow:') &&
    !dependabotConfiguration.includes('ignore:'),
  'Dependabot scheduled majors must be limited with allow.update-types.'
);

/**
 * @typedef {object} RulesetRule
 * @property {string} type
 * @property {{
 *   required_status_checks?: Array<{ context: string }>,
 *   code_scanning_tools?: Array<{ tool: string }>
 * }} [parameters]
 */

/** @type {RulesetRule[]} */
const rulesetRules = rulesetConfiguration.rules;

const requiredStatusRule = rulesetRules.find(
  rule => rule.type === 'required_status_checks'
);
for (const { context } of requiredStatusRule?.parameters
  ?.required_status_checks ?? []) {
  check(
    prPolicyScript.includes(`'${context}'`),
    `The PR policy must wait for ruleset-required check "${context}".`
  );
}

const codeScanningRule = rulesetRules.find(
  rule => rule.type === 'code_scanning'
);
check(
  codeScanningRule?.parameters?.code_scanning_tools?.some(
    tool => tool.tool === 'CodeQL'
  ),
  'The ruleset must keep native CodeQL merge protection.'
);

for (const forbidden of ['--admin', '--force']) {
  check(
    !policySurface.includes(forbidden),
    `The PR policy must never pass ${forbidden}.`
  );
}

if (
  !releaseWorkflow.includes(
    "cancel-in-progress: ${{ github.event_name == 'pull_request' }}"
  )
) {
  throw new Error('Default-branch runs must not be cancellable mid-publish.');
}

for (const [jobName, jobBody] of Object.entries(releaseJobs)) {
  const jobText = JSON.stringify(jobBody);
  if (!jobText.includes('actions/checkout@')) {
    continue;
  }

  if (!jobText.includes('persist-credentials')) {
    throw new Error(
      `Job "${jobName}" must check out with persist-credentials: false.`
    );
  }

  const checkoutStep = jobBody.steps.find((/** @type {any} */ step) =>
    step?.uses?.startsWith('actions/checkout@')
  );
  if (checkoutStep?.with?.['persist-credentials'] !== false) {
    throw new Error(
      `Job "${jobName}" must check out with persist-credentials: false.`
    );
  }
}

check(
  packageLane.includes('bin/release/package.sh'),
  'bin/ci/package.sh must build the ZIP via bin/release/package.sh.'
);

check(
  packageLane.includes('bin/release/verify-package.sh'),
  'bin/ci/package.sh must verify the ZIP it just built.'
);

for (const array of ['AA_PACKAGE_INCLUDE', 'AA_PACKAGE_REQUIRED']) {
  check(releaseLib.includes(array), `bin/release/lib.sh must define ${array}.`);
}

const phpFloor = '8.2';
const declaredPhp = /^ \* Requires PHP:\s*(\S+)$/mu.exec(pluginHeader)?.[1];
const composerPhp = composerJson.require?.php;
const composerPlatformPhp = composerJson.config?.platform?.php;
const phpstanTarget = /^\s*phpVersion:\s*(\d+)$/mu.exec(
  phpstanConfiguration
)?.[1];

const PHP_FLOOR_DECLARATIONS = [
  ['plugin header "Requires PHP"', declaredPhp, phpFloor],
  ['composer.json require.php', composerPhp, `>=${phpFloor}`],
  ['composer.json config.platform.php', composerPlatformPhp, `${phpFloor}.0`],
  ['phpstan.neon phpVersion', phpstanTarget, '80200'],
  ['bin/ci/.wp-env.json phpVersion', wpEnv.phpVersion, phpFloor],
  [
    'bin/ci/artifact/.wp-env.json phpVersion',
    artifactWpEnv.phpVersion,
    phpFloor,
  ],
];

for (const [source, actual, expected] of PHP_FLOOR_DECLARATIONS) {
  check(
    actual === expected,
    `${source} declares "${actual}" but PHP ${phpFloor} is the single floor ` +
      `(expected "${expected}").`
  );
}

const forwardVersions = flowSequence(phpForwardWorkflow, 'php');

check(
  phpForwardWorkflow.includes('schedule:'),
  'php-forward-compatibility.yml must stay on a schedule.'
);

check(
  phpForwardWorkflow.includes('pnpm ci:php:forward'),
  'php-forward-compatibility.yml must invoke the canonical ci:php:forward lane.'
);

check(
  packageJson.scripts['ci:php:forward'] ===
    'pnpm ci:doctor && bash bin/ci/php-forward.sh',
  'The ci:php:forward script must run the doctor then bin/ci/php-forward.sh.'
);

check(
  phpForwardLane.includes('WP_ENV_PHP_VERSION'),
  'bin/ci/php-forward.sh must override WP_ENV_PHP_VERSION.'
);

check(
  phpForwardLane.includes(
    'AA_CI_WP_ENV_HOME="${REPO_ROOT}/.cache/ci/wp-env-forward"'
  ),
  'bin/ci/php-forward.sh must place its wp-env home at .cache/ci/wp-env-forward.'
);

check(
  forwardVersions.length > 0,
  'php-forward-compatibility.yml declares no PHP matrix versions.'
);

for (const version of forwardVersions) {
  check(
    isNewerThan(version, phpFloor),
    `php-forward-compatibility.yml tests PHP ${version}, which is not newer than ${phpFloor}.`
  );
}

const summaryJob = releaseJobs.summary;
const summaryNeeds = summaryJob?.needs ?? [];
const summaryCommands = runCommands(summaryJob).join('\n');
const summaryDependencies = [
  'changes',
  'release-plan',
  'lint-frontend',
  'i18n',
  'build',
  'test',
  'e2e',
  'package',
  'artifact-acceptance',
];

check(
  !releaseWorkflow.includes("- '!"),
  'ci.yml uses a negated glob in a paths-filter. Classify in bin/ci/classify-changes.mjs instead.'
);

check(
  !/dorny\/paths-filter/u.test(releaseWorkflow) ||
    releaseWorkflow.includes('node bin/ci/classify-changes.mjs'),
  'ci.yml must classify changed files with bin/ci/classify-changes.mjs.'
);

check(
  !releaseWorkflow.includes('ci.override.json'),
  'ci.yml must not use a wp-env override file.'
);

check(
  !releaseWorkflow.includes('pnpm exec playwright test'),
  'ci.yml must run browser tests through the ci:e2e lane.'
);

check(Boolean(summaryJob), 'ci.yml has no summary job.');

for (const job of summaryDependencies) {
  check(
    summaryNeeds.includes(job),
    `The summary job must list "${job}" in needs:.`
  );
}

check(
  summaryCommands === 'node bin/ci/release-summary.mjs',
  'The summary job must delegate to bin/ci/release-summary.mjs.'
);

check(
  releaseSummaryScript.includes("requireSuccess('browser E2E', results.e2e)"),
  'The release summary script must assert the E2E result explicitly.'
);

check(
  releaseSummaryScript.includes('### Required CI gate passed.'),
  'The release summary script must state its verdict.'
);

check(
  releaseSummaryScript.includes('process.exitCode = 1'),
  'The release summary script must exit non-zero on failure.'
);

check(
  packageJson.scripts['test:tools'].includes('bin/ci/release-summary.test.mjs'),
  'test:tools must exercise the release summary policy.'
);
