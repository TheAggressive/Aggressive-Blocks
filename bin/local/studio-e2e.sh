#!/usr/bin/env bash
#
# Run the browser suite against the WordPress Studio site that serves this
# checkout, for local feedback without Docker. CI's wp-env lane stays the
# release proof: this site also runs other plugins (Gutenberg, WooCommerce,
# Query Monitor) and its own theme, so a pass here is a strong signal, not
# parity. independent-site.spec.ts is excluded (see playwright.config.ts):
# a site with Aggressive Apparel installed cannot prove the plugin runs
# without it.
#
# The suite mutates the site it runs against. Everything it changes is
# recorded first and put back on the way out, on success and failure alike:
#
#   * the active theme (the suite needs Twenty Twenty-Five);
#   * the admin user's front-end admin bar preference (the bar shifts layout);
#   * pages the specs create, which are all titled "E2E <timestamp>". The
#     specs delete their own; cleanup removes any a killed run left behind.
#
# Nothing is irreversible: login uses Studio's auto-login URL, so no password
# is reset. The site still has to opt in before this touches it: create
# .aggressive-blocks-e2e-site in its root, or export AB_STUDIO_E2E_ALLOW=1
# for one run.
#
# Usage: bin/local/studio-e2e.sh [playwright test args…]

set -euo pipefail

cd "$(dirname "$0")/../.."

repo_root="$(pwd -P)"
requested_path="${AB_STUDIO_PATH:-}"

if ! command -v studio >/dev/null 2>&1; then
	echo "studio-e2e: Studio CLI is not installed or not on PATH." >&2
	echo "Enable it in Studio: Settings → General → Studio CLI for terminal." >&2
	exit 1
fi

# Pick the site whose plugins/aggressive-blocks resolves to this checkout, or
# the one AB_STUDIO_PATH names. The listing goes to node on stdin, not through
# the environment: it can carry stored credentials, and a child environment is
# readable from /proc and echoed by any `set -x`.
mapfile -t discovery < <(
	studio site list --format=json |
		AB_PLUGIN_ROOT="${repo_root}" AB_STUDIO_REQUESTED="${requested_path}" node -e '
			const fs = require("node:fs");
			const path = require("node:path");
			const parsed = JSON.parse(fs.readFileSync(0, "utf8"));
			const sites = Array.isArray(parsed) ? parsed : parsed.sites ?? [];
			const real = target => {
				try {
					return fs.realpathSync(target);
				} catch {
					return null;
				}
			};
			const root = real(process.env.AB_PLUGIN_ROOT);
			const requested = process.env.AB_STUDIO_REQUESTED;
			const wanted = requested ? real(requested) : null;
			if (requested && wanted === null) {
				process.stdout.write("missing\n" + requested + "\n");
				process.exit(0);
			}
			const matches = sites
				.map(site => site.path ?? site.sitePath ?? null)
				.filter(Boolean)
				.filter(sitePath =>
					wanted
						? real(sitePath) === wanted
						: real(path.join(sitePath, "wp-content/plugins/aggressive-blocks")) === root
				);
			if (matches.length === 1) {
				process.stdout.write("ok\n" + matches[0] + "\n");
			} else if (matches.length > 1) {
				process.stdout.write("ambiguous\n" + matches.join("\n") + "\n");
			} else {
				process.stdout.write("none\n");
			}
		'
)

case "${discovery[0]:-}" in
	ok) site_path="${discovery[1]}" ;;
	ambiguous)
		echo "studio-e2e: several Studio sites serve this checkout:" >&2
		printf '  %s\n' "${discovery[@]:1}" >&2
		echo "Set AB_STUDIO_PATH to the one you mean." >&2
		exit 1
		;;
	missing)
		echo "studio-e2e: AB_STUDIO_PATH does not exist: ${discovery[1]}" >&2
		exit 1
		;;
	none)
		echo "studio-e2e: no Studio site serves this checkout." >&2
		echo "Set AB_STUDIO_PATH to the Studio site root." >&2
		exit 1
		;;
	*)
		echo "studio-e2e: could not read the Studio site list." >&2
		exit 1
		;;
esac

if [[ "${AB_STUDIO_E2E_ALLOW:-}" != "1" && ! -e "${site_path}/.aggressive-blocks-e2e-site" ]]; then
	cat >&2 <<-CONSENT
		studio-e2e: ${site_path} has not opted in to browser testing.

		For the length of a run the suite switches the theme to Twenty Twenty-Five,
		hides the admin's front-end admin bar, and creates "E2E <timestamp>" pages.
		All of it is restored afterwards. To allow it:

		  touch "${site_path}/.aggressive-blocks-e2e-site"

		or export AB_STUDIO_E2E_ALLOW=1 for a single run.
	CONSENT
	exit 1
fi

wp() {
	studio wp --path "${site_path}" "$@"
}

