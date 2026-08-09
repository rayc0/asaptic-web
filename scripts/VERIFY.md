# VERIFY — site-wide soft-404 catch-all fix (PENDING A251)

Branch `fix/soft-404-catchall`, cut from `origin/main` @ `40ff9c1b`.
Built and verified 2026-08-09. **Not deployed** — build + verify only.

> Filed under `scripts/` on purpose. Root-level `.md` files ARE publicly served
> (`asaptic.com/README.md` and `/CHANGELOG.md` both return 200 today), whereas
> `scripts/` is gitignored and not uploaded by the deploy. This note is internal.

---

## 1. The defect and its actual root cause

Verified on production 2026-08-08 and re-confirmed 2026-08-09:

```
GET https://asaptic.com/definitely-not-a-real-path-xyz   -> 200 text/html  (homepage, byte-identical)
GET https://asaptic.com/demo/style.css?v=20260711d       -> 200 text/html
GET https://asaptic.com/img/nope.png                     -> 200 text/html
```

**The catch-all was not in `_worker.js` and not in `_redirects`.** Both were
searched, including every one of the 17 remote branches — no `/* /index.html 200`
rule has ever existed in this repo, and the worker's final line was a plain
`return env.ASSETS.fetch(request)`.

The real cause is Cloudflare Pages' own miss behaviour: **when a request matches
no asset and the project ships no `404.html`, Pages serves the root
`index.html` with HTTP 200.** asaptic.com had no `404.html`, so every miss —
pages *and* assets — became a 200 homepage.

That distinction matters, because it means the worker alone could not have been
fixed: `env.ASSETS.fetch()` was returning `200 + index.html`, so there was no
404 for the worker to detect. The fix needs `404.html` to exist *first*.

### Consequences being fixed
- Google records soft-404s instead of clean 404s.
- Uptime/link monitors and crawlers can never observe a broken URL.
- Unknown deep paths render as an unstyled homepage (relative asset paths
  resolve against the wrong directory).
- Six consumers of `/tender/rows.json` (asaptic.com/tender, app / radar / go
  .asaptic.com, iOS, Android) would receive HTML to `JSON.parse` if the baked
  fallback asset ever went missing.

---

## 2. Route inventory — every legitimate path class

Taken before touching anything; the fix had to break none of it.

### Worker-owned routes (never reach the static assets)
| Route | Behaviour | Kept |
|---|---|---|
| `www.asaptic.com`, `asaptic.cn`, `www.asaptic.cn` | 301 to `https://asaptic.com` (canonical-host consolidation) | unchanged |
| `/geo` | JSON `{country}` from `request.cf`, `no-store`, CORS `*` | unchanged |
| `/mcp` | MCP server — GET discovery, POST JSON-RPC 2.0 (`initialize`, `tools/list`, `tools/call`), OPTIONS 204, else 405 | unchanged |
| `/tender/rows.json` | R2 via `env.TENDER_DATA` (`X-Data-Source: r2`), falls back to the baked static copy | unchanged; the fallback now 404s honestly instead of returning HTML |

### Static path classes (served by Pages assets)
| Class | Examples | Count |
|---|---|---|
| Root pages | `/`, `/about`, `/engage`, `/thesis`, `/sourcing`, `/privacy`, … | 18 `.html` |
| `/blog/*` | `/blog/handoff-problem` | 201 files |
| `/demo/*`, `/demos/*` | `/demo/`, `/demo/match/`, `/demo/loa.png`, `/demos/` | 4 |
| `/tender/*` | `/tender/`, market subdirs `sg` `gb` `au` `mo`, `/tender/archive/*`, `/tender/c/<category>/`, `rows.json`, `teaser.json` | 28 |
| `/agent` + JSON | `/agent.json`, `/agent/capabilities.json`, `/agent/capabilities.schema.json` | 3 |
| `/legal/*` | `/legal/terms`, `/legal/privacy` | 2 |
| `/.well-known/*` | `agent.json`, `ai-plugin.json`, `mcp.json` | 3 |
| Locale trees | `/zh/*` (1451), `/zht/*` (1434), `/pt/*` (180) | 3065 |
| `/standard/*` + `/standards/*` | Cross-Standard corpus + `compliance-matrix` | 7760 |
| `/robot/*`, `/university/*`, `/physicalai/`, `/sourcing/*` | incl. `robot.css`, `university.css`, `standard/search.js`, `robot/build/manual.js` | ~25 |
| Assets | `/style.css`, `/content.js`, `/assets/js/nav-mobile.js`, `/img/og-image.jpg`, `/assets/*.html|.pdf|.csv` | — |
| Crawler files | `/robots.txt`, `/llms.txt`, `/llms-full.txt`, `/llms-{energy,medical,photonics}.txt`, 14 × `sitemap*.xml`, `openapi.json`, `server.json` | — |

