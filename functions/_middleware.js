/**
 * Gate for the .dev staging copy of the Asaptic marketing site (asaptic.dev).
 * This file exists ONLY on the dev/gated-instance branch — it must NEVER reach
 * the branch that deploys public asaptic.com.
 *
 *   1. HTTP Basic Auth over the whole site (env VAULT_PASSWORD), so the staged
 *      marketing site is never public while it's a .dev instance.
 *   2. /robots.txt served publicly with Disallow:/ so crawlers read the block.
 *   3. X-Robots-Tag: noindex on every response (incl. 401) — no search engine
 *      or AI crawler indexes the staging site.
 *   4. Injects the shared Control Tower launcher on every HTML page.
 * Fail-closed: no VAULT_PASSWORD -> 503.
 */
const NOINDEX = 'noindex, nofollow, noarchive, nosnippet, noimageindex';

function safeEqual(a, b) {
  const enc = new TextEncoder(), bufA = enc.encode(a), bufB = enc.encode(b);
  const n = Math.max(bufA.length, bufB.length);
  let r = bufA.length ^ bufB.length;
  for (let i = 0; i < n; i++) r |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
  return r === 0;
}
function unauthorized() {
  return new Response('Unauthorized — Asaptic (.dev staging)', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Asaptic dev"',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': NOINDEX,
    },
  });
}
function noIndex(res) {
  const h = new Headers(res.headers);
  h.set('X-Robots-Tag', NOINDEX);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
async function injectCT(res, request) {
  try {
    if (!(res.headers.get('content-type') || '').includes('text/html')) return res;
    if (new URL(request.url).pathname.startsWith('/_ct/')) return res;
    let html = await res.text();
    if (html.includes('/_ct/widget.js')) return res;
    const tag = '<script src="/_ct/widget.js" defer></script>';
    html = html.includes('</body>') ? html.replace('</body>', tag + '</body>') : html + tag;
    const h = new Headers(res.headers); h.delete('content-length');
    return new Response(html, { status: res.status, statusText: res.statusText, headers: h });
  } catch (_) { return res; }
}

export async function onRequest(context) {
  const { request, env, next } = context;
  if (new URL(request.url).pathname === '/robots.txt') return noIndex(await next());

  const pw = env.VAULT_PASSWORD;
  if (!pw) return new Response('Service misconfigured — contact administrator.', { status: 503, headers: { 'X-Robots-Tag': NOINDEX } });

  const h = request.headers.get('Authorization') ?? '';
  if (!h.startsWith('Basic ')) return unauthorized();
  let decoded;
  try { decoded = atob(h.slice(6).trim()); } catch { return unauthorized(); }
  const i = decoded.indexOf(':');
  if (i === -1 || !safeEqual(decoded.slice(i + 1), pw)) return unauthorized();

  return noIndex(await injectCT(await next(), request));
}
