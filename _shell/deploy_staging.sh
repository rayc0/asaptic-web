#!/bin/bash
# deploy_staging.sh — deploy the theme-unification worktree to the GATED
# staging surface (asaptic.dev, Cloudflare Pages project asaptic-web-dev,
# behind Cloudflare Access / email policy). NEVER touches production.
#
# THIS SCRIPT IS NOT AUTO-EXECUTED. Run it manually when ready to stage a
# preview build for Raymond to review.
#
# ---------------------------------------------------------------------------
# STAGING (this script):
#   Target:      Cloudflare Pages project `asaptic-web-dev`
#   Domain:      asaptic.dev (gated by Cloudflare Access, email policy —
#                verified 2026-08-23: GET https://asaptic.dev/ -> HTTP 302
#                Location: https://old-bread-15c1.cloudflareaccess.com/...)
#   Project's production_branch = "production" (NOT "main") — deploying with
#   --branch=theme-unify therefore lands as a PREVIEW deployment on this
#   project, not its production slot. It gets its own
#   https://<hash>.asaptic-web-dev.pages.dev URL AND is reachable at
#   asaptic.dev (Pages serves the project's custom domain from whichever
#   deployment matches; verify via API after deploy — see below).
#   Last known deployment on this project before this script existed:
#   2026-07-16T15:02:09Z (commit 1af35fd, environment=preview) — i.e. this
#   staging surface is currently ~5 weeks stale relative to production
#   (asaptic-web / asaptic.com last deployed 2026-08-23T07:43:17Z).
#
# PRODUCTION (asaptic.com) — NOT run by this script, documented here only:
#   1. Merge feat/theme-unify-2026-08-23 -> main in the asaptic-web repo
#      (this worktree's branch, NOT this repo's own git history — confirm
#      which repo/remote before merging; asaptic-web-theme vs asaptic-web
#      may be different clones of the same or different remotes, check
#      `git remote -v` first).
#   2. Push main.
#   3. If tender bakers changed: bash ~/bin/sync_tender_bakers.sh FIRST
#      (refreshes ~/.raymond/tender-refresh/bakers/, which
#      asaptic_tender_refresh.sh reads from — NOT from any worktree's
#      scripts/, which is gitignored on origin/main).
#   4. bash ~/bin/asaptic_tender_refresh.sh
#      This is the ONLY sanctioned path to asaptic.com. It has a hard
#      HEAD == origin/main guard (worktree at ~/.raymond/tender-refresh/
#      asaptic-web-publish is reset --hard + checked out to origin/main
#      before any deploy), a keychain preflight, a run lock, and reconciles
#      against Cloudflare's actual latest production deployment before
#      deciding whether to redeploy. Raw `wrangler pages deploy` against
#      asaptic-web from a dev checkout is FORBIDDEN (repo guard, after the
#      2026-07-18 stale-deploy incident) — this script does not, and must
#      never, do that.
# ---------------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REQUIRED_BRANCH="feat/theme-unify-2026-08-23"
PROJECT_NAME="asaptic-web-dev"
DEPLOY_BRANCH="theme-unify"
DOMAIN="asaptic.dev"

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

cd "$REPO_ROOT"

echo "=== deploy_staging.sh ==="
echo "repo root: $REPO_ROOT"

CURRENT_BRANCH="$(git branch --show-current)"
if [[ "$CURRENT_BRANCH" != "$REQUIRED_BRANCH" ]]; then
  echo "REFUSING: current branch is '$CURRENT_BRANCH', expected '$REQUIRED_BRANCH'." >&2
  exit 1
fi
echo "branch check OK: $CURRENT_BRANCH"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "REFUSING: working tree is not clean. Commit or stash changes first." >&2
  git status --short >&2
  exit 1
fi
echo "clean tree check OK"

if [[ -f "$REPO_ROOT/_shell/qc.py" ]]; then
  echo "--- running QC (_shell/qc.py) ---"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] would run: python3 _shell/qc.py"
  else
    if ! python3 "$REPO_ROOT/_shell/qc.py"; then
      echo "REFUSING: QC reported a HARD failure (exit != 0). See report above." >&2
      exit 1
    fi
    echo "QC OK (exit 0)"
  fi
else
  echo "note: _shell/qc.py not found — skipping QC gate"
fi

CF_TOKEN=""
if [[ "$DRY_RUN" -eq 0 ]]; then
  CF_TOKEN="$(security find-generic-password -s cloudflare-api-token-full -w 2>/dev/null || true)"
  if [[ -z "$CF_TOKEN" ]]; then
    echo "REFUSING: could not read keychain item cloudflare-api-token-full." >&2
    exit 1
  fi
fi

DEPLOY_CMD=(npx wrangler pages deploy . --project-name="$PROJECT_NAME" --branch="$DEPLOY_BRANCH" --commit-dirty=false)

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "--- DRY RUN — would execute ---"
  echo "CLOUDFLARE_API_TOKEN=<redacted> ${DEPLOY_CMD[*]}"
  echo ""
  echo "Afterwards would verify via Cloudflare API (GET /accounts/<id>/pages/projects/$PROJECT_NAME/deployments)"
  echo "and print these URLs for Raymond to open manually (Access will block a plain curl):"
  echo "  https://$DOMAIN/"
  echo "  https://$DOMAIN/<changed-page-1>"
  echo "  https://$DOMAIN/<changed-page-2>"
  echo "[dry-run] no changes made."
  exit 0
fi

echo "--- deploying to Cloudflare Pages ($PROJECT_NAME, branch=$DEPLOY_BRANCH) ---"
CLOUDFLARE_API_TOKEN="$CF_TOKEN" "${DEPLOY_CMD[@]}"

echo "--- verifying via Cloudflare API ---"
ACCOUNT_ID="2c4fde32590a55f13c8181cbc33027ba"
LATEST_JSON="$(curl -s -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT_NAME/deployments?per_page=1")"
echo "$LATEST_JSON" | python3 -c '
import json, sys
d = json.load(sys.stdin)
r = (d.get("result") or [{}])[0]
print("latest deployment id:", r.get("id"))
print("created_on:", r.get("created_on"))
print("environment:", r.get("environment"))
print("stage status:", (r.get("latest_stage") or {}).get("status"))
print("preview url:", r.get("url"))
'

echo ""
echo "=== Access will block a plain curl to $DOMAIN — open these manually to verify (logged in as an allowed email): ==="
echo "  https://$DOMAIN/"
echo "  https://$DOMAIN/<changed-page-1>"
echo "  https://$DOMAIN/<changed-page-2>"
