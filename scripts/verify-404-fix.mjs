#!/usr/bin/env node
/**
 * verify-404-fix.mjs — proves the soft-404 catch-all fix without deploying.
 *
 * WHY THIS EXISTS
 * asaptic.com answered EVERY unknown path with 200 + homepage HTML, because
 * Cloudflare Pages serves the root index.html when a request matches no asset
 * and the project ships no 404.html. The failure was invisible precisely
 * because every probe "succeeded". So the check has to assert the negative:
 * unknown paths must 404, and missing ASSETS must not be text/html.
 *
 * The worker is not unit-runnable (it needs env.ASSETS + the Pages asset
 * server), so this drives a REAL local Pages runtime and probes a URL matrix.
 *
 * USAGE
 *   npx wrangler pages dev . --port 8899 --ip 127.0.0.1   # terminal 1 (local only)
 *   node scripts/verify-404-fix.mjs                       # terminal 2
 *
 *   node scripts/verify-404-fix.mjs --base https://<preview>.pages.dev
 *   node scripts/verify-404-fix.mjs --audit-refs   # offline static ref audit
 *
 * Exits non-zero if any case fails.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const BASE = argOf('--base', 'http://127.0.0.1:8899').replace(/\/$/, '');

// ---------------------------------------------------------------------------
// The matrix
//
// status  — expected HTTP status (or an array of acceptable statuses)
// type    — substring the Content-Type must contain
// notHtml — response must NOT be text/html (the whole point for asset misses)
// marker  — substring the body must contain
// ---------------------------------------------------------------------------

const HTML = 'text/html';
const PAGE404 = 'Record Not Found'; // the stamp on /404.html

/** Known-good: every legitimate path class the project serves. */
const GOOD = [
  // -- worker-owned routes (must keep working; they never touch ASSETS) -----
  { path: '/geo', status: 200, type: 'application/json', marker: 'country' },
  { path: '/mcp', status: 200, type: 'application/json', marker: 'asaptic-sourcing' },

  // -- tender data feed: R2 in prod, baked asset locally (both must be JSON) -
  { path: '/tender/rows.json', status: 200, type: 'application/json' },
  { path: '/tender/teaser.json', status: 200, type: 'application/json' },

  // -- root static pages ----------------------------------------------------
  { path: '/', status: 200, type: HTML, marker: 'Asaptic' },
  { path: '/about', status: 200, type: HTML },
  { path: '/engage', status: 200, type: HTML },
  { path: '/thesis', status: 200, type: HTML },
  { path: '/sourcing', status: 200, type: HTML },
  { path: '/privacy', status: 200, type: HTML },
  // Pages canonicalises .html -> extensionless with a 308; both forms resolve.
  { path: '/about.html', status: [200, 301, 308] },
  { path: '/index.html', status: [200, 301, 308] },

  // -- /tender/* incl. market subdirs and baked pages -----------------------
  { path: '/tender/', status: 200, type: HTML },
  { path: '/tender/sg/', status: 200, type: HTML },
  { path: '/tender/gb/', status: 200, type: HTML },
  { path: '/tender/au/', status: 200, type: HTML },
  { path: '/tender/mo/', status: 200, type: HTML },
  { path: '/tender/archive/', status: 200, type: HTML },
  { path: '/tender/c/it-software/', status: 200, type: HTML },
  // trailing-slash handling: the un-slashed form must still resolve (308).
  { path: '/tender/sg', status: [200, 301, 308] },

  // -- /demo/* and /demos/* -------------------------------------------------
  { path: '/demo/', status: 200, type: HTML },
  { path: '/demo/match/', status: 200, type: HTML },
  { path: '/demo/match', status: [200, 301, 308] },
  { path: '/demos/', status: 200, type: HTML },
  { path: '/demo/loa.png', status: 200, type: 'image/png' },

  // -- /agent + agent.json + .well-known ------------------------------------
  { path: '/agent.json', status: 200, type: 'json' },
  { path: '/agent/capabilities.json', status: 200, type: 'json' },
  { path: '/.well-known/agent.json', status: 200, type: 'json' },
  { path: '/.well-known/ai-plugin.json', status: 200, type: 'json' },

  // -- /legal/* -------------------------------------------------------------
  { path: '/legal/terms', status: 200, type: HTML },
  { path: '/legal/privacy', status: 200, type: HTML },

  // -- /blog/* --------------------------------------------------------------
  { path: '/blog/handoff-problem', status: 200, type: HTML },

  // -- locale trees ---------------------------------------------------------
  { path: '/zh/', status: 200, type: HTML },
  { path: '/zht/', status: 200, type: HTML },
  { path: '/pt/', status: 200, type: HTML },

  // -- other page clusters --------------------------------------------------
  { path: '/robot/', status: 200, type: HTML },
  { path: '/university/', status: 200, type: HTML },
  { path: '/physicalai/', status: 200, type: HTML },
  { path: '/sourcing/clinical-devices', status: 200, type: HTML },
  { path: '/standards/compliance-matrix', status: 200, type: HTML },

  // -- assets ---------------------------------------------------------------
  { path: '/style.css', status: 200, type: 'css' },
  { path: '/content.js', status: 200, type: 'javascript' },
  { path: '/assets/js/nav-mobile.js', status: 200, type: 'javascript' },
  { path: '/robot/robot.css', status: 200, type: 'css' },
  { path: '/university/university.css', status: 200, type: 'css' },
  { path: '/standard/standard.css', status: 200, type: 'css' },
  { path: '/standard/search.js', status: 200, type: 'javascript' },
  { path: '/img/og-image.jpg', status: 200, type: 'image/jpeg' },

  // -- crawler files --------------------------------------------------------
  { path: '/robots.txt', status: 200, type: 'text/plain' },
  { path: '/llms.txt', status: 200, type: 'text' },
  { path: '/llms-full.txt', status: 200, type: 'text' },
  { path: '/sitemap.xml', status: 200, type: 'xml' },
];

