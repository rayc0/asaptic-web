#!/bin/bash
# guard-deploy.sh — refuse to let a manual `wrangler pages deploy` run unless
# the working tree is clean AND HEAD matches origin/main. Added after the
# 2026-07-18 stale-deploy incident (unpushed commit deployed via raw wrangler).
# Exit 0 only when it is safe to deploy.
set -euo pipefail

cd "$(dirname "$0")/.."

git fetch origin --quiet

if [[ -n "$(git status --porcelain)" ]]; then
  echo "🚨 ABORT: working tree is not clean — commit or stash before deploying." >&2
  git status --porcelain >&2
  exit 1
fi

HEAD_SHA="$(git rev-parse HEAD)"
MAIN_SHA="$(git rev-parse origin/main)"
if [[ "$HEAD_SHA" != "$MAIN_SHA" ]]; then
  echo "🚨 ABORT: HEAD ($HEAD_SHA) != origin/main ($MAIN_SHA) — push/pull before deploying." >&2
  exit 1
fi

echo "✓ guard-deploy: clean tree, HEAD == origin/main — safe to deploy."
exit 0
