#!/usr/bin/env node
// build_feeds.mjs — zero-dependency Atom/RSS generator for the Asaptic public tender feed.
//
// Reads the sanitized public feed (asaptic.com/tender/rows.json OR a local fixture path)
// and emits syndication surfaces into an output dir (default: feeds/out, gitignored):
//   all.atom.xml, <market>.atom.xml (one per market), all.rss.xml
//
// HARD RULES (see MERGE_NOTES_feeds.md):
//   * ONLY the 11 public fields are ever read. No ref / issuer / real closing date / source link.
//   * Closing state is expressed ONLY as closing_bucket (never a real date -> would recover deadlines).
//   * Entry links point to the canonical host asaptic.com/tender, never a source portal.
//   * deadline_passed opportunities are excluded (feeds carry ACTIVE opportunities only).
//   * All entity content is XML-escaped.
//
// Usage:
//   node feeds/build_feeds.mjs                         # fetch live feed -> feeds/out
//   node feeds/build_feeds.mjs path/to/rows.json       # local fixture   -> feeds/out
//   node feeds/build_feeds.mjs <src> --out <dir>       # choose output dir
//   import { buildFeeds } from './build_feeds.mjs'      # programmatic (tests)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_SRC = 'https://asaptic.com/tender/rows.json';
const CANONICAL_LINK = 'https://asaptic.com/tender';
const FEEDS_BASE = 'https://asaptic.com/feeds';

// The ONLY fields a feed entry may ever read from a row. Anything else on a row
// (a source ref, an issuer, a real closing date) is dropped on the floor here.
export const PUBLIC_FIELDS = [
  'asaptic_id', 'market', 'category', 'summary_zh', 'value_band',
  'closing_bucket', 'lead_ok', 'new_this_issue', 'sort_key',
  'summary_en', 'summary_zht',
];

const MARKET_NAMES = {
  HK: 'Hong Kong', SG: 'Singapore', MO: 'Macau', GB: 'United Kingdom',
  AU: 'Australia', CA: 'Canada', EU: 'European Union',
};

// Concise, deadline-safe closing labels (bucket only — never a real date).
const BUCKET_LABEL = {
  le_2w: 'Closing in ≤2 weeks',
  '2_4w': 'Closing in 2–4 weeks',
  gt_4w: 'Closing in >4 weeks',
};

const BAND_LABEL = {
  lt_500k: '<HK$0.5M', '500k_2m': 'HK$0.5–2M',
  '2m_10m': 'HK$2–10M', gt_10m: '>HK$10M',
};

// --- helpers -----------------------------------------------------------------

