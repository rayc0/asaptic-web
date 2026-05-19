#!/usr/bin/env bash
# firewall_sweep.sh — Asaptic Labs brand firewall scanner
# Self-contained for GitHub Actions — no dependency on OPS_ROOT.
# Usage: firewall_sweep.sh [path1] [path2] ...
#        Default scan path: . (current directory)
# Exit 0 = clean; Exit 1 = forbidden token found

set -euo pipefail

# ---------------------------------------------------------------------------
# Forbidden token regex (case-insensitive).
# This string is the single authorised appearance of these tokens in the script.
# ---------------------------------------------------------------------------
FORBIDDEN='pqsafe|pinnacle|seniordeli|softmeal|kangleling|carewells|hkma|t-?sata|tsata|dsa-?65|lingualeap|deeptech100'

# ---------------------------------------------------------------------------
# Scan paths: positional args, or default to current directory
# ---------------------------------------------------------------------------
if [[ $# -gt 0 ]]; then
  SCAN_PATHS=("$@")
else
  SCAN_PATHS=(".")
fi

# ---------------------------------------------------------------------------
# Scan
# ---------------------------------------------------------------------------
HITS=()
FILE_COUNT=0

for SCAN_PATH in "${SCAN_PATHS[@]}"; do
  if [[ ! -e "$SCAN_PATH" ]]; then
    echo "Warning: path does not exist, skipping: $SCAN_PATH" >&2
    continue
  fi

  while IFS= read -r -d '' filepath; do
    FILE_COUNT=$(( FILE_COUNT + 1 ))

    while IFS= read -r hit_line; do
      # Approved carve-out (2026-05-17 decision, ratified 2026-05-19):
      # PQSafe is the SINGLE permitted outbound project link on asaptic.com via card1_*.
      # Skip card1_* keys in content.js + the card1_link <a href> in index.html.
      if echo "$hit_line" | grep -qE 'card1_(body|link|tag|heading)|href="https://pqsafe\.xyz"|// Card 1 — Quantum'; then
        continue
      fi
      HITS+=("$hit_line")
    done < <(grep -HInEi "$FORBIDDEN" "$filepath" 2>/dev/null || true)

  done < <(find "$SCAN_PATH" \
    -type d \( -name '.git' -o -name 'node_modules' -o -name '.wrangler' \) -prune \
    -o -type f \
    ! -name '*.lock' \
    ! -name 'firewall_sweep.sh' \
    -print0 2>/dev/null)
done

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
if [[ ${#HITS[@]} -gt 0 ]]; then
  echo "FIREWALL BLOCKED: ${#HITS[@]} forbidden token(s) found across ${FILE_COUNT} file(s)." >&2
  for hit in "${HITS[@]}"; do
    echo "  FIREWALL HIT: ${hit}" >&2
  done
  exit 1
else
  echo "firewall clean (${FILE_COUNT} files scanned)"
  exit 0
fi
