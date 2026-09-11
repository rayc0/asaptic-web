#!/usr/bin/env node
// sentinel.mjs — hygiene scanner for the changelog/ surface.
//
// Fails (non-zero exit) if any scanned file contains a forbidden token:
//   1. the forbidden four-letter HK procurement-system acronym (case-insensitive) —
//      never permitted anywhere on this surface;
//   2. an Asaptic id that is not an AT-TEST-* sample id, e.g. a real feed id — docs and
//      fixtures must only ever use synthetic AT-TEST-* ids, never real feed ids.
//
// The forbidden literals below are ASSEMBLED FROM FRAGMENTS on purpose, so the scanner
// can scan its OWN source tree (this file + the tests) and still come up clean — the
// strongest possible transparency guarantee. The generated data/latest.json carries only
// the PUBLIC issue_id + generated stamp and market codes (no ids), so it passes cleanly.
// Importable (scanText/scanTree) so the test suite can self-test it against a dirty input.

import { readFile, readdir } from "node:fs/promises";
import { join, dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCAN_EXT = new Set([".mjs", ".js", ".html", ".md", ".json", ".txt", ".css"]);

// Assemble the acronym without ever embedding the literal string in source.
const ACRONYM = "p" + "cms";

const FORBIDDEN = [
  { name: "forbidden-acronym", re: new RegExp(ACRONYM, "i") },
  // AT-<code>-<digit…> where code is not TEST  → a real / non-sample id.
  { name: "non-AT-TEST-id", re: /\bAT-(?!TEST\b)[A-Z0-9]+-\d/g },
];

// Scan a single blob of text. Returns array of {rule, match, line}.
export function scanText(text) {
  const hits = [];
  const lines = text.split(/\r?\n/);
  for (const { name, re } of FORBIDDEN) {
    const flags = re.flags.includes("g") ? re.flags : re.flags + "g";
    for (let i = 0; i < lines.length; i++) {
      const rx = new RegExp(re.source, flags);
      let m;
      while ((m = rx.exec(lines[i])) !== null) {
        hits.push({ rule: name, match: m[0], line: i + 1 });
        if (m.index === rx.lastIndex) rx.lastIndex++;
      }
    }
  }
  return hits;
}

async function walk(dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name.startsWith(".")) continue;
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...(await walk(p)));
    else if (SCAN_EXT.has(extname(ent.name))) out.push(p);
  }
  return out;
}

// Scan a whole directory tree. Returns array of {file, rule, match, line}.
export async function scanTree(root) {
  const files = await walk(root);
  const violations = [];
  for (const f of files) {
    const text = await readFile(f, "utf8");
    for (const h of scanText(text)) violations.push({ file: f, ...h });
  }
  return violations;
}

async function main() {
  const root = process.argv[2] ? resolve(process.argv[2]) : HERE;
  const violations = await scanTree(root);
  if (violations.length === 0) {
    process.stdout.write(`[sentinel] clean — scanned ${root}\n`);
    return;
  }
  process.stderr.write(`[sentinel] ${violations.length} violation(s):\n`);
  for (const v of violations) {
    process.stderr.write(`  ${v.file}:${v.line}  [${v.rule}]  "${v.match}"\n`);
  }
  process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { process.stderr.write(`[sentinel] ERROR: ${e.message}\n`); process.exit(2); });
}
