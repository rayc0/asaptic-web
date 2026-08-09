// Unit tests: REST /api/v1/* behavior against the real fixture through the
// real worker fetch handler, in-process (no network).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../_worker.js';
import { _resetSnapshotMemo, encodeCursor, parseFilters, filterFingerprint, getSnapshot } from '../lib/agent-api.mjs';
import { makeEnv, callWorker, FIXTURE } from './helpers/env.mjs';

const ROWS = FIXTURE.rows;
const OPEN_ROWS = ROWS.filter((r) => r.closing_bucket !== 'deadline_passed');

async function getJson(env, path) {
  const res = await callWorker(worker, env, path);
  const body = await res.text();
  return { res, body, json: JSON.parse(body) };
}

before(() => _resetSnapshotMemo());

// ---------- listing defaults ----------

test('GET /api/v1/tenders — default excludes deadline_passed, limit 50, exact 11-key rows', async () => {
  const env = makeEnv();
  const { res, json } = await getJson(env, '/api/v1/tenders');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.equal(json.meta.total, OPEN_ROWS.length);
  assert.equal(json.meta.returned, 50);
  assert.equal(json.data.length, 50);
  assert.ok(json.meta.next_cursor);
  assert.equal(json.meta.issue_id, FIXTURE.issue_id);
  assert.equal(json.meta.generated, FIXTURE.generated);
  assert.ok(json.meta.snapshot_etag);
  assert.ok(json.meta.access.spec_coded.gated);
  for (const row of json.data) {
    assert.equal(Object.keys(row).length, 11);
    assert.notEqual(row.closing_bucket, 'deadline_passed');
  }
});

test('rows are verbatim subsets of the fixture rows', async () => {
  const env = makeEnv();
  const { json } = await getJson(env, '/api/v1/tenders?limit=5');
  for (const row of json.data) {
    const src = ROWS.find((r) => r.asaptic_id === row.asaptic_id);
    assert.ok(src, 'row exists in fixture');
    for (const [k, v] of Object.entries(row)) {
      assert.deepEqual(v, src[k] === undefined ? null : src[k], `field ${k} verbatim`);
    }
  }
});

// ---------- filters ----------

test('market filter (csv, case-insensitive)', async () => {
  const env = makeEnv();
  const expected = OPEN_ROWS.filter((r) => r.market === 'HK' || r.market === 'SG').length;
  const { json } = await getJson(env, '/api/v1/tenders?market=hk,SG&limit=200');
  assert.equal(json.meta.total, expected);
  for (const row of json.data) assert.ok(['HK', 'SG'].includes(row.market));
});

test('closing_bucket=all includes every row; explicit deadline_passed works', async () => {
  const env = makeEnv();
  const all = await getJson(env, '/api/v1/tenders?closing_bucket=all&limit=1');
  assert.equal(all.json.meta.total, ROWS.length);
  const passed = await getJson(env, '/api/v1/tenders?closing_bucket=deadline_passed&limit=1');
  assert.equal(passed.json.meta.total, ROWS.filter((r) => r.closing_bucket === 'deadline_passed').length);
});

test('new / lead_ok / value_band filters', async () => {
  const env = makeEnv();
  const newOpen = OPEN_ROWS.filter((r) => r.new_this_issue === true).length;
  const r1 = await getJson(env, '/api/v1/tenders?new=true&limit=1');
  assert.equal(r1.json.meta.total, newOpen);

  const leadOpen = OPEN_ROWS.filter((r) => r.lead_ok === true).length;
  const r2 = await getJson(env, '/api/v1/tenders?lead_ok=true&limit=1');
  assert.equal(r2.json.meta.total, leadOpen);

  const bandAll = ROWS.filter((r) => r.value_band === 'gt_10m').length;
  const r3 = await getJson(env, '/api/v1/tenders?value_band=gt_10m&closing_bucket=all&limit=1');
  assert.equal(r3.json.meta.total, bandAll);

  const unspec = ROWS.filter((r) => r.value_band == null).length;
  const r4 = await getJson(env, '/api/v1/tenders?value_band=unspecified&closing_bucket=all&limit=1');
  assert.equal(r4.json.meta.total, unspec);
});

