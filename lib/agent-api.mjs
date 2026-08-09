// lib/agent-api.mjs — Asaptic agent-access layer (public read plane).
//
// Shared by the REST routes (/api/v1/*) and the MCP tender tools in _worker.js.
//
// BOUNDARY RULE (do not weaken): every row this module emits is a whitelist
// copy of a row already published in the public rows.json artifact. This file
// must NEVER import portal projection code (tender-record.js or any
// toPublicSummary/toSupplierSummary equivalent) and must never add keys beyond
// ALLOWED_ROW_KEYS. A filter over an allowlisted output cannot leak more than
// the allowlisted output.

import { captureLead } from './lead-capture.mjs';

// ---------------------------------------------------------------------------
// §1 Constants
// ---------------------------------------------------------------------------

export const ALLOWED_ROW_KEYS = Object.freeze([
  'asaptic_id',
  'market',
  'category',
  'summary_en',
  'summary_zh',
  'summary_zht',
  'value_band',
  'closing_bucket',
  'lead_ok',
  'new_this_issue',
  'sort_key',
]);

export const ALLOWED_CATEGORY_KEYS = Object.freeze(['name_en', 'name_zh', 'name_zht']);

const LANGS = Object.freeze(['en', 'zh', 'zht']);
const CLOSING_BUCKETS = Object.freeze(['le_2w', '2_4w', 'gt_4w', 'deadline_passed']);
const VALUE_BANDS = Object.freeze(['lt_500k', '500k_2m', '2m_10m', 'gt_10m', 'unspecified']);

const REST_DEFAULT_LIMIT = 50;
const MCP_DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;
const CACHE_TTL_SECONDS = 300;

const PORTAL_URL = 'https://portal.asaptic.com/';
export const CONTACT_EMAIL = 'engage@asaptic.com';

// Funnel copy — every listing response names the path to the gated tier.
export const ACCESS_META = Object.freeze({
  listing: 'open',
  spec_coded: Object.freeze({
    gated: true,
    how:
      'Spec-coded technical packages require an approved Asaptic account. ' +
      'Request access with the request_tender_access tool on https://asaptic.com/mcp, ' +
      'or email ' + CONTACT_EMAIL + '.',
    url: PORTAL_URL,
  }),
});

// Byte-identical 404 body: same bytes for unknown, withheld, or expired ids so
// the response never distinguishes why an id is absent from the public snapshot.
const NOT_FOUND_BODY = JSON.stringify({
  error: {
    code: 'not_found',
    message: 'No such id in the current public listing snapshot.',
  },
});

// NOTE: the site-wide `_headers` file's X-Content-Type-Options: nosniff rule
// only applies to responses served through the Pages ASSETS pipeline — every
// response this worker constructs directly (all of /api/*) bypasses it, so
// nosniff is included here and spread onto every /api/* response alongside
// CORS.
const CORS_HEADERS = Object.freeze({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'X-Content-Type-Options': 'nosniff',
});

// ---------------------------------------------------------------------------
// §2 Snapshot loading — R2 first, baked static copy as fail-safe, with a
// module-global parsed-snapshot memo keyed on the R2 etag.
// ---------------------------------------------------------------------------

let snapshotMemo = { etag: null, snapshot: null };

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildSnapshot(raw, etag) {
  const rows = Array.isArray(raw.rows) ? raw.rows : [];
  const byId = new Map();
  const categories = new Map(); // slug -> {slug, name_en, name_zh, name_zht, count}
  const nameToSlug = new Map(); // lowercased name (any lang) -> slug
  const markets = new Set();
  for (const row of rows) {
    byId.set(row.asaptic_id, row);
    markets.add(row.market);
    const cat = row.category || {};
    const slug = slugify(cat.name_en || '');
    if (!categories.has(slug)) {
      categories.set(slug, {
        slug,
        name_en: cat.name_en,
        name_zh: cat.name_zh,
        name_zht: cat.name_zht,
        count: 0,
      });
      for (const k of ALLOWED_CATEGORY_KEYS) {
        if (cat[k]) nameToSlug.set(String(cat[k]).toLowerCase(), slug);
      }
    }
    categories.get(slug).count += 1;
  }
  return {
    etag,
    issue_id: raw.issue_id,
    generated: raw.generated,
    total_published: raw.total,
    rows,
    byId,
    categories,
    nameToSlug,
    markets,
  };
}

