// scout.mjs — Scout Pack pure logic (node + browser, no top-level DOM refs).
// Funnel converter: multi-select public opportunities → shareable shortlist → one high-intent lead.
// CONSTRAINTS: only the 11 public feed fields ever rendered; never real ref/issuer/date;
// share URL encodes only public AT-ids. Sourcing-scout framing; never bid advice.

// ---- The ONLY fields that exist in the public feed / may ever be rendered ----
export const PUBLIC_FIELDS = Object.freeze([
  'asaptic_id', 'market', 'category', 'summary_zh', 'summary_zht', 'summary_en',
  'value_band', 'closing_bucket', 'lead_ok', 'new_this_issue', 'sort_key'
]);

export const LANGS = Object.freeze(['zh', 'zht', 'en']);
export const FEED_URL = 'https://asaptic.com/tender/rows.json';
export const PORTAL_REGISTER = 'https://portal.asaptic.com/register.html';
export const STORAGE_KEY = 'asaptic_scout_pack_v1';
export const AT_ID_RE = /^AT-[A-Z]{2}-\d+-\d+$/;

// ---- Feed shaping ----------------------------------------------------------
// Active = every closing bucket except a passed deadline.
export function isActive(row) {
  return !!row && row.closing_bucket !== 'deadline_passed';
}

export function activeRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter(isActive);
}

// Reduce any row to strictly the 11 public fields (defensive: drops ref/issuer/date if a
// future feed ever carried them). Never returns anything outside PUBLIC_FIELDS.
export function pickPublic(row) {
  const out = {};
  for (const k of PUBLIC_FIELDS) if (row && k in row) out[k] = row[k];
  return out;
}

export function summaryFor(row, lang) {
  const key = lang === 'en' ? 'summary_en' : lang === 'zht' ? 'summary_zht' : 'summary_zh';
  return (row && row[key]) || row.summary_en || row.summary_zh || '';
}

export function categoryFor(row, lang) {
  const c = row && row.category;
  if (!c) return '';
  if (typeof c === 'string') return c;
  return (lang === 'en' ? c.name_en : lang === 'zht' ? c.name_zht : c.name_zh) || c.name_en || '';
}

// Render payload for one card: label/value pairs derived ONLY from public fields.
// Returns { fields: [{key,value}], sourceKeys: Set } so a test can prove the whitelist.
export function cardFields(row, lang) {
  const pub = pickPublic(row);
  const fields = [
    { key: 'summary', value: summaryFor(pub, lang) },
    { key: 'market', value: pub.market || '' },
    { key: 'category', value: categoryFor(pub, lang) },
    { key: 'value_band', value: pub.value_band || '—' },
    { key: 'closing_bucket', value: pub.closing_bucket || '' },
    { key: 'lead_ok', value: pub.lead_ok ? 'lead-ready' : 'standard' }
  ];
  return { id: pub.asaptic_id, newThisIssue: !!pub.new_this_issue, fields };
}

// ---- Filtering -------------------------------------------------------------
export function distinct(rows, extractor) {
  const s = new Set();
  for (const r of rows) { const v = extractor(r); if (v) s.add(v); }
  return [...s].sort();
}

export function applyFilters(rows, f, lang) {
  const q = f || {};
  return activeRows(rows).filter((r) => {
    if (q.market && q.market !== 'all' && r.market !== q.market) return false;
    if (q.closing_bucket && q.closing_bucket !== 'all' && r.closing_bucket !== q.closing_bucket) return false;
    if (q.category && q.category !== 'all' && categoryFor(r, lang) !== q.category) return false;
    return true;
  });
}

// ---- Pack (list of AT-ids) -------------------------------------------------
export function isValidId(id) { return typeof id === 'string' && AT_ID_RE.test(id); }

export function addToPack(pack, id) {
  if (!isValidId(id) || pack.includes(id)) return pack.slice();
  return [...pack, id];
}

export function removeFromPack(pack, id) {
  return pack.filter((x) => x !== id);
}

export function togglePack(pack, id) {
  return pack.includes(id) ? removeFromPack(pack, id) : addToPack(pack, id);
}

// Dedupe + drop invalid ids, preserving first-seen order.
export function normalizePack(ids) {
  const seen = new Set(); const out = [];
  for (const id of (Array.isArray(ids) ? ids : [])) {
    if (isValidId(id) && !seen.has(id)) { seen.add(id); out.push(id); }
  }
  return out;
}

// ---- localStorage round-trip ----------------------------------------------
export function savePack(storage, pack) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(normalizePack(pack))); } catch (_) {}
}

export function loadPack(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return normalizePack(JSON.parse(raw));
  } catch (_) { return []; }
}

// ---- Share URL (hash encodes ONLY public AT-ids) ---------------------------
function b64urlEncode(str) {
  const b64 = (typeof Buffer !== 'undefined')
    ? Buffer.from(str, 'utf8').toString('base64')
    : btoa(unescape(encodeURIComponent(str)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return (typeof Buffer !== 'undefined')
    ? Buffer.from(b64, 'base64').toString('utf8')
    : decodeURIComponent(escape(atob(b64)));
}

export function encodePack(ids) {
  const clean = normalizePack(ids);
  if (!clean.length) return '';
  return 'pack=' + b64urlEncode(clean.join(','));
}

export function decodePack(hash) {
  if (!hash) return [];
  const h = String(hash).replace(/^#/, '');
  const m = /(?:^|&)pack=([^&]+)/.exec(h);
  if (!m) return [];
  try { return normalizePack(b64urlDecode(m[1]).split(',')); }
  catch (_) { return []; }
}

export function buildShareUrl(origin, pathname, ids) {
  const enc = encodePack(ids);
  return origin + pathname + (enc ? '#' + enc : '');
}

// ---- CTA (whole pack = one high-intent lead) -------------------------------
export function buildCtaUrl(ids) {
  const clean = normalizePack(ids);
  const p = new URLSearchParams();
  p.set('src', 'scout_pack');
  if (clean.length) p.set('ids', clean.join(','));
  return PORTAL_REGISTER + '?' + p.toString();
}

// ---- Sentinel scanner (self-testable) --------------------------------------
// Flags forbidden tokens + any hardcoded real AT-id (only AT-TEST-* allowed in source).
export const FORBIDDEN = ['P' + 'CMS']; // built from parts so this file is itself clean
export function sentinelScan(text) {
  const violations = [];
  for (const tok of FORBIDDEN) if (new RegExp(tok, 'i').test(text)) violations.push('forbidden-token:' + tok);
  // Any AT-id literal in SOURCE must be AT-TEST-*. Real market codes flagged.
  const ids = text.match(/AT-[A-Z]{2}-\d+-\d+/g) || [];
  for (const id of ids) if (!id.startsWith('AT-TEST-')) violations.push('hardcoded-real-id:' + id);
  return violations;
}
