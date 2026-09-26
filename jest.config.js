import jestConfig from '@wordpress/scripts/config/jest-unit.config.js';

export default {
  ...jestConfig,
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
      statements: 32,
      branches: 29,
      functions: 29,
      lines: 32,
    },
  },
};
