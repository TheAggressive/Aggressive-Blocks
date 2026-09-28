#!/usr/bin/env bash

# Aggressive Apparel against the packaged plugin: install the ZIP into a clean
# WordPress, add the theme from its repository with the WooCommerce version the
# theme pins, and check that every plugin block the theme uses registers,
# validates in the editor, and renders on the front end.
#
# AB_THEME_DIR is a built checkout of TheAggressive/Aggressive-Apparel. The
# plugin's own lanes never need it; see docs/ci.md.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd -P)"
AB_THEME_DIR="${AB_THEME_DIR:-${REPO_ROOT}/.cache/ci/aggressive-apparel}"
PACKAGE_PATH="${REPO_ROOT}/aggressive-blocks.zip"
cd "${REPO_ROOT}"

# shellcheck source=bin/ci/lib/native-wp.sh
source "${SCRIPT_DIR}/lib/native-wp.sh"

if [[ ! -f "${PACKAGE_PATH}" ]]; then
	echo "Expected aggressive-blocks.zip in the repository root (pnpm ci:package)." >&2
	exit 1
fi
if ! grep -q '^Theme Name: Aggressive Apparel$' "${AB_THEME_DIR}/style.css" 2>/dev/null; then
	echo "AB_THEME_DIR must be an Aggressive Apparel checkout: ${AB_THEME_DIR}" >&2
	exit 1
fi
if [[ ! -f "${AB_THEME_DIR}/build/blocks-manifest.php" ]]; then
	echo "Build the theme first: pnpm --dir \"${AB_THEME_DIR}\" build" >&2
	exit 1
fi

# The primary CI WordPress, and the WooCommerce release the theme tests with.
wp_version="$(node -p 'require("./bin/ci/artifact/.wp-env.json").core.match(/wordpress-(.+)\.zip$/)[1]')"
woocommerce_zip="$(
	node -p 'JSON.parse(require("fs").readFileSync(process.argv[1])).env.tests.plugins.find(url => url.includes("/woocommerce."))' \
		"${AB_THEME_DIR}/bin/ci/.wp-env.json"
)"

native_wp_init integration "${wp_version}" "${AB_INTEGRATION_PORT:-9960}"
trap native_wp_cleanup EXIT
native_wp_install "${PACKAGE_PATH}"

"${NATIVE_WP}" plugin install "${woocommerce_zip}" --activate --force
# A copy of the built theme, as a site would install it. A symlink would put
# the theme checkout (and the WordPress its own tooling links back to it)
# inside this repository's tree.
theme_dir="${NATIVE_WP_DIR}/wp-content/themes/aggressive-apparel"
rm -rf "${theme_dir}"
mkdir -p "${theme_dir}"
tar -C "${AB_THEME_DIR}" --exclude=./node_modules --exclude=./.git --exclude=./.cache -cf - . |
	tar -C "${theme_dir}" -xf -
"${NATIVE_WP}" theme activate aggressive-apparel

# A product, so the single-product template has something to render.
product_id="$("${NATIVE_WP}" post create --post_type=product --post_status=publish \
	--post_title='Integration Tee' --porcelain)"
"${NATIVE_WP}" post meta update "${product_id}" _regular_price 30
"${NATIVE_WP}" post meta update "${product_id}" _price 30

echo "integration: WordPress ${wp_version}, $("${NATIVE_WP}" plugin get woocommerce --field=title) $("${NATIVE_WP}" plugin get woocommerce --field=version), Aggressive Apparel $("${NATIVE_WP}" theme get aggressive-apparel --field=version), Aggressive Blocks $("${NATIVE_WP}" plugin get aggressive-blocks --field=version)"

native_wp_serve

CI=1 \
	WP_BASE_URL="${NATIVE_BASE_URL}" \
	AB_INTEGRATION_PRODUCT_URL="$("${NATIVE_WP}" post list --post_type=product --post__in="${product_id}" --field=url)" \
	playwright test --config playwright.integration.config.ts "$@"

# Files under the plugin or the theme, and core notices naming the plugin's
# text domain (_doing_it_wrong reports those from wp-includes).
native_wp_assert_clean_log \
	"${NATIVE_WP_DIR}/wp-content/plugins/aggressive-blocks/" \
	"${theme_dir}/" \
	'<code>aggressive-blocks</code>'
