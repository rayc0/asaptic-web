// prooflab.mjs — client-side, unit-testable logic for the Proof Lab / Glass-Box demo.
//
// MOAT SAFETY (read before editing):
//   This module ships to the browser and to the public repo. It contains ONLY:
//     (1) the public field allowlist (the 11 fields, by name), and
//     (2) generic shape regexes.
//   It must NEVER contain the internal sentinel term-list, a real source term list,
//   or any real tender identifier. Every sample id is AT-TEST-*. The gate below
//   rejects everything outside the allowlist WITHOUT naming what it rejects — so an
//   attacker learns "12th field refused", never which field it was hiding.
//
// The gate is an ALLOWLIST, not a denylist. That is the whole design: we never
// enumerate forbidden fields, so no forbidden name has to live in this file.

// ---------------------------------------------------------------------------
// 1. LEAK-GATE — the public 11-field contract, replicated client-side.
// ---------------------------------------------------------------------------

// The public contract admits exactly these 11 top-level fields. Not 12.
export const ALLOWED_FIELDS = Object.freeze([
  'asaptic_id',
  'market',
  'category',
  'summary_zh',
  'value_band',
  'closing_bucket',
  'lead_ok',
  'new_this_issue',
  'sort_key',
  'summary_en',
  'summary_zht',
]);

// `category` is the one nested value, and it admits exactly these 3 sub-fields.
export const CATEGORY_SUBFIELDS = Object.freeze(['name_en', 'name_zh', 'name_zht']);

// Coarse, bucketed closing window — never an exact date.
export const CLOSING_BUCKETS = Object.freeze(['le_2w', '2_4w', 'gt_4w']);

// Short market enum.
export const MARKETS = Object.freeze(['HK', 'SG', 'MO', 'GB', 'AU', 'CA', 'EU', 'CN']);

// Generic shape regexes — no term-list, only structure.
const RE = Object.freeze({
  // Public id shape: synthetic test ids OR the generic production shape.
  testId: /^AT-TEST-\d{4}$/,
  prodId: /^AT-[A-Z]{2,4}-\d{3,4}-\d{2,4}$/,
  // A value that leaks an exact calendar date (YYYY-MM-DD).
  exactDate: /\d{4}-\d{2}-\d{2}/,
  // A slash-delimited procurement-portal code — a short alpha prefix, then a
  // segment that contains a digit (catches "XXXX/2026/0417" style codes while
  // leaving natural "supply/delivery" text alone).
  portalCode: /\b[A-Za-z]{2,8}\/[A-Za-z0-9]*\d[A-Za-z0-9]*\b/,
  // sort_key is an opaque hex digest.
  digest: /^[a-f0-9]{16,}$/,
});

// A clean, canonical 11-field row — used as the page prefill and in tests.
export const CLEAN_SAMPLE = Object.freeze({
  asaptic_id: 'AT-TEST-0001',
  market: 'SG',
  category: { name_en: 'Lab & scientific', name_zh: '实验室与科研', name_zht: '實驗室與科研' },
  summary_zh: '供应及交付科学实验室用显微镜60台',
  value_band: null,
  closing_bucket: 'le_2w',
  lead_ok: false,
  new_this_issue: true,
  sort_key: '001e8f18971be430eb205ed93f55430aaa40a9f272ed32cb8accd2a74374eec6',
  summary_en: 'Supply and delivery of 60 units of microscopes for a science laboratory',
  summary_zht: '供應及交付科學實驗室用顯微鏡60台',
});

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Scan a scalar string value for content that leaks internal state.
function valueLeaks(str) {
  if (typeof str !== 'string') return null;
  if (RE.exactDate.test(str)) return 'exact_date';
  if (RE.portalCode.test(str)) return 'portal_code';
  return null;
}

/**
 * Run the public leak-gate over an arbitrary payload.
 * @param {object|string} input - the row object, or JSON text.
 * @returns {{ok:boolean, rejections:Array<{field:string,class:string,reason:string}>, accepted:string[]}}
 */