/**
 * Load the current public snapshot. Throws SnapshotUnavailableError only when
 * both R2 and the baked static copy fail.
 */
export async function getSnapshot(env) {
  const bucket = env && env.TENDER_DATA;
  // Fast path: cheap etag check against the memo.
  if (bucket && snapshotMemo.snapshot) {
    try {
      if (typeof bucket.head === 'function') {
        const head = await bucket.head('rows.json');
        if (head && head.httpEtag === snapshotMemo.etag) return snapshotMemo.snapshot;
      }
    } catch {
      /* fall through to full load */
    }
  }
  // Full load from R2.
  if (bucket) {
    try {
      const obj = await bucket.get('rows.json');
      if (obj) {
        if (obj.httpEtag && obj.httpEtag === snapshotMemo.etag) {
          return snapshotMemo.snapshot;
        }
        const body = await obj.text();
        if (body && body.length > 0) {
          const snap = buildSnapshot(JSON.parse(body), obj.httpEtag || 'r2');
          snapshotMemo = { etag: snap.etag, snapshot: snap };
          return snap;
        }
      }
    } catch {
      /* fall through to baked copy */
    }
  }
  // Fail-safe: last baked static copy shipped with the site.
  if (env && env.ASSETS) {
    try {
      const res = await env.ASSETS.fetch(new Request('https://asaptic.com/tender/rows.json'));
      if (res && res.ok) {
        const raw = await res.json();
        const etag = 'baked:' + (raw.generated || 'unknown');
        if (etag === snapshotMemo.etag) return snapshotMemo.snapshot;
        const snap = buildSnapshot(raw, etag);
        snapshotMemo = { etag: snap.etag, snapshot: snap };
        return snap;
      }
    } catch {
      /* fall through to error */
    }
  }
  // Last resort: serve the stale memo rather than fail (mirrors the
  // /tender/rows.json fail-safe — a data outage degrades to the last
  // successfully loaded snapshot, never to a dead API).
  if (snapshotMemo.snapshot) return snapshotMemo.snapshot;
  const err = new Error('listing snapshot unavailable');
  err.code = 'snapshot_unavailable';
  throw err;
}

/** Test hook: clear the memo so tests can exercise reload paths. */
export function _resetSnapshotMemo() {
  snapshotMemo = { etag: null, snapshot: null };
}

// ---------------------------------------------------------------------------
// §3 Row projection — whitelist copy, optional language collapsing.
// A row without `lang` carries exactly the 11 allowed keys; with `lang` the
// non-selected summary_* keys and category names are dropped (strict subset,
// never a new key).
// ---------------------------------------------------------------------------

export function projectRow(row, lang) {
  const cat = row.category || {};
  let category;
  if (lang) {
    category = {};
    category['name_' + lang] = cat['name_' + lang];
  } else {
    category = { name_en: cat.name_en, name_zh: cat.name_zh, name_zht: cat.name_zht };
  }
  const out = {
    asaptic_id: row.asaptic_id,
    market: row.market,
    category,
    value_band: row.value_band ?? null,
    closing_bucket: row.closing_bucket,
    lead_ok: row.lead_ok,
    new_this_issue: row.new_this_issue,
    sort_key: row.sort_key,
  };
  if (lang) {
    out['summary_' + lang] = row['summary_' + lang];
  } else {
    out.summary_en = row.summary_en;
    out.summary_zh = row.summary_zh;
    out.summary_zht = row.summary_zht;
  }
  return out;
}

// ---------------------------------------------------------------------------
// §4 Filters + cursor
// ---------------------------------------------------------------------------

class ParamError extends Error {
  constructor(message) {
    super(message);
    this.code = 'invalid_parameter';
  }
}

// Both REST (URL length is bounded by intermediaries) and MCP (a tool-call
// argument is just a JSON string with no such bound) share parseFilters — so
// these clamps must live here, not at either transport's edge, to actually
// cover both.
const MAX_PARAM_STRING_LEN = 256;
const MAX_PARAM_ARRAY_ITEMS = 16;

