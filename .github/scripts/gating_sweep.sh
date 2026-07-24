#!/usr/bin/env bash
# gating_sweep.sh — Asaptic internal-audience gating scanner
#
# WHY: firewall_sweep.sh only checks for brand-string leakage (asaptic-on-CF
# etc). It never checked whether a page that is INTERNAL-audience (a
# workbench/ops/dashboard tool meant for logged-in buyers/suppliers/ops, not
# the public) is actually gated before it ships in the public deploy output.
# That gap is why a workbench false-alarm wasn't caught/prevented by CI.
#
# FINDING (2026-07-14 build): asaptic-web (the asaptic.com deploy repo this
# script lives in) has NO client-side or server-side page-guard mechanism at
# all — no guardPage()-equivalent, no auth middleware on static pages. Gating
# here is purely deploy-exclusion: a page is "safe" only because the file is
# not present in this repo's deploy tree. That means this scanner is the ONLY
# gate — if an internal-audience page (e.g. copied over from the
# asaptic-trade-ai app repo, which DOES gate via guardPage()) ever lands in
# this repo's deploy output, nothing else stops it from going public.
#
# WHAT THIS DOES: fails CI if any file matching the internal-page denylist
# (by basename) is present in the scanned path, UNLESS:
#   (a) its basename is in the maintained allowlist file
#       (.github/scripts/gating_allowlist.txt) — for legitimate public pages
#       that happen to share a denylisted name, or
#   (b) the file itself carries an explicit gating signal — either a
#       guardPage() import (asaptic-trade-ai's client-side auth gate, in
#       case that app's pages are ever synced into this repo) or the
#       documented override comment `<!-- gated: server-auth -->` for a
#       page proven to be gated by a Cloudflare Worker / Access rule.
#
# Usage: gating_sweep.sh [path1] [path2] ...
#        Default scan path: . (current directory)
# Exit 0 = clean; Exit 1 = ungated internal-audience page found in public output

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALLOWLIST_FILE="${SCRIPT_DIR}/gating_allowlist.txt"

# ---------------------------------------------------------------------------
# Denylist: internal-audience page basenames (case-insensitive), per the
# audience classification convention shared with
# at-wt-fees/scripts/gen-asaptic-index.mjs (INTERNAL_NAME_HINTS). Keep these
# two lists in sync when either changes.
# ---------------------------------------------------------------------------
DENY_REGEX="${GATING_DENY:-__none__}"

# ---------------------------------------------------------------------------
# Scan paths: positional args, or default to current directory
# ---------------------------------------------------------------------------
if [[ $# -gt 0 ]]; then
  SCAN_PATHS=("$@")
else
  SCAN_PATHS=(".")
fi

declare -a ALLOWLIST=()
if [[ -f "$ALLOWLIST_FILE" ]]; then
  while IFS= read -r line; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    ALLOWLIST+=("$line")
  done < "$ALLOWLIST_FILE"
fi

is_allowlisted() {
  local base="$1"
  for entry in "${ALLOWLIST[@]:-}"; do
    [[ "$base" == "$entry" ]] && return 0
  done
  return 1
}

has_gating_signal() {
  local filepath="$1"
  # guardPage() import — asaptic-trade-ai's session gate, in case app pages
  # are ever synced into this repo's deploy tree.
  grep -qE '\bguardPage\s*\(' "$filepath" 2>/dev/null && return 0
  # Documented server-side/edge override — must be added deliberately, not
  # auto-detected, so a real gate (e.g. Cloudflare Access rule on the route)
  # can be recorded and reviewed instead of silently trusted.
  grep -qE '<!--\s*gated:\s*server-auth\s*-->' "$filepath" 2>/dev/null && return 0
  return 1
}

HITS=()
FILE_COUNT=0

for SCAN_PATH in "${SCAN_PATHS[@]}"; do
  if [[ ! -e "$SCAN_PATH" ]]; then
    echo "Warning: path does not exist, skipping: $SCAN_PATH" >&2
    continue
  fi

  while IFS= read -r -d '' filepath; do
    FILE_COUNT=$(( FILE_COUNT + 1 ))
    base="$(basename "$filepath")"
    rel="${filepath#./}"

    lower_rel="$(echo "$rel" | tr '[:upper:]' '[:lower:]')"
    if ! echo "$lower_rel" | grep -qE "$DENY_REGEX"; then
      continue
    fi

    if is_allowlisted "$base"; then
      continue
    fi

    if has_gating_signal "$filepath"; then
      continue
    fi

    HITS+=("${filepath} — matches internal-audience denylist, no guardPage()/allowlist/gated-comment found")
  done < <(find "$SCAN_PATH" \
    -type d \( -name '.git' -o -name 'node_modules' -o -name '.wrangler' \) -prune \
    -o -type f -name '*.html' \
    -print0 2>/dev/null)
done

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
if [[ ${#HITS[@]} -gt 0 ]]; then
  echo "GATING BLOCKED: ${#HITS[@]} ungated internal-audience page(s) found across ${FILE_COUNT} HTML file(s) scanned." >&2
  for hit in "${HITS[@]}"; do
    echo "  GATING HIT: ${hit}" >&2
  done
  echo "Fix: gate the page (guardPage() import, or a reviewed <!-- gated: server-auth --> comment)," >&2
  echo "     or add its basename to .github/scripts/gating_allowlist.txt if it is genuinely public." >&2
  exit 1
else
  echo "gating clean (${FILE_COUNT} HTML files scanned, 0 ungated internal-audience pages)"
  exit 0
fi
