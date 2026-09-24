#!/usr/bin/env bash

# Report the isolated CI environment and fail if independence is broken.

set -euo pipefail

if [[ "${1:-}" == "--container" ]]; then
	core_version="$(wp core version)"
	php_version="$(php -r 'echo PHP_VERSION;')"
	site_url="$(wp option get siteurl)"
	active_theme="$(wp theme list --status=active --field=name | head -n 1)"
	plugin_status="$(wp plugin list --name=aggressive-blocks --field=status 2>/dev/null || true)"
	plugin_status="${plugin_status:-not installed}"
	aa_theme_status="$(wp theme list --name=aggressive-apparel --field=status 2>/dev/null || true)"
	aa_theme_status="${aa_theme_status:-not installed}"
	woocommerce_status="$(wp plugin list --name=woocommerce --field=status 2>/dev/null || true)"
	woocommerce_status="${woocommerce_status:-not installed}"
	beta_tester_status="$(wp plugin list --name=wordpress-beta-tester --field=status 2>/dev/null || true)"
	beta_tester_status="${beta_tester_status:-not installed}"
	beta_channel="$(wp option get wp_beta_tester --format=json 2>/dev/null || echo "not configured")"

	cat <<EOF
wp-env development health
  Site URL:              ${site_url}
  WordPress:             ${core_version}
  PHP:                   ${php_version}
  Active theme:          ${active_theme:-none}
  Aggressive Blocks:     ${plugin_status}
  Aggressive Apparel:    ${aa_theme_status}
  WooCommerce:           ${woocommerce_status}
  Beta Tester:           ${beta_tester_status}
  Beta channel:          ${beta_channel}
EOF

	health_failed=0

	if [[ "${plugin_status}" != "active" ]]; then
		echo "wp-env: aggressive-blocks must be active." >&2
		health_failed=1
	fi

	if [[ "${active_theme}" != "twentytwentyfive" ]]; then
		echo "wp-env: Twenty Twenty-Five must be the active theme (found ${active_theme:-none})." >&2
		health_failed=1
	fi

	if [[ "${aa_theme_status}" != "not installed" ]]; then
		echo "wp-env: Aggressive Apparel must not be present in the isolated environment." >&2
		health_failed=1
	fi

	if [[ "${woocommerce_status}" != "not installed" ]]; then
		echo "wp-env: WooCommerce must not be present in the isolated environment." >&2
		health_failed=1
	fi

	exit "${health_failed}"
fi

echo "This health checker is CI-only. Start the isolated environment with pnpm ci:env:reset." >&2
exit 2
