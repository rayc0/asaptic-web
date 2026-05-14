# Asaptic Labs — asaptic.com

Static site for Asaptic Labs. Deployed via Cloudflare Pages.

## Files
- `index.html` — single-page site, 3-language (EN/ZH/ZHT)
- `content.js` — all text content in 3 languages
- `style.css` — dark theme, AI-native design
- `_worker.js` — Cloudflare edge function for geo/IP language detection
- `_headers` — security + cache headers
- `_redirects` — www redirect

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
or open index.html directly in browser.