function assertParamLength(name, raw) {
  if (String(raw).length > MAX_PARAM_STRING_LEN) {
    throw new ParamError(
      'Invalid ' + name + ': exceeds the maximum length of ' + MAX_PARAM_STRING_LEN + ' characters.'
    );
  }
}

function assertArrayItems(name, arr) {
  if (arr.length > MAX_PARAM_ARRAY_ITEMS) {
    throw new ParamError(
      'Invalid ' + name + ': too many comma-separated values (max ' + MAX_PARAM_ARRAY_ITEMS + ').'
    );
  }
}

function csv(value) {
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseBool(name, value) {
  const v = String(value).toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  throw new ParamError('Invalid value for ' + name + ': expected true or false.');
}

/**
 * Normalize filter params from either a URLSearchParams (REST) or a plain
 * object (MCP tool arguments). Returns a canonical filter description.
 */
export function parseFilters(input, snapshot) {
  const get = (name) => {
    if (typeof input.get === 'function') {
      const v = input.get(name);
      return v === null || v === '' ? undefined : v;
    }
    const v = input[name];
    if (v === undefined || v === null || v === '') return undefined;
    return Array.isArray(v) ? v.join(',') : String(v);
  };

  const f = {};

  const market = get('market');
  if (market !== undefined) {
    assertParamLength('market', market);
    const codes = csv(market).map((c) => c.toUpperCase());
    assertArrayItems('market', codes);
    for (const c of codes) {
      if (!/^[A-Z]{2}$/.test(c)) {
        throw new ParamError('Invalid market code: expected two-letter codes, comma-separated.');
      }
    }
    f.markets = codes;
  }

  const category = get('category');
  if (category !== undefined) {
    assertParamLength('category', category);
    const items = csv(category);
    assertArrayItems('category', items);
    const slugs = [];
    for (const c of items) {
      const direct = slugify(c);
      if (snapshot.categories.has(direct)) slugs.push(direct);
      else {
        const byName = snapshot.nameToSlug.get(c.toLowerCase());
        slugs.push(byName || direct); // unknown category matches nothing (empty result, not an error)
      }
    }
    f.categories = slugs;
  }

  const bucket = get('closing_bucket');
  if (bucket !== undefined && String(bucket).toLowerCase() !== 'all') {
    const buckets = csv(bucket).map((b) => b.toLowerCase());
    for (const b of buckets) {
      if (!CLOSING_BUCKETS.includes(b)) {
        throw new ParamError(
          'Invalid closing_bucket: valid values are ' + CLOSING_BUCKETS.join(', ') + ', or all.'
        );
      }
    }
    f.buckets = buckets;
  } else if (bucket === undefined) {
    f.excludePassed = true; // default: open opportunities only
  }

  const isNew = get('new');
  if (isNew !== undefined) f.new = parseBool('new', isNew);

  const leadOk = get('lead_ok');
  if (leadOk !== undefined) f.lead_ok = parseBool('lead_ok', leadOk);

  const band = get('value_band');
  if (band !== undefined) {
    assertParamLength('value_band', band);
    const bands = csv(band).map((b) => b.toLowerCase());
    assertArrayItems('value_band', bands);
    for (const b of bands) {
      if (!VALUE_BANDS.includes(b)) {
        throw new ParamError('Invalid value_band: valid values are ' + VALUE_BANDS.join(', ') + '.');
      }
    }
    f.bands = bands;
  }

  const q = get('q');
  if (q !== undefined) {
    assertParamLength('q', q);
    f.q = String(q).toLowerCase();
  }

  const lang = get('lang');
  if (lang !== undefined) {
    const l = String(lang).toLowerCase();
    if (!LANGS.includes(l)) {
      throw new ParamError('Invalid lang: valid values are ' + LANGS.join(', ') + '.');
    }
    f.lang = l;
  }

  return f;
}

/** q searches ONLY the sanitized summaries and category names. */
function rowMatchesQ(row, q) {
  const cat = row.category || {};
  return (
    (row.summary_en || '').toLowerCase().includes(q) ||
    (row.summary_zh || '').includes(q) ||
    (row.summary_zht || '').includes(q) ||
    (cat.name_en || '').toLowerCase().includes(q) ||
    (cat.name_zh || '').includes(q) ||
    (cat.name_zht || '').includes(q)
  );
}

export function applyFilters(snapshot, f) {
  const out = [];
  for (const row of snapshot.rows) {
    if (f.markets && !f.markets.includes(row.market)) continue;
    if (f.categories) {
      const slug = slugify((row.category || {}).name_en || '');
      if (!f.categories.includes(slug)) continue;
    }
    if (f.excludePassed && row.closing_bucket === 'deadline_passed') continue;
    if (f.buckets && !f.buckets.includes(row.closing_bucket)) continue;
    if (f.new !== undefined && row.new_this_issue !== f.new) continue;
    if (f.lead_ok !== undefined && row.lead_ok !== f.lead_ok) continue;
    if (f.bands) {
      const band = row.value_band == null ? 'unspecified' : row.value_band;
      if (!f.bands.includes(band)) continue;
    }
    if (f.q && !rowMatchesQ(row, f.q)) continue;
    out.push(row);
  }
  return out;
}

// Stable fingerprint of the canonical filter, so a cursor cannot be replayed
// against a different filter set.
//
// This used to be a 32-bit DJB2 hash of the canonical string. A 32-bit hash
// has only ~4 billion buckets — cheap to collide on purpose, which would let
// a crafted cursor be replayed against a filter set it was never issued for
// (the decode check is a straight equality compare, so any collision passes
// it). The canonical string built below is short (every input that feeds it
// is clamped to MAX_PARAM_STRING_LEN / MAX_PARAM_ARRAY_ITEMS by parseFilters
// before it ever reaches here), so there is no size reason to hash it — the
// fingerprint IS the canonical filter string itself, base64url-encoded as
// part of the cursor (see encodeCursor). Equality is then exact, not
// probabilistic.
export function filterFingerprint(f) {
  return [
    f.markets ? f.markets.slice().sort().join('+') : '',
    f.categories ? f.categories.slice().sort().join('+') : '',
    f.buckets ? f.buckets.slice().sort().join('+') : f.excludePassed ? 'default' : 'all',
    f.new === undefined ? '' : String(f.new),
    f.lead_ok === undefined ? '' : String(f.lead_ok),
    f.bands ? f.bands.slice().sort().join('+') : '',
    f.q || '',
    f.lang || '',
  ].join('|');
}

function b64urlEncode(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeCursor(issueId, offset, fp) {
  return b64urlEncode(JSON.stringify({ v: 1, i: issueId, o: offset, f: fp }));
}

class CursorError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // invalid_cursor | snapshot_changed
  }
}

