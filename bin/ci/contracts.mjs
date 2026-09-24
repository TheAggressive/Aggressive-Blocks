/**
 * CI and wp-env contracts.
 *
 * Loading this file runs every assertion. The first failure names the file
 * and value to fix.
 */

import './contracts/guards.mjs';
import './contracts/toolchain.mjs';
import './contracts/wp-env.mjs';
import './contracts/workflows.mjs';

console.log('CI and wp-env contracts passed.');
