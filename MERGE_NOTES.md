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
