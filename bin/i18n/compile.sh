#!/usr/bin/env bash
# Compile every locale .po into .mo + Jed JSON for classic scripts.
set -euo pipefail

# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

aa_i18n_ensure_languages_dir

po_files="$(aa_i18n_list_po_files || true)"
if [[ -z "${po_files}" ]]; then
	aa_i18n_info "No locale .po files to compile."
	exit 0
fi

while IFS= read -r po; do
	[[ -n "${po}" ]] || continue
	locale="$(aa_i18n_locale_from_po "${po}")"
	aa_i18n_info "Compiling ${locale}"

	# Binary catalog for PHP gettext.
	aa_i18n_wp i18n make-mo "${po}" "${AA_LANGUAGES_DIR}"

	# make-mo names its output after the .po: aggressive-blocks-de_DE.mo. Keep
	# that name. load_plugin_textdomain() registers this languages/ directory
	# and _load_textdomain_just_in_time() opens "{$path}{$domain}-{$locale}.mo"
	# for any path outside the active theme. The bare "{$locale}.mo" form is
	# the theme-directory convention only; a plugin catalog named that way is
	# never loaded.
	#
	# The JSON catalogs are named "{$domain}-{$locale}-{$md5}.json", where the
	# md5 is of the build/ script path each POT reference points at.
	aa_i18n_wp i18n make-json "${po}" "${AA_LANGUAGES_DIR}" --pretty-print --no-purge
done <<< "${po_files}"

aa_i18n_info "Done."