test('category filter accepts slug and native-language name equally', async () => {
  const env = makeEnv();
  const sample = ROWS.find((r) => r.category && r.category.name_en === 'Medical equipment');
  assert.ok(sample);
  const expected = ROWS.filter((r) => r.category.name_en === 'Medical equipment').length;
  const bySlug = await getJson(env, '/api/v1/tenders?category=medical-equipment&closing_bucket=all&limit=1');
  const byZh = await getJson(
    env,
    '/api/v1/tenders?category=' + encodeURIComponent(sample.category.name_zh) + '&closing_bucket=all&limit=1'
  );
  assert.equal(bySlug.json.meta.total, expected);
  assert.equal(byZh.json.meta.total, expected);
});

test('unknown category matches nothing (empty result, not an error)', async () => {
  const env = makeEnv();
  const { res, json } = await getJson(env, '/api/v1/tenders?category=definitely-not-a-category');
  assert.equal(res.status, 200);
  assert.equal(json.meta.total, 0);
  assert.equal(json.meta.next_cursor, null);
});

test('q matches sanitized summaries and category names ONLY (not sort_key)', async () => {
  const env = makeEnv();
  const sample = OPEN_ROWS[0];
  const needle = sample.summary_en.slice(10, 30);
  const hit = await getJson(
    env,
    '/api/v1/tenders?q=' + encodeURIComponent(needle) + '&closing_bucket=all&limit=200'
  );
  assert.ok(hit.json.data.some((r) => r.asaptic_id === sample.asaptic_id));

  // sort_key is NOT searchable — querying a full sort_key hash returns nothing
  const miss = await getJson(env, '/api/v1/tenders?q=' + sample.sort_key + '&closing_bucket=all');
  assert.equal(miss.json.meta.total, 0);

  // zh summary substring matches too
  const zhNeedle = sample.summary_zh.slice(0, 6);
  const zhHit = await getJson(env, '/api/v1/tenders?q=' + encodeURIComponent(zhNeedle) + '&closing_bucket=all&limit=200');
  assert.ok(zhHit.json.meta.total >= 1);
});

test('lang collapsing: only the selected summary and category name remain; never a new key', async () => {
  const env = makeEnv();
  const { json } = await getJson(env, '/api/v1/tenders?lang=zh&limit=10');
  for (const row of json.data) {
    const keys = Object.keys(row).sort();
    assert.deepEqual(keys, [
      'asaptic_id', 'category', 'closing_bucket', 'lead_ok', 'market',
      'new_this_issue', 'sort_key', 'summary_zh', 'value_band',
    ]);
    assert.deepEqual(Object.keys(row.category), ['name_zh']);
  }
});

test('invalid params → 400 invalid_parameter', async () => {
  const env = makeEnv();
  for (const qs of ['closing_bucket=tomorrow', 'value_band=huge', 'lang=fr', 'new=maybe', 'limit=0', 'limit=abc', 'market=hkg']) {
    const { res, json } = await getJson(env, '/api/v1/tenders?' + qs);
    assert.equal(res.status, 400, qs);
    assert.equal(json.error.code, 'invalid_parameter', qs);
  }
});

test('limit clamps at 200', async () => {
  const env = makeEnv();
  const { json } = await getJson(env, '/api/v1/tenders?limit=999&closing_bucket=all');
  assert.equal(json.meta.returned, 200);
});

// ---------- cursor pagination ----------