export function decodeCursor(cursor, issueId, fp) {
  let c;
  try {
    c = JSON.parse(b64urlDecode(String(cursor)));
  } catch {
    throw new CursorError('invalid_cursor', 'Cursor is malformed. Restart from the first page.');
  }
  if (!c || c.v !== 1 || typeof c.o !== 'number' || c.o < 0) {
    throw new CursorError('invalid_cursor', 'Cursor is malformed. Restart from the first page.');
  }
  if (c.i !== issueId) {
    throw new CursorError(
      'snapshot_changed',
      'The listing snapshot changed since this cursor was issued. Restart from the first page.'
    );
  }
  if (c.f !== fp) {
    throw new CursorError(
      'invalid_cursor',
      'Cursor does not match the current filters. Restart from the first page.'
    );
  }
  return c.o;
}

// ---------------------------------------------------------------------------
// §5 Core operations — return {status, body} plain objects (transport-neutral,
// shared verbatim by REST and MCP).
// ---------------------------------------------------------------------------

function metaFor(snapshot, extra) {
  return {
    issue_id: snapshot.issue_id,
    generated: snapshot.generated,
    snapshot_etag: snapshot.etag,
    access: ACCESS_META,
    ...extra,
  };
}

export async function listTenders(env, params, { defaultLimit = REST_DEFAULT_LIMIT } = {}) {
  const snapshot = await getSnapshot(env);
  let f;
  try {
    f = parseFilters(params, snapshot);
  } catch (e) {
    return { status: 400, body: { error: { code: e.code || 'invalid_parameter', message: e.message } } };
  }

  const rawLimit =
    typeof params.get === 'function' ? params.get('limit') : params.limit;
  let limit = defaultLimit;
  if (rawLimit !== undefined && rawLimit !== null && rawLimit !== '') {
    limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1) {
      return {
        status: 400,
        body: { error: { code: 'invalid_parameter', message: 'Invalid limit: expected an integer between 1 and ' + MAX_LIMIT + '.' } },
      };
    }
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;
  }

  const filtered = applyFilters(snapshot, f);
  const fp = filterFingerprint(f);

  let offset = 0;
  const rawCursor = typeof params.get === 'function' ? params.get('cursor') : params.cursor;
  if (rawCursor) {
    try {
      offset = decodeCursor(rawCursor, snapshot.issue_id, fp);
    } catch (e) {
      const status = e.code === 'snapshot_changed' ? 409 : 400;
      return { status, body: { error: { code: e.code, message: e.message } } };
    }
  }

  const page = filtered.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  const next_cursor = nextOffset < filtered.length ? encodeCursor(snapshot.issue_id, nextOffset, fp) : null;

  return {
    status: 200,
    body: {
      data: page.map((r) => projectRow(r, f.lang)),
      meta: metaFor(snapshot, { total: filtered.length, returned: page.length, next_cursor }),
    },
  };
}

