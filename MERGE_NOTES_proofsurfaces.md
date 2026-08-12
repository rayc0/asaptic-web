# Merge notes — feat/proof-surfaces

New static artifacts only. This branch does **not** edit `_worker.js`, `_redirects`, `_headers`,
`tender/**`, `demos/**`, `dev/**`, README, or `llms.txt`. Everything below is a request for the
branch that owns those shared files.

## New files added (all NEW, no edits to existing files)

| File | Purpose |
|---|---|
| `.well-known/asaptic-proof.json` | Falsifiable proof manifest — endpoint URLs, schema id + sha256, live rows.json snapshot digest, conformance result, compatible client versions. |
| `.well-known/security.txt` | RFC 9116 security contact (canonical location). |
| `security.txt` | RFC 9116 at web root (points Canonical at the `.well-known` copy). |
| `security/index.html` | Human-readable responsible-disclosure page (demos design language, indexable). |
| `status/index.html` | Client-side live status page — probes endpoints from the visitor's browser. |
| `status/history.json` | Seed history for the status page (honest recorded probe states). |
| `tests/proofsurfaces/*` | node:test suite + shell sentinel scan + recorded probe verdicts. |

## 1. Routing — extension-less HTML paths `/security` and `/status`

`_worker.js` passes `/.well-known/*` and any `*.{json,txt,...}` path straight to `env.ASSETS`.
The **JSON/txt artifacts are already covered** by that passthrough and need no worker change —
`.well-known/asaptic-proof.json`, `.well-known/security.txt`, `/security.txt`, `/status/history.json`
will all serve from ASSETS with the correct extension-derived content-type.

`/security` and `/status` are **extension-less** and fall through to the final SPA
`env.ASSETS.fetch(request)`. Cloudflare Pages resolves these to `security/index.html` /
`status/index.html` via directory-index — the **same mechanism that already serves `/demos`
today**, so this should work as-is. If verification after merge shows either path soft-404ing to
the SPA shell, apply the minimal fix in the owning branch, choosing one:

- **_worker.js** (preferred) — before the SPA fallback, add:
  ```js
  if (url.pathname === '/security' || url.pathname === '/status') {
    return env.ASSETS.fetch(new Request(url.origin + url.pathname + '/index.html', request));
  }
  ```
- **_redirects** — `/security /security/ 308` and `/status /status/ 308` (only if Pages needs the trailing slash).

## 2. Recommended `_headers` additions (owning branch)

The extension passthrough gives correct content-types by default. These add CORS + caching so
agents/clients can fetch the manifest cross-origin (mirrors the existing `/.well-known/agent.json`
rule):

```
/.well-known/asaptic-proof.json
  Content-Type: application/json; charset=utf-8
  Cache-Control: public, max-age=3600
  Access-Control-Allow-Origin: *

/.well-known/security.txt
  Content-Type: text/plain; charset=utf-8
  Cache-Control: public, max-age=3600

/security.txt
  Content-Type: text/plain; charset=utf-8
  Cache-Control: public, max-age=3600

/status/history.json
  Content-Type: application/json; charset=utf-8
  Cache-Control: public, max-age=300
```

## 3. Recorded probe verdicts (2026-08-10, this build)

| Endpoint | HTTP | Content-Type observed | Verdict |
|---|---|---|---|
| `/tender/rows.json` | 200 | application/json | **live** (JSON, validates against `asaptic.tender.v1`, all 2395 rows) |
| `/mcp` (POST tools/list) | 200 | application/json | **live** (valid JSON-RPC 2.0 `result.tools[]`) |
| `/api/v1/tenders` | 200 | text/html | **pending rollout** (returns the site shell, not JSON) |
| `/api/v1/health` | 200 | text/html | **pending rollout** (returns the site shell, not JSON) |

- Snapshot digest pinned in the manifest: `sha256 7bfdc1947a701cf6a4e9cc81ee05f1e1d6422ce91d4494c71a625d28a41c22f6`
  over the decoded body of issue `2026-W33`. Reproduce: `curl -s --compressed https://asaptic.com/tender/rows.json | shasum -a 256`.
  **Volatile** — rotates each feed publish; it is scoped to `issue_id` in the manifest.
- Schema digest: `sha256 1375644189ebcfd88c359642ee3cdd6723ee635babc70f3a50660bf52ae06039`, computed from
  the contract schema on `feat/developers-surface`. It will match
  `https://asaptic.com/developers/contract/asaptic.tender.v1.schema.json` once that branch is published.

## 4. Which states flip live at the API merge

When `/api/v1/tenders` and `/api/v1/health` are deployed to return JSON:

1. `status/index.html` — **no change needed**; it probes live and flips the dots to green automatically.
2. `.well-known/asaptic-proof.json` — set `endpoints.tenders_api.state` and `endpoints.health.state`
   to `"live"` and drop their `content_type_observed`.
3. `status/history.json` — append new `checks` entries with `state: "live"`.
4. `tests/proofsurfaces/probe_verdicts.json` — set `is_json: true` for those two endpoints, then the
   no-false-live tests keep guarding truthfulness.

## 5. dev-hub linkage

The dev-hub branch links **to** these surfaces (`/.well-known/asaptic-proof.json`, `/security`,
`/status`). Those links go live when this branch merges. This branch owns the targets; dev-hub owns the links.

## 6. Optional automation

Consider regenerating the manifest's `snapshot.sha256` + `issue_id` + `conformance` on each feed
publish so the pinned digest never drifts from the current issue. Until then it stays honest by being
scoped to a named `issue_id`.