/** Known-bad: everything here MUST 404 (it returned 200 + homepage before). */
const BAD = [
  // unknown pages -> branded 404 page, 404 status
  { path: '/definitely-not-a-real-path-xyz', status: 404, type: HTML, marker: PAGE404 },
  { path: '/deep/nested/unknown/path', status: 404, type: HTML, marker: PAGE404 },
  { path: '/blog/no-such-article-exists', status: 404, type: HTML, marker: PAGE404 },
  { path: '/zh/no-such-page', status: 404, type: HTML, marker: PAGE404 },
  { path: '/tender/zz/', status: 404, type: HTML, marker: PAGE404 },
  { path: '/legal/no-such-doc', status: 404, type: HTML, marker: PAGE404 },
  { path: '/robot/101/no-such-topic', status: 404, type: HTML, marker: PAGE404 },
  { path: '/university/no-such-course', status: 404, type: HTML, marker: PAGE404 },

  // missing ASSETS -> 404 and never text/html (this is the regression that hid
  // every broken stylesheet behind a 200)
  { path: '/demo/style.css?v=20260711d', status: 404, notHtml: true },
  { path: '/nonexistent.css', status: 404, notHtml: true },
  { path: '/img/nope.png', status: 404, notHtml: true },
  { path: '/assets/js/nope.js', status: 404, notHtml: true },
  { path: '/agent/nope.json', status: 404, notHtml: true },
  { path: '/sitemap-nope.xml', status: 404, notHtml: true },
  { path: '/fonts/nope.woff2', status: 404, notHtml: true },

  // the error document itself must not be an indexable 200
  { path: '/404', status: 404, type: HTML, marker: PAGE404 },
];

// ---------------------------------------------------------------------------

async function probe(base, c) {
  const url = base + c.path;
  const expected = Array.isArray(c.status) ? c.status : [c.status];
  // redirect: 'manual' — Pages' 301/308 canonicalisation is part of what we
  // assert, so following it would hide it.
  let res;
  try {
    res = await fetch(url, { redirect: 'manual' });
  } catch (e) {
    return { url, ok: false, why: `request failed: ${e.message}` };
  }
  const ct = res.headers.get('content-type') || '';
  const fails = [];

  if (!expected.includes(res.status)) fails.push(`status ${res.status}, want ${expected.join('|')}`);
  if (c.type && !ct.toLowerCase().includes(c.type.toLowerCase()) && res.status < 300) {
    fails.push(`content-type "${ct}", want ~"${c.type}"`);
  }
  if (c.notHtml && ct.toLowerCase().includes('text/html')) {
    fails.push(`content-type is text/html ("${ct}") — asset miss must not be HTML`);
  }
  if (c.marker && res.status !== 301 && res.status !== 308) {
    const body = await res.text().catch(() => '');
    if (!body.includes(c.marker)) fails.push(`body missing marker "${c.marker}"`);
  }
  return {
    url,
    ok: fails.length === 0,
    why: fails.join('; '),
    detail: `${res.status} ${ct || '-'}`,
  };
}

/**
 * Refuse to report on a server that is not this site. Port 8788 (wrangler's
 * default) is easily occupied by an unrelated local dev server, and probing it
 * produces a page of confident, meaningless FAILs.
 */
async function preflight(base) {
  let res, body;
  try {
    res = await fetch(base + '/', { redirect: 'follow' });
    body = await res.text();
  } catch (e) {
    console.error(`\nCannot reach ${base} — ${e.message}`);
    console.error('Start the local runtime first:');
    console.error('  npx wrangler pages dev . --port 8899 --ip 127.0.0.1\n');
    process.exit(2);
  }
  if (res.status !== 200 || !body.includes('asaptic')) {
    console.error(`\n${base}/ returned ${res.status} and does not look like asaptic-web.`);
    console.error('Refusing to run: this is some other server. Check the port.\n');
    process.exit(2);
  }
}

