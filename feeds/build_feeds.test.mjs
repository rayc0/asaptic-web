// build_feeds.test.mjs — node --test suite for the syndication generator + sentinel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFeeds, pickPublic, PUBLIC_FIELDS } from './build_feeds.mjs';
import { scanPaths } from './sentinel.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, 'fixtures', 'rows.sample.json');
const feed = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

// --- minimal zero-dep XML well-formedness checker ---------------------------
const ENTITY = /&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g;
function checkText(t) {
  assert.ok(!t.includes('<'), 'bare < in text');
  const bare = t.replace(ENTITY, '');
  assert.ok(!bare.includes('&'), 'unescaped & in text: ' + t.slice(0, 40));
}
function parseXml(xml) {
  let s = xml.replace(/^<\?xml[^>]*\?>\s*/, '');
  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
  const stack = [];
  let last = 0, m, tags = 0;
  while ((m = tagRe.exec(s))) {
    checkText(s.slice(last, m.index));
    last = tagRe.lastIndex;
    const [, close, name, , self] = m;
    tags++;
    if (close) {
      const top = stack.pop();
      assert.equal(name, top, `close </${name}> vs <${top}>`);
    } else if (!self) stack.push(name);
  }
  checkText(s.slice(last));
  assert.equal(stack.length, 0, 'unclosed: ' + stack.join(','));
  return { tags };
}
const count = (s, sub) => s.split(sub).length - 1;

// --- build once -------------------------------------------------------------
const { files, activeCount, markets } = buildFeeds(feed);

test('active count excludes deadline_passed', () => {
  assert.equal(activeCount, 4);
  assert.deepEqual(markets, ['HK', 'MO', 'SG']);
});

test('emits all + rss + one file per active market', () => {
  const names = Object.keys(files).sort();
  assert.deepEqual(names, ['all.atom.xml', 'all.rss.xml', 'hk.atom.xml', 'mo.atom.xml', 'sg.atom.xml']);
});

test('every emitted file is well-formed XML', () => {
  for (const [name, xml] of Object.entries(files)) {
    assert.ok(parseXml(xml).tags > 0, name);
  }
});

test('entry / item counts equal active rows', () => {
  assert.equal(count(files['all.atom.xml'], '<entry>'), 4);
  assert.equal(count(files['all.rss.xml'], '<item>'), 4);
  assert.equal(count(files['hk.atom.xml'], '<entry>'), 2);
  assert.equal(count(files['sg.atom.xml'], '<entry>'), 1);
  assert.equal(count(files['mo.atom.xml'], '<entry>'), 1);
});

test('deadline_passed opportunity is fully excluded', () => {
  for (const xml of Object.values(files)) {
    assert.ok(!xml.includes('AT-TEST-0004-004'), 'closed id leaked');
    assert.ok(!xml.includes('has closed'), 'closed summary leaked');
  }
});

test('output carries ONLY allowed public fields — no forbidden keys/terms', () => {
  const forbidden = ['ref', 'issuer', 'department', 'closing_date', 'gebiz', 'sort_key', 'source_url'];
  const joined = Object.values(files).join('\n');
  for (const f of forbidden) assert.ok(!new RegExp('\\b' + f + '\\b', 'i').test(joined), 'forbidden term present: ' + f);
  // sort_key value never emitted
  assert.ok(!joined.includes('a1b2c3d4e5f6'), 'sort_key hash leaked');
  // banned procurement acronym never present
  assert.ok(!new RegExp(['P', 'C', 'M', 'S'].join(''), 'i').test(joined), 'banned acronym present');
});

test('no real date leaks — only the feed generated timestamp appears', () => {
  for (const xml of Object.values(files)) {
    for (const m of xml.matchAll(/\d{4}-\d{2}-\d{2}/g)) {
      assert.equal(m[0], '2026-08-10', 'stray date: ' + m[0]);
    }
  }
});

test('entities are escaped (& < >) in content and titles', () => {
  const atom = files['all.atom.xml'];
  assert.ok(atom.includes('&amp;'), 'ampersand not escaped');
  assert.ok(atom.includes('&lt;'), 'lt not escaped');
  assert.ok(atom.includes('&gt;HK$10M'), 'gt in value band not escaped');
});

test('all entry links point only to the canonical host', () => {
  const joined = Object.values(files).join('\n');
  const hosts = new Set([...joined.matchAll(/https?:\/\/([^/"<\s]+)/g)].map((m) => m[1]));
  for (const h of hosts) {
    assert.ok(h === 'asaptic.com' || h === 'www.w3.org', 'non-canonical host: ' + h);
  }
});

test('committed samples on disk are current (regenerated build)', () => {
  for (const [name, xml] of Object.entries(files)) {
    const p = path.join(HERE, 'samples', name);
    assert.ok(fs.existsSync(p), 'missing sample: ' + name);
    assert.equal(fs.readFileSync(p, 'utf8'), xml, 'stale sample: ' + name + ' — re-run build to samples');
  }
});

// --- generator field-stripping self-test ------------------------------------
test('a forbidden field on an input row never reaches output', () => {
  const dirty = JSON.parse(JSON.stringify(feed));
  dirty.rows[0].ref = 'ZZ-REF-9999/2026';
  dirty.rows[0].issuer = 'Secret Procuring Department';
  dirty.rows[0].closing_date = '2099-12-31';
  dirty.rows[0].source_url = 'https://some-source-portal.example/notice/123';
  const built = buildFeeds(dirty);
  const joined = Object.values(built.files).join('\n');
  for (const leak of ['ZZ-REF-9999', 'Secret Procuring Department', '2099-12-31', 'some-source-portal']) {
    assert.ok(!joined.includes(leak), 'leaked forbidden field value: ' + leak);
  }
  // pickPublic keeps only the allowlist
  assert.deepEqual(Object.keys(pickPublic(dirty.rows[0])).sort(), [...PUBLIC_FIELDS].sort());
});

// --- sentinel -------------------------------------------------------------
test('sentinel reports the committed surfaces clean', () => {
  assert.deepEqual(scanPaths(), []);
});

test('sentinel self-test: a dirty fixture trips it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-'));
  const bad = ['P', 'C', 'M', 'S'].join('') + ' notice ' + ['AT', 'ZZ', '9999', '999'].join('-') + ' body';
  fs.writeFileSync(path.join(dir, 'dirty.txt'), bad);
  const v = scanPaths([dir]);
  const kinds = new Set(v.map((x) => x.kind));
  assert.ok(kinds.has('banned-acronym'), 'acronym not caught');
  assert.ok(kinds.has('non-test-id'), 'real id not caught');
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- dataset page JSON-LD ---------------------------------------------------
test('data/index.html has valid Dataset JSON-LD and is indexable', () => {
  const html = fs.readFileSync(path.join(HERE, '..', 'data', 'index.html'), 'utf8');
  assert.ok(!/noindex/i.test(html), 'dataset page must be indexable');
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(m, 'no JSON-LD block');
  const ld = JSON.parse(m[1]);
  assert.equal(ld['@type'], 'Dataset');
  for (const k of ['name', 'description', 'license', 'creator', 'distribution']) {
    assert.ok(ld[k], 'missing Dataset field: ' + k);
  }
  assert.ok(Array.isArray(ld.distribution) && ld.distribution.length >= 2, 'need rows.json + feed distributions');
  const urls = JSON.stringify(ld.distribution);
  assert.ok(urls.includes('rows.json'), 'distribution missing rows.json');
  assert.ok(urls.includes('all.atom.xml'), 'distribution missing atom feed');
  assert.equal(ld.creator?.name || ld.creator, 'Asaptic');
});
