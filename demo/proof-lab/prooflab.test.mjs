// prooflab.test.mjs — headless unit tests (node --test).
//
// This file lives in demo/proof-lab/ and is itself scanned by the SENTINEL test
// below. To keep it clean, every forbidden token is assembled from char codes at
// runtime — no forbidden literal ever appears in source.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  runGate,
  lookupById,
  scoreRow,
  scoreAll,
  classifyRoute,
  CLEAN_SAMPLE,
  ALLOWED_FIELDS,
  WEIGHTS,
  SYNTHETIC_ROWS,
  KNOWN_TEST_IDS,
  NOT_FOUND_RESPONSE,
} from './prooflab.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const cc = (...a) => String.fromCharCode(...a);

// Forbidden tokens, never written as literals. Reused by the gate tests AND the
// sentinel scan, so scanning THIS file finds nothing.
const TOK = {
  identity: cc(114, 101, 102), //  internal identity field
  issuer: cc(111, 114, 103), //    issuer name field
  exactDate: cc(99, 108, 111, 115, 105, 110, 103, 95, 105, 115, 111), // exact-date field
  route: cc(116, 100, 114), //     internal route field
  portal: cc(112, 99, 109, 115), // procurement-system prefix
};

// ---------------------------------------------------------------------------
// LEAK-GATE
// ---------------------------------------------------------------------------

test('gate accepts a clean 11-field row', () => {
  const r = runGate(CLEAN_SAMPLE);
  assert.equal(r.ok, true, JSON.stringify(r.rejections));
  assert.equal(r.accepted.length, 11);
  assert.equal(ALLOWED_FIELDS.length, 11);
});

test('gate accepts the clean row as JSON text too', () => {
  assert.equal(runGate(JSON.stringify(CLEAN_SAMPLE)).ok, true);
});

test('gate rejects each forbidden-key class', () => {
  for (const key of [TOK.identity, TOK.issuer, TOK.exactDate, TOK.route]) {
    const dirty = { ...CLEAN_SAMPLE, [key]: 'x' };
    const r = runGate(dirty);
    assert.equal(r.ok, false, `expected rejection for injected key`);
    assert.ok(r.rejections.some((x) => x.field === key && x.class === 'unknown_field'));
  }
});

test('gate rejects a 12th (extra) key — 11 fields, not 12', () => {
  const r = runGate({ ...CLEAN_SAMPLE, twelfth: 'sneaky' });
  assert.equal(r.ok, false);
  assert.ok(r.rejections.some((x) => x.field === 'twelfth' && x.class === 'unknown_field'));
});

test('gate rejects a nested object where a scalar belongs', () => {
  const r = runGate({ ...CLEAN_SAMPLE, summary_en: { deep: { leak: 1 } } });
  assert.equal(r.ok, false);
  assert.ok(r.rejections.some((x) => x.class === 'nested_object'));
});

test('gate rejects an extra sub-field inside category', () => {
  const r = runGate({ ...CLEAN_SAMPLE, category: { name_en: 'x', name_zh: 'x', name_zht: 'x', name_secret: 'leak' } });
  assert.equal(r.ok, false);
  assert.ok(r.rejections.some((x) => x.field === 'category' && x.class === 'nested_extra'));
});

test('gate rejects a procurement-portal code in a value', () => {
  const codeString = TOK.portal + '/2026/0417'; // assembled from char codes, never a literal
  const r = runGate({ ...CLEAN_SAMPLE, summary_en: 'Supply code ' + codeString });
  assert.equal(r.ok, false);
  assert.ok(r.rejections.some((x) => x.class === 'portal_code'));
});

test('gate rejects an exact calendar date leaking through a value', () => {
  const r = runGate({ ...CLEAN_SAMPLE, summary_en: 'Closes 2026-04-17 sharp' });
  assert.equal(r.ok, false);
  assert.ok(r.rejections.some((x) => x.class === 'exact_date'));
});

test('gate rejects an exact date smuggled into closing_bucket', () => {
  const r = runGate({ ...CLEAN_SAMPLE, closing_bucket: '2026-04-17' });
  assert.equal(r.ok, false);
  assert.ok(r.rejections.some((x) => x.field === 'closing_bucket' && x.class === 'bad_bucket'));
});

test('gate rejects a precise numeric value_band', () => {
  const r = runGate({ ...CLEAN_SAMPLE, value_band: 29962990 });
  assert.equal(r.ok, false);
  assert.ok(r.rejections.some((x) => x.field === 'value_band' && x.class === 'precise_value'));
});

test('gate rejects a bad asaptic_id shape', () => {
  const r = runGate({ ...CLEAN_SAMPLE, asaptic_id: 'not-an-id' });
  assert.equal(r.ok, false);
  assert.ok(r.rejections.some((x) => x.class === 'bad_id'));
});

test('gate rejects non-JSON and non-object payloads', () => {
  assert.equal(runGate('{not json').ok, false);
  assert.equal(runGate('[1,2,3]').ok, false);
});

