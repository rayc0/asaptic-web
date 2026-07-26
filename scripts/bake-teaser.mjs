#!/usr/bin/env node
/**
 * bake-teaser.mjs — inject real headline numbers from teaser.json into the
 * STATIC tender page HTML, so a cold fetch (crawler, link-unfurl, no-JS,
 * slow connection) shows real data instead of the "—" placeholder state.
 * The client-side fetch still runs and refreshes these on load (progressive
 * enhancement) — this just guarantees the page is never blank.
 *
 * Idempotent: replaces whatever text currently sits inside each placeholder.
 * Mirrors the page's own JS: ISO-week → issue no + "Week of <Monday>",
 * en-HK date formatting, total, gov/public split, "Updated <date>".
 *
 * Usage: node scripts/bake-teaser.mjs <page.html> <teaser.json>
 *   (the refresh pipeline calls it once per market after teaser rebuild)
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [page, teaserPath] = process.argv.slice(2);
if (!page || !teaserPath) {
  console.error('usage: bake-teaser.mjs <page.html> <teaser.json>');
  process.exit(1);
}

const t = JSON.parse(readFileSync(teaserPath, 'utf8'));

function isoWeekMonday(year, week) {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay() || 7;
  if (dow <= 4) simple.setUTCDate(simple.getUTCDate() - dow + 1);
  else simple.setUTCDate(simple.getUTCDate() + 8 - dow);
  return simple;
}
const fmt = (d, opts) => d.toLocaleDateString('en-HK', opts);

let issueNo = '', weekDate = '';
if (t.week && /^\d{4}-W\d{1,2}$/.test(t.week)) {
  const [y, w] = t.week.split('-W').map(Number);
  issueNo = String(w);
  weekDate = fmt(isoWeekMonday(y, w), { day: 'numeric', month: 'long', year: 'numeric' });
}
const total = t.total != null ? String(t.total) : '—';
const gov = t.sources && t.sources.government != null ? String(t.sources.government) : '—';
const pub = t.sources && t.sources.public_bodies != null ? String(t.sources.public_bodies) : '—';
const updated = t.generated ? 'Updated ' + fmt(new Date(t.generated), { year: 'numeric', month: 'short', day: 'numeric' }) : 'Updated —';

const vals = {
  'tw-issue-no': issueNo || '—',
  'tw-week-date': weekDate || '—',
  'tw-issue-total': total,
  'tw-total': total,
  'tw-gov': gov,
  'tw-pub': pub,
  'tw-updated': updated,
};

let html = readFileSync(page, 'utf8');
let n = 0;
for (const [id, val] of Object.entries(vals)) {
  // replace the text inside <tag id="ID" ...> ... </tag> (simple text nodes only)
  const re = new RegExp('(id="' + id + '"[^>]*>)[^<]*(<)');
  const before = html;
  html = html.replace(re, `$1${val}$2`);
  if (html !== before) n++;
}
writeFileSync(page, html);
console.log(`[bake] ${page}: baked ${n}/7 headline fields (issue ${issueNo || '—'}, total ${total}, updated ${updated.replace('Updated ', '')})`);
