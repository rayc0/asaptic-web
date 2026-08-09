#!/usr/bin/env bash
# Proof-surfaces test runner: independent shell-level sentinel scan + node:test suite.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT" || exit 2

SHIPPED=(
  ".well-known/asaptic-proof.json"
  ".well-known/security.txt"
  "security.txt"
  "security/index.html"
  "status/index.html"
  "status/history.json"
)

fail=0

echo "== shell sentinel scan (independent of node) =="
# Whole-token forbidden terms (case-insensitive, word-boundary).
TOKENS='pcms|ref|org|closing_iso|tdr|source_url'
for f in "${SHIPPED[@]}"; do
  if grep -nEi "\b(${TOKENS})\b" "$f" >/tmp/ps_tok.$$  2>/dev/null; then
    echo "SENTINEL FAIL ($f) forbidden token:"; cat /tmp/ps_tok.$$; fail=1
  fi
  # non-AT-TEST live-shaped ids
  if grep -nE 'AT-[A-Z]{2}-[0-9]{4}-[0-9]{3}' "$f" | grep -v 'AT-TEST-' >/tmp/ps_id.$$ 2>/dev/null; then
    if [ -s /tmp/ps_id.$$ ]; then echo "SENTINEL FAIL ($f) live-shaped id:"; cat /tmp/ps_id.$$; fail=1; fi
  fi
done
rm -f /tmp/ps_tok.$$ /tmp/ps_id.$$
[ "$fail" -eq 0 ] && echo "shell sentinel: all shipped artifacts CLEAN"

echo "== shell sentinel self-test (dirty fixture must trip) =="
DIRTY=$(printf 'via %s portal\nsee %s\nrecord AT-HK-1234-567\n' 'PC''MS' 'source_url')
if printf '%s' "$DIRTY" | grep -qEi "\b(${TOKENS})\b" && \
   printf '%s' "$DIRTY" | grep -qE 'AT-[A-Z]{2}-[0-9]{4}-[0-9]{3}'; then
  echo "shell sentinel self-test: dirty fixture correctly TRIPPED"
else
  echo "shell sentinel self-test: FAILED to trip on dirty fixture"; fail=1
fi

echo "== node:test suite =="
node --test "$ROOT"/tests/proofsurfaces/*.test.js || fail=1

echo "======================================"
if [ "$fail" -eq 0 ]; then echo "ALL PROOF-SURFACES TESTS GREEN"; else echo "PROOF-SURFACES TESTS FAILED"; fi
exit "$fail"
