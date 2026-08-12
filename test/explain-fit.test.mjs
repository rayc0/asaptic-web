// explain_fit tests — the fit-scoring scout tool.
//
// Covers: deterministic scoring, decomposition-sums-to-score, fired-token
// explainability (only sanitized-summary tokens), route_class thresholds,
// leak-sentinel over the tool output (public fields + fit numbers only, no
// forbidden keys/terms, pcms case-insensitive), and an MCP round-trip through
// the real worker fetch handler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../_worker.js';
import {
  explainFit,
  _resetSnapshotMemo,
  ALLOWED_FIT_KEYS,
  TENDER_TOOLS,
} from '../lib/agent-api.mjs';
import { makeEnv, rpc, FIXTURE } from './helpers/env.mjs';
import { checkRow, scanText, ALLOWED_ROW_KEYS } from './helpers/sentinel.mjs';

const ROWS = FIXTURE.rows;
// Two concrete fixture rows used for deterministic single-row assertions.
const AU_ROW = 'AT-AU-2630-101'; // category "Facilities & cleaning", market AU, summary has office/workspace
const HK_ROW = 'AT-HK-2631-327'; // category "Other", market HK, summary about medical insurance

const summaryHaystack = (row) =>
  [row.summary_en || '', row.summary_zh || '', row.summary_zht || ''].join('\n').toLowerCase();

const rowById = (id) => ROWS.find((r) => r.asaptic_id === id);

// ---------------------------------------------------------------------------
// Scoring correctness + determinism
// ---------------------------------------------------------------------------

