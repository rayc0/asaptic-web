// LEAK SENTINEL — the hard boundary check for every agent-facing output.
//
// Two layers:
//   checkRow(row, {lang})  — structural: exactly the 11 allowed keys (a strict
//                            subset when lang-collapsed, never a key outside
//                            the allowlist), category keys allowlisted, and no
//                            forbidden key at any depth.
//   scanText(text, label)  — content: forbidden internal field names appearing
//                            as JSON keys, plus forbidden value patterns
//                            (case-insensitive "pcms", "TDR-" id prefix).
//
// The sentinel is itself under test: sentinel.self.test asserts that a
// deliberately dirty row FAILS both layers — a gate that cannot fail
// measures nothing.

export const ALLOWED_ROW_KEYS = [
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
];

export const ALLOWED_CATEGORY_KEYS = ['name_en', 'name_zh', 'name_zht'];

// Internal-plane field names that must never appear as keys in any output.
export const FORBIDDEN_KEYS = [
  'ref',
  'org',
  'dept',
  'title',
  'source',
  'source_url',
  'closing_iso',
  'closing_date',
  'tdr',
  'tender_id',
  'est_wan',
];

const FORBIDDEN_KEY_RE = new RegExp(
  '"(' + FORBIDDEN_KEYS.join('|') + ')"\\s*:',
  'i'
);
const PCMS_RE = /pcms/i; // must never appear anywhere, any case
const TDR_PREFIX_RE = /\bTDR-/i; // internal id prefix

export class SentinelViolation extends Error {}

function deepForbiddenKey(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((v, i) => deepForbiddenKey(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.includes(k.toLowerCase())) {
        throw new SentinelViolation(`forbidden key "${k}" at ${path}`);
      }
      deepForbiddenKey(v, `${path}.${k}`);
    }
  }
}

/**
 * Structural check for one output row.
 * Without lang: keys must be EXACTLY the 11 allowed keys.
 * With lang: keys must be a strict subset (the selected summary only),
 * still never anything outside the allowlist.
 */
export function checkRow(row, { lang } = {}) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new SentinelViolation('row is not an object');
  }
  const keys = Object.keys(row);
  for (const k of keys) {
    if (!ALLOWED_ROW_KEYS.includes(k)) {
      throw new SentinelViolation(`row key "${k}" is not in the 11-key allowlist`);
    }
  }
  if (lang) {
    const expected = ALLOWED_ROW_KEYS.filter(
      (k) => !k.startsWith('summary_') || k === 'summary_' + lang
    );
    const missing = expected.filter((k) => !keys.includes(k));
    const extra = keys.filter((k) => !expected.includes(k));
    if (missing.length || extra.length) {
      throw new SentinelViolation(
        `lang-collapsed row key mismatch (missing: ${missing}; extra: ${extra})`
      );
    }
  } else {
    if (keys.length !== ALLOWED_ROW_KEYS.length) {
      throw new SentinelViolation(
        `row has ${keys.length} keys, expected exactly ${ALLOWED_ROW_KEYS.length}: ${keys.join(',')}`
      );
    }
  }
  const cat = row.category;
  if (!cat || typeof cat !== 'object') throw new SentinelViolation('row.category missing');
  for (const k of Object.keys(cat)) {
    if (!ALLOWED_CATEGORY_KEYS.includes(k)) {
      throw new SentinelViolation(`category key "${k}" is not allowlisted`);
    }
  }
  deepForbiddenKey(row);
  scanText(JSON.stringify(row), 'row ' + row.asaptic_id);
  return true;
}

/** Content scan over any serialized output, tool description, or error string. */
export function scanText(text, label = 'output') {
  const s = String(text);
  if (PCMS_RE.test(s)) {
    throw new SentinelViolation(`"pcms" (any case) found in ${label}`);
  }
  if (TDR_PREFIX_RE.test(s)) {
    throw new SentinelViolation(`"TDR-" id prefix found in ${label}`);
  }
  const m = s.match(FORBIDDEN_KEY_RE);
  if (m) {
    throw new SentinelViolation(`forbidden JSON key "${m[1]}" found in ${label}`);
  }
  return true;
}
