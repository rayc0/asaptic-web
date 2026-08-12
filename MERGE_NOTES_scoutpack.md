# MERGE_NOTES — Scout Pack (feat/scout-pack)

Funnel converter: supplier multi-selects live public opportunities into a shareable shortlist and
requests Asaptic to source the whole pack in one action (the pack = one high-intent lead).

## New files (NEW-ONLY, no shared/existing files touched)
- `scout/index.html` — the page (bridge nav + filters + selectable cards + sticky pack tray + CTA). `<meta robots noindex>`.
- `scout/scout.mjs` — pure, browser+node logic (feed shaping, pack ops, localStorage, share-URL codec, CTA builder, sentinel scanner).
- `scout/scout.test.mjs` — `node --test` suite (8 tests, green).

Did NOT edit: `_worker.js`, `tender/**`, `demos/**`, `dev/**`, or any shared file.

## Wiring needed to go live
1. **Route**: serve `scout/index.html` at `https://asaptic.com/scout/` (and `scout.mjs` as a sibling — the page imports `./scout.mjs`). Static assets only; no server logic, no key.
2. **Data**: reads the existing live feed `https://asaptic.com/tender/rows.json` at runtime (same-origin in prod). No new data pipeline.
3. **CTA target**: links to `https://portal.asaptic.com/register.html?src=scout_pack&ids=<AT-ids>`. Confirm `register.html` accepts/records `src` + `ids` query params (read-only; ids are public). No change required for the link to work; capture is a portal-side enhancement.
4. **CSP**: page needs to `fetch` `tender/rows.json` (same-origin) and Google Fonts (already used by `demos/`). No other external calls.

## Design / constraint compliance
- Only the 11 public feed fields ever rendered (market, category, summaries×3, value_band, closing_bucket, lead_ok, new_this_issue, asaptic_id, sort_key). `pickPublic()` hard-drops anything else even if a future feed carries ref/issuer/date.
- Never the string "PCMS"; no real ref/issuer/date; share hash encodes only public AT-ids (base64url of the id list).
- All feed data rendered via `textContent` / `createTextNode` — no `innerHTML`. Hostile-summary test + sentinel scan enforce it.
- `deadline_passed` bucket excluded by default (feed marks passed items via `closing_bucket`, not a separate field).
- Sourcing-scout framing throughout; no bid/pricing advice anywhere.

## Tests (node --test scout/)
pack add/remove/dedupe · localStorage round-trip · share-URL encode/decode round-trip · deadline_passed
excluded · CTA URL builds with AT-ids · cardFields emits only the 11 public fields (internal-field leak
blocked) · hostile-summary XSS guard (+ innerHTML absence assertion) · sentinel self-test (catches
forbidden token + real ids, passes clean shipped source). 8 pass / 0 fail.
