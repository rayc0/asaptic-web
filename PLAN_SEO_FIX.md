# SEO Canonical Fix Plan — asaptic.com
**Date:** 2026-06-14  
**Status:** FIXES APPLIED (do not redeploy from pre-fix state)

---

## Root Cause

Two bugs caused Google to report "Duplicate, Google chose different canonical than user":

### Bug 1 (PRIMARY — affects 939 pages): Missing `.html` extension in canonical and hreflang href values

Pages in `standard/`, `zh/standard/`, `zht/standard/`, and 3 files in `pt/` declared their canonical URL without the `.html` extension — e.g.:

```html
<!-- WRONG (what was there) -->
<link rel="canonical" href="https://asaptic.com/standard/bess-china-to-mexico" />
<!-- CORRECT (what it should be) -->
<link rel="canonical" href="https://asaptic.com/standard/bess-china-to-mexico.html" />
```

The sitemap `<loc>` entries correctly used `.html` (e.g. `https://asaptic.com/standard/bess-china-to-mexico.html`). This created a canonical/sitemap mismatch: the sitemap told Google the canonical URL was `…/bess-china-to-mexico.html` but the HTML page itself said `…/bess-china-to-mexico` (no extension). Since Cloudflare Pages serves `bess-china-to-mexico.html` at the path `/standard/bess-china-to-mexico` (extension-less), Google saw two reachable URL variants pointing to each other inconsistently, and chose its own canonical — hence the GSC report.

The same `.html`-less bug applied to the `hreflang` alternate link tags within those same pages, making cross-language linking also inconsistent.

### Bug 2 (SECONDARY — affects 554 HTML pages): `hreflang="pt"` in HTML vs `hreflang="pt-PT"` in sitemap

Every HTML file used `hreflang="pt"` for the Portuguese locale variant, while `sitemap.xml` used `hreflang="pt-PT"`. Google requires consistency between HTML hreflang and sitemap hreflang annotations to correctly assign locale pages.

---

## Scope of Files Changed

| Category | Files Fixed | Issue |
|---|---|---|
| `standard/*.html` (EN) | 312 files | canonical + hreflang hrefs missing `.html` |
| `zh/standard/*.html` | 312 files | canonical + hreflang hrefs missing `.html` |
| `zht/standard/*.html` | 312 files | canonical + hreflang hrefs missing `.html` |
| `pt/heavy-lift-uav.html` | 1 file | canonical + hreflang hrefs missing `.html` |
| `pt/physical-ai-robotics.html` | 1 file | canonical + hreflang hrefs missing `.html` |
| `pt/ev-charger-power-module-sourcing.html` | 1 file | canonical + hreflang hrefs missing `.html` |
| All 2000 HTML files (`-name "*.html"`) | 554 files with `hreflang="pt"` | changed to `hreflang="pt-PT"` to match sitemap |

**Total distinct files touched: ~2000** (all HTML files for hreflang fix; 939 files for the canonical fix)

---

## Specific File Examples: Before vs After

### standard/ pages (312 EN + 312 zh + 312 zht)

**Before:**
```html
<link rel="canonical" href="https://asaptic.com/standard/bess-china-to-mexico" />
<link rel="alternate" hreflang="en" href="https://asaptic.com/standard/bess-china-to-mexico" />
<link rel="alternate" hreflang="zh-Hans" href="https://asaptic.com/zh/standard/bess-china-to-mexico" />
<link rel="alternate" hreflang="zh-Hant" href="https://asaptic.com/zht/standard/bess-china-to-mexico" />
<link rel="alternate" hreflang="x-default" href="https://asaptic.com/standard/bess-china-to-mexico" />
```

**After:**
```html
<link rel="canonical" href="https://asaptic.com/standard/bess-china-to-mexico.html" />
<link rel="alternate" hreflang="en" href="https://asaptic.com/standard/bess-china-to-mexico.html" />
<link rel="alternate" hreflang="zh-Hans" href="https://asaptic.com/zh/standard/bess-china-to-mexico.html" />
<link rel="alternate" hreflang="zh-Hant" href="https://asaptic.com/zht/standard/bess-china-to-mexico.html" />
<link rel="alternate" hreflang="x-default" href="https://asaptic.com/standard/bess-china-to-mexico.html" />
```