export async function getTender(env, atId, lang) {
  const snapshot = await getSnapshot(env);
  if (lang && !LANGS.includes(lang)) {
    return { status: 400, body: { error: { code: 'invalid_parameter', message: 'Invalid lang: valid values are ' + LANGS.join(', ') + '.' } } };
  }
  const row = snapshot.byId.get(String(atId));
  if (!row) {
    // Byte-identical 404: the exact same body string for every absent id.
    return { status: 404, rawBody: NOT_FOUND_BODY };
  }
  return {
    status: 200,
    body: {
      data: projectRow(row, lang),
      meta: metaFor(snapshot, { total: 1, returned: 1, next_cursor: null }),
    },
  };
}

export async function getFacets(env) {
  const snapshot = await getSnapshot(env);
  const market = {};
  const bucket = {};
  const band = {};
  let newCount = 0;
  let leadOkCount = 0;
  for (const row of snapshot.rows) {
    market[row.market] = (market[row.market] || 0) + 1;
    bucket[row.closing_bucket] = (bucket[row.closing_bucket] || 0) + 1;
    const vb = row.value_band == null ? 'unspecified' : row.value_band;
    band[vb] = (band[vb] || 0) + 1;
    if (row.new_this_issue) newCount++;
    if (row.lead_ok) leadOkCount++;
  }
  const categories = [...snapshot.categories.values()].sort((a, b) => b.count - a.count);
  return {
    status: 200,
    body: {
      data: {
        market: Object.keys(market).sort().map((code) => ({ code, count: market[code] })),
        category: categories,
        closing_bucket: CLOSING_BUCKETS.map((code) => ({ code, count: bucket[code] || 0 })),
        value_band: VALUE_BANDS.map((code) => ({ code, count: band[code] || 0 })),
        new_this_issue: newCount,
        lead_ok: leadOkCount,
      },
      meta: metaFor(snapshot, { total: snapshot.rows.length }),
    },
  };
}

// Freshness IS the product claim for a data business: /api/v1/health reports
// what is actually being served, read through the same snapshot loader.
const FEED_FRESH_MAX_AGE_MS = 8 * 24 * 60 * 60 * 1000; // one weekly issue + slack

export async function getHealth(env) {
  let snapshot;
  try {
    snapshot = await getSnapshot(env);
  } catch {
    return {
      status: 503,
      body: { status: 'unavailable', rows_total: null, issue_id: null, generated: null, feed_fresh: false },
    };
  }
  const generatedMs = Date.parse(snapshot.generated || '');
  const feed_fresh =
    Number.isFinite(generatedMs) && Date.now() - generatedMs < FEED_FRESH_MAX_AGE_MS;
  const servingBaked = String(snapshot.etag).startsWith('baked:');
  return {
    status: 200,
    body: {
      status: feed_fresh && !servingBaked ? 'ok' : 'degraded',
      rows_total: snapshot.rows.length,
      issue_id: snapshot.issue_id,
      generated: snapshot.generated,
      feed_fresh,
      schema: 'asaptic.tender.v1',
    },
  };
}