### Pages' URL canonicalisation (load-bearing, must survive)
Confirmed against production, then re-confirmed locally after the change:
- `/about.html` → **308** → `/about` (extensionless canonicalisation)
- `/demo/match` → **308** → `/demo/match/` (directory-index trailing slash)
- `/tender/sg` → **308** → `/tender/sg/`

So both forms of every existing page keep working — the un-slashed/`.html`
form via a 308, the canonical form with a 200. The fix only intercepts
status **404**, so every 301/308/304/206 passes through untouched.

### Not in play
- `functions/mcp.js` exists but is **dead code**: `_worker.js` at the root puts
  Pages in advanced mode, which ignores `functions/`. Confirmed live — `/geo`
  responds, and `/geo` only exists in `_worker.js`. Left alone (out of scope).
- `_redirects` contains exactly one rule: `https://www.asaptic.com/* → https://asaptic.com/:splat 301`.
  **No marketing shortlinks, no SPA rule.** (See §5.)
- `_headers` — 14 rules, all preserved; the worker only sets `Cache-Control` and
  `X-Robots-Tag` on 404 responses.

---

## 3. The fix

**`404.html`** (new, root) — branded dossier-style page: navy tokens lifted from
`style.css`, mono stamp, `404`, bilingual one-liner (EN + 简体中文), the
requested path echoed, a "Return home · 返回首页" button, and pointers to
`/tender/` and `engage@asaptic.com`. `<meta name="robots" content="noindex, nofollow">`.
**All CSS is inline and there are no external fonts** — the page has to render
correctly even when the miss that produced it is itself a broken stylesheet.

**`_worker.js`** — added `serveAsset(request, env, url)`, through which both
static branches now flow. It passes every non-404 response straight through and
only shapes misses:

| Miss kind | Response |
|---|---|
| Page (`/no-such-page`) | 404 + the branded `404.html` body, `text/html`, `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow` |
| Asset (extension-bearing: css/js/json/png/woff2/xml/…) | 404 + `text/plain`, **never `text/html`** |
| `/404` itself | 404, not an indexable 200 duplicate |
| Pages returns a 404 that isn't our HTML | small inline fallback, still 404 |

The two previously-identical `env.ASSETS.fetch(request)` branches were merged;
the old comment on the first one ("prevents SPA catch-all…") described a
catch-all that no longer existed in the worker.

---

## 4. Verification

No test framework exists for this worker, and it is not unit-runnable (it needs
`env.ASSETS` plus the Pages asset server). So verification drives a **real local
Pages runtime** — `npx wrangler pages dev . --port 8899 --ip 127.0.0.1`,
127.0.0.1-bound, production never touched.

```
npx wrangler pages dev . --port 8899 --ip 127.0.0.1     # terminal 1
node scripts/verify-404-fix.mjs --base http://127.0.0.1:8899
node scripts/verify-404-fix.mjs --audit-refs
node scripts/verify-404-fix.mjs --audit-sitemaps --base http://127.0.0.1:8899
```

### 4a. URL matrix — **68/68 passed**

52 known-good (status + content-type + body marker) and 16 known-bad.
Known-good covers: `/geo`, `/mcp`, `/tender/rows.json`, `/tender/teaser.json`,
6 root pages, both canonicalisation forms, `/tender/` + all four market subdirs
+ `archive` + a `/tender/c/` category, `/demo/` `/demo/match/` `/demos/`
`/demo/loa.png`, `agent.json` + `/agent/capabilities.json` + 2 `.well-known`
JSONs, `/legal/terms` + `/legal/privacy`, a blog article, `/zh/` `/zht/` `/pt/`,
`/robot/` `/university/` `/physicalai/` `/sourcing/clinical-devices`
`/standards/compliance-matrix`, 8 assets across every content type, and
`robots.txt` / `llms.txt` / `llms-full.txt` / `sitemap.xml`.

Known-bad covers 8 unknown page paths (must return the branded page) and
7 missing assets across css/png/js/json/xml/woff2 (must return 404 non-HTML),
plus `/404` itself.

