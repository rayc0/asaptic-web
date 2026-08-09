// MCP protocol tests — initialize / tools list / tools call round-trips
// against the real worker fetch handler, in-process with the stub env.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../_worker.js';
import { _resetSnapshotMemo } from '../lib/agent-api.mjs';
import { makeEnv, callWorker, rpc, FIXTURE } from './helpers/env.mjs';

const ROWS = FIXTURE.rows;

test('initialize round-trip', async () => {
  const env = makeEnv();
  const out = await rpc(worker, env, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '0' },
  });
  assert.equal(out.jsonrpc, '2.0');
  assert.equal(out.id, 1);
  assert.equal(out.result.protocolVersion, '2025-06-18');
  assert.ok(out.result.capabilities.tools);
});

test('notifications/initialized → 204, no body', async () => {
  const env = makeEnv();
  const res = await callWorker(worker, env, '/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  });
  assert.equal(res.status, 204);
});

test('tools/list exposes legacy sourcing tools AND the five tender tools', async () => {
  const env = makeEnv();
  const out = await rpc(worker, env, 'tools/list', {});
  const names = out.result.tools.map((t) => t.name);
  for (const n of [
    'list_sourcing_lanes', 'get_lane_capability', 'get_engagement', 'submit_rfq',
    'list_tenders', 'get_tender', 'tender_facets', 'get_spec_coded', 'request_tender_access',
  ]) {
    assert.ok(names.includes(n), 'missing tool ' + n);
  }
  for (const t of out.result.tools) {
    assert.ok(t.description && t.inputSchema, t.name + ' has descriptor');
  }
});

test('GET /mcp discovery lists the new tool names', async () => {
  const env = makeEnv();
  const res = await callWorker(worker, env, '/mcp');
  const json = await res.json();
  assert.ok(json.tools.includes('list_tenders'));
  assert.ok(json.tools.includes('request_tender_access'));
});

test('list_tenders defaults to 25 rows and returns the standard envelope', async () => {
  const env = makeEnv();
  const out = await rpc(worker, env, 'tools/call', { name: 'list_tenders', arguments: {} });
  const payload = JSON.parse(out.result.content[0].text);
  assert.equal(payload.data.length, 25);
  assert.equal(payload.meta.returned, 25);
  assert.equal(payload.meta.issue_id, FIXTURE.issue_id);
  assert.ok(payload.meta.next_cursor);
  assert.ok(payload.meta.access.spec_coded.gated);
});

test('list_tenders accepts the same filters as REST (market + lang + q)', async () => {
  const env = makeEnv();
  const out = await rpc(worker, env, 'tools/call', {
    name: 'list_tenders',
    arguments: { market: 'MO', closing_bucket: 'all', lang: 'zht', limit: 200 },
  });
  const payload = JSON.parse(out.result.content[0].text);
  const expected = ROWS.filter((r) => r.market === 'MO').length;
  assert.equal(payload.meta.total, expected);
  for (const row of payload.data) {
    assert.equal(row.market, 'MO');
    assert.ok('summary_zht' in row);
    assert.ok(!('summary_en' in row));
  }
});

test('MCP cursor round-trips and 409-equivalent error surfaces as JSON-RPC error', async () => {
  const env = makeEnv();
  const p1 = await rpc(worker, env, 'tools/call', {
    name: 'list_tenders',
    arguments: { value_band: '500k_2m', closing_bucket: 'all', limit: 4 },
  });
  const pay1 = JSON.parse(p1.result.content[0].text);
  assert.ok(pay1.meta.next_cursor);
  const p2 = await rpc(worker, env, 'tools/call', {
    name: 'list_tenders',
    arguments: { value_band: '500k_2m', closing_bucket: 'all', limit: 4, cursor: pay1.meta.next_cursor },
  });
  const pay2 = JSON.parse(p2.result.content[0].text);
  const ids1 = new Set(pay1.data.map((r) => r.asaptic_id));
  for (const r of pay2.data) assert.ok(!ids1.has(r.asaptic_id), 'no overlap across pages');

  // stale cursor (issue rotated) → JSON-RPC error, not an exception
  const rotated = JSON.stringify({ ...FIXTURE, issue_id: '2027-W09' });
  const envB = makeEnv({ raw: rotated });
  const stale = await rpc(worker, envB, 'tools/call', {
    name: 'list_tenders',
    arguments: { value_band: '500k_2m', closing_bucket: 'all', limit: 4, cursor: pay1.meta.next_cursor },
  });
  assert.ok(stale.error, 'stale cursor is a JSON-RPC error');
  assert.match(stale.error.message, /snapshot changed|Restart/i);
});

test('get_tender: found returns the row; absent returns the identical not_found result (not an error)', async () => {
  const env = makeEnv();
  const sample = ROWS[42];
  const found = await rpc(worker, env, 'tools/call', {
    name: 'get_tender',
    arguments: { at_id: sample.asaptic_id },
  });
  const payload = JSON.parse(found.result.content[0].text);
  assert.equal(payload.data.asaptic_id, sample.asaptic_id);
  assert.equal(Object.keys(payload.data).length, 11);

  const miss1 = await rpc(worker, env, 'tools/call', { name: 'get_tender', arguments: { at_id: 'AT-XX-1' } });
  const miss2 = await rpc(worker, env, 'tools/call', { name: 'get_tender', arguments: { at_id: 'AT-YY-2' } });
  assert.equal(miss1.result.content[0].text, miss2.result.content[0].text, 'not-found results identical');
  assert.equal(JSON.parse(miss1.result.content[0].text).error.code, 'not_found');
});

test('tender_facets sums to the corpus', async () => {
  const env = makeEnv();
  const out = await rpc(worker, env, 'tools/call', { name: 'tender_facets', arguments: {} });
  const payload = JSON.parse(out.result.content[0].text);
  assert.equal(payload.data.market.reduce((a, m) => a + m.count, 0), ROWS.length);
});

test('get_spec_coded returns a structured access-required RESULT, never an error', async () => {
  const env = makeEnv();
  const out = await rpc(worker, env, 'tools/call', {
    name: 'get_spec_coded',
    arguments: { at_id: 'AT-HK-2630-001' },
  });
  assert.ok(!out.error, 'must not be a JSON-RPC error');
  const payload = JSON.parse(out.result.content[0].text);
  assert.equal(payload.access_required, true);
  assert.equal(payload.url, 'https://portal.asaptic.com/');
  assert.ok(payload.how.includes('request_tender_access'));
});

test('request_tender_access validates input and acknowledges WITHOUT a fabricated reference number', async () => {
  const env = makeEnv();
  const ok = await rpc(worker, env, 'tools/call', {
    name: 'request_tender_access',
    arguments: { company: 'Acme Ltd', contact_email: 'buyer@acme.com', markets: 'HK,SG' },
  });
  const payload = JSON.parse(ok.result.content[0].text);
  assert.equal(payload.acknowledged, true);
  assert.ok(!('reference' in payload), 'no fabricated reference number');
  assert.ok(!/RFQ-/.test(ok.result.content[0].text), 'no minted RFQ-style id');
  assert.ok(payload.next.includes('engage@asaptic.com'));

  const missing = await rpc(worker, env, 'tools/call', {
    name: 'request_tender_access',
    arguments: { company: 'Acme Ltd' },
  });
  assert.equal(missing.error.code, -32602);
});

test('legacy tools still work (submit_rfq untouched this phase)', async () => {
  const env = makeEnv();
  const lanes = await rpc(worker, env, 'tools/call', { name: 'list_sourcing_lanes', arguments: {} });
  assert.ok(JSON.parse(lanes.result.content[0].text).length >= 5);
  const rfq = await rpc(worker, env, 'tools/call', {
    name: 'submit_rfq',
    arguments: { product: 'widgets', buyer_contact: 'a@b.co' },
  });
  assert.ok(JSON.parse(rfq.result.content[0].text).received);
});

test('R2 failure inside a tender tool → graceful JSON-RPC error with the request id preserved', async () => {
  _resetSnapshotMemo();
  const env = makeEnv({ r2: 'throw', assets: 'fail' });
  const out = await rpc(worker, env, 'tools/call', { name: 'list_tenders', arguments: {} }, 77);
  assert.equal(out._status, 200, 'HTTP layer stays 200 — the error is JSON-RPC level');
  assert.equal(out.id, 77);
  assert.equal(out.error.code, -32603);
  assert.match(out.error.message, /temporarily unavailable/);
  _resetSnapshotMemo();
});

test('unknown tool and unknown method → proper JSON-RPC errors; parse error → -32700', async () => {
  const env = makeEnv();
  const unknown = await rpc(worker, env, 'tools/call', { name: 'no_such_tool', arguments: {} });
  assert.equal(unknown.error.code, -32602);
  const method = await rpc(worker, env, 'no/such-method', {});
  assert.equal(method.error.code, -32601);
  const res = await callWorker(worker, env, '/mcp', { method: 'POST', body: '{not json' });
  assert.equal(res.status, 400);
  const parsed = await res.json();
  assert.equal(parsed.error.code, -32700);
});

test('health endpoint: ok on live R2, degraded on baked fallback, 503 when nothing loads', async () => {
  _resetSnapshotMemo();
  const env = makeEnv();
  const ok = await (await callWorker(worker, env, '/api/v1/health')).json();
  // fixture generated 2026-08-09; "ok" only while within the freshness window,
  // so assert on the mechanical fields and consistency instead of wall clock
  assert.equal(ok.rows_total, ROWS.length);
  assert.equal(ok.issue_id, FIXTURE.issue_id);
  assert.equal(ok.schema, 'asaptic.tender.v1');
  assert.equal(ok.status, ok.feed_fresh ? 'ok' : 'degraded');

  const aliasRes = await callWorker(worker, env, '/healthz');
  const alias = await aliasRes.json();
  assert.equal(aliasRes.headers.get('cache-control'), 'no-store');
  assert.equal(alias.rows_total, ok.rows_total);

  _resetSnapshotMemo();
  const baked = makeEnv({ r2: 'throw', assets: 'fixture' });
  const degraded = await (await callWorker(worker, baked, '/api/v1/health')).json();
  assert.equal(degraded.status, 'degraded');
  assert.equal(degraded.rows_total, ROWS.length);

  _resetSnapshotMemo();
  const dead = makeEnv({ r2: 'throw', assets: 'fail' });
  const res503 = await callWorker(worker, dead, '/api/v1/health');
  assert.equal(res503.status, 503);
  assert.equal((await res503.json()).status, 'unavailable');
  _resetSnapshotMemo();
});
