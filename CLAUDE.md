# asaptic-web — Deploy Policy (READ BEFORE ANY DEPLOY)

## Raw `wrangler pages deploy` is FORBIDDEN from this checkout.

This exists because of the **2026-07-18 stale-deploy incident**: a Claude Code
dev session committed locally and ran raw `wrangler pages deploy` the same
second, publishing an unpushed commit, and the refresh script's Cloudflare
reconcile safety net failed silently instead of catching it.

### Sanctioned deploy paths (pick one)

1. **`bash ~/bin/asaptic_tender_refresh.sh`** — the normal path. Runs the
   full registry→teaser→archive→commit→push→deploy chain with guards.
2. **Push to `origin/main`** and let the 09:40 / 15:40 LaunchAgent deploy it.
   Do not deploy manually just because you're impatient — wait for the run.
3. **Manual deploy, only if truly necessary:**
   ```bash
   bash scripts/guard-deploy.sh && wrangler pages deploy . --project-name asaptic-web --branch main
   ```
   `guard-deploy.sh` refuses unless the working tree is clean AND HEAD ==
   `origin/main` — i.e. what's on disk is exactly what's on GitHub. Never
   deploy an unpushed or dirty tree.

### If you're unsure

Don't run `wrangler pages deploy` bare. Run `guard-deploy.sh` first, or just
push and let the LaunchAgent handle it.