### pt/ root pages (3 files)

**Before:**
```html
<link rel="canonical" href="https://asaptic.com/pt/heavy-lift-uav" />
<link rel="alternate" hreflang="en" href="https://asaptic.com/heavy-lift-uav" />
...
```

**After:**
```html
<link rel="canonical" href="https://asaptic.com/pt/heavy-lift-uav.html" />
<link rel="alternate" hreflang="en" href="https://asaptic.com/heavy-lift-uav.html" />
...
```

### hreflang pt → pt-PT (all HTML pages with pt locale tag)

**Before:**
```html
<link rel="alternate" hreflang="pt" href="https://asaptic.com/pt/" />
```

**After:**
```html
<link rel="alternate" hreflang="pt-PT" href="https://asaptic.com/pt/" />
```

---

## Configuration Findings

| File | Status |
|---|---|
| `robots.txt` | Clean — allows all crawlers, sitemap correctly declared at `https://asaptic.com/sitemap.xml` |
| `sitemap.xml` | Correct — all `<loc>` entries use `.html`, hreflang annotations use `pt-PT` |
| `_redirects` | Has `www/* -> asaptic.com/:splat 301` (note: this catches URL-path redirects, NOT hostname redirect for `www.asaptic.com`) |
| `_headers` | Clean — correct Content-Language headers per locale directory |
| `netlify.toml` | Not present |
| `wrangler.toml` | Not present |

### www Subdomain Note

`curl -sI https://www.asaptic.com/` returns **HTTP 200** — NOT a redirect. The `_redirects` rule `/www/* https://asaptic.com/:splat 301` only catches requests with the path prefix `/www/`, not the `www.` hostname. The `www.asaptic.com` subdomain is serving the same content with a canonical pointing to `https://asaptic.com/` — which is a "soft duplicate" that Google should resolve via the canonical tag. However, to fully close this, a Cloudflare-level "Always Use HTTPS + redirect www to non-www" rule is recommended (see remaining manual steps below).

---

## Verification Commands

After deploying, run:

```bash
# Check canonical on a standard page
curl -s https://asaptic.com/standard/bess-china-to-mexico.html | grep canonical

# Check hreflang on a standard page
curl -s https://asaptic.com/standard/bess-china-to-mexico.html | grep hreflang

# Confirm www redirects (after Cloudflare rule is set)
curl -sI https://www.asaptic.com/
```

---

## Remaining Manual Steps

1. **Deploy** — push to Cloudflare Pages (git commit + push). The fixes are in the working tree but not yet deployed.

2. **Cloudflare www → non-www redirect** — In Cloudflare dashboard: Pages > asaptic.com > Custom Domains, configure redirect rule for `www.asaptic.com` → `https://asaptic.com$request_uri` (308 permanent). This closes the soft duplicate that `_redirects` alone cannot fix.

3. **Resubmit sitemap in GSC** — Google Search Console > Sitemaps > resubmit `https://asaptic.com/sitemap.xml` to trigger re-crawl.

4. **Validate Fix in GSC** — After recrawl (allow 1–4 weeks): GSC > Pages > Duplicate canonical > select affected URL > "Validate Fix". Watch for GSC report count to drop toward zero.

---

## What Was NOT Changed

- Page content, layout, meta titles, descriptions — untouched
- `sitemap.xml` — already correct, no changes needed
- `robots.txt`, `_redirects`, `_headers` — no changes needed
- Blog pages — already had correct `.html` canonicals
- Root-level pages (`index.html`, `sourcing.html`, `about.html`, etc.) — canonical was already correct; only the `hreflang="pt"` → `hreflang="pt-PT"` change was applied
- `pt/` blog pages — already had correct `.html` canonicals
