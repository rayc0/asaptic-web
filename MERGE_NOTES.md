# MERGE_NOTES — feat/developers-surface

Branch adds the W1 "developers surface" as **new files only**. No existing file was
edited. Everything below is the wiring the merging session must apply (or gate) at
merge time.

## New files on this branch

- `developers/index.html` — the /developers page (quickstart, 11-field table, access
  tiers, live status board, OCDS non-goal note)
- `developers/status.json` — data behind the "What's live right now" board
- `developers/conformance.md` — public conformance check description + one-liners
- `developers/contract/asaptic.tender.v1.schema.json` — JSON Schema 2020-12
- `developers/contract/validate.mjs` — zero-dependency validator (Node 18+)
- `developers/contract/fixtures/positive-*.json` — 3 synthetic fixtures (AT-TEST ids)
- `developers/contract/fixtures/negative-403-spec-denied.json` — denied-response shape
- `developers/contract/test/contract.test.mjs` — `node --test` suite
- `.github/workflows/contract-check.yml` — weekly conformance run (see gating below)

## Patches to apply in existing files at merge (owned by other branches, not edited here)

1. **Nav** — in each top-level page's `<div class="nav-links" id="navDrawer">` add,
   after the Live Tenders entry:
   ```html
   <a href="/developers/" data-key="nav_developers">Developers</a>
   ```
   and add `nav_developers: "Developers"` to each language dict in `content.js`
   (zh: `开发者`, zht: `開發者`, pt: `Desenvolvedores`).
2. **Footer** — optional: add `<a href="/developers/">Developers</a>` to `.footer-links`
   on the main pages.
3. **llms.txt** — add one line under the machine-surfaces section:
   `Developer surface: https://asaptic.com/developers/ — quickstart, asaptic.tender.v1 schema + fixtures + validator, live status board`
4. **README "live evidence" table** (lands with the truth-fixes bundle) — add a row
   linking /developers/ and /developers/conformance.md.

## Merge order (verified 2026-08-10 by integration run)

Both branches share merge-base `40ff9c1b` on `origin/main` and touch **disjoint file
sets** — `git diff --name-only origin/main...HEAD` on each gives 16 files (agent-access)
and 12 files (this branch) with an empty `comm -12` intersection. No textual conflict
either way.

Merge **`feat/agent-access` first, then `feat/developers-surface`**. Not because git
requires it, but because every patch in the section above lands in a file that
agent-access rewrites (`llms.txt`, `README.md`) and because the status-board rows below
can only be flipped to `live` once the REST plane is actually deployed. Merging in the
other order means writing those lines twice.

## Stale-on-merge claims (found by the integration run — must be updated with the merge)

These are honest **today** (production `/mcp` really does expose 4 tools) and become
wrong the moment `feat/agent-access` lands, which adds five tender tools to the same
endpoint. Neither is a conflict; both are silent-rot risks:

- `developers/index.html:219` — the sample `tools/list` output line lists only
  `list_sourcing_lanes · get_lane_capability · get_engagement · submit_rfq`. After the
  merge the endpoint returns **9** tools (adds `list_tenders`, `get_tender`,
  `tender_facets`, `get_spec_coded`, `request_tender_access`). Verified against the
  built worker running the merged code.
- `developers/status.json` → item `mcp`, `detail` — same four-tool sentence, same fix.

## Gated items (Raymond decides at merge — do NOT flip these silently)

- **Enabling `.github/workflows/contract-check.yml`** is Raymond-gated with the merge.
  It runs weekly (Mon 02:17 UTC) + manual dispatch, validates fixtures and a 20-row
  live-feed sample. Real runs only; the board chip for "Weekly public conformance run"
  stays "In build" until the first real run, then `developers/status.json` flips it.
- **`developers/status.json` regeneration** — currently hand-verified (2026-08-10).
  The weekly refresh cron should regenerate it (re-probe each `url`, stamp
  `last_verified`, set `updated`). Until that exists, whoever merges should re-verify
  the "live" rows on merge day. Verified live today: /tender/rows.json, /tender/,
  /mcp (4 tools via tools/list), /llms.txt, /openapi.json, /demo/match/.
  Verified NOT live today (kept as in_build): /api/v1/tenders and /api/v1/health
  (both fall through to the SPA today), @asaptic/cli on npm (unpublished), code
  license file (truth-fixes bundle not merged), conformance cron (not enabled).
- **When the truth-fixes bundle merges**: flip the `license`, `rest_api`, `health`
  rows in `developers/status.json` to `live` after probing them, and update the two
  "IN BUILD" quickstart chips in `developers/index.html` (snippets 1b and 2).
- **When the CLI publishes to npm** (release-gated): flip the `cli` row and the
  snippet-2 chip to LIVE.

## Contract triangle — verified against the built worker (2026-08-10)

The row contract is encoded independently in four places: `lib/agent-api.mjs`
(`ALLOWED_ROW_KEYS`, server), `src/api.js` (`ALLOWED_ROW_KEYS`, CLI fail-closed check),
`openapi.json` (`components.schemas.TenderRow`), and this kit's schema. Checked field by
field: **zero drift** on the 11 row keys, the 3 category keys, the `closing_bucket` and
`value_band` enums, the 7-market list, and the `409 snapshot_changed` / `403
SPEC_CODED_GATED` / `404 not_found` error codes. Every one of the 2,395 live rows
validates against `$defs/row`.

Two seams were found and closed on this branch:

1. The published `negative-403-spec-denied.json` fixture documented a denied-access body
   (`error.code: "spec_access_denied"`, `error.asaptic_id`, `error.http_status`,
   `error.request_id`) that **no Asaptic server emits**. The real body — and what
   `@asaptic/cli` branches on — is `{error:{code:"SPEC_CODED_GATED", message}, at_id,
   access_url}`. A developer keying off the published fixture would have written a
   handler that never fires. Fixture corrected to the real key shape.
2. `asaptic.tender.v1` names the **feed** envelope here, but `openapi.json` and
   `/api/v1/health` apply the same name to the **row**. Piping `/api/v1/tenders` into
   `validate.mjs --stdin` therefore failed on 8 envelope errors while every row was
   perfectly conformant — the REST plane had no conformance story at all. Added
   `validate.mjs --rows` (unwraps `data` / `rows` / bare array, validates each element
   against `$defs/row`) plus a conformance.md table for the two envelopes. `?lang=`
   responses are a deliberate subset and are documented as out of contract scope.

## Sentinel note (do not lose this)

The full forbidden-terms list is internal and must never land in this public repo in
plaintext. The public test suite embeds only a small base64-encoded generic subset and
its failure output is redacted (position only, never the term). Keep it that way when
extending the tests. Fixture and example ids must always use the `AT-TEST-` marker;
the suite fails on any live-shaped listing id in new files.

## Test status at branch time

`node --test developers/contract/test/contract.test.mjs` — all green locally, including live-feed
sample validation against https://asaptic.com/tender/rows.json (skips gracefully
offline). The workflow's final step runs the same suite.
