// Unit tests for lib/lead-capture.mjs — the fix for the silent-lead-drop bug
// (submit_rfq minted a fake reference and persisted nothing; see
// AGENT_ACCESS_PLAN §E). Covers: KV happy path, webhook happy path (local
// http server) + one-retry-max, honest no-binding path, input clamping, and
// forbidden-term scrubbing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { captureLead, sanitizeLeadInput, isoWeekString, CONTACT_FALLBACK } from '../lib/lead-capture.mjs';
import { scanText } from './helpers/sentinel.mjs';

function makeKvEnv() {
  const calls = [];
  return {
    env: { LEADS: { calls, put: async (key, value) => { calls.push({ key, value }); } } },
    calls,
  };
}

test('KV happy path: stored via KV, honest LEAD- reference, key shape leads:<isoweek>:<uuid>', async () => {
  const { env, calls } = makeKvEnv();
  const res = await captureLead(env, {
    tool: 'request_tender_access',
    company: 'Acme Ltd',
    contact_email: 'buyer@acme.com',
    markets: 'HK,SG',
    at_ids: ['AT-HK-1', 'AT-SG-2'],
  });
  assert.equal(res.stored, true);
  assert.equal(res.channel, 'kv');
  assert.match(res.reference, /^LEAD-[0-9a-f]{8}$/);
  assert.equal(calls.length, 1);
  const week = isoWeekString();
  assert.equal(calls[0].key, `leads:${week}:${calls[0].key.split(':')[2]}`);
  assert.match(calls[0].key, /^leads:\d{4}-W\d{2}:[0-9a-f-]{36}$/);
  const stored = JSON.parse(calls[0].value.trim());
  assert.equal(stored.company, 'Acme Ltd');
  assert.deepEqual(stored.markets, ['HK', 'SG']);
  assert.deepEqual(stored.at_ids, ['AT-HK-1', 'AT-SG-2']);
  assert.ok(stored.id && stored.at, 'record carries id + timestamp');
  // value is JSONL-style: newline-terminated single JSON object
  assert.ok(calls[0].value.endsWith('\n'));
});

test('webhook happy path: POSTs the record to LEAD_WEBHOOK_URL', async () => {
  const received = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ headers: req.headers, body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const env = { LEAD_WEBHOOK_URL: `http://127.0.0.1:${port}/leads` };
    const res = await captureLead(env, {
      tool: 'submit_rfq',
      contact_email: 'a@b.co',
      categories: 'widgets',
    });
    assert.equal(res.stored, true);
    assert.equal(res.channel, 'webhook');
    assert.match(res.reference, /^LEAD-[0-9a-f]{8}$/);
    assert.equal(received.length, 1, 'exactly one POST on first success (no wasted retry)');
    assert.equal(received[0].headers['content-type'], 'application/json');
    const body = JSON.parse(received[0].body);
    assert.equal(body.contact_email, 'a@b.co');
    assert.deepEqual(body.categories, ['widgets']);
  } finally {
    server.close();
  }
});

