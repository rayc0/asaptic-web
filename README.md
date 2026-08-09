# Asaptic — asaptic.com

Site + edge worker for Asaptic (HK) Limited. Deployed via Cloudflare Pages.

## Live evidence

Every claim below is a real, clickable URL — no static badges.

| What | URL |
|---|---|
| Live tender ledger (7 markets, trilingual) | https://asaptic.com/tender |
| Raw listing feed (`asaptic.tender.v1` rows) | https://asaptic.com/tender/rows.json |
| Agent REST API — listings | https://asaptic.com/api/v1/tenders |
| Agent REST API — facets | https://asaptic.com/api/v1/tenders/facets |
| Feed health / freshness | https://asaptic.com/api/v1/health |
| MCP server (JSON-RPC 2.0) | https://asaptic.com/mcp |
| OpenAPI description | https://asaptic.com/openapi.json |
| llms.txt | https://asaptic.com/llms.txt |
| Matching demo | https://asaptic.com/demo/match |

## Files

- `index.html` — single-page site, 3-language (EN/ZH/ZHT)
- `content.js` — all text content in 3 languages
- `style.css` — dark theme, AI-native design
- `_worker.js` — Cloudflare Pages worker: canonical-host redirect, geo language
  detection, `/tender/rows.json` R2 feed, agent REST API (`/api/v1/*`),
  `/healthz`, MCP server (`/mcp`)
- `lib/agent-api.mjs` — shared agent-access logic (REST + MCP tender tools).
  Public boundary: every emitted row is a whitelist copy of the published
  rows.json artifact — the `asaptic.tender.v1` schema, exactly 11 fields,
  never more. This module must never import portal projection code.
- `_headers` — security + cache headers
- `_redirects` — www redirect
- `test/` — `node --test test/` runs the unit, MCP-protocol, and leak-sentinel
  suites against the real worker handler in-process (fixture:
  `test/fixtures/rows.json`)

## `asaptic.tender.v1` (public listing row)

The public listing row schema. Verbatim fields, always exactly these:
`asaptic_id`, `market`, `category{name_en,name_zh,name_zht}`, `summary_en`,
`summary_zh`, `summary_zht`, `value_band`, `closing_bucket`, `lead_ok`,
`new_this_issue`, `sort_key`. Full parameter documentation:
https://asaptic.com/openapi.json

## License

The **code** in this repository is licensed under the Apache License 2.0
(see `LICENSE`). The **tender listing dataset** served by this site is not
covered by the code license — it is published under Asaptic's own usage terms
(see the "Agent tender API" section of `llms.txt`); the Cross-Standard
compliance dataset keeps its separately stated license.

## Deploy

1. Push to GitHub (main branch)
2. Cloudflare Pages auto-deploys on push
3. Custom domain: asaptic.com (set in Cloudflare Pages dashboard)

## Language detection

Visitors auto-routed by IP country via `_worker.js`:
- HK / MO / TW → Traditional Chinese
- CN → Simplified Chinese
- All others → English

Manual override: language switcher in nav (EN | 简 | 繁). Preference stored in localStorage.

## Local dev

```
npx serve .
```

or `npx wrangler pages dev .` to exercise the worker routes; `node --test test/`
for the API/MCP suites.