// XML 1.0 forbids most control characters entirely — they cannot be represented
// even as numeric entities. A stray \x00 / \x0B / \x0C (paste artifacts, bad
// upstream data) would otherwise produce non-well-formed output that every feed
// reader rejects. Strip anything outside the legal Char production before escaping.
// Legal: #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF].
const XML_ILLEGAL = /[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;

export function xmlEscape(s) {
  return String(s ?? '')
    .replace(XML_ILLEGAL, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function rfc822(iso) {
  const d = new Date(iso);
  return isNaN(d) ? new Date(0).toUTCString() : d.toUTCString();
}

export function isActive(row) {
  return row && row.closing_bucket !== 'deadline_passed';
}

// Project a raw row onto the public-field allowlist. This is the single choke
// point that guarantees a forbidden field on an input row cannot reach output.
export function pickPublic(row) {
  const out = {};
  for (const k of PUBLIC_FIELDS) if (k in row) out[k] = row[k];
  return out;
}

function entryTitle(r) {
  const cat = r.category?.name_en || 'Tender';
  const mkt = MARKET_NAMES[r.market] || r.market || '';
  const band = r.value_band ? BAND_LABEL[r.value_band] : '';
  return [cat, mkt, band].filter(Boolean).join(' · ');
}

function entryContent(r) {
  const parts = [r.summary_en || r.summary_zh || ''];
  const cw = BUCKET_LABEL[r.closing_bucket];
  if (cw) parts.push(cw + '.');
  if (r.value_band) parts.push('Estimated value ' + BAND_LABEL[r.value_band] + '.');
  parts.push('Market: ' + (MARKET_NAMES[r.market] || r.market) + '.');
  return parts.filter(Boolean).join(' ');
}

const urn = (id) => `urn:asaptic:tender:${id}`;

// --- renderers ---------------------------------------------------------------

function renderAtom({ rows, generated, issueId, selfName, titleSuffix }) {
  const upd = generated || new Date().toISOString();
  const feedId = `urn:asaptic:tender:feed:${selfName.replace(/\.atom\.xml$/, '')}`;
  const entries = rows.map((r) => {
    const c = entryContent(r);
    return [
      '  <entry>',
      `    <title>${xmlEscape(entryTitle(r))}</title>`,
      `    <id>${xmlEscape(urn(r.asaptic_id))}</id>`,
      `    <link href="${xmlEscape(CANONICAL_LINK)}" rel="alternate" type="text/html"/>`,
      `    <updated>${xmlEscape(upd)}</updated>`,
      `    <category term="${xmlEscape(r.category?.name_en || 'Tender')}"/>`,
      `    <summary type="text">${xmlEscape(r.summary_en || r.summary_zh || '')}</summary>`,
      `    <content type="text">${xmlEscape(c)}</content>`,
      '  </entry>',
    ].join('\n');
  }).join('\n');
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <title>Asaptic Tenders — ${xmlEscape(titleSuffix)}</title>`,
    '  <subtitle>Sanitized weekly public-sector tender listings (asaptic.tender.v1)</subtitle>',
    `  <id>${xmlEscape(feedId)}</id>`,
    `  <link href="${xmlEscape(CANONICAL_LINK)}" rel="alternate" type="text/html"/>`,
    `  <link href="${xmlEscape(FEEDS_BASE + '/' + selfName)}" rel="self" type="application/atom+xml"/>`,
    `  <updated>${xmlEscape(upd)}</updated>`,
    issueId ? `  <generator uri="https://asaptic.com/feeds" version="${xmlEscape(issueId)}">asaptic-feeds</generator>` : '  <generator uri="https://asaptic.com/feeds">asaptic-feeds</generator>',
    '  <author><name>Asaptic</name></author>',
    '  <rights>Sanitized listing metadata. Terms: https://asaptic.com/legal/terms</rights>',
    entries,
    '</feed>',
    '',
  ].join('\n');
}

function renderRss({ rows, generated, selfName, titleSuffix }) {
  const build = rfc822(generated);
  const items = rows.map((r) => [
    '    <item>',
    `      <title>${xmlEscape(entryTitle(r))}</title>`,
    `      <link>${xmlEscape(CANONICAL_LINK)}</link>`,
    `      <guid isPermaLink="false">${xmlEscape(urn(r.asaptic_id))}</guid>`,
    `      <category>${xmlEscape(r.category?.name_en || 'Tender')}</category>`,
    `      <description>${xmlEscape(entryContent(r))}</description>`,
    `      <pubDate>${xmlEscape(build)}</pubDate>`,
    '    </item>',
  ].join('\n')).join('\n');
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>Asaptic Tenders — ${xmlEscape(titleSuffix)}</title>`,
    `    <link>${xmlEscape(CANONICAL_LINK)}</link>`,
    '    <description>Sanitized weekly public-sector tender listings (asaptic.tender.v1)</description>',
    `    <atom:link href="${xmlEscape(FEEDS_BASE + '/' + selfName)}" rel="self" type="application/rss+xml"/>`,
    `    <lastBuildDate>${xmlEscape(build)}</lastBuildDate>`,
    '    <generator>asaptic-feeds</generator>',
    items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}

// --- core --------------------------------------------------------------------

// Returns { files: { name -> xmlString }, activeCount, markets }
export function buildFeeds(feed) {
  const generated = feed.generated || new Date().toISOString();
  const issueId = feed.issue_id || feed.issue || '';
  const raw = Array.isArray(feed) ? feed : (feed.rows || feed.data || []);
  const active = raw.filter(isActive).map(pickPublic);

  const markets = [...new Set(active.map((r) => r.market).filter(Boolean))].sort();
  const files = {};

  files['all.atom.xml'] = renderAtom({ rows: active, generated, issueId, selfName: 'all.atom.xml', titleSuffix: 'All markets' });
  files['all.rss.xml'] = renderRss({ rows: active, generated, selfName: 'all.rss.xml', titleSuffix: 'All markets' });

  for (const m of markets) {
    const rows = active.filter((r) => r.market === m);
    const name = `${m.toLowerCase()}.atom.xml`;
    files[name] = renderAtom({
      rows, generated, issueId, selfName: name,
      titleSuffix: MARKET_NAMES[m] || m,
    });
  }
  return { files, activeCount: active.length, markets };
}

async function loadSource(src) {
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`fetch ${src} -> HTTP ${res.status}`);
    return res.json();
  }
  return JSON.parse(fs.readFileSync(src, 'utf8'));
}

async function main() {
  const args = process.argv.slice(2);
  let src = DEFAULT_SRC;
  let out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') out = args[++i];
    else if (!args[i].startsWith('--')) src = args[i];
  }
  const feed = await loadSource(src);
  const { files, activeCount, markets } = buildFeeds(feed);
  fs.mkdirSync(out, { recursive: true });
  for (const [name, xml] of Object.entries(files)) {
    fs.writeFileSync(path.join(out, name), xml);
  }
  console.log(`[build_feeds] source=${src}`);
  console.log(`[build_feeds] active=${activeCount} markets=${markets.join(',')}`);
  console.log(`[build_feeds] wrote ${Object.keys(files).length} files -> ${out}`);
}

// Run only when invoked directly (not on import).
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error('[build_feeds] ERROR', e.message); process.exit(1); });
}
