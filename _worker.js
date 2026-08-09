// ---------------------------------------------------------------------------
// 404 handling (added 2026-08-09 — fixes the site-wide soft-404 catch-all)
//
// Cloudflare Pages, when a request matches no asset AND the project ships no
// 404.html, falls back to serving the root index.html with HTTP **200**.
// asaptic.com had no 404.html, so EVERY unknown path answered 200 + homepage
// HTML — including missing assets (/demo/style.css?v=1 returned 200 text/html).
// Consequences: Google recorded soft-404s, uptime/link monitors could never
// see a broken URL, and unknown deep paths rendered as an unstyled homepage.
//
// The fix has two halves and needs BOTH:
//   1. /404.html now exists, which flips Pages' miss behaviour from
//      "index.html + 200" to "404.html + 404" — this is what makes a miss
//      *detectable* here at all.
//   2. The handler below shapes that miss by request kind: a missing PAGE gets
//      the branded 404 page, a missing ASSET gets a plain-text 404 and is never
//      handed text/html.
// ---------------------------------------------------------------------------

// Extension-bearing paths are asset requests: CSS, JS, JSON, images, fonts,
// feeds. A browser asking for one must never receive an HTML document.
const ASSET_PATH_RE =
  /\.(json|txt|xml|png|svg|ico|jpg|jpeg|gif|webp|avif|pdf|webmanifest|css|js|mjs|map|woff2|woff|ttf|otf|csv|zip|mp4)$/i;

const NOT_FOUND_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
};

// Last-resort body, used only if Pages returns a 404 that is not our own
// 404.html (e.g. the asset were ever dropped from a deploy). Deliberately
// tiny — /404.html remains the single source of truth for the real page.
const FALLBACK_404_HTML =
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<meta name="robots" content="noindex, nofollow"><title>404 — Not Found · Asaptic</title></head>' +
  '<body style="background:#0A1428;color:#fff;font-family:system-ui,sans-serif;padding:48px">' +
  '<h1 style="font-size:48px;margin:0 0 12px">404</h1>' +
  '<p style="color:#B0BEC5;margin:0 0 4px">This page does not exist on asaptic.com.</p>' +
  '<p style="color:#B0BEC5;margin:0 0 24px">此页面不存在于 asaptic.com。</p>' +
  '<a href="/" style="color:#29B6F6">Return home · 返回首页</a></body></html>';

// A missing asset: plain text, correct status, never text/html.
function assetNotFound() {
  return new Response('404 Not Found\n', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...NOT_FOUND_HEADERS },
  });
}