async function runMatrix() {
  await preflight(BASE);
  console.log(`\nProbing ${BASE}\n${'='.repeat(78)}`);
  let pass = 0;
  const failures = [];

  for (const [label, cases] of [['KNOWN-GOOD', GOOD], ['KNOWN-BAD (must 404)', BAD]]) {
    console.log(`\n--- ${label} (${cases.length} cases) ---`);
    for (const c of cases) {
      const r = await probe(BASE, c);
      if (r.ok) {
        pass++;
        console.log(`  PASS  ${c.path.padEnd(44)} ${r.detail}`);
      } else {
        failures.push(r);
        console.log(`  FAIL  ${c.path.padEnd(44)} ${r.why}`);
      }
    }
  }

  const total = GOOD.length + BAD.length;
  console.log(`\n${'='.repeat(78)}`);
  console.log(`${pass}/${total} passed  (known-good ${GOOD.length}, known-bad ${BAD.length})`);
  if (failures.length) {
    console.log(`\n${failures.length} FAILURES:`);
    for (const f of failures) console.log(`  ${f.url}\n     ${f.why}`);
    process.exit(1);
  }
  console.log('All cases passed.\n');
}

// ---------------------------------------------------------------------------
// Offline mode: which asset references in the HTML resolve to a real file?
// Before the fix these all "worked" (200 + homepage HTML); after it they 404
// honestly. This lists any that would newly show up as 404 in a monitor.
// ---------------------------------------------------------------------------

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === '.git' || e === 'node_modules' || e === '.wrangler') continue;
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (e.endsWith('.html')) out.push(p);
  }
  return out;
}

function auditRefs() {
  const files = walk(ROOT);
  const missing = new Map(); // resolved path -> [referring files]
  const re = /(?:href|src)="([^"]+\.(?:css|js|mjs|json|png|jpg|jpeg|svg|webp|woff2?|xml|txt|pdf))(?:\?[^"]*)?"/gi;

  for (const f of files) {
    const html = readFileSync(f, 'utf8');
    for (const m of html.matchAll(re)) {
      const ref = m[1];
      if (/^(https?:)?\/\//i.test(ref) || ref.startsWith('data:') || ref.startsWith('mailto:')) continue;
      const target = ref.startsWith('/')
        ? join(ROOT, ref)
        : resolve(dirname(f), ref);
      if (!existsSync(target)) {
        const key = '/' + relative(ROOT, target);
        if (!missing.has(key)) missing.set(key, []);
        missing.get(key).push('/' + relative(ROOT, f));
      }
    }
  }

  console.log(`\nStatic asset-reference audit — ${files.length} HTML files scanned`);
  console.log('='.repeat(78));
  if (missing.size === 0) {
    console.log('No referenced asset resolves to a missing file.');
    console.log('=> No page loses a working asset when misses start returning 404.\n');
    return;
  }
  console.log(`${missing.size} referenced asset(s) do not exist:\n`);
  for (const [target, refs] of [...missing].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${target}  <- ${refs.length} page(s), e.g. ${refs[0]}`);
  }
  console.log('\nThese were ALREADY broken (a browser rejects text/html served as');
  console.log('CSS/JS under nosniff). After the fix they report 404 instead of 200.\n');
}

// ---------------------------------------------------------------------------
// Sitemap sweep: every URL Google is told to index must still answer 200.
// This is the real SEO risk of the fix — before it, a sitemap URL whose file
// had been deleted still returned 200 (soft-404). After it, it returns a hard
// 404. Anything this reports is a URL to remove from the sitemap (or restore),
// not a reason to keep the catch-all.
// ---------------------------------------------------------------------------

async function auditSitemaps() {
  const locs = new Set();
  for (const f of readdirSync(ROOT).filter((x) => /^sitemap.*\.xml$/.test(x))) {
    const xml = readFileSync(join(ROOT, f), 'utf8');
    for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
      let u = m[1].trim();
      if (/\.xml$/.test(u)) continue; // sitemap-index entries
      try {
        locs.add(new URL(u).pathname);
      } catch { /* ignore malformed */ }
    }
  }
  const paths = [...locs].sort();
  console.log(`\nSitemap sweep — ${paths.length} unique URLs against ${BASE}`);
  console.log('='.repeat(78));

  const bad = [];
  const CONCURRENCY = 24;
  let done = 0;
  const queue = paths.slice();

  async function worker() {
    for (;;) {
      const p = queue.shift();
      if (p === undefined) return;
      try {
        // redirect: 'follow' — a 308 to the canonical form is a healthy URL.
        const res = await fetch(BASE + p, { redirect: 'follow', method: 'GET' });
        if (res.status !== 200) bad.push(`${res.status}  ${p}`);
        await res.arrayBuffer().catch(() => {});
      } catch (e) {
        bad.push(`ERR  ${p}  (${e.message})`);
      }
      if (++done % 500 === 0) console.log(`  ...${done}/${paths.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`\nchecked ${paths.length}, non-200: ${bad.length}`);
  if (bad.length) {
    for (const b of bad.sort().slice(0, 60)) console.log(`  ${b}`);
    if (bad.length > 60) console.log(`  ...and ${bad.length - 60} more`);
    process.exit(1);
  }
  console.log('Every sitemap URL still returns 200. No indexed URL starts 404ing.\n');
}

if (argv.includes('--audit-refs')) auditRefs();
else if (argv.includes('--audit-sitemaps')) await auditSitemaps();
else await runMatrix();
