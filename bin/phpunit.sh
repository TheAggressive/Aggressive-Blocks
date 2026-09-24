#!/usr/bin/env bash
# Run plugin PHPUnit using the theme's disposable WordPress test install when present.

set -euo pipefail

cd "$(dirname "$0")/.."

theme_root="$(cd ../../themes/aggressive-apparel && pwd -P)"

if [[ -x "${theme_root}/bin/local/mysql.sh" ]]; then
	bash "${theme_root}/bin/local/mysql.sh" start
	bash "${theme_root}/bin/local/wp-core.sh"
	export AA_TESTS_ABSPATH="${theme_root}/${AA_TESTS_WP_DIR:-.cache/local/wordpress}"
	export AA_TESTS_DB_HOST="127.0.0.1:${AA_TESTS_DB_PORT:-13316}"
fi

export WP_TESTS_DIR="${WP_TESTS_DIR:-$(pwd)/vendor/wp-phpunit/wp-phpunit}"
wp_phpunit_config="$(pwd)/tests/wp-tests-config.php"
export WP_PHPUNIT__TESTS_CONFIG="${wp_phpunit_config}"

./vendor/bin/phpunit "$@"