export function specCodedGate(atId) {
  return {
    status: 403,
    body: {
      error: {
        code: 'SPEC_CODED_GATED',
        message:
          'Spec-coded technical packages are available to approved accounts only. ' +
          'Request access with the request_tender_access tool on https://asaptic.com/mcp, ' +
          'or email ' + CONTACT_EMAIL + '.',
      },
      at_id: atId || null,
      access_url: PORTAL_URL,
    },
  };
}

// ---------------------------------------------------------------------------
// §6 REST transport — Response builder + router for /api/*.
// ---------------------------------------------------------------------------

function jsonHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=' + CACHE_TTL_SECONDS,
    ...CORS_HEADERS,
  };
}

function toResponse(result) {
  const body = result.rawBody !== undefined ? result.rawBody : JSON.stringify(result.body);
  const headers = jsonHeaders();
  if (result.status !== 200) headers['Cache-Control'] = 'no-store';
  return new Response(body, { status: result.status, headers });
}

export function jsonNotFound() {
  return new Response(
    JSON.stringify({ error: { code: 'not_found', message: 'Unknown API path. See https://asaptic.com/openapi.json.' } }),
    { status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS_HEADERS } }
  );
}

const AT_ID_RE = /^\/api\/v1\/tenders\/([A-Za-z0-9_.-]+)$/;
const SPEC_RE = /^\/api\/v1\/spec-coded\/([A-Za-z0-9_.-]+)$/;

/**
 * Handle any /api/* request. Always returns a Response for /api/* paths
 * (scoped JSON-404 for unmatched ones); returns null for non-/api paths.
 */
export async function handleApiRequest(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return null;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: { code: 'method_not_allowed', message: 'Only GET is supported on this endpoint.' } }),
      { status: 405, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS_HEADERS } }
    );
  }

  // Edge cache (guarded: absent outside the Workers runtime).
  let cache = null;
  try {
    cache = globalThis.caches ? globalThis.caches.default : null;
  } catch {
    cache = null;
  }
  if (cache) {
    try {
      const hit = await cache.match(request);
      if (hit) return hit;
    } catch {
      /* cache is best-effort */
    }
  }

  // Health is never edge-cached: it must reflect what is being served NOW.
  if (url.pathname === '/api/v1/health') {
    const h = await getHealth(env);
    return new Response(JSON.stringify(h.body), {
      status: h.status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS_HEADERS },
    });
  }

  let result;
  try {
    if (url.pathname === '/api/v1/tenders') {
      result = await listTenders(env, url.searchParams, { defaultLimit: REST_DEFAULT_LIMIT });
    } else if (url.pathname === '/api/v1/tenders/facets') {
      result = await getFacets(env);
    } else {
      let m = url.pathname.match(AT_ID_RE);
      if (m) {
        result = await getTender(env, decodeURIComponent(m[1]), url.searchParams.get('lang') || undefined);
      } else {
        m = url.pathname.match(SPEC_RE);
        if (m) {
          result = specCodedGate(decodeURIComponent(m[1]));
        } else {
          return jsonNotFound();
        }
      }
    }
  } catch (e) {
    const code = e && e.code === 'snapshot_unavailable' ? 'snapshot_unavailable' : 'internal_error';
    result = {
      status: 503,
      body: { error: { code, message: 'Listing data is temporarily unavailable. Retry shortly.' } },
    };
  }

  const res = toResponse(result);
  if (cache && res.status === 200) {
    try {
      await cache.put(request, res.clone());
    } catch {
      /* cache is best-effort */
    }
  }
  return res;
}

// ---------------------------------------------------------------------------
// §7 MCP tender tools — definitions + async dispatcher.
// Descriptions use generic procurement language only.
// ---------------------------------------------------------------------------

