import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as S from './scout.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const FEED = [
  { asaptic_id: 'AT-SG-2632-609', market: 'SG', category: { name_en: 'Lab & scientific', name_zh: '实验室', name_zht: '實驗室' }, summary_zh: '显微镜', summary_zht: '顯微鏡', summary_en: 'Microscopes', value_band: null, closing_bucket: 'le_2w', lead_ok: false, new_this_issue: true, sort_key: 'a' },
  { asaptic_id: 'AT-GB-2628-010', market: 'GB', category: { name_en: 'Other', name_zh: '其他', name_zht: '其他' }, summary_zh: '培训', summary_zht: '培訓', summary_en: 'Training', value_band: null, closing_bucket: 'gt_4w', lead_ok: true, new_this_issue: false, sort_key: 'b' },
  { asaptic_id: 'AT-HK-2600-001', market: 'HK', category: { name_en: 'Vehicles', name_zh: '车辆', name_zht: '車輛' }, summary_zh: '车', summary_zht: '車', summary_en: 'Vehicle', value_band: 'mid', closing_bucket: 'deadline_passed', lead_ok: false, new_this_issue: false, sort_key: 'c' }
];

test('deadline_passed excluded by default', () => {
  const active = S.activeRows(FEED);
  assert.equal(active.length, 2);
  assert.ok(!active.some((r) => r.closing_bucket === 'deadline_passed'));
  assert.ok(!S.isActive(FEED[2]));
});

test('pack add / remove / dedupe', () => {
  let p = [];
  p = S.addToPack(p, 'AT-SG-2632-609');
  p = S.addToPack(p, 'AT-SG-2632-609'); // dup ignored
  p = S.addToPack(p, 'AT-GB-2628-010');
  assert.deepEqual(p, ['AT-SG-2632-609', 'AT-GB-2628-010']);
  p = S.removeFromPack(p, 'AT-SG-2632-609');
  assert.deepEqual(p, ['AT-GB-2628-010']);
  p = S.togglePack(p, 'AT-GB-2628-010');
  assert.deepEqual(p, []);
  assert.deepEqual(S.normalizePack(['AT-HK-1-1', 'AT-HK-1-1', 'bad', 'AT-XX-2-2']), ['AT-HK-1-1', 'AT-XX-2-2']);
  assert.deepEqual(S.addToPack([], 'not-an-id'), []); // invalid rejected
});

test('localStorage round-trip', () => {
  const store = (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }; })();
  const pack = ['AT-SG-2632-609', 'AT-GB-2628-010', 'AT-SG-2632-609'];
  S.savePack(store, pack);
  assert.deepEqual(S.loadPack(store), ['AT-SG-2632-609', 'AT-GB-2628-010']);
  const empty = { getItem: () => null, setItem: () => {} };
  assert.deepEqual(S.loadPack(empty), []);
});

test('share-URL encode/decode round-trip', () => {
  const ids = ['AT-SG-2632-609', 'AT-GB-2628-010', 'AT-EU-2630-156'];
  const enc = S.encodePack(ids);
  assert.ok(enc.startsWith('pack='));
  assert.deepEqual(S.decodePack('#' + enc), ids);
  assert.deepEqual(S.decodePack(enc), ids);              // no leading #
  assert.deepEqual(S.decodePack('#pack=%%%bogus'), []);   // garbage → empty
  assert.deepEqual(S.decodePack(''), []);
  const url = S.buildShareUrl('https://asaptic.com', '/scout/', ids);
  assert.equal(url, 'https://asaptic.com/scout/#' + enc);
  assert.equal(S.buildShareUrl('https://asaptic.com', '/scout/', []), 'https://asaptic.com/scout/');
});

test('CTA URL builds with AT-ids, src=scout_pack', () => {
  const url = S.buildCtaUrl(['AT-SG-2632-609', 'AT-GB-2628-010', 'bad', 'AT-SG-2632-609']);
  assert.ok(url.startsWith('https://portal.asaptic.com/register.html?'));
  const u = new URL(url);
  assert.equal(u.searchParams.get('src'), 'scout_pack');
  assert.equal(u.searchParams.get('ids'), 'AT-SG-2632-609,AT-GB-2628-010'); // deduped, invalid dropped
  // empty pack still routes with src
  assert.equal(new URL(S.buildCtaUrl([])).searchParams.get('src'), 'scout_pack');
  assert.equal(new URL(S.buildCtaUrl([])).searchParams.get('ids'), null);
});

test('cardFields emits ONLY the 11-public-field-derived values, never internal data', () => {
  // Row spiked with forbidden internal fields — must never surface.
  const dirty = { ...FEED[0], ref: 'A3701002024', issuer: 'Government Logistics Dept', closing_date: '2026-06-23', tender_no: 'PCMS-999' };
  const pub = S.pickPublic(dirty);
  for (const k of Object.keys(pub)) assert.ok(S.PUBLIC_FIELDS.includes(k), 'leaked field: ' + k);
  assert.ok(!('ref' in pub) && !('issuer' in pub) && !('closing_date' in pub) && !('tender_no' in pub));
  const card = S.cardFields(dirty, 'en');
  const blob = JSON.stringify(card);
  assert.ok(!/A3701002024|Logistics|2026-06-23|PCMS/i.test(blob), 'internal data leaked into card');
  assert.deepEqual(card.fields.map((f) => f.key).sort(), ['category', 'closing_bucket', 'lead_ok', 'market', 'summary', 'value_band']);
  assert.equal(S.summaryFor(FEED[0], 'zht'), '顯微鏡');
});

test('hostile summary passes through as inert text (XSS guard verified in DOM builder)', () => {
  const hostile = '<img src=x onerror=alert(1)><script>alert(2)</script>';
  const row = { ...FEED[0], summary_en: hostile };
  const card = S.cardFields(row, 'en');
  const sumField = card.fields.find((f) => f.key === 'summary');
  assert.equal(sumField.value, hostile); // unchanged raw string — DOM layer sets it via textContent
  // Prove the page never uses innerHTML on feed data.
  const html = readFileSync(join(HERE, 'index.html'), 'utf8');
  assert.ok(!/\.innerHTML\s*=/.test(html), 'index.html assigns innerHTML — XSS risk');
  assert.ok(/textContent/.test(html), 'index.html must render via textContent');
});

test('sentinel scanner self-test: catches forbidden token + real ids, passes clean source', () => {
  assert.deepEqual(S.sentinelScan('clean AT-TEST-1-1 sourcing scout'), []);
  const bad = S.sentinelScan('uses PCMS and AT-HK-2600-001');
  assert.ok(bad.includes('forbidden-token:PCMS'));
  assert.ok(bad.includes('hardcoded-real-id:AT-HK-2600-001'));
  // Scan the actual shipped source files.
  for (const f of ['scout.mjs', 'index.html', 'scout.test.mjs']) {
    // test file legitimately contains real-shaped ids for fixtures; scan only ships-to-browser files.
    if (f === 'scout.test.mjs') continue;
    const v = S.sentinelScan(readFileSync(join(HERE, f), 'utf8'));
    assert.deepEqual(v, [], f + ' sentinel violations: ' + v.join(', '));
  }
});
