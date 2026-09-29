// @wordpress/scripts 36 no longer bundles Jest; `test-unit-jest` runs this
// project-installed Jest with the defaults scripts 33 used to supply.
// See node_modules/@wordpress/scripts/docs/vitest-migration.md.
export default {
  preset: '@wordpress/jest-preset-default',
  transform: {
    '\\.[jt]sx?$': [
      'babel-jest',
      { presets: ['@wordpress/babel-preset-default'] },
    ],
  },
  roots: ['<rootDir>/src'],
  reporters: ['default', '<rootDir>/bin/ci/jest-no-skips-reporter.cjs'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/**/*.d.ts',
  ],
  // A ratchet, not a target: the measured floor when it was introduced,
  // rounded down. Raise it when coverage rises; never lower it to pass.
  // Editor UI and the modal store are covered by Playwright, not Jest.
  coverageThreshold: {
    global: {
      statements: 43,
      branches: 39,
      functions: 39,
      lines: 44,
    },
  },
};
