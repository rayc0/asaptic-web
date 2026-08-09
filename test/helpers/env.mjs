// Test harness: stub Cloudflare env around the downloaded rows.json fixture.
import { readFileSync } from 'node:fs';

export const FIXTURE_RAW = readFileSync(new URL('../fixtures/rows.json', import.meta.url), 'utf8');
export const FIXTURE = JSON.parse(FIXTURE_RAW);

let etagCounter = 0;

/**
 * Build a stub worker env.
 * opts:
 *   raw      — JSON string served by R2 (default: real fixture)
 *   r2       — false: no TENDER_DATA binding; 'throw': binding that throws
 *   assets   — 'fixture': ASSETS serves the fixture at /tender/rows.json;
 *              'fail': ASSETS throws; default: 404 for everything
 *   etag     — R2 etag (default: fresh unique etag per env)
 */
export function makeEnv(opts = {}) {
  const raw = opts.raw ?? FIXTURE_RAW;
  const etag = opts.etag ?? `"test-etag-${++etagCounter}"`;

  let tenderData;
  if (opts.r2 === false) tenderData = undefined;
  else if (opts.r2 === 'throw') {
    tenderData = {
      head: async () => { throw new Error('r2 head boom'); },
      get: async () => { throw new Error('r2 get boom'); },
    };
  } else {
    tenderData = {
      head: async (key) => (key === 'rows.json' ? { httpEtag: etag } : null),
      get: async (key) =>
        key === 'rows.json' ? { httpEtag: etag, text: async () => raw } : null,
    };
  }

  const assets = {
    fetch: async (req) => {
      const url = new URL(typeof req === 'string' ? req : req.url);
      if (opts.assets === 'fail') throw new Error('assets boom');
      if (opts.assets === 'fixture' && url.pathname === '/tender/rows.json') {
        return new Response(raw, { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (opts.assets === 'agentfile' && url.pathname === '/agent/capabilities.json') {
        return new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
    },
  };

  return { TENDER_DATA: tenderData, ASSETS: assets };
}

/** Invoke the real worker fetch handler in-process. */
export async function callWorker(worker, env, path, init = {}) {
  return worker.fetch(new Request('https://asaptic.com' + path, init), env);
}

/** JSON-RPC call against /mcp through the worker. */
export async function rpc(worker, env, method, params, id = 1) {
  const res = await callWorker(worker, env, '/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  if (res.status === 204) return { _status: 204 };
  return { _status: res.status, ...(await res.json()) };
}