export function runGate(input) {
  let row = input;
  if (typeof input === 'string') {
    try {
      row = JSON.parse(input);
    } catch (e) {
      return { ok: false, rejections: [{ field: '(payload)', class: 'not_json', reason: 'Payload is not valid JSON.' }], accepted: [] };
    }
  }
  if (!isPlainObject(row)) {
    return { ok: false, rejections: [{ field: '(payload)', class: 'not_object', reason: 'Payload must be a JSON object.' }], accepted: [] };
  }

  const rejections = [];
  const accepted = [];
  const allow = new Set(ALLOWED_FIELDS);

  for (const key of Object.keys(row)) {
    const val = row[key];

    // (a) Field allowlist — a key we did not name is refused, and we do not say what it was.
    if (!allow.has(key)) {
      rejections.push({ field: key, class: 'unknown_field', reason: 'Not one of the 11 published fields. A twelfth field is refused.' });
      continue;
    }

    // (b) `category` is the only nested value, with an exact shape.
    if (key === 'category') {
      if (!isPlainObject(val)) {
        rejections.push({ field: key, class: 'category_shape', reason: 'category must be an object of exactly name_en / name_zh / name_zht.' });
        continue;
      }
      const subs = Object.keys(val);
      const extra = subs.filter((s) => !CATEGORY_SUBFIELDS.includes(s));
      if (extra.length) {
        rejections.push({ field: 'category', class: 'nested_extra', reason: 'category carries a sub-field outside name_en / name_zh / name_zht.' });
        continue;
      }
      let dirty = false;
      for (const s of subs) {
        const leak = valueLeaks(val[s]);
        if (leak) { rejections.push({ field: `category.${s}`, class: leak, reason: leakReason(leak) }); dirty = true; }
      }
      if (!dirty) accepted.push(key);
      continue;
    }

    // (c) Any other nested object/array where a scalar belongs is refused.
    if (isPlainObject(val) || Array.isArray(val)) {
      rejections.push({ field: key, class: 'nested_object', reason: 'This field must be a scalar — a nested object/array is refused.' });
      continue;
    }

    // (d) Field-specific shape checks — all generic, no term-list.
    if (key === 'asaptic_id') {
      if (!(RE.testId.test(val) || RE.prodId.test(val))) {
        rejections.push({ field: key, class: 'bad_id', reason: 'asaptic_id does not match the public id shape.' });
        continue;
      }
    } else if (key === 'market') {
      if (!MARKETS.includes(val)) {
        rejections.push({ field: key, class: 'bad_market', reason: 'market is not a known short market code.' });
        continue;
      }
    } else if (key === 'closing_bucket') {
      if (!CLOSING_BUCKETS.includes(val)) {
        rejections.push({ field: key, class: 'bad_bucket', reason: 'closing_bucket must be a coarse band (le_2w / 2_4w / gt_4w) — an exact date is refused.' });
        continue;
      }
    } else if (key === 'value_band') {
      if (!(val === null || typeof val === 'string')) {
        rejections.push({ field: key, class: 'precise_value', reason: 'value_band is a coarse band or null — never a precise number.' });
        continue;
      }
    } else if (key === 'lead_ok' || key === 'new_this_issue') {
      if (typeof val !== 'boolean') {
        rejections.push({ field: key, class: 'bad_flag', reason: 'This field must be a boolean.' });
        continue;
      }
    } else if (key === 'sort_key') {
      if (typeof val !== 'string' || !RE.digest.test(val)) {
        rejections.push({ field: key, class: 'bad_digest', reason: 'sort_key must be an opaque hex digest.' });
        continue;
      }
    } else {
      // summary_en / summary_zh / summary_zht — free text, but must not leak.
      const leak = valueLeaks(val);
      if (leak) { rejections.push({ field: key, class: leak, reason: leakReason(leak) }); continue; }
    }

    accepted.push(key);
  }

  return { ok: rejections.length === 0, rejections, accepted };
}

function leakReason(cls) {
  if (cls === 'exact_date') return 'Value contains an exact calendar date — refused (buckets only).';
  if (cls === 'portal_code') return 'Value looks like an internal procurement-portal code — refused.';
  return 'Value refused.';
}

// ---------------------------------------------------------------------------
// 2. UNKNOWN-ID 404 — byte-identical, no enumeration oracle.
// ---------------------------------------------------------------------------

export const KNOWN_TEST_IDS = Object.freeze(['AT-TEST-0001', 'AT-TEST-0002', 'AT-TEST-0003', 'AT-TEST-0004']);

// The single, fixed not-found response. A hidden-but-real id and pure garbage
// both return THIS exact body — so no attacker can tell "exists" from "doesn't".
export const NOT_FOUND_RESPONSE = Object.freeze({ status: 404, body: '{"error":"not_found"}' });

/**
 * Look up an id the way the public endpoint does.
 * @returns {{status:number, body:string}}
 */
export function lookupById(id) {
  if (KNOWN_TEST_IDS.includes(id)) {
    return { status: 200, body: JSON.stringify({ asaptic_id: id, note: 'public row served' }) };
  }
  // Everything else — malformed, hidden, or never-existed — is byte-identical.
  return { status: NOT_FOUND_RESPONSE.status, body: NOT_FOUND_RESPONSE.body };
}

