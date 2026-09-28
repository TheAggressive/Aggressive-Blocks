# shellcheck shell=bash
#
# A disposable WordPress, served by PHP's built-in server, that installs the
# packaged plugin ZIP. Lanes that need a WordPress other than the wp-env pin
# (the declared floor) or another repository's theme (Aggressive Apparel) use
# it. It needs no Docker, so the same lane runs in Actions and locally.
#
# Database: AB_WP_DB_HOST/USER/PASSWORD name a server the caller provides (the
# Actions MySQL service). Without them, the lane uses the disposable local
# MySQL that bin/phpunit.sh starts from the theme checkout, with its own
# database, and stops it again only if this run started it.
#
# Callers set REPO_ROOT, then call, in order:
#   native_wp_init <lane> <wordpress-version> <port>
#   trap native_wp_cleanup EXIT
#   native_wp_install <plugin-zip>
#   native_wp_serve
#   native_wp_assert_clean_log <text>...

NATIVE_PHP="${AB_PHP:-php}"
NATIVE_THEME_MYSQL="${AB_THEME_DIR:-${REPO_ROOT}/../../themes/aggressive-apparel}/bin/local/mysql.sh"
native_server_pid=""
native_stop_mysql=0

native_wp_init() {
	NATIVE_LANE="$1"
	NATIVE_WP_VERSION="$2"
	NATIVE_PORT="$3"
	NATIVE_ROOT="${REPO_ROOT}/.cache/ci/native-${NATIVE_LANE}"
	NATIVE_WP_DIR="${NATIVE_ROOT}/wordpress"
	NATIVE_WP="${NATIVE_ROOT}/wp"
	NATIVE_BASE_URL="http://127.0.0.1:${NATIVE_PORT}"
	NATIVE_DB_NAME="ab_${NATIVE_LANE//-/_}"

	if [[ -n "${AB_WP_DB_HOST:-}" ]]; then
		NATIVE_DB_HOST="${AB_WP_DB_HOST}"
		NATIVE_DB_USER="${AB_WP_DB_USER:-root}"
		NATIVE_DB_PASSWORD="${AB_WP_DB_PASSWORD:-}"
	elif [[ -f "${NATIVE_THEME_MYSQL}" ]]; then
		bash "${NATIVE_THEME_MYSQL}" status >/dev/null 2>&1 || native_stop_mysql=1
		bash "${NATIVE_THEME_MYSQL}" start
		NATIVE_DB_HOST="127.0.0.1:${AA_TESTS_DB_PORT:-13316}"
		NATIVE_DB_USER=root
		NATIVE_DB_PASSWORD=""
	else
		echo "Set AB_WP_DB_HOST, or check out Aggressive Apparel for its local MySQL." >&2
		return 1
	fi

	mkdir -p "${NATIVE_ROOT}"
	WP_CLI_INSTALL_PATH="${REPO_ROOT}/.cache/ci/wp" \
		WP_CLI_SKIP_INFO=1 \
		bash "${REPO_ROOT}/bin/ci/install-wp-cli.sh" >/dev/null

	# PHP notices go to stderr so they never mix with command output.
	cat >"${NATIVE_WP}" <<-SH
		#!/usr/bin/env bash
		exec "${NATIVE_PHP}" -d display_errors=stderr -d memory_limit=512M \\
			-d error_reporting='E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED' \\
			"${REPO_ROOT}/.cache/ci/wp" --path="${NATIVE_WP_DIR}" "\$@"
	SH
	chmod +x "${NATIVE_WP}"
}

native_wp_cleanup() {
	if [[ -n "${native_server_pid}" ]]; then
		kill "${native_server_pid}" 2>/dev/null || true
		wait "${native_server_pid}" 2>/dev/null || true
	fi
	if ((native_stop_mysql)) && ! bash "${NATIVE_THEME_MYSQL}" stop; then
		echo "Warning: the local MySQL server could not be stopped." >&2
	fi
}

