#!/usr/bin/env node
// sentinel.mjs — leak scanner for the committed syndication surfaces.
//
// Scans feeds/ (committed) + data/ for:
//   1. the banned procurement-system acronym (never allowed on any public surface)
//   2. asaptic ids that are NOT AT-TEST-* (real market-coded ids must never sit in
//      committed samples/docs — only the AT-TEST-* placeholders may)
//
// The banned acronym is assembled at runtime so this scanner source can itself
// pass its own scan. Importable as scanPaths(paths) for the self-test.
//
// Usage:  node feeds/sentinel.mjs            # scan committed surfaces, exit 1 on any hit
//         node feeds/sentinel.mjs <path...>  # scan explicit paths (used by tests)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

// banned acronym, built so the literal never appears in this file
const BANNED_ACRONYM = ['P', 'C', 'M', 'S'].join('');

// Anything under these is NEVER scanned (build output + local deps).
const SKIP_DIRS = new Set(['out', 'node_modules', '.git', '.wrangler']);

// Default committed surfaces to guard.
const DEFAULT_TARGETS = [
  path.join(HERE),          // feeds/  (samples, fixtures, code, notes)
  path.join(REPO, 'data'),  // data/   (dataset page)
  path.join(REPO, 'MERGE_NOTES_feeds.md'),
];

const ID_RE = /\bAT-[A-Z]{2,}-\d+-\d+\b/g;

function* walk(target) {
  let st;
  try { st = fs.statSync(target); } catch { return; }
  if (st.isDirectory()) {
    if (SKIP_DIRS.has(path.basename(target))) return;
    for (const name of fs.readdirSync(target)) yield* walk(path.join(target, name));
  } else if (st.isFile()) {
    yield target;
  }
}

function scanText(text) {
  const hits = [];
  if (new RegExp(BANNED_ACRONYM, 'i').test(text)) {
    hits.push({ kind: 'banned-acronym' });
  }
  for (const m of text.matchAll(ID_RE)) {
    if (!m[0].startsWith('AT-TEST-')) hits.push({ kind: 'non-test-id', value: m[0] });
  }
  return hits;
}

// Returns [{ file, kind, value? }, ...]
export function scanPaths(targets = DEFAULT_TARGETS) {
  const violations = [];
  for (const t of targets) {
    for (const file of walk(t)) {
      let text;
      try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
      for (const h of scanText(text)) violations.push({ file, ...h });
    }
  }
  return violations;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const targets = process.argv.slice(2);
  const v = scanPaths(targets.length ? targets : DEFAULT_TARGETS);
  if (v.length) {
    console.error(`[sentinel] ${v.length} violation(s):`);
    for (const x of v) console.error(`  ${x.kind}${x.value ? ' ' + x.value : ''} :: ${x.file}`);
    process.exit(1);
  }
  console.log('[sentinel] clean — no forbidden tokens or non-AT-TEST ids');
}
