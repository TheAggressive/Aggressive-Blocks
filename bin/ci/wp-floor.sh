#!/usr/bin/env bash

# The declared minimum. Install the packaged ZIP on the first release of the
# WordPress branch the plugin header requires ("Requires at least: 7.0" means
# 7.0.0), under the PHP it requires, and prove the plugin activates, registers
# every block it builds, renders them, and runs the Interactivity API block
# whose behavior sets that floor (Hero Carousel deep links need 7.0's anchor
# ids). PHP must log nothing.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd -P)"
cd "${REPO_ROOT}"

# shellcheck source=bin/ci/lib/native-wp.sh
source "${SCRIPT_DIR}/lib/native-wp.sh"

release_version="${AA_RELEASE_VERSION:-}"
package_path="${REPO_ROOT}/aggressive-blocks${release_version:+-${release_version}}.zip"
if [[ ! -f "${package_path}" ]]; then
	echo "Expected $(basename "${package_path}") in the repository root (pnpm ci:package)." >&2
	exit 1
fi

header() {
	sed -n "s/^ \* ${1}:[[:space:]]*\([^[:space:]]*\).*$/\1/p" aggressive-blocks.php | head -n 1
}
wp_floor="$(header 'Requires at least')"
php_floor="$(header 'Requires PHP')"
php_running="$("${NATIVE_PHP}" -r 'echo PHP_MAJOR_VERSION . "." . PHP_MINOR_VERSION;')"

if [[ ! "${wp_floor}" =~ ^[0-9]+\.[0-9]+$ ]]; then
	echo "Requires at least must name a WordPress branch like 7.0, got: ${wp_floor}" >&2
	exit 1
fi
if [[ "${php_running}" != "${php_floor}" ]]; then
	if [[ -n "${CI:-}" ]]; then
		echo "The floor lane must run on PHP ${php_floor}, not ${php_running}." >&2
		exit 1
	fi
	echo "Warning: PHP ${php_running} is not the ${php_floor} floor; CI runs ${php_floor}." >&2
fi

native_wp_init floor "${wp_floor}" "${AB_FLOOR_PORT:-9970}"
trap native_wp_cleanup EXIT
native_wp_install "${package_path}"
"${NATIVE_WP}" theme activate twentytwentyfive

# Every block the build ships is registered.
# shellcheck disable=SC2016 # PHP source: its $ variables are PHP's.
"${NATIVE_WP}" eval '
	$manifest = require WP_PLUGIN_DIR . "/aggressive-blocks/build/blocks-manifest.php";
	$registry = WP_Block_Type_Registry::get_instance();
	$missing  = array();
	foreach ( $manifest as $metadata ) {
		if ( ! $registry->is_registered( $metadata["name"] ) ) {
			$missing[] = $metadata["name"];
		}
	}
	if ( array() !== $missing ) {
		WP_CLI::error( "Not registered: " . implode( ", ", $missing ) );
	}
	WP_CLI::success( count( $manifest ) . " blocks registered." );
'

echo "floor: WordPress $("${NATIVE_WP}" core version), PHP ${php_running}, Aggressive Blocks $("${NATIVE_WP}" plugin get aggressive-blocks --field=version)"

native_wp_serve

CI=1 \
	WP_BASE_URL="${NATIVE_BASE_URL}" \
	playwright test --project=chromium \
	tests/e2e/independent-site.spec.ts \
	tests/e2e/copyright.spec.ts \
	tests/e2e/hero-carousel.spec.ts \
	"$@"

# Any problem at all: the floor site runs only core and the plugin.
native_wp_assert_clean_log ''
