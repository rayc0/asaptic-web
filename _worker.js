import {
  handleApiRequest,
  jsonNotFound,
  getHealth,
  TENDER_TOOLS,
  TENDER_TOOL_NAMES,
  handleTenderTool,
} from './lib/agent-api.mjs';

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

    // /healthz — alias of /api/v1/health (feed freshness is the product claim).
    if (url.pathname === '/healthz') {
      const h = await getHealth(env);
      return new Response(JSON.stringify(h.body), {
        status: h.status,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Agent REST API (public read plane) — /api/v1/tenders, /tenders/:at_id,
    // /tenders/facets, /spec-coded/:at_id (structured 403 funnel), plus a
    // scoped JSON-404 for every other /api/* path. Rows are verbatim subsets
    // of the public rows.json artifact — see lib/agent-api.mjs boundary rule.
    // Must sit BEFORE the static-asset passthrough (its regex would claim
    // /api/*.json-looking paths and answer HTML 404s to typos).
    if (url.pathname.startsWith('/api/')) {
      return handleApiRequest(request, env);
    }

    // /agent/* — real static files (e.g. /agent/capabilities.json) pass
    // through; anything unmatched gets a scoped JSON-404 instead of SPA HTML.
    if (url.pathname.startsWith('/agent/')) {
      const res = await env.ASSETS.fetch(request);
      if (res.status !== 404) return res;
      return jsonNotFound();
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
        // Tender listing tools (shared logic with /api/v1/* — lib/agent-api.mjs)
        ...TENDER_TOOLS,
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
        try {
          switch (req.method) {
            case 'initialize': return reply({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'asaptic-sourcing', version: '1.1.0' } });
            case 'tools/list': return reply({ tools: TOOLS });
            case 'tools/call': {
              const name = req.params?.name;
              const args = req.params?.arguments || {};
              // Tender tools: async handlers that never throw — a storage
              // failure comes back as a JSON-RPC error, not a worker exception.
              if (TENDER_TOOL_NAMES.has(name)) {
                const out = await handleTenderTool(env, name, args);
                if (out.rpcError) return err(out.rpcError.code, out.rpcError.message);
                return reply({ content: [{ type: 'text', text: JSON.stringify(out.result) }] });
              }
              const r = callTool(name, args);
              if (r === null) return err(-32602, 'Unknown tool');
              return reply({ content: [{ type: 'text', text: JSON.stringify(r) }] });
            }
            case 'notifications/initialized': return new Response(null, { status: 204, headers: cors });
            default: return err(-32601, 'Method not found');
          }
        } catch {
          return err(-32603, 'Internal error');
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
      return env.ASSETS.fetch(request);
    }

    // Static assets and well-known files: always pass through to ASSETS
    // (prevents SPA catch-all from serving text/html for these paths)
    if (
      url.pathname.startsWith('/.well-known/') ||
      url.pathname === '/llms.txt' ||
      url.pathname === '/robots.txt' ||
      url.pathname === '/sitemap.xml' ||
      /\.(json|txt|xml|png|svg|ico|jpg|jpeg|gif|webp|pdf|webmanifest|css|js|woff2|woff|ttf|otf)$/i.test(url.pathname)
    ) {
      return env.ASSETS.fetch(request);
    }

    // Serve static assets from Pages (SPA fallback)
    return env.ASSETS.fetch(request);
  },
};