```
--- KNOWN-GOOD (52 cases) ---   all PASS
--- KNOWN-BAD  (16 cases) ---   all PASS
68/68 passed
```

### 4b. Control run — the check can see the bug

The same matrix against **unfixed production** (`--base https://asaptic.com`,
read-only probing):

```
52/67 passed   (known-good 52 ✓,  known-bad 15/15 FAIL)
```

Two things are proven at once: the 15 known-bad cases fail on prod exactly as
predicted (`status 200, want 404` / `content-type is text/html — asset miss must
not be HTML`), so the check is not one that passes no matter what; **and all 52
known-good cases pass identically on prod and on the fixed build**, so the fix
changes nothing about legitimate traffic.

### 4c. Static asset-reference audit — 4,580 HTML files, 0 broken

Every `href`/`src` pointing at a css/js/json/image/font/xml/pdf across the whole
site was resolved against the filesystem. **No referenced asset is missing.** No
page loses a working asset when misses start returning 404. (The
`/demo/style.css?v=…` in the defect report is a synthetic probe path — nothing
in the site references it.)

### 4d. Sitemap sweep — 4,037 unique URLs, **0 non-200**

Every `<loc>` in all 14 `sitemap*.xml` files, deduped, probed against the fixed
build following redirects. All 4,037 return 200. **No URL submitted to Google
starts 404ing.**

---

## 5. SEO note

**Expected GSC effect — net positive.** The ~soft-404s Search Console currently
reports ("Soft 404" / "Duplicate, Google chose a different canonical", both
caused by unlimited unknown paths returning the homepage) convert into clean
404s. Google drops them from the index instead of holding them as thin
duplicates of `/`. Crawl budget stops being spent re-fetching the homepage under
arbitrary URLs. Expect the Soft-404 bucket to fall and the "Not found (404)"
bucket to rise by roughly the same amount — that migration is the fix working,
not a regression.

**Does any URL lose traffic?** Checked, not assumed:
- `_redirects` holds exactly one rule (`www` → apex). **There are no marketing
  shortlinks** — no vanity path, campaign path or QR-code path is being served
  by the catch-all, so none starts 404ing.
- All 4,037 sitemap URLs still return 200 (§4d).
- All referenced assets exist (§4c).

The only URLs whose status changes are ones that never had real content — they
were returning a homepage under a wrong address, which Google was already
discounting.

Two behaviour changes worth knowing:
- Repo files that happen to sit at the root are still public (`/README.md`,
  `/CHANGELOG.md` return 200 — unchanged by this fix). `/scripts/*` currently
  returns the 200 homepage and will now correctly 404; `scripts/` is not
  uploaded by the deploy.
- 404 responses are `Cache-Control: no-store`, so a genuinely-restored page is
  visible immediately with no cache purge.

---

## 6. Deploy notes and flags

**Not a blocker — but the brief's premise did not match the repo.** The task
described "a DESIGN §6 mobile-UA rewrite priority chain in `_worker.js`" that
had to keep working. **No such logic exists.** `_worker.js` contains no
`userAgent` / `user-agent` reference on `main` or on any of the 17 remote
branches, and no `DESIGN.md` exists in the repo. The only mobile-specific code
is client-side (`assets/js/nav-mobile.js`, referenced by 29 pages, untouched).
Evidence that the deployed worker equals `origin/main`'s: `/geo` and `/mcp`
respond exactly as this source defines them, and the deployed `index.html` is
14,759 B vs 14,518 B in the repo — a ~241 B delta consistent with Cloudflare's
Web Analytics beacon injection, not with different source.

**No legit path class was left unpreserved.** Nothing to flag as a deploy
blocker.

**When deploying** (separate, authorised step — this branch is build+verify only):
1. `asaptic-web` repo → `asaptic-web` Pages project → asaptic.com (direct
   upload). Confirmed via `asaptic-dev` `estate.py`.
2. `scripts/guard-deploy.sh` refuses to deploy unless the tree is clean **and
   HEAD == origin/main**, so this branch must be merged to `main` first.
3. Post-deploy, re-run the same matrix against production — it should flip from
   52/67 to 68/68:
   `node scripts/verify-404-fix.mjs --base https://asaptic.com`
4. Optionally submit `/404` for removal in GSC if it ever got indexed (it now
   returns 404 anyway).