test('cursor round-trip: pages concatenate to the exact filtered set, no overlap', async () => {
  const env = makeEnv();
  const expectedIds = ROWS.filter((r) => r.value_band === '500k_2m').map((r) => r.asaptic_id);
  assert.ok(expectedIds.length >= 3, 'fixture has enough rows for this test');
  const seen = [];
  let cursor = null;
  let pages = 0;
  do {
    const qs = '/api/v1/tenders?value_band=500k_2m&closing_bucket=all&limit=4' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
    const { res, json } = await getJson(env, qs);
    assert.equal(res.status, 200);
    seen.push(...json.data.map((r) => r.asaptic_id));
    cursor = json.meta.next_cursor;
    pages++;
    assert.ok(pages < 100, 'pagination terminates');
  } while (cursor);
  assert.deepEqual(seen, expectedIds);
  assert.equal(new Set(seen).size, seen.length, 'no duplicates across pages');
});

test('stale cursor from a previous issue → 409 snapshot_changed', async () => {
  const env = makeEnv();
  const snap = await getSnapshot(env);
  const f = parseFilters(new URLSearchParams(''), snap);
  const staleCursor = encodeCursor('2020-W01', 10, filterFingerprint(f));
  const { res, json } = await getJson(env, '/api/v1/tenders?cursor=' + encodeURIComponent(staleCursor));
  assert.equal(res.status, 409);
  assert.equal(json.error.code, 'snapshot_changed');
});

test('issue rotation invalidates an in-flight cursor (end-to-end)', async () => {
  const envA = makeEnv();
  const first = await getJson(envA, '/api/v1/tenders?limit=10');
  const cursor = first.json.meta.next_cursor;
  assert.ok(cursor);
  // New env: same rows, new issue id + new etag (as after a weekly publish)
  const rotated = JSON.stringify({ ...FIXTURE, issue_id: '2027-W01' });
  const envB = makeEnv({ raw: rotated });
  const { res, json } = await getJson(envB, '/api/v1/tenders?limit=10&cursor=' + encodeURIComponent(cursor));
  assert.equal(res.status, 409);
  assert.equal(json.error.code, 'snapshot_changed');
});

test('cursor bound to its filter set → 400 on filter mismatch; garbage cursor → 400', async () => {
  const env = makeEnv();
  const hk = await getJson(env, '/api/v1/tenders?market=HK&limit=5');
  const cursor = hk.json.meta.next_cursor;
  assert.ok(cursor);
  const misuse = await getJson(env, '/api/v1/tenders?market=SG&limit=5&cursor=' + encodeURIComponent(cursor));
  assert.equal(misuse.res.status, 400);
  assert.equal(misuse.json.error.code, 'invalid_cursor');

  const garbage = await getJson(env, '/api/v1/tenders?cursor=%%%not-a-cursor');
  assert.equal(garbage.res.status, 400);
  assert.equal(garbage.json.error.code, 'invalid_cursor');
});

// ---------- single row ----------

test('GET /api/v1/tenders/:at_id — verbatim row for a published id', async () => {
  const env = makeEnv();
  const sample = ROWS[123];
  const { res, json } = await getJson(env, '/api/v1/tenders/' + sample.asaptic_id);
  assert.equal(res.status, 200);
  assert.equal(json.data.asaptic_id, sample.asaptic_id);
  assert.equal(Object.keys(json.data).length, 11);
  assert.equal(json.data.summary_en, sample.summary_en);
  assert.equal(json.meta.total, 1);
});

test('404 bodies are byte-identical for every absent id', async () => {
  const env = makeEnv();
  const bodies = [];
  for (const id of ['AT-XX-9999-999', 'AT-HK-0000-000', 'not-even-an-id', 'AT-HK-2630-001x']) {
    const res = await callWorker(worker, env, '/api/v1/tenders/' + id);
    assert.equal(res.status, 404, id);
    assert.match(res.headers.get('content-type'), /application\/json/);
    bodies.push(await res.text());
  }
  assert.ok(bodies.every((b) => b === bodies[0]), '404 bodies byte-identical');
});

// ---------- facets ----------