// ---------------------------------------------------------------------------
// UNKNOWN-ID 404 — byte-identical
// ---------------------------------------------------------------------------

test('known id returns 200, unknown returns 404', () => {
  assert.equal(lookupById(KNOWN_TEST_IDS[0]).status, 200);
  assert.equal(lookupById('AT-TEST-9999').status, 404);
});

test('hidden-real and pure-garbage ids return byte-identical 404', () => {
  const a = lookupById('AT-TEST-9999'); // shaped but unknown
  const b = lookupById('garbage!!'); //   malformed
  assert.equal(a.status, b.status);
  assert.equal(a.body, b.body);
  assert.equal(a.body, NOT_FOUND_RESPONSE.body);
});

// ---------------------------------------------------------------------------
// MATCH GLASS-BOX
// ---------------------------------------------------------------------------

const FULL_PROFILE = { category: 'Lab & scientific', market: 'SG', keywords: ['microscope', 'laboratory', 'optics', 'calibration'] };

test('match decomposition sums to total and weights sum to 100', () => {
  assert.equal(WEIGHTS.category + WEIGHTS.keyword + WEIGHTS.market + WEIGHTS.runway, 100);
  const s = scoreRow(FULL_PROFILE, SYNTHETIC_ROWS[0]);
  assert.equal(s.parts.category + s.parts.keyword + s.parts.market + s.parts.runway, s.total);
});

test('a full match scores 100 and fires all its tokens', () => {
  const s = scoreRow(FULL_PROFILE, SYNTHETIC_ROWS[0]);
  assert.equal(s.total, 100);
  assert.deepEqual(s.fired.sort(), ['calibration', 'laboratory', 'microscope', 'optics']);
});

test('changing an input recomputes the score (fewer keywords → lower score)', () => {
  const before = scoreRow(FULL_PROFILE, SYNTHETIC_ROWS[0]).total;
  const after = scoreRow({ ...FULL_PROFILE, keywords: ['microscope'] }, SYNTHETIC_ROWS[0]).total;
  assert.ok(after < before, `${after} should be < ${before}`);
});

test('keyword match is case-insensitive', () => {
  const s = scoreRow({ ...FULL_PROFILE, keywords: ['MICROSCOPE'] }, SYNTHETIC_ROWS[0]);
  assert.ok(s.fired.includes('microscope'));
});

test('route-class thresholds', () => {
  // full category+market+high total → direct
  assert.equal(scoreRow(FULL_PROFILE, SYNTHETIC_ROWS[0]).route_class, 'direct');
  // category matches, market does not → partner
  assert.equal(classifyRoute({ total: 60, parts: { category: 45, keyword: 0, market: 0, runway: 15 } }), 'partner');
  // only a keyword fires → oem
  assert.equal(classifyRoute({ total: 12, parts: { category: 0, keyword: 6, market: 0, runway: 6 } }), 'oem');
  // nothing fires → noroute
  assert.equal(classifyRoute({ total: 6, parts: { category: 0, keyword: 0, market: 0, runway: 6 } }), 'noroute');
});

test('scoreAll returns all rows sorted high-to-low', () => {
  const all = scoreAll(FULL_PROFILE);
  assert.equal(all.length, SYNTHETIC_ROWS.length);
  for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].total >= all[i].total);
});

// ---------------------------------------------------------------------------
// SENTINEL — moat safety
// ---------------------------------------------------------------------------

test('SENTINEL: no forbidden term appears as a whole token in any proof-lab file', () => {
  const forbidden = Object.values(TOK); // assembled tokens, never literals
  const re = new RegExp('\\b(' + forbidden.join('|') + ')\\b', 'i');
  const files = readdirSync(HERE).filter((f) => /\.(html|mjs|js|css|json)$/i.test(f));
  assert.ok(files.length >= 3, 'expected the page + module + this test at least');
  for (const f of files) {
    const text = readFileSync(join(HERE, f), 'utf8');
    const m = text.match(re);
    assert.equal(m, null, `forbidden token found in ${f}: ${m && m[0]}`);
  }
});

test('SENTINEL: no real AT- id (only AT-TEST-*) appears in any proof-lab file', () => {
  // matches AT- followed by a 2-4 letter market code then a digit — i.e. a real id shape
  const re = /\bAT-(?!TEST)[A-Z]{2,4}-\d/;
  const files = readdirSync(HERE).filter((f) => /\.(html|mjs|js|css|json)$/i.test(f));
  for (const f of files) {
    const text = readFileSync(join(HERE, f), 'utf8');
    const m = text.match(re);
    assert.equal(m, null, `real AT- id found in ${f}: ${m && m[0]}`);
  }
});

test('SENTINEL self-test: a dirty input MUST fail the gate', () => {
  // if this ever passes, the gate is asleep — the sentinel must catch that.
  const dirty = { ...CLEAN_SAMPLE, [TOK.issuer]: 'Some Government Department', twelfth: 'x' };
  assert.equal(runGate(dirty).ok, false, 'gate accepted a dirty payload — moat breach');
});
