#!/usr/bin/env bash

# Prove a release installs through the plugin's own updater, against GitHub.
#
# Run after a release is published. The released code is packaged as an old
# version (0.0.1) and installed into a clean WordPress that is neither a
# checkout nor a development environment, as a customer site would be. Then:
#
#   1. WordPress offers the release, with its exact package URL and the
#      requirements its readme declares, and updating installs it.
#   2. Served a wrong checksum, the update is refused and 0.0.1 stays active.
#   3. Given a poisoned download cache (WP-CLI's), the update is refused too.
#
# AA_RELEASE_VERSION is the published version to update to.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd -P)"
cd "${REPO_ROOT}"

RELEASE="${AA_RELEASE_VERSION:-}"
if [[ ! "${RELEASE}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
	echo "AA_RELEASE_VERSION must be the published X.Y.Z release, got '${RELEASE}'." >&2
	exit 2
fi

OLD_VERSION='0.0.1'
PLUGIN='aggressive-blocks/aggressive-blocks.php'

# shellcheck source=bin/ci/lib/native-wp.sh
source "${SCRIPT_DIR}/lib/native-wp.sh"

# The package script writes its ZIP to the repository root.
bash bin/release/package.sh "${OLD_VERSION}"
old_package="${REPO_ROOT}/aggressive-blocks-${OLD_VERSION}.zip"

wp_version="$(node -p 'require("./bin/ci/artifact/.wp-env.json").core.match(/wordpress-(.+)\.zip$/)[1]')"
native_wp_init update-smoke "${wp_version}" "${AB_UPDATE_SMOKE_PORT:-9990}"
WP_CLI_CACHE_DIR="${NATIVE_ROOT}/wp-cli-cache"
export WP_CLI_CACHE_DIR

cleanup() {
	rm -f "${old_package}"
	native_wp_cleanup
}
trap cleanup EXIT

native_wp_install "${old_package}"
mu_plugins="${NATIVE_WP_DIR}/wp-content/mu-plugins"

fail() {
	echo "update-smoke: $*" >&2
	exit 1
}

installed_version() {
	"${NATIVE_WP}" plugin get aggressive-blocks --field=version
}

# Reinstall 0.0.1 and clear every cache, so each case starts the same.
reset_install() {
	rm -rf "${mu_plugins}" "${WP_CLI_CACHE_DIR}"
	mkdir -p "${mu_plugins}" "${WP_CLI_CACHE_DIR}/plugin"
	"${NATIVE_WP}" plugin install "${old_package}" --activate --force >/dev/null
	"${NATIVE_WP}" transient delete --all --network >/dev/null
	"${NATIVE_WP}" transient delete --all >/dev/null
	[[ "$(installed_version)" == "${OLD_VERSION}" ]] || fail "could not reinstall ${OLD_VERSION}."
}

# Update, and require the installed version afterwards.
expect_update() {
	local expected="$1"
	"${NATIVE_WP}" plugin update aggressive-blocks || true
	[[ "$(installed_version)" == "${expected}" ]] || fail "expected ${expected} after updating, found $(installed_version)."
	[[ "$("${NATIVE_WP}" plugin get aggressive-blocks --field=status)" == active ]] || fail 'the plugin is not active after updating.'
}

echo "update-smoke: ${OLD_VERSION} → v${RELEASE} on WordPress ${wp_version}"
[[ -e "${NATIVE_WP_DIR}/wp-content/plugins/aggressive-blocks/.git" ]] && fail 'the install must not be a checkout.'

# 1. The release is offered exactly, and installs.
reset_install
# shellcheck disable=SC2016 # PHP source: its $ variables are PHP's.
offer="$("${NATIVE_WP}" eval '
	wp_update_plugins();
	$item = get_site_transient( "update_plugins" )->response["'"${PLUGIN}"'"] ?? null;
	echo $item ? implode( "|", array( $item->new_version, $item->package, $item->requires ?? "", $item->requires_php ?? "" ) ) : "none";
')"
expected_package="https://github.com/TheAggressive/Aggressive-Blocks/releases/download/v${RELEASE}/aggressive-blocks-${RELEASE}.zip"
IFS='|' read -r offered_version offered_package offered_requires offered_php <<<"${offer}"
[[ "${offered_version}" == "${RELEASE}" ]] || fail "WordPress was offered '${offer}', not v${RELEASE}."
[[ "${offered_package}" == "${expected_package}" ]] || fail "the offered package is ${offered_package}."
[[ -n "${offered_requires}" && -n "${offered_php}" ]] || fail "the offer carries no requirements: '${offer}'."
echo "update-smoke: offered ${offered_version} (requires WordPress ${offered_requires}, PHP ${offered_php})"
expect_update "${RELEASE}"
echo "update-smoke: the genuine release installed"

# 2. A wrong checksum is refused.
reset_install
cat >"${mu_plugins}/wrong-checksum.php" <<'PHP'
<?php
add_filter( 'pre_http_request', static function ( $pre, $args, $url ) {
	if ( str_ends_with( $url, '.zip.sha256' ) ) {
		return array( 'headers' => array(), 'body' => str_repeat( 'a', 64 ) . '  x.zip', 'response' => array( 'code' => 200, 'message' => 'OK' ), 'cookies' => array(), 'filename' => null );
	}
	return $pre;
}, 10, 3 );
PHP
expect_update "${OLD_VERSION}"
echo "update-smoke: a wrong checksum was refused"

# 3. A poisoned download cache is refused.
reset_install
printf 'PK not the release' >"${WP_CLI_CACHE_DIR}/plugin/aggressive-blocks-${RELEASE}.zip"
expect_update "${OLD_VERSION}"
echo "update-smoke: a poisoned download cache was refused"

native_wp_assert_clean_log "${NATIVE_WP_DIR}/wp-content/plugins/aggressive-blocks/"
echo "update-smoke: v${RELEASE} is installable through the updater."
