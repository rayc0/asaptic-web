# MERGE_NOTES — feat/explain-fit

## What this branch adds
A new MCP + agent-plane tool **`explain_fit`**: given a company profile
(`categories[]`, `markets[]`, `keywords[]`), it scores how well the profile
fits the public tender listings and explains why — a moat-safe sourcing SCOUT
(it never advises on how to bid, price, or win).

- **Scope**: scores ONLY the public 11-field rows served by `list_tenders`
  (the shared `getSnapshot` memo — R2, baked copy, or fail-safe). No ops-plane
  scorer, no real dates (uses `closing_bucket` only), no non-public field.
- **Output per row**: the public 11-field projection plus a `fit` object whose
  keys are exactly `ALLOWED_FIT_KEYS` =
  `{score, category_weight, keyword_weight, market_weight, route_class, route_next, fired_tokens}`.
  - `score` (0–100) = `category_weight (0|40) + keyword_weight (0..40) + market_weight (0|20)` — the decomposition always sums to the score.
  - `keyword_weight = round(40 × fired/total)`; `fired_tokens` are the profile keywords that appear in the sanitized summaries (en/zh/zht) — nothing else can fire.
  - `route_class` thresholds: `≥70 direct`, `≥45 partner`, `≥20 oem-locked`, else `no-route`. Each `route_next` frames the next step as "ask Asaptic to execute" via `request_tender_access` — capture-don't-teach.
- **Modes**: with `asaptic_id` it explains that one public row; otherwise it
  returns the top-N best-fit ACTIVE rows (`closing_bucket !== deadline_passed`),
  score desc then `sort_key` asc (deterministic). `top_n` default 10, max 50.
- **Errors**: async try/catch in `handleTenderTool` → R2 failure becomes a
  JSON-RPC `-32603`; invalid params → `-32602`; unknown id → byte-identical 404.

## Files touched
- `lib/agent-api.mjs` — `ALLOWED_FIT_KEYS` export, new §5b `explainFit` core +
  helpers, `explain_fit` entry in `TENDER_TOOLS`, dispatcher case in
  `handleTenderTool`. (`_worker.js` needed **no change** — it registers
  `...TENDER_TOOLS` and routes via `TENDER_TOOL_NAMES`, so the tool wired in
  automatically.)
- `test/explain-fit.test.mjs` — new (19 tests).

## MCP tools/list count
`TENDER_TOOLS` 5 → **6**. Worker `tools/list` total **9 → 10**
(4 sourcing lanes + 6 tender tools). Asserted in the suite.

## Tests
Full suite green: **96 tests pass** (77 pre-existing + 19 new).
Run: `node --test test/*.test.mjs` (the README's `node --test test/` form
trips a Node ≥25 directory-resolution quirk — pre-existing, unrelated).

## Merge order
**Merge AFTER `feat/agent-access`.** This branch is cut FROM `feat/agent-access`
and extends its MCP layer (`lib/agent-api.mjs` + `_worker.js` tool registry).
Order: `agent-access → explain-fit`. Did not touch `tender/**`, `demos/**`, `dev/**`.