// Serve `request` from Pages' static assets, converting any miss into a real
// 404 of the right shape. Every legitimate response (200, 206, 301/308
// trailing-slash + extensionless canonicalisation, 304) passes through
// untouched — this only intercepts status 404.
async function serveAsset(request, env, url) {
  const res = await env.ASSETS.fetch(request);

  // The error document itself must not answer 200 — otherwise /404 is an
  // indexable page that duplicates the error state. (/404.html 308s here.)
  if (res.status === 200 && url.pathname === '/404') {
    const headers = new Headers(res.headers);
    headers.set('Cache-Control', NOT_FOUND_HEADERS['Cache-Control']);
    headers.set('X-Robots-Tag', NOT_FOUND_HEADERS['X-Robots-Tag']);
    return new Response(res.body, { status: 404, headers });
  }

  if (res.status !== 404) return res;

  if (ASSET_PATH_RE.test(url.pathname)) return assetNotFound();

  // Pages has already rendered /404.html with a 404 status; keep that body and
  // just harden the headers. If it is somehow not HTML, substitute our own.
  const isHtml = (res.headers.get('Content-Type') || '').includes('text/html');
  if (!isHtml) {
    return new Response(FALLBACK_404_HTML, {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8', ...NOT_FOUND_HEADERS },
    });
  }
  const headers = new Headers(res.headers);
  headers.set('Cache-Control', NOT_FOUND_HEADERS['Cache-Control']);
  headers.set('X-Robots-Tag', NOT_FOUND_HEADERS['X-Robots-Tag']);
  return new Response(res.body, { status: 404, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Canonical host: consolidate all variants to https://asaptic.com (301).
    // Identical content was served on asaptic.cn + www.* with no redirect,
    // causing GSC "Duplicate, Google chose different canonical than user".
    // (*.pages.dev previews and the separate ai.asaptic.com are left alone.)
    const REDIRECT_HOSTS = new Set([
      'www.asaptic.com',
      'asaptic.cn',
      'www.asaptic.cn',
    ]);
    if (REDIRECT_HOSTS.has(url.hostname)) {
      url.hostname = 'asaptic.com';
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }

    // Geo endpoint for language detection
    if (url.pathname === '/geo') {
      const country = request.cf?.country || 'US';
      return new Response(JSON.stringify({ country }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        },
      });
    }

    // MCP server (agent-callable sourcing tools) at /mcp
    if (url.pathname === '/mcp') {
      const cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      };
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

      const LANES = [
        { id: 'clinical-bioimpedance', sources: 'clinical bioimpedance / body-composition analysers', markets: ['CA','AU','UK','EU'], compliance: ['Health Canada MDALL','TGA ARTG','CE MDR','ISO 13485'], page: 'https://asaptic.com/sourcing/clinical-devices.html' },
        { id: 'remote-patient-monitoring', sources: 'RPM / connected-health devices (BP, SpO2, glucose, cellular hubs)', markets: ['US','EU','UK','Global-South'], compliance: ['FDA 510(k)','CE MDR','ISO 13485'], page: 'https://asaptic.com/blog/source-remote-patient-monitoring-rpm-devices-china.html' },
        { id: 'tfln-photonics', sources: 'TFLN/LNOI wafers + EO modulators', markets: ['US','EU','GB','CA','AU'], compliance: ['EAR99','export-control screening'], page: 'https://asaptic.com/deep-tech-sourcing.html' },
        { id: 'energy-solar-bess', sources: 'solar/hybrid inverters, LFP BESS, EV chargers', markets: ['Gulf','Lusophone','Global-South'], compliance: ['SABER/SASO','INMETRO','CE','IEC 62109'], page: 'https://asaptic.com/blog/source-solar-inverters-bess-gulf-lusophone.html' },
        { id: 'ai-cold-plates', sources: 'AI data-center liquid cold plates, CDUs, manifolds', markets: ['US','EU','global'], compliance: ['C11000 copper','helium leak test','flatness <=0.02mm'], page: 'https://asaptic.com/blog/source-ai-data-center-cold-plates-china.html' },
        { id: 'gan-power', sources: 'GaN power devices + fast chargers (power, not RF)', markets: ['US','EU','global'], compliance: ['EAR99','MOFCOM gallium export licence','CE/FCC'], page: 'https://asaptic.com/blog/source-gan-power-devices-china.html' },
        { id: 'na-ion-bess', sources: 'sodium-ion cells + BESS', markets: ['Global-South','telecom','off-grid'], compliance: ['IEC 62619','UN3551/3552','CE/UL'], page: 'https://asaptic.com/deep-tech-sourcing.html' },
        { id: 'humanoid-actuators', sources: 'harmonic drives, joint modules, frameless torque motors', markets: ['US','EU','global'], compliance: ['CE','RoHS'], page: 'https://asaptic.com/blog/source-humanoid-robot-actuators-china.html' },
        { id: 'tactile-eskin', sources: 'tactile e-skin + multimodal force-sensor arrays', markets: ['EU-first','global','prosthetics'], compliance: ['verify HS for AI-chip-embedded (China dual-use)'], page: 'https://asaptic.com/blog/source-tactile-eskin-force-sensors-china.html' },
        { id: 'ev-charger-modules', sources: 'EV-charger SiC DC fast-charge power modules', markets: ['EU','US','global'], compliance: ['CE','ISO 15118','DIN 70121'], page: 'https://asaptic.com/blog/source-ev-charger-power-modules-china.html' },
      ];
      const ENGAGEMENT = { model: 'principal-reseller, factory-direct, deposit-first', payment: '30% deposit on proforma, 70% against bill of lading', buyer_working_capital: '~zero', email: 'engage@asaptic.com', response_sla: 'RFQs answered within 4 hours, 24/7' };
      const TOOLS = [
        { name: 'list_sourcing_lanes', description: 'List all of Asaptic’s factory-direct sourcing lanes (id, products, markets).', inputSchema: { type: 'object', properties: {} } },
        { name: 'get_lane_capability', description: 'Get full detail for one sourcing lane.', inputSchema: { type: 'object', properties: { lane_id: { type: 'string' } }, required: ['lane_id'] } },
        { name: 'get_engagement', description: 'Get Asaptic’s deposit-first model and engagement path.', inputSchema: { type: 'object', properties: {} } },
        { name: 'submit_rfq', description: 'Submit a request for quote to Asaptic.', inputSchema: { type: 'object', properties: { product: { type: 'string' }, quantity: { type: 'string' }, target_market: { type: 'string' }, buyer_contact: { type: 'string' } }, required: ['product','buyer_contact'] } },
      ];

      if (request.method === 'GET') {
        return new Response(JSON.stringify({ name: 'asaptic-sourcing', description: 'Asaptic (HK) Ltd factory-direct sourcing MCP server. POST JSON-RPC 2.0 to call tools.', transport: 'streamable-http', endpoint: 'https://asaptic.com/mcp', tools: TOOLS.map(t => t.name), docs: 'https://asaptic.com/llms-full.txt' }, null, 2), { headers: { 'Content-Type': 'application/json', ...cors } });
      }

      if (request.method === 'POST') {
        let req; try { req = await request.json(); } catch { return new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } }); }
        const id = req.id ?? null;
        const reply = (result) => new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), { headers: { 'Content-Type': 'application/json', ...cors } });
        const err = (code, message) => new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), { headers: { 'Content-Type': 'application/json', ...cors } });
        const callTool = (name, args = {}) => {
          if (name === 'list_sourcing_lanes') return LANES.map(l => ({ id: l.id, sources: l.sources, markets: l.markets }));
          if (name === 'get_lane_capability') { const l = LANES.find(x => x.id === (args.lane_id || '').trim()); return l || { error: 'unknown lane_id', valid: LANES.map(x => x.id) }; }
          if (name === 'get_engagement') return ENGAGEMENT;
          if (name === 'submit_rfq') { if (!args.product || !args.buyer_contact) return { error: 'product and buyer_contact are required' }; const ref = 'RFQ-' + Date.now().toString(36).toUpperCase(); return { received: true, reference: ref, next: 'Asaptic will respond to buyer_contact within 4 hours; or email engage@asaptic.com', echo: args }; }
          return null;
        };
        switch (req.method) {
          case 'initialize': return reply({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'asaptic-sourcing', version: '1.0.0' } });
          case 'tools/list': return reply({ tools: TOOLS });
          case 'tools/call': {
            const r = callTool(req.params?.name, req.params?.arguments || {});
            if (r === null) return err(-32602, 'Unknown tool');
            return reply({ content: [{ type: 'text', text: JSON.stringify(r) }] });
          }
          case 'notifications/initialized': return new Response(null, { status: 204, headers: cors });
          default: return err(-32601, 'Method not found');
        }
      }
      return new Response('Method Not Allowed', { status: 405, headers: cors });
    }

    // Tender LISTING feed — served from R2 so publishing DATA no longer requires
    // deploying the SITE. This is the single public data source read by
    // asaptic.com/tender, app.asaptic.com, radar.asaptic.com, go.asaptic.com and
    // the iOS/Android builds. The URL is deliberately unchanged: the native apps
    // hardcode it at build time and have no OTA channel, so it can never move.
    //
    // Must sit BEFORE the static-asset passthrough below, whose regex would
    // otherwise claim any *.json path.
    //
    // Fail-safe: any problem (no binding, missing object, empty body, thrown
    // error) falls through to the last baked static copy. A data outage degrades
    // to yesterday's tenders — never to an empty list across six surfaces.
    if (url.pathname === '/tender/rows.json') {
      try {
        const obj = env.TENDER_DATA && await env.TENDER_DATA.get('rows.json');
        if (obj) {
          const body = await obj.text();
          if (body && body.length > 0) {
            return new Response(body, {
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=300, must-revalidate',
                'ETag': obj.httpEtag,
                'X-Data-Source': 'r2',
              },
            });
          }
        }
      } catch (e) {
        // swallow — never surface a storage error to a public consumer
      }
      // Falls back to the last baked static copy. If even that is missing the
      // six consumers get a plain 404, never a 200 HTML page they would try to
      // JSON.parse.
      return serveAsset(request, env, url);
    }

    // Everything else is a static asset served by Pages: HTML pages, the
    // trailing-slash and extensionless canonicalisation redirects Pages issues
    // for them, /.well-known/*, sitemaps, feeds, CSS/JS/images/fonts.
    // serveAsset() passes all of those through unchanged and only intervenes on
    // a miss — which is now a real 404 instead of the homepage.
    return serveAsset(request, env, url);
  },
};
