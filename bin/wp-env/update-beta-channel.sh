#!/usr/bin/env bash
#
# Move the running wp-env site onto the WordPress Bleeding Edge Beta/RC channel.
#
# DESTRUCTIVE. `wp core update` replaces wp-content with the one from the
# WordPress package, so this backs wp-content up first and restores it after.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CI_WP_ENV="${SCRIPT_DIR}/../ci/wp-env.sh"

if [[ "${WP_ENV_SKIP_BETA_UPDATE:-0}" == "1" ]]; then
	echo "wp-env: skipping the WordPress Beta/RC update."
	exit 0
fi

echo "wp-env: selecting the WordPress Bleeding Edge Beta/RC Only channel..."

# shellcheck disable=SC2016
bash "${CI_WP_ENV}" run cli --env-cwd=wp-content/plugins/aggressive-blocks -- bash -c '
	set -euo pipefail

	count_wp_content() {
		find /var/www/html/wp-content \
			-path /var/www/html/wp-content/plugins/aggressive-blocks -prune -o \
			-path /var/www/html/wp-content/plugins/wordpress-beta-tester -prune -o \
			-type f -print 2>/dev/null | wc -l
	}

	wp plugin install wordpress-beta-tester --activate --force

	wp option update wp_beta_tester \
		"{\"channel\":\"development\",\"stream-option\":\"beta\"}" \
		--format=json
	wp transient delete update_core --network

	update_count=$(wp core check-update --format=count)
	if [[ "$update_count" == "0" ]]; then
		echo "WordPress is already on the latest Beta/RC."
		exit 0
	fi

	files_before=$(count_wp_content)
	echo "wp-content files before core update: ${files_before}"

	backup_archive=$(mktemp /tmp/wp-content-before-core-update.XXXXXX)

	tar \
		--exclude="wp-content/plugins/aggressive-blocks" \
		--exclude="wp-content/plugins/wordpress-beta-tester" \
		-C /var/www/html \
		-cf "$backup_archive" \
		wp-content

	archived=$(tar -tf "$backup_archive" | grep -c "^wp-content/" || true)
	if [[ "$archived" -eq 0 ]]; then
		echo "wp-env: the wp-content archive is empty; refusing to run core update." >&2
		exit 1
	fi
	echo "Archived ${archived} wp-content entries."

	restore_wp_content() {
		mkdir -p /var/www/html/wp-content
		tar -C /var/www/html -xf "$backup_archive"
	}

	trap restore_wp_content EXIT
	wp core update
	restore_wp_content
	trap - EXIT

	files_after=$(count_wp_content)
	echo "wp-content files after restore: ${files_after}"

	if [[ "$files_after" -lt "$files_before" ]]; then
		echo "wp-env: wp-content restore lost $((files_before - files_after)) file(s)." >&2
		echo "wp-env: archive kept at ${backup_archive} inside the cli container." >&2
		exit 1
	fi

	rm -f "$backup_archive"
	wp core update-db
'

echo "wp-env: site is on the latest available WordPress Beta/RC."