test('facets counts sum to the published total; no per-facet withheld', async () => {
  const env = makeEnv();
  const { res, json } = await getJson(env, '/api/v1/tenders/facets');
  assert.equal(res.status, 200);
  const d = json.data;
  const sum = (arr) => arr.reduce((a, x) => a + x.count, 0);
  assert.equal(sum(d.market), ROWS.length);
  assert.equal(sum(d.category), ROWS.length);
  assert.equal(sum(d.closing_bucket), ROWS.length);
  assert.equal(sum(d.value_band), ROWS.length);
  assert.equal(d.new_this_issue, ROWS.filter((r) => r.new_this_issue).length);
  assert.equal(d.lead_ok, ROWS.filter((r) => r.lead_ok).length);
  for (const c of d.category) {
    assert.ok(c.slug && c.name_en, 'category carries slug + names');
    assert.ok(!('withheld' in c));
  }
  assert.ok(!JSON.stringify(d).includes('"withheld"'), 'no per-facet withheld anywhere');
});

// ---------- spec-coded gate + scoped 404 ----------

test('GET /api/v1/spec-coded/:at_id → structured 403 SPEC_CODED_GATED with access_url', async () => {
  const env = makeEnv();
  const { res, json } = await getJson(env, '/api/v1/spec-coded/AT-HK-2630-001');
  assert.equal(res.status, 403);
  assert.equal(json.error.code, 'SPEC_CODED_GATED');
  assert.equal(json.access_url, 'https://portal.asaptic.com/');
  // identical shape for ids that do not exist — the gate reveals nothing
  const other = await getJson(env, '/api/v1/spec-coded/AT-ZZ-0000-000');
  assert.equal(other.res.status, 403);
  assert.equal(other.json.error.code, 'SPEC_CODED_GATED');
});

test('scoped JSON-404 on unmatched /api/* and /agent/*; real /agent files pass through', async () => {
  const env = makeEnv({ assets: 'agentfile' });
  for (const path of ['/api/v1/nope', '/api/zzz', '/api/v1/tenders/x/y', '/agent/nope.json']) {
    const res = await callWorker(worker, env, path);
    assert.equal(res.status, 404, path);
    assert.match(res.headers.get('content-type'), /application\/json/, path);
    const json = await res.json();
    assert.equal(json.error.code, 'not_found', path);
  }
  const real = await callWorker(worker, env, '/agent/capabilities.json');
  assert.equal(real.status, 200);
});

test('non-GET /api/* → 405 JSON', async () => {
  const env = makeEnv();
  const res = await callWorker(worker, env, '/api/v1/tenders', { method: 'POST', body: '{}' });
  assert.equal(res.status, 405);
  const json = await res.json();
  assert.equal(json.error.code, 'method_not_allowed');
});

// ---------- resilience ----------

test('R2 dead + baked copy present → API still serves (fail-safe)', async () => {
  _resetSnapshotMemo();
  const env = makeEnv({ r2: 'throw', assets: 'fixture' });
  const { res, json } = await getJson(env, '/api/v1/tenders?limit=1');
  assert.equal(res.status, 200);
  assert.equal(json.meta.total, OPEN_ROWS.length);
  assert.match(json.meta.snapshot_etag, /^baked:/);
});

test('R2 dead + no baked copy + cold memo → 503 JSON, never an exception', async () => {
  _resetSnapshotMemo();
  const env = makeEnv({ r2: 'throw', assets: 'fail' });
  const { res, json } = await getJson(env, '/api/v1/tenders');
  assert.equal(res.status, 503);
  assert.equal(json.error.code, 'snapshot_unavailable');
  _resetSnapshotMemo();
});

test('memo reuse: same etag served twice parses once (idempotent, still correct)', async () => {
  _resetSnapshotMemo();
  const env = makeEnv({ etag: '"stable-etag"' });
  const a = await getJson(env, '/api/v1/tenders?limit=1');
  const b = await getJson(env, '/api/v1/tenders?limit=1');
  assert.equal(a.json.meta.snapshot_etag, b.json.meta.snapshot_etag);
  assert.equal(b.res.status, 200);
});

test('/tender/rows.json passthrough unaffected', async () => {
  const env = makeEnv();
  const res = await callWorker(worker, env, '/tender/rows.json');
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.rows.length, ROWS.length);
});
