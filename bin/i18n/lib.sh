#!/usr/bin/env bash
# Shared helpers for plugin i18n tooling.
# shellcheck shell=bash

set -euo pipefail

AA_I18N_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AA_THEME_ROOT="$(cd "${AA_I18N_DIR}/../.." && pwd)"
AA_TEXT_DOMAIN="${AA_TEXT_DOMAIN:-aggressive-blocks}"
AA_LANGUAGES_DIR="${AA_THEME_ROOT}/languages"
# Read by the scripts that source this file; ShellCheck sees one file.
# shellcheck disable=SC2034
AA_POT_FILE="${AA_LANGUAGES_DIR}/${AA_TEXT_DOMAIN}.pot"
AA_I18N_EXCLUDE="${AA_I18N_EXCLUDE:-node_modules,vendor,build,coverage,tests,.git,bin,.wp-env,.wp-env-ci,.wp-env-backups,.wp-env-backup-staging,.cache,local-uploads}"
# Script pass: build/ only. Exclude src/ so a WP-CLI that learns TypeScript
# cannot add a second, unloadable reference for the same string.
AA_I18N_SCRIPT_EXCLUDE="${AA_I18N_SCRIPT_EXCLUDE:-node_modules,vendor,src,coverage,tests,.git,bin,.wp-env,.wp-env-ci,.wp-env-backups,.wp-env-backup-staging,.cache,local-uploads}"

# Container-relative theme path when using wp-env.
AA_WP_ENV_THEME_CWD="${AA_WP_ENV_THEME_CWD:-wp-content/plugins/aggressive-blocks}"

aa_i18n_info() {
	printf 'i18n: %s\n' "$*"
}

aa_i18n_die() {
	printf 'i18n: ERROR: %s\n' "$*" >&2
	exit 1
}

aa_i18n_ensure_languages_dir() {
	mkdir -p "${AA_LANGUAGES_DIR}"
}

# Load gitignored local secrets (`.env.local`, then `.env`) without overriding
# variables already set in the shell / CI.
aa_i18n_load_dotenv() {
	local env_file
	for env_file in "${AA_THEME_ROOT}/.env.local" "${AA_THEME_ROOT}/.env"; do
		[[ -f "${env_file}" ]] || continue
		# Export KEY=value lines; skip comments and blanks.
		set -a
		# shellcheck disable=SC1090
		source "${env_file}"
		set +a
	done
}

# Run WP-CLI through Studio locally or the isolated wp-env container in CI.
aa_i18n_wp() {
	if [[ "${AA_I18N_FORCE_WP_ENV:-0}" == "1" ]]; then
		command -v wp-env >/dev/null 2>&1 || aa_i18n_die "wp-env is required (AA_I18N_FORCE_WP_ENV=1)."
		CI=true wp-env run cli --env-cwd="${AA_WP_ENV_THEME_CWD}" wp "$@"
		return
	fi

	# Probe the same invocation we run. `wp help i18n` exits 255 on some
	# WP-CLI + PHP combinations because of vendor deprecations; make-pot --help does not.
	if command -v wp >/dev/null 2>&1 && wp --allow-root i18n make-pot --help >/dev/null 2>&1; then
		( cd "${AA_THEME_ROOT}" && wp --allow-root "$@" )
		return
	fi

	if command -v studio >/dev/null 2>&1 && \
		[[ -f "${AA_THEME_ROOT}/bin/local/studio.mjs" ]] && \
		node "${AA_THEME_ROOT}/bin/local/studio.mjs" wp i18n make-pot --help >/dev/null 2>&1; then
		local -a studio_args=( "$@" )
		if [[ "${studio_args[0]:-}" == "i18n" && \
			"${studio_args[1]:-}" == "make-pot" && \
			"${studio_args[2]:-}" == "." ]]; then
			studio_args[2]="${AA_THEME_ROOT}"
		fi
		node "${AA_THEME_ROOT}/bin/local/studio.mjs" wp \
			'--exec=ini_set( "memory_limit", "1G" );' \
			"${studio_args[@]}"
		return
	fi

	if command -v wp-env >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
		CI=true wp-env run cli --env-cwd="${AA_WP_ENV_THEME_CWD}" wp "$@"
		return
	fi

	aa_i18n_die "Need WordPress Studio or WP-CLI with the i18n package; CI may use wp-env."
}

# Extract the plugin POT into $1.
#
# PHP and block.json strings come from the source tree. Script strings come
# from build/: wp i18n make-json names each JSON catalog after the md5 of the
# script path in the POT reference, and load_script_textdomain() hashes the
# enqueued build/ path, so a src/ reference would never be loaded. WP-CLI
# also does not parse src/ TypeScript. Callers must build first.
aa_i18n_make_pot() {
	local dest="$1"
	local tmp_dir

	[[ -d "${AA_THEME_ROOT}/build" ]] || aa_i18n_die "build/ is missing. Run: pnpm build"

	tmp_dir="$(mktemp -d)"
	# shellcheck disable=SC2064 # Expand now: tmp_dir is local to this call.
	trap "rm -rf '${tmp_dir}'; trap - RETURN" RETURN

	aa_i18n_wp i18n make-pot \
		. \
		"${tmp_dir}/source.pot" \
		--domain="${AA_TEXT_DOMAIN}" \
		--exclude="${AA_I18N_EXCLUDE}" \
		--skip-js

	aa_i18n_wp i18n make-pot \
		. \
		"${dest}" \
		--domain="${AA_TEXT_DOMAIN}" \
		--include=build \
		--exclude="${AA_I18N_SCRIPT_EXCLUDE}" \
		--skip-php \
		--skip-block-json \
		--merge="${tmp_dir}/source.pot"
}

# Strip volatile POT headers for stable CI diffs.
# Report-Msgid-Bugs-To follows the on-disk theme folder name (aggressive-apparel
# vs Aggressive-Apparel), which differs between local checkouts and CI clones.
aa_i18n_normalize_pot() {
	local src="$1"
	local dest="$2"

	# Project-Id-Version carries the theme version, which semantic-release bumps
	# on every release without regenerating the committed POT — so the header
	# lags by one version and would otherwise flag as drift on the next push.
	# It is a version stamp, not translatable content; normalize it away like
	# the other volatile headers below.
	sed -E \
		-e 's/^"Project-Id-Version: .+\\n"$/"Project-Id-Version: Aggressive Blocks\\n"/' \
		-e 's/^"POT-Creation-Date: .+\\n"$/"POT-Creation-Date: YEAR-MO-DA HO:MI+ZONE\\n"/' \
		-e 's/^"PO-Revision-Date: .+\\n"$/"PO-Revision-Date: YEAR-MO-DA HO:MI+ZONE\\n"/' \
		-e 's/^"X-Generator: .+\\n"$/"X-Generator: WP-CLI\\n"/' \
		-e 's|^"Report-Msgid-Bugs-To: .+\\n"$|"Report-Msgid-Bugs-To: https://wordpress.org/support/plugin/aggressive-blocks\\n"|' \
		"${src}" > "${dest}"
}

aa_i18n_list_po_files() {
	find "${AA_LANGUAGES_DIR}" -maxdepth 1 -type f -name "${AA_TEXT_DOMAIN}-*.po" | sort
}

aa_i18n_locale_from_po() {
	local po_file="$1"
	local base
	base="$(basename "${po_file}" .po)"
	printf '%s\n' "${base#"${AA_TEXT_DOMAIN}-"}"
}