const FILTER_PROPS = {
  market: { type: 'string', description: 'Comma-separated two-letter market codes (e.g. "HK,SG").' },
  category: { type: 'string', description: 'Category slug or name (any of en/zh/zht), comma-separated.' },
  closing_bucket: {
    type: 'string',
    description: 'One of le_2w, 2_4w, gt_4w, deadline_passed, or all (comma-separated). Default excludes deadline_passed.',
  },
  new: { type: 'boolean', description: 'Only rows new in the current issue.' },
  lead_ok: { type: 'boolean', description: 'Only rows open to expressions of interest.' },
  value_band: { type: 'string', description: 'One of lt_500k, 500k_2m, 2m_10m, gt_10m, unspecified (comma-separated).' },
  q: { type: 'string', description: 'Substring search over the sanitized summaries and category names.' },
  lang: { type: 'string', description: 'Collapse output to one language: en, zh, or zht.' },
  limit: { type: 'integer', description: 'Rows per page (default 25, max 200).' },
  cursor: { type: 'string', description: 'Opaque pagination cursor from a previous call.' },
};

export const TENDER_TOOLS = [
  {
    name: 'list_tenders',
    description:
      'Search the public cross-market tender listing feed (sanitized trilingual summaries). ' +
      'Returns a page of listing rows plus meta with total count and a pagination cursor.',
    inputSchema: { type: 'object', properties: FILTER_PROPS },
  },
  {
    name: 'get_tender',
    description: 'Fetch one public tender listing row by its Asaptic id (AT-…).',
    inputSchema: {
      type: 'object',
      properties: {
        at_id: { type: 'string', description: 'The Asaptic listing id, e.g. AT-HK-2630-001.' },
        lang: { type: 'string', description: 'Collapse output to one language: en, zh, or zht.' },
      },
      required: ['at_id'],
    },
  },
  {
    name: 'tender_facets',
    description: 'Get listing facet vocabulary and counts: markets, categories (with slugs), closing buckets, value bands.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_spec_coded',
    description:
      'Request the spec-coded technical package for one listing id. Without an approved account, ' +
      'this returns the access path instead of the data.',
    inputSchema: {
      type: 'object',
      properties: { at_id: { type: 'string', description: 'The Asaptic listing id.' } },
      required: ['at_id'],
    },
  },
  {
    name: 'request_tender_access',
    description:
      'Ask Asaptic for access to gated spec-coded technical data. Provide company and contact_email, ' +
      'plus optional markets, categories, at_ids, and a note. A human follows up by email.',
    inputSchema: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Company or organization name.' },
        contact_email: { type: 'string', description: 'Email address for follow-up.' },
        markets: { type: 'string', description: 'Markets of interest (free text or comma-separated codes).' },
        categories: { type: 'string', description: 'Categories of interest (free text or comma-separated).' },
        at_ids: { type: 'string', description: 'Specific Asaptic listing ids (AT-…) you want access to, comma-separated.' },
        note: { type: 'string', description: 'Anything else Asaptic should know.' },
      },
      required: ['company', 'contact_email'],
    },
  },
];

export const TENDER_TOOL_NAMES = new Set(TENDER_TOOLS.map((t) => t.name));

// ---------------------------------------------------------------------------
// §7b Lead capture — wires request_tender_access and (legacy) submit_rfq
// through lib/lead-capture.mjs so an agent's RFQ/access request is never
// silently dropped. See lead-capture.mjs for the honest-degradation contract.
// ---------------------------------------------------------------------------

/** Build the request_tender_access acknowledgment. Never fabricates a reference. */
async function buildAccessRequestAck(env, company, email, args) {
  const capture = await captureLead(env, {
    tool: 'request_tender_access',
    company,
    contact_email: email,
    markets: args.markets,
    categories: args.categories,
    note: args.note,
    at_ids: args.at_ids,
  });

  const requested = {};
  if (capture.sanitized.markets) requested.markets = capture.sanitized.markets;
  if (capture.sanitized.categories) requested.categories = capture.sanitized.categories;
  if (capture.sanitized.at_ids) requested.at_ids = capture.sanitized.at_ids;

  const ack = {
    acknowledged: true,
    stored: capture.stored,
    ...(Object.keys(requested).length ? { requested } : {}),
    next: capture.stored
      ? 'Received — a human will follow up by email. Reference ' + capture.reference + '.'
      : 'Access requests are followed up by a human. To guarantee a response now, email ' +
        CONTACT_EMAIL +
        ' with your company, contact details, and the listing ids you are interested in.',
    contact: CONTACT_EMAIL,
    portal: PORTAL_URL,
  };
  if (capture.stored) ack.reference = capture.reference;
  else ack.contact_fallback = capture.contact_fallback;
  return ack;
}

