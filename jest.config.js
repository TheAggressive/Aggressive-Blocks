import jestConfig from '@wordpress/scripts/config/jest-unit.config.js';

export default {
  ...jestConfig,
  roots: ['<rootDir>/src'],
  reporters: ['default', '<rootDir>/bin/ci/jest-no-skips-reporter.cjs'],
};