# stdout is dropped: `studio site start` prints the admin password.
studio site start --path "${site_path}" >/dev/null

# Only the URLs and the username leave node; the password in the status
# payload never reaches a variable or the log.
mapfile -t connection < <(
	studio status --path "${site_path}" --format json | node -e '
		const status = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
		const site = new URL(status.siteUrl ?? "");
		const login = new URL(status.autoLoginUrl ?? "");
		if (site.origin !== login.origin) process.exit(2);
		process.stdout.write(
			site.href.replace(/\/$/u, "") + "\n" + login.href + "\n" + (status.adminUsername ?? "admin") + "\n"
		);
	'
)

base_url="${connection[0]:-}"
auto_login_url="${connection[1]:-}"
admin_user="${connection[2]:-}"

if [[ ! "${base_url}" =~ ^https?:// || -z "${auto_login_url}" || -z "${admin_user}" ]]; then
	echo "studio-e2e: Studio returned no usable site URL, auto-login URL, or admin user." >&2
	exit 1
fi

served_plugin="$(wp eval 'echo realpath( WP_PLUGIN_DIR . "/aggressive-blocks" );' | tr -d '\r\n')"
if [[ "${served_plugin}" != "${repo_root}" ]]; then
	echo "studio-e2e: ${site_path} is not serving this checkout." >&2
	echo "Expected: ${repo_root}" >&2
	echo "Actual:   ${served_plugin:-missing plugin}" >&2
	exit 1
fi

home_url="$(wp option get home | tr -d '\r\n')"
if [[ "${home_url%/}" != "${base_url}" ]]; then
	echo "studio-e2e: the site's home option (${home_url}) is not the URL Studio serves (${base_url})." >&2
	echo "Fix it in Studio before running the suite; this script does not rewrite it." >&2
	exit 1
fi

# What to put back, kept in a file so a run killed before its trap (SIGKILL, a
# closed terminal) does not make the next run mistake the test state for the
# original. While the file exists it is the truth, not the live site.
restore_file="${site_path}/.aggressive-blocks-e2e-restore"

if [[ -f "${restore_file}" ]]; then
	original_theme="$(sed -n '1p' "${restore_file}" | tr -d '\r\n')"
	original_admin_bar="$(sed -n '2p' "${restore_file}" | tr -d '\r\n')"
	echo "studio-e2e: a previous run did not clean up; recovering its record." >&2
	echo "  theme:     ${original_theme}" >&2
	echo "  admin bar: ${original_admin_bar:-unset}" >&2
else
	original_theme="$(wp option get stylesheet | tr -d '\r\n')"
	original_admin_bar="$(wp user meta get "${admin_user}" show_admin_bar_front 2>/dev/null | tr -d '\r\n' || true)"
	printf '%s\n%s\n' "${original_theme}" "${original_admin_bar}" >"${restore_file}"
fi

cleanup() {
	status=$?
	cleanup_failed=0
	trap - EXIT
	set +e

	if [[ "$(wp option get stylesheet 2>/dev/null | tr -d '\r\n')" != "${original_theme}" ]]; then
		wp theme activate "${original_theme}" >/dev/null || cleanup_failed=1
	fi

	if [[ -n "${original_admin_bar}" ]]; then
		wp user meta update "${admin_user}" show_admin_bar_front "${original_admin_bar}" >/dev/null || cleanup_failed=1
	else
		wp user meta delete "${admin_user}" show_admin_bar_front >/dev/null 2>&1
	fi

	# Only exact "E2E <13-digit timestamp>" titles, which only the specs create.
	# shellcheck disable=SC2016 # PHP variables, not shell ones.
	wp eval '
		$ids = get_posts( array( "post_type" => "page", "post_status" => "any", "numberposts" => -1, "fields" => "ids" ) );
		foreach ( $ids as $id ) {
			if ( preg_match( "/^E2E \d{13}$/", get_the_title( $id ) ) ) {
				wp_delete_post( $id, true );
			}
		}
	' >/dev/null || cleanup_failed=1

	# Last, and only when the restore worked: a record removed after a failed
	# restore would hand the next run the test state as its baseline.
	if [[ "${cleanup_failed}" -eq 0 ]]; then
		rm -f "${restore_file}"
	else
		echo "studio-e2e: keeping ${restore_file} so the next run can recover." >&2
		[[ "${status}" -eq 0 ]] && status=1
	fi

	exit "${status}"
}
trap cleanup EXIT

wp plugin activate aggressive-blocks >/dev/null
wp theme activate twentytwentyfive >/dev/null
wp user meta update "${admin_user}" show_admin_bar_front false >/dev/null

echo "studio-e2e: ${base_url} (${site_path}); theme and admin bar are restored afterwards."

WP_BASE_URL="${base_url}" \
	AB_E2E_STUDIO=1 \
	AB_E2E_AUTO_LOGIN_URL="${auto_login_url}" \
	pnpm exec playwright test "$@"