/**
 * Legacy submit_rfq, now backed by the same honest capture path as
 * request_tender_access. Historically this minted an RFQ-<timestamp>
 * reference and echoed args back while persisting NOTHING — every agent
 * RFQ since launch was silently lost. Fixed here: never fabricates a
 * reference unless the lead was actually stored, never echoes raw args.
 */
export async function handleSubmitRfq(env, args = {}, request) {
  const product = typeof args.product === 'string' ? args.product.trim() : '';
  const buyerContact = typeof args.buyer_contact === 'string' ? args.buyer_contact.trim() : '';
  if (!product || !buyerContact) {
    return { error: 'product and buyer_contact are required' };
  }
  let ua = null;
  try {
    ua = request && request.headers ? request.headers.get('user-agent') : null;
  } catch {
    ua = null;
  }
  const capture = await captureLead(env, {
    tool: 'submit_rfq',
    contact_email: buyerContact,
    markets: args.target_market,
    categories: product,
    note: args.quantity ? 'quantity: ' + args.quantity : undefined,
    ua,
  });

  const out = {
    received: true,
    stored: capture.stored,
    next: capture.stored
      ? 'Received — Asaptic will respond to buyer_contact within 4 hours. Reference ' + capture.reference + '.'
      : 'Asaptic will respond to buyer_contact within 4 hours; or email ' + CONTACT_EMAIL + ' if urgent.',
  };
  if (capture.stored) out.reference = capture.reference;
  else out.contact_fallback = capture.contact_fallback;
  return out;
}

/**
 * Async MCP tool dispatcher. Never throws: returns either
 * {result: <JSON-serializable>} or {rpcError: {code, message}}.
 */
export async function handleTenderTool(env, name, args = {}) {
  try {
    switch (name) {
      case 'list_tenders': {
        const r = await listTenders(env, args, { defaultLimit: MCP_DEFAULT_LIMIT });
        if (r.status !== 200) return { rpcError: { code: -32602, message: r.body.error.message } };
        return { result: r.body };
      }
      case 'get_tender': {
        if (!args.at_id || typeof args.at_id !== 'string') {
          return { rpcError: { code: -32602, message: 'at_id is required.' } };
        }
        const r = await getTender(env, args.at_id, args.lang ? String(args.lang).toLowerCase() : undefined);
        if (r.status === 404) return { result: JSON.parse(r.rawBody) };
        if (r.status !== 200) return { rpcError: { code: -32602, message: r.body.error.message } };
        return { result: r.body };
      }
      case 'tender_facets': {
        const r = await getFacets(env);
        return { result: r.body };
      }
      case 'get_spec_coded': {
        if (!args.at_id || typeof args.at_id !== 'string') {
          return { rpcError: { code: -32602, message: 'at_id is required.' } };
        }
        // Structured RESULT, not an error: agents surface results to users.
        return {
          result: {
            access_required: true,
            at_id: args.at_id,
            how: ACCESS_META.spec_coded.how,
            url: ACCESS_META.spec_coded.url,
          },
        };
      }
      case 'request_tender_access': {
        const company = typeof args.company === 'string' ? args.company.trim() : '';
        const email = typeof args.contact_email === 'string' ? args.contact_email.trim() : '';
        if (!company || !email) {
          return { rpcError: { code: -32602, message: 'company and contact_email are required.' } };
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return { rpcError: { code: -32602, message: 'contact_email must be a valid email address.' } };
        }
        return { result: await buildAccessRequestAck(env, company, email, args) };
      }
      default:
        return { rpcError: { code: -32602, message: 'Unknown tool' } };
    }
  } catch (e) {
    const msg =
      e && e.code === 'snapshot_unavailable'
        ? 'Listing data is temporarily unavailable. Retry shortly.'
        : 'Internal error while handling the tool call.';
    return { rpcError: { code: -32603, message: msg } };
  }
}