test('explain_fit: ranking mode returns best-fit ACTIVE rows, scored 0–100', async () => {
  const env = makeEnv();
  const r = await explainFit(env, {
    company_profile: { categories: ['Facilities & cleaning'], markets: ['AU'], keywords: ['office', 'workspace'] },
    top_n: 5,
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.meta.mode, 'ranked');
  assert.ok(r.body.data.length > 0 && r.body.data.length <= 5);
  for (const item of r.body.data) {
    assert.ok(item.fit.score >= 0 && item.fit.score <= 100);
    // ACTIVE only — a deadline-passed row must never appear in ranking.
    assert.notEqual(item.closing_bucket, 'deadline_passed');
  }
  // Sorted by score descending.
  for (let i = 1; i < r.body.data.length; i++) {
    assert.ok(r.body.data[i - 1].fit.score >= r.body.data[i].fit.score);
  }
});

test('explain_fit: deterministic — identical inputs produce identical output', async () => {
  const params = {
    company_profile: { categories: ['Facilities & cleaning'], markets: ['AU', 'SG'], keywords: ['office', 'insurance', 'workspace'] },
    top_n: 8,
  };
  const a = await explainFit(makeEnv(), params);
  const b = await explainFit(makeEnv(), params);
  assert.deepEqual(a.body.data, b.body.data);
});

test('explain_fit: decomposition always sums to the score', async () => {
  const env = makeEnv();
  const r = await explainFit(env, {
    company_profile: { categories: ['Facilities & cleaning', 'Other'], markets: ['AU', 'HK'], keywords: ['office', 'medical', 'insurance', 'workspace', 'services'] },
    top_n: 40,
  });
  assert.ok(r.body.data.length > 0);
  for (const item of r.body.data) {
    const { category_weight, keyword_weight, market_weight, score } = item.fit;
    assert.equal(category_weight + keyword_weight + market_weight, score,
      `decomposition must sum to score for ${item.asaptic_id}`);
    // Each sub-score stays on its declared sub-scale.
    assert.ok(category_weight === 0 || category_weight === 40);
    assert.ok(market_weight === 0 || market_weight === 20);
    assert.ok(keyword_weight >= 0 && keyword_weight <= 40);
  }
});

// ---------------------------------------------------------------------------
// Fired-token explainability
// ---------------------------------------------------------------------------

test('explain_fit: every fired token is a real substring of THIS row\'s sanitized summary, and only profile keywords fire', async () => {
  const env = makeEnv();
  const keywords = ['office', 'workspace', 'zzz-never-appears', 'insurance'];
  const r = await explainFit(env, {
    company_profile: { categories: [], markets: [], keywords },
    top_n: 40,
  });
  for (const item of r.body.data) {
    const hay = summaryHaystack(rowById(item.asaptic_id));
    for (const tok of item.fit.fired_tokens) {
      assert.ok(keywords.includes(tok), `${tok} must be one of the profile keywords`);
      assert.ok(hay.includes(tok), `${tok} must actually appear in ${item.asaptic_id}'s sanitized summary`);
    }
    // The bogus token can never fire.
    assert.ok(!item.fit.fired_tokens.includes('zzz-never-appears'));
  }
});

test('explain_fit: keyword_weight is the fired fraction of the profile keyword set', async () => {
  // Single-row mode against a known row lets us assert the exact number.
  const env = makeEnv();
  const r = await explainFit(env, {
    company_profile: { categories: [], markets: [], keywords: ['office', 'workspace', 'zzz-nope', 'qqq-nope'] },
    asaptic_id: AU_ROW,
  });
  const fit = r.body.data[0].fit;
  // 2 of 4 keywords fire → round(40 * 2/4) = 20.
  assert.equal(fit.fired_tokens.length, 2);
  assert.equal(fit.keyword_weight, 20);
});

// ---------------------------------------------------------------------------
// route_class thresholds
// ---------------------------------------------------------------------------

test('explain_fit: route_class thresholds (no-route / oem-locked / partner / direct)', async () => {
  const env = makeEnv();
  const single = async (profile) =>
    (await explainFit(env, { company_profile: profile, asaptic_id: AU_ROW })).body.data[0].fit;

  // score 0 → no-route
  const noRoute = await single({ categories: [], markets: [], keywords: ['zzz-nope'] });
  assert.equal(noRoute.score, 0);
  assert.equal(noRoute.route_class, 'no-route');

  // market only (20) → oem-locked  [20,45)
  const oem = await single({ categories: [], markets: ['AU'], keywords: [] });
  assert.equal(oem.score, 20);
  assert.equal(oem.route_class, 'oem-locked');

  // category + market (60) → partner  [45,70)
  const partner = await single({ categories: ['Facilities & cleaning'], markets: ['AU'], keywords: [] });
  assert.equal(partner.score, 60);
  assert.equal(partner.route_class, 'partner');

  // category + market + a firing keyword (100) → direct  [70,100]
  const direct = await single({ categories: ['Facilities & cleaning'], markets: ['AU'], keywords: ['office'] });
  assert.equal(direct.score, 100);
  assert.equal(direct.route_class, 'direct');
});

test('explain_fit: every route_next is a capture-not-teach readout that routes to Asaptic', async () => {
  const env = makeEnv();
  const r = await explainFit(env, {
    company_profile: { categories: ['Facilities & cleaning'], markets: ['AU'], keywords: ['office', 'insurance'] },
    top_n: 20,
  });
  const forbiddenAdvice = /\b(bid|bidding|price|pricing|undercut|win the|how to win|discount|margin)\b/i;
  for (const item of r.body.data) {
    const next = item.fit.route_next;
    assert.ok(typeof next === 'string' && next.length > 0);
    // Never teaches how to bid/price/win.
    assert.ok(!forbiddenAdvice.test(next), `route_next must not give bid/price advice: ${next}`);
    // Always frames the next step as asking Asaptic to execute.
    assert.ok(/request_tender_access|asaptic/i.test(next), `route_next must route to Asaptic: ${next}`);
  }
});

// ---------------------------------------------------------------------------
// Leak sentinel — output is ONLY public fields + fit numbers
// ---------------------------------------------------------------------------

function assertCleanItem(item, lang) {
  const { fit, ...row } = item;
  // The row portion is exactly a public 11-field projection.
  checkRow(row, lang ? { lang } : {});
  // The fit portion carries nothing beyond the allowed derived numbers.
  assert.ok(fit && typeof fit === 'object');
  for (const k of Object.keys(fit)) {
    assert.ok(ALLOWED_FIT_KEYS.includes(k), `fit key "${k}" is not in ALLOWED_FIT_KEYS`);
  }
  // fired_tokens is an array of strings only.
  assert.ok(Array.isArray(fit.fired_tokens));
  fit.fired_tokens.forEach((t) => assert.equal(typeof t, 'string'));
  // Whole-item content scan: no forbidden keys, no "pcms" (any case), no TDR- id.
  scanText(JSON.stringify(item), 'explain_fit ' + item.asaptic_id);
}

test('explain_fit: leak-sentinel over ranked output (public fields + fit numbers only)', async () => {
  const env = makeEnv();
  const r = await explainFit(env, {
    company_profile: { categories: ['Facilities & cleaning', 'Other'], markets: ['AU', 'HK', 'SG'], keywords: ['office', 'medical', 'insurance', 'workspace'] },
    top_n: 50,
  });
  assert.ok(r.body.data.length > 0);
  for (const item of r.body.data) assertCleanItem(item);
  // The entire response (incl. meta) must also pass the content scan.
  scanText(JSON.stringify(r.body), 'explain_fit full response');
});

test('explain_fit: lang-collapsed output still passes the sentinel', async () => {
  const env = makeEnv();
  const r = await explainFit(env, {
    company_profile: { categories: ['Facilities & cleaning'], markets: ['AU'], keywords: ['office'] },
    top_n: 10,
    lang: 'en',
  });
  for (const item of r.body.data) assertCleanItem(item, 'en');
});

test('explain_fit: adversarial keywords (pcms/ref/source/tdr-) never surface in output and never fire', async () => {
  const env = makeEnv();
  const r = await explainFit(env, {
    company_profile: { categories: [], markets: ['HK'], keywords: ['pcms', 'PCMS', 'ref', 'source', 'tdr-2630', 'office'] },
    top_n: 50,
  });
  for (const item of r.body.data) {
    assertCleanItem(item); // scanText inside would throw on any "pcms"/"TDR-"/forbidden key
    assert.ok(!item.fit.fired_tokens.some((t) => /pcms|tdr-/i.test(t)));
  }
  // Belt-and-braces: no "pcms" anywhere in the serialized response.
  assert.ok(!/pcms/i.test(JSON.stringify(r.body)));
});

// ---------------------------------------------------------------------------
// Single-row mode + validation
// ---------------------------------------------------------------------------

test('explain_fit: asaptic_id explains exactly that one row', async () => {
  const env = makeEnv();
  const r = await explainFit(env, {
    company_profile: { categories: ['Other'], markets: ['HK'], keywords: ['medical', 'insurance'] },
    asaptic_id: HK_ROW,
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.meta.mode, 'single');
  assert.equal(r.body.data.length, 1);
  assert.equal(r.body.data[0].asaptic_id, HK_ROW);
  assertCleanItem(r.body.data[0]);
});

test('explain_fit: unknown asaptic_id → byte-identical 404 body', async () => {
  const env = makeEnv();
  const r = await explainFit(env, { company_profile: { keywords: ['x'] }, asaptic_id: 'AT-NOPE-000' });
  assert.equal(r.status, 404);
  assert.ok(r.rawBody.includes('not_found'));
});

test('explain_fit: rejects missing/invalid company_profile, bad lang, bad top_n', async () => {
  const env = makeEnv();
  assert.equal((await explainFit(env, {})).status, 400);
  assert.equal((await explainFit(env, { company_profile: 'nope' })).status, 400);
  assert.equal((await explainFit(env, { company_profile: {}, lang: 'fr' })).status, 400);
  assert.equal((await explainFit(env, { company_profile: {}, top_n: 0 })).status, 400);
  assert.equal((await explainFit(env, { company_profile: {}, top_n: 2.5 })).status, 400);
});

test('explain_fit: too many profile items → 400', async () => {
  const env = makeEnv();
  const many = Array.from({ length: 17 }, (_, i) => 'k' + i);
  assert.equal((await explainFit(env, { company_profile: { keywords: many } })).status, 400);
});

// ---------------------------------------------------------------------------
// MCP round-trip via the real worker fetch handler
// ---------------------------------------------------------------------------

test('MCP: tools/list advertises explain_fit and totals 10 tools', async () => {
  const env = makeEnv();
  const out = await rpc(worker, env, 'tools/list', {});
  const names = out.result.tools.map((t) => t.name);
  assert.ok(names.includes('explain_fit'));
  assert.equal(out.result.tools.length, 10); // 4 sourcing + 6 tender (was 9, +explain_fit)
  const def = out.result.tools.find((t) => t.name === 'explain_fit');
  // Tool description must not leak internal terms.
  scanText(JSON.stringify(def), 'explain_fit tool def');
});

test('MCP: tools/call explain_fit round-trips a clean fit result', async () => {
  const env = makeEnv();
  const out = await rpc(worker, env, 'tools/call', {
    name: 'explain_fit',
    arguments: {
      company_profile: { categories: ['Facilities & cleaning'], markets: ['AU'], keywords: ['office', 'workspace'] },
      top_n: 3,
    },
  });
  assert.ok(out.result && out.result.content);
  const payload = JSON.parse(out.result.content[0].text);
  assert.equal(payload.meta.mode, 'ranked');
  assert.ok(payload.data.length > 0);
  for (const item of payload.data) assertCleanItem(item);
  // Full MCP text payload must pass the content scan.
  scanText(out.result.content[0].text, 'explain_fit MCP payload');
});

test('MCP: tools/call explain_fit single-id round-trip', async () => {
  const env = makeEnv();
  const out = await rpc(worker, env, 'tools/call', {
    name: 'explain_fit',
    arguments: { company_profile: { markets: ['HK'], keywords: ['medical'] }, asaptic_id: HK_ROW },
  });
  const payload = JSON.parse(out.result.content[0].text);
  assert.equal(payload.data[0].asaptic_id, HK_ROW);
});

test('MCP: explain_fit invalid params → JSON-RPC -32602', async () => {
  const env = makeEnv();
  const out = await rpc(worker, env, 'tools/call', {
    name: 'explain_fit',
    arguments: { company_profile: 'nope' },
  });
  assert.ok(out.error);
  assert.equal(out.error.code, -32602);
});

test('MCP: explain_fit on R2 failure → JSON-RPC -32603 (never a worker exception)', async () => {
  _resetSnapshotMemo(); // cold memo so there is no stale snapshot to fall back to
  const env = makeEnv({ r2: 'throw' }); // R2 throws, ASSETS 404s → snapshot unavailable
  const out = await rpc(worker, env, 'tools/call', {
    name: 'explain_fit',
    arguments: { company_profile: { keywords: ['office'] } },
  });
  assert.ok(out.error);
  assert.equal(out.error.code, -32603);
});
