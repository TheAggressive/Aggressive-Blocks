/** Contracts for isolated CI wp-env: plugin only, default block theme, no theme source. */

import {
  artifactWpEnv,
  betaUpdater,
  betaWorkflow,
  check,
  packageJson,
  wpEnv,
} from '../lib/contract-inputs.mjs';

const stableCorePattern =
  /^https:\/\/wordpress\.org\/wordpress-\d+\.\d+\.\d+\.zip$/;

check(
  stableCorePattern.test(wpEnv.core),
  `bin/ci/.wp-env.json must pin stable WordPress (found "${wpEnv.core}").`
);

check(
  wpEnv.phpVersion === '8.2',
  `bin/ci/.wp-env.json must pin PHP 8.2 (found "${wpEnv.phpVersion}").`
);

check(
  !JSON.stringify(wpEnv).includes('woocommerce') &&
    !JSON.stringify(wpEnv).includes('aggressive-apparel'),
  'The isolated CI environment must not install WooCommerce or Aggressive Apparel.'
);

check(
  wpEnv.port === 9930 && wpEnv.testsPort === 9931,
  'The isolated CI environment must retain ports 9930 and 9931.'
);

check(
  !JSON.stringify(wpEnv).includes('lifecycleScripts'),
  'The CI parity environment must be reproducible without lifecycle hooks.'
);

for (const environment of ['development', 'tests']) {
  const mapping =
    wpEnv.env?.[environment]?.mappings?.[
      'wp-content/plugins/aggressive-blocks'
    ];
  check(
    mapping === '../..',
    `bin/ci/.wp-env.json ${environment} must map the plugin slug to ../.. (found ${JSON.stringify(mapping)}).`
  );
}

check(
  artifactWpEnv.core === wpEnv.core &&
    artifactWpEnv.phpVersion === wpEnv.phpVersion,
  'Artifact acceptance must use the release gate WordPress and PHP versions.'
);

check(
  !JSON.stringify(artifactWpEnv).includes(
    'wp-content/plugins/aggressive-blocks'
  ) &&
    artifactWpEnv.env?.development?.mappings?.['wp-content/ab-artifacts'] ===
      '../../../.cache/ci/artifact-files',
  'Artifact acceptance must install the ZIP without mapping plugin source.'
);

check(
  artifactWpEnv.port === 9940 && artifactWpEnv.testsPort === 9941,
  'Artifact acceptance must retain isolated ports 9940 and 9941.'
);

check(
  !JSON.stringify(artifactWpEnv).includes('aggressive-apparel') &&
    !JSON.stringify(artifactWpEnv).includes('woocommerce'),
  'Artifact acceptance must prove independence from Aggressive Apparel and WooCommerce.'
);

check(
  packageJson.scripts['ci:env:beta'] ===
    'bash bin/wp-env/update-beta-channel.sh' &&
    packageJson.scripts['ci:env:check'] === 'bash bin/ci/check-wp-env.sh',
  'Beta compatibility must use explicit ci:env:* commands.'
);

check(
  betaWorkflow.includes('pnpm ci:env:reset') &&
    betaWorkflow.includes('pnpm ci:env:beta') &&
    betaWorkflow.includes('pnpm ci:env:check') &&
    !betaWorkflow.includes('pnpm env:start'),
  'The beta workflow must never call local Studio lifecycle commands.'
);

check(
  betaUpdater.includes('/../ci/wp-env.sh') &&
    betaUpdater.includes('files_before') &&
    betaUpdater.includes('files_after'),
  'The beta updater must use the isolated CI wrapper and verify wp-content restore.'
);