test('webhook: one retry on failure, then succeeds (no retry storm — max 2 attempts)', async () => {
  let attempts = 0;
  const server = http.createServer((req, res) => {
    attempts++;
    req.on('data', () => {});
    req.on('end', () => {
      if (attempts === 1) {
        res.writeHead(500);
        res.end('boom');
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const env = { LEAD_WEBHOOK_URL: `http://127.0.0.1:${port}/leads` };
    const res = await captureLead(env, { tool: 'submit_rfq', contact_email: 'a@b.co' });
    assert.equal(res.stored, true);
    assert.equal(attempts, 2, 'failed once, retried once, succeeded — exactly 2 attempts');
  } finally {
    server.close();
  }
});

test('webhook: unreachable URL fails after retry → honest no-op, never a fabricated reference', async () => {
  // Port 1 is a reserved/unroutable port on loopback — connection is refused
  // immediately, so this exercises the failure path without waiting out the
  // 5s per-attempt timeout.
  const env = { LEAD_WEBHOOK_URL: 'http://127.0.0.1:1/leads' };
  const res = await captureLead(env, { tool: 'submit_rfq', contact_email: 'a@b.co' });
  assert.equal(res.stored, false);
  assert.ok(!('reference' in res), 'no fabricated reference number');
  assert.equal(res.contact_fallback, CONTACT_FALLBACK);
});

test('no capture binding configured → honest {stored:false}, mailto fallback, never a fabricated reference', async () => {
  const res = await captureLead({}, { tool: 'submit_rfq', contact_email: 'a@b.co' });
  assert.equal(res.stored, false);
  assert.ok(!('reference' in res), 'no fabricated reference number');
  assert.ok(!('channel' in res));
  assert.equal(res.contact_fallback, 'mailto:engage@asaptic.com');
});

test('KV write failure falls through to honest no-op (never throws, never fabricates)', async () => {
  const env = { LEADS: { put: async () => { throw new Error('kv boom'); } } };
  const res = await captureLead(env, { tool: 'submit_rfq', contact_email: 'a@b.co' });
  assert.equal(res.stored, false);
  assert.ok(!('reference' in res));
  assert.equal(res.contact_fallback, CONTACT_FALLBACK);
});

test('KV write failure falls through to webhook when both are configured', async () => {
  const received = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push(body);
      res.writeHead(200);
      res.end('{}');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const env = {
      LEADS: { put: async () => { throw new Error('kv boom'); } },
      LEAD_WEBHOOK_URL: `http://127.0.0.1:${port}/leads`,
    };
    const res = await captureLead(env, { tool: 'submit_rfq', contact_email: 'a@b.co' });
    assert.equal(res.stored, true);
    assert.equal(res.channel, 'webhook');
    assert.equal(received.length, 1);
  } finally {
    server.close();
  }
});

// ---------- input clamping ----------

test('input clamping: overlong strings clamp, oversized arrays clamp to 20, at_ids restricted to a safe charset', () => {
  const s = sanitizeLeadInput({
    company: 'x'.repeat(500),
    contact_email: 'y'.repeat(500),
    note: 'z'.repeat(5000),
    markets: Array.from({ length: 40 }, (_, i) => 'MARKET' + i),
    categories: Array.from({ length: 40 }, (_, i) => 'cat' + i),
    at_ids: Array.from({ length: 40 }, (_, i) => `AT-HK-${i}<script>`),
  });
  assert.equal(s.company.length, 200);
  assert.equal(s.contact_email.length, 320);
  assert.equal(s.note.length, 2000);
  assert.equal(s.markets.length, 20);
  assert.equal(s.categories.length, 20);
  assert.equal(s.at_ids.length, 20);
  for (const id of s.at_ids) assert.match(id, /^[A-Za-z0-9_.-]+$/, `at_id "${id}" outside the safe charset`);
});

test('input clamping: control characters are stripped from every text field', () => {
  const dirty = 'Acme' + String.fromCharCode(0) + 'Ltd' + String.fromCharCode(7) + 'Co';
  const s = sanitizeLeadInput({ company: dirty });
  assert.ok(!/[\x00-\x1f\x7f]/.test(s.company), 'no control characters survive');
});

test('input clamping: empty/whitespace-only fields collapse to null, not empty strings', () => {
  const s = sanitizeLeadInput({ company: '   ', note: undefined, markets: '' });
  assert.equal(s.company, null);
  assert.equal(s.note, null);
  assert.equal(s.markets, null);
});

// ---------- sentinel: forbidden terms never survive into a stored record or an echoed response ----------

test('sentinel: forbidden terms in free-text input are scrubbed before storage AND before any echo', async () => {
  const { env, calls } = makeKvEnv();
  const res = await captureLead(env, {
    tool: 'request_tender_access',
    company: 'PCMS Sourcing Ltd',
    contact_email: 'a@b.co',
    note: 'saw this on TDR-99887',
    categories: 'pcms integration, TDR-11223 lookalikes',
  });
  // response never leaks the forbidden terms
  scanText(JSON.stringify(res), 'captureLead response');
  assert.ok(!/pcms/i.test(JSON.stringify(res.sanitized)));
  assert.ok(!/\bTDR-/i.test(JSON.stringify(res.sanitized)));
  // the stored KV record is equally scrubbed — storage is not a side-channel
  const stored = calls[0].value;
  scanText(stored, 'stored KV record');
});

test('sentinel: redaction covers mixed case and repeated occurrences, not just a single lowercase hit', async () => {
  const res = await captureLead({}, {
    tool: 'submit_rfq',
    contact_email: 'a@b.co',
    note: 'PCMS then pcms then Pcms, also TDR-1 and TDR-22',
  });
  scanText(JSON.stringify(res), 'captureLead response (mixed-case forbidden terms)');
});