native_wp_install() {
	local package_path="$1"
	local installed=""

	if [[ -f "${NATIVE_WP_DIR}/wp-includes/version.php" ]]; then
		installed="$(sed -n "s/^\$wp_version = '\([^']*\)';$/\1/p" "${NATIVE_WP_DIR}/wp-includes/version.php")"
	fi
	if [[ "${installed}" != "${NATIVE_WP_VERSION}" ]]; then
		rm -rf "${NATIVE_WP_DIR}"
		# The .zip: WP-CLI extracts the default .tar.gz with PharData, which
		# truncates the 100+ character paths WordPress 7 ships.
		"${NATIVE_WP}" core download "https://wordpress.org/wordpress-${NATIVE_WP_VERSION}.zip" --force
	fi
	"${NATIVE_WP}" core verify-checksums

	# Start from a clean wp-content: no plugin, theme, or log from a prior run.
	rm -rf "${NATIVE_WP_DIR}/wp-content/plugins/aggressive-blocks" \
		"${NATIVE_WP_DIR}/wp-content/upgrade" \
		"${NATIVE_WP_DIR}/wp-content/debug.log"

	"${NATIVE_WP}" config create \
		--dbname="${NATIVE_DB_NAME}" \
		--dbuser="${NATIVE_DB_USER}" \
		--dbpass="${NATIVE_DB_PASSWORD}" \
		--dbhost="${NATIVE_DB_HOST}" \
		--skip-check \
		--force

	# The same wp-config constants as the artifact-acceptance environment.
	local name value
	while IFS=$'\t' read -r name value; do
		"${NATIVE_WP}" config set "${name}" "${value}" --raw
	done < <(
		# shellcheck disable=SC2016 # A JavaScript template literal, not shell.
		node -e '
			const { config } = JSON.parse(require("fs").readFileSync(process.argv[1]));
			for (const [name, value] of Object.entries(config)) {
				console.log(`${name}\t${JSON.stringify(value)}`);
			}
		' "${REPO_ROOT}/bin/ci/artifact/.wp-env.json"
	)

	"${NATIVE_WP}" db reset --yes
	"${NATIVE_WP}" core install \
		--url="${NATIVE_BASE_URL}" \
		--title="Aggressive Blocks ${NATIVE_LANE}" \
		--admin_user=admin \
		--admin_password=password \
		--admin_email=admin@example.test \
		--skip-email
	# core install guesses siteurl from the path, and a site under this checkout
	# has "wp-content" in it, so WordPress takes it for a subdirectory install.
	"${NATIVE_WP}" option update siteurl "${NATIVE_BASE_URL}"
	"${NATIVE_WP}" option update home "${NATIVE_BASE_URL}"
	"${NATIVE_WP}" rewrite structure '/%postname%/'
	"${NATIVE_WP}" user meta update admin show_admin_bar_front false

	"${NATIVE_WP}" plugin install "${package_path}" --activate --force
}

native_wp_serve() {
	# Several workers so a loopback request (WP-Cron, REST preloading) never
	# waits behind the page request that triggered it.
	PHP_CLI_SERVER_WORKERS=4 "${NATIVE_PHP}" -S "127.0.0.1:${NATIVE_PORT}" -t "${NATIVE_WP_DIR}" \
		>"${NATIVE_ROOT}/server.log" 2>&1 &
	native_server_pid=$!

	local attempt
	for attempt in {1..30}; do
		curl --fail --silent --output /dev/null "${NATIVE_BASE_URL}/wp-login.php" && return 0
		if ! kill -0 "${native_server_pid}" 2>/dev/null; then
			break
		fi
		sleep 1
	done

	echo "WordPress did not start on ${NATIVE_BASE_URL} (attempt ${attempt})." >&2
	tail -n 20 "${NATIVE_ROOT}/server.log" >&2 || true
	return 1
}

# Fail on any PHP error, warning, notice, or deprecation in the debug log that
# contains one of the given strings ('' matches every line). WP-CLI's own PHAR
# is tooling, not code under test.
native_wp_assert_clean_log() {
	local log="${NATIVE_WP_DIR}/wp-content/debug.log"
	local filters=()
	local needle

	for needle in "$@"; do
		filters+=(-e "${needle}")
	done

	[[ -f "${log}" ]] || return 0
	if grep -E 'PHP (Fatal error|Parse error|Warning|Notice|Deprecated)' "${log}" |
		grep -v 'phar://' | grep -F "${filters[@]}"; then
		echo "PHP reported the problems above during the ${NATIVE_LANE} lane." >&2
		return 1
	fi
}
