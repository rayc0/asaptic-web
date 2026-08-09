// LEAK-SENTINEL suite — the boundary proof.
//  (1) every REST/MCP row output carries exactly the 11 allowed keys
//  (2) all outputs pass the forbidden-key/forbidden-string scan
//  (3) SELF-TEST: a deliberately dirty row FAILS the gate (a gate that cannot
//      fail measures nothing)
//  (4) MCP tool descriptions and every reachable error string pass the scan
//  (5) docs shipped with this branch (agent.json, llms.txt, README, LICENSE,
//      NOTICE, openapi.json, server.json) pass the content scan
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../_worker.js';
import { _resetSnapshotMemo } from '../lib/agent-api.mjs';
import { makeEnv, callWorker, rpc, FIXTURE } from './helpers/env.mjs';
import { checkRow, scanText, SentinelViolation, ALLOWED_ROW_KEYS } from './helpers/sentinel.mjs';

const ROWS = FIXTURE.rows;

async function getJson(env, path) {
  const res = await callWorker(worker, env, path);
  const body = await res.text();
  return { res, body, json: JSON.parse(body) };
}

// ---------- (3) SELF-TEST first: prove the gate can fail ----------

test('SELF-TEST: sentinel FAILS a deliberately dirty row (every forbidden class)', () => {
  const clean = ROWS[0];

  // Forbidden keys injected at top level
  for (const bad of [
    { ref: 'X123' },
    { title: 'Supply of things' },
    { closing_date: '2026-09-01' },
    { closing_iso: '2026-09-01T00:00:00Z' },
    { source_url: 'https://example.gov/notice/1' },
    { source: 'somewhere' },
    { org: 'Some Bureau' },
    { dept: 'Some Department' },
    { tender_id: 'GLD-1' },
    { tdr: 'x' },
    { est_wan: 120 },
  ]) {
    const dirty = { ...clean, ...bad };
    assert.throws(() => checkRow(dirty), SentinelViolation, 'key ' + Object.keys(bad)[0]);
  }

  // Forbidden key nested inside category
  assert.throws(
    () => checkRow({ ...clean, category: { ...clean.category, source: 'x' } }),
    SentinelViolation
  );

  // Forbidden content strings in a summary value
  assert.throws(
    () => checkRow({ ...clean, summary_en: clean.summary_en + ' via PCMS portal' }),
    SentinelViolation,
    'pcms uppercase'
  );
  assert.throws(
    () => checkRow({ ...clean, summary_en: clean.summary_en + ' pcms ' }),
    SentinelViolation,
    'pcms lowercase'
  );
  assert.throws(
    () => checkRow({ ...clean, summary_zh: clean.summary_zh + ' TDR-2630-101 ' }),
    SentinelViolation,
    'TDR- prefix'
  );

  // Missing key (12th removed) fails the exactly-11 rule
  const { sort_key, ...missing } = clean;
  assert.throws(() => checkRow(missing), SentinelViolation, 'missing key');

  // Extra unknown key fails
  assert.throws(() => checkRow({ ...clean, extra_field: 1 }), SentinelViolation, 'unknown key');

  // scanText directly
  assert.throws(() => scanText('the PCMS system'), SentinelViolation);
  assert.throws(() => scanText('id TDR-123'), SentinelViolation);
  assert.throws(() => scanText('{"closing_date":"2026-01-01"}'), SentinelViolation);

  // and the clean row PASSES
  assert.ok(checkRow(clean));
});

// ---------- (1)+(2) full-corpus REST sweep ----------

