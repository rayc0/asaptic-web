# MERGE NOTES — F1 Proof Lab / Glass-Box (feat/proof-lab)

New, self-contained static surface. No shared file was edited by this branch.

## What shipped (NEW FILES ONLY, all under `demo/proof-lab/`)
- `demo/proof-lab/index.html` — the two-panel proof surface (no-build, self-contained, `<meta name="robots" content="noindex">`). Loads its module via `<script type="module" src="./app.mjs">` (no inline script) so the page can ship a strict `script-src 'self'` CSP.
- `demo/proof-lab/app.mjs` — page wiring (DOM reads + innerHTML assignment only); extracted from the former inline script for CSP hardening.
- `demo/proof-lab/prooflab.mjs` — client-side gate + match logic AND the render-to-string helpers (`escapeHtml` / `renderGateHtml` / `renderLookupHtml` / `renderMatchHtml`), so the real DOM-sink render path is unit-testable headless.
- `demo/proof-lab/prooflab.test.mjs` — `node --test` suite (27 tests incl. moat sentinel + render escaping + rejection-row cap).

## Defense-in-depth hardening (2026-08-10, no behaviour change)
- **CSP**: added a `/demo/proof-lab/*` `Content-Security-Policy` to `_headers` (repo root). Adds only — the global `/*` HSTS/X-Frame-Options/nosniff/Referrer/Permissions still apply.
- **Render escaping test**: the DOM sinks were extracted into `prooflab.mjs` and now have a regression test that feeds a hostile field name (`<img src=x onerror=alert(1)>`) through the real render path and fails if `esc()` is ever dropped.
- **Rejection-row cap**: `renderGateHtml` caps rendered rejection `<li>` rows at `MAX_REJECTION_ROWS` (200) with a "+N more" summary, so a pasted multi-MB / 200k-key payload can't freeze the tab.

Route on this branch: `/demo/proof-lab/` serves as a plain static file — no `_worker.js` change was required to view it locally or on Pages (static asset). It was NOT wired into any shared file by this branch, on purpose.

## Wiring the integrator should add on `main` (outside this branch's scope)
1. **Nav / discovery link** — add a link to `/demo/proof-lab/` wherever the other `demo/*` surfaces are surfaced (e.g. the same place `demo/match/` is linked, or a "Proof" entry in the site nav / footer). This branch did NOT touch nav/header/footer partials to avoid conflicts with the other three worktrees.
2. **Pretty route (optional)** — if a clean path like `/proof` or `/proof-lab` is wanted, add a redirect/rewrite in `_worker.js` (or `_redirects`) `→ /demo/proof-lab/`. Not required; the `/demo/proof-lab/` path already works as a static asset.
3. **Robots** — page is intentionally `noindex` (crawlable but not indexed) and this stance is left AS-IS. Nothing on the page is secret (synthetic `AT-TEST-*` rows, the public contract + public scorer only), so **Raymond may choose to make it indexable** — drop the `<meta name="robots" content="noindex">` in `index.html` and add a sitemap entry — if he wants it to rank as a public "attack our sanitization" proof surface. No sitemap entry is added by this branch. If a global sitemap generator enumerates `demo/**`, exclude `demo/proof-lab/` while it stays noindex.
4. **No data dependency** — the page reads NOTHING from `tender/rows.json` or any live endpoint. It ships synthetic `AT-TEST-*` rows only, so it cannot drift or leak when the real registry changes.

## Moat-safety guarantees (enforced by the test suite, re-check on any edit)
- The gate is an **allowlist** of exactly the 11 public fields — it never enumerates or names forbidden fields.
- Files ship ONLY the field allowlist + generic shape regexes. No internal sentinel term-list, no real source terms, no real tender ids.
- Sentinel tests scan every file in `demo/proof-lab/` for forbidden whole-token terms and any non-`AT-TEST` `AT-` id — must stay clean. Run `cd demo/proof-lab && node --test` before merging any change here.