// ---------------------------------------------------------------------------
// 3. MATCH GLASS-BOX — score decomposition + route-class, recomputed live.
// ---------------------------------------------------------------------------

// The public scorer's four signals. Deliberately simple and published — the
// moat was never the arithmetic. Sums to 100.
export const WEIGHTS = Object.freeze({ category: 45, keyword: 25, market: 15, runway: 15 });

// Runway is BUCKETED — never a real date. Sooner windows score higher.
const RUNWAY_SCORE = Object.freeze({ le_2w: 15, '2_4w': 10, gt_4w: 6 });

// A small fixed set of SYNTHETIC public opportunities. All ids are AT-TEST-*.
export const SYNTHETIC_ROWS = Object.freeze([
  {
    asaptic_id: 'AT-TEST-0001',
    category: 'Lab & scientific',
    market: 'SG',
    keywords: ['microscope', 'laboratory', 'optics', 'calibration'],
    closing_bucket: 'le_2w',
    title_en: 'Supply of laboratory microscopes',
    title_zh: '供应实验室显微镜',
  },
  {
    asaptic_id: 'AT-TEST-0002',
    category: 'Medical devices',
    market: 'HK',
    keywords: ['infusion', 'pump', 'sterile', 'consumable'],
    closing_bucket: '2_4w',
    title_en: 'Supply of infusion pumps and sterile consumables',
    title_zh: '供应输液泵及无菌耗材',
  },
  {
    asaptic_id: 'AT-TEST-0003',
    category: 'Food & beverage',
    market: 'HK',
    keywords: ['chilled', 'catering', 'delivery', 'cold-chain'],
    closing_bucket: 'gt_4w',
    title_en: 'Chilled catering supply and cold-chain delivery',
    title_zh: '冷藏餐饮供应及冷链配送',
  },
  {
    asaptic_id: 'AT-TEST-0004',
    category: 'Lab & scientific',
    market: 'GB',
    keywords: ['reagent', 'assay', 'diagnostic', 'laboratory'],
    closing_bucket: '2_4w',
    title_en: 'Diagnostic reagents and assay kits',
    title_zh: '诊断试剂及检测套装',
  },
]);

/**
 * Score one opportunity row against a company profile, returning the full
 * decomposition and the fired keyword tokens.
 * @param {{category:string, market:string, keywords:string[]}} profile
 * @param {object} row - one of SYNTHETIC_ROWS
 */
export function scoreRow(profile, row) {
  const category = profile.category && profile.category === row.category ? WEIGHTS.category : 0;

  const profKw = (profile.keywords || []).map((k) => String(k).trim().toLowerCase()).filter(Boolean);
  const fired = row.keywords.filter((k) => profKw.includes(k.toLowerCase()));
  const keyword = row.keywords.length ? Math.round(WEIGHTS.keyword * (fired.length / row.keywords.length)) : 0;

  const market = profile.market && profile.market === row.market ? WEIGHTS.market : 0;
  const runway = RUNWAY_SCORE[row.closing_bucket] ?? 0;

  const parts = { category, keyword, market, runway };
  const total = category + keyword + market + runway;
  return { asaptic_id: row.asaptic_id, total, parts, fired, route_class: classifyRoute({ total, parts }) };
}

/**
 * Route class from the decomposition — thresholds, sourcing-scout framing only.
 * Never bid advice: the readout pulls toward "request Asaptic to execute".
 */
export function classifyRoute(s) {
  if (s.parts.category > 0 && s.parts.market > 0 && s.total >= 70) return 'direct';
  if (s.parts.category > 0) return 'partner';
  if (s.parts.keyword > 0) return 'oem';
  return 'noroute';
}

export const ROUTE_READOUT = Object.freeze({
  direct: { label: 'Direct-eligible', note: 'Your profile covers this one — but assembly, compliance and submission still run through Asaptic. Request access to execute.' },
  partner: { label: 'Partner-assembly', note: 'You would need a partner to complete this. Asaptic assembles the execution structure. Request access.' },
  oem: { label: 'OEM-locked', note: 'A keyword touches you, but the route is OEM-locked. Ask Asaptic to source and execute.' },
  noroute: { label: 'No route from profile', note: 'Nothing routable from your inputs alone — Asaptic can still source it for you. Request access.' },
});

/** Score all synthetic rows, sorted high-to-low. */
export function scoreAll(profile) {
  return SYNTHETIC_ROWS.map((r) => scoreRow(profile, r)).sort((a, b) => b.total - a.total);
}