test('REST: every row served across the FULL corpus has exactly the 11 keys and passes the scan', async () => {
  const env = makeEnv();
  let cursor = null;
  let scanned = 0;
  do {
    const qs =
      '/api/v1/tenders?closing_bucket=all&limit=200' +
      (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
    const { res, body, json } = await getJson(env, qs);
    assert.equal(res.status, 200);
    scanText(body, 'listing page');
    for (const row of json.data) {
      checkRow(row);
      scanned++;
    }
    cursor = json.meta.next_cursor;
  } while (cursor);
  assert.equal(scanned, ROWS.length, 'sentinel swept the full published corpus');
});

test('REST: lang-collapsed rows stay inside the allowlist', async () => {
  const env = makeEnv();
  for (const lang of ['en', 'zh', 'zht']) {
    const { body, json } = await getJson(env, `/api/v1/tenders?lang=${lang}&limit=200`);
    scanText(body, 'lang=' + lang);
    for (const row of json.data) checkRow(row, { lang });
  }
});

test('REST: single-row, facets, spec-coded, health outputs pass the scan', async () => {
  const env = makeEnv();
  const single = await getJson(env, '/api/v1/tenders/' + ROWS[7].asaptic_id);
  checkRow(single.json.data);
  scanText(single.body, 'single row envelope');

  const facets = await getJson(env, '/api/v1/tenders/facets');
  scanText(facets.body, 'facets');

  const spec = await getJson(env, '/api/v1/spec-coded/AT-HK-0000-000');
  scanText(spec.body, 'spec-coded gate');

  const health = await getJson(env, '/api/v1/health');
  scanText(health.body, 'health');
});

test('REST: every reachable error string passes the scan', async () => {
  _resetSnapshotMemo();
  const deadEnv = makeEnv({ r2: 'throw', assets: 'fail' });
  const unavailable = await getJson(deadEnv, '/api/v1/tenders');
  assert.equal(unavailable.res.status, 503);
  scanText(unavailable.body, '503 error');
  _resetSnapshotMemo();

  const env = makeEnv();
  const errorPaths = [
    '/api/v1/tenders?closing_bucket=zzz', // 400 invalid_parameter
    '/api/v1/tenders?cursor=broken', // 400 invalid_cursor
    '/api/v1/tenders/AT-NO-SUCH-ID', // 404 byte-identical
    '/api/v1/no-such-endpoint', // scoped JSON-404
  ];
  for (const p of errorPaths) {
    const { res, body } = await getJson(env, p);
    assert.ok(res.status >= 400, p);
    scanText(body, p);
  }
  const post = await callWorker(worker, env, '/api/v1/tenders', { method: 'PUT' });
  scanText(await post.text(), '405 error');
});

// ---------- (4) MCP surface ----------

test('MCP: tool descriptions, schemas, and discovery manifest pass the scan', async () => {
  const env = makeEnv();
  const list = await rpc(worker, env, 'tools/list', {});
  assert.ok(list.result.tools.length >= 9);
  scanText(JSON.stringify(list.result), 'tools/list');

  const disc = await callWorker(worker, env, '/mcp');
  scanText(await disc.text(), 'GET /mcp discovery');
});

test('MCP: full-corpus rows through list_tenders pass checkRow; tool errors pass the scan', async () => {
  const env = makeEnv();
  let cursor = null;
  let scanned = 0;
  do {
    const args = { closing_bucket: 'all', limit: 200 };
    if (cursor) args.cursor = cursor;
    const out = await rpc(worker, env, 'tools/call', { name: 'list_tenders', arguments: args });
    const payload = JSON.parse(out.result.content[0].text);
    scanText(out.result.content[0].text, 'list_tenders page');
    for (const row of payload.data) {
      checkRow(row);
      scanned++;
    }
    cursor = payload.meta.next_cursor;
  } while (cursor);
  assert.equal(scanned, ROWS.length);

  // error strings from tool misuse
  const bad1 = await rpc(worker, env, 'tools/call', { name: 'get_tender', arguments: {} });
  assert.ok(bad1.error);
  scanText(JSON.stringify(bad1.error), 'get_tender missing at_id');
  const bad2 = await rpc(worker, env, 'tools/call', {
    name: 'list_tenders',
    arguments: { closing_bucket: 'nope' },
  });
  assert.ok(bad2.error);
  scanText(JSON.stringify(bad2.error), 'list_tenders bad bucket');
  const bad3 = await rpc(worker, env, 'tools/call', {
    name: 'request_tender_access',
    arguments: { company: 'X', contact_email: 'not-an-email' },
  });
  assert.ok(bad3.error);
  scanText(JSON.stringify(bad3.error), 'request_tender_access bad email');
});

// ---------- (5) shipped docs ----------

test('docs: agent.json, llms.txt, README, LICENSE, NOTICE, openapi.json, server.json pass the content scan', () => {
  const root = new URL('..', import.meta.url);
  for (const f of ['agent.json', 'llms.txt', 'README.md', 'LICENSE', 'NOTICE', 'openapi.json', 'server.json', 'smithery.yaml']) {
    const text = readFileSync(new URL(f, root), 'utf8');
    // Content scan only (pcms / TDR- prefix). The JSON-key rule is for API row
    // outputs — docs legitimately use standard keys like OpenAPI's "title".
    assert.ok(!/pcms/i.test(text), `"pcms" found in ${f}`);
    assert.ok(!/\bTDR-/i.test(text), `"TDR-" found in ${f}`);
  }
  // llms.txt stale-count regression: the old hardcoded row count must be gone
  const llms = readFileSync(new URL('llms.txt', root), 'utf8');
  assert.ok(!llms.includes('1,282'), 'stale 1,282 row count still present in llms.txt');
  assert.ok(!llms.includes('five markets'), 'stale five-markets wording still present in llms.txt');
});

// ---------- forbidden-import rule (red-team HIGH) ----------

test('code: agent-api module and worker never import portal projection code', () => {
  const root = new URL('..', import.meta.url);
  for (const f of ['lib/agent-api.mjs', '_worker.js']) {
    const src = readFileSync(new URL(f, root), 'utf8');
    // No import/require of portal projection code, under any path or alias.
    const importLines = src.split('\n').filter((l) => /\b(import|require|from)\b/.test(l) && !l.trim().startsWith('//') && !l.trim().startsWith('*'));
    for (const line of importLines) {
      assert.ok(!/tender-record/.test(line), `${f} imports tender-record: ${line.trim()}`);
      assert.ok(!/toPublicSummary|toSupplierSummary/.test(line), `${f} imports portal projections: ${line.trim()}`);
    }
    // No use of the projection symbols anywhere in executable code either.
    const codeOnly = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/toPublicSummary|toSupplierSummary/.test(codeOnly), `${f} uses portal projection symbols`);
    assert.ok(!/pcms/i.test(src), `${f} contains forbidden term`);
  }
});

// keep the allowlist in the sentinel and the module in lockstep
test('sentinel allowlist matches the module allowlist', async () => {
  const mod = await import('../lib/agent-api.mjs');
  assert.deepEqual([...mod.ALLOWED_ROW_KEYS].sort(), [...ALLOWED_ROW_KEYS].sort());
});
