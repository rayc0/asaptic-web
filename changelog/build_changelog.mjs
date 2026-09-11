#!/usr/bin/env node
// build_changelog.mjs — zero-dep changelog generator for the Asaptic tender feed.
//
// Reads the PUBLIC feed (rows.json) and, for the CURRENT issue, computes PER MARKET:
//   - new    = count of rows with new_this_issue === true
//   - active = count of rows that are NOT deadline-passed
// plus the issue_id and generated stamp copied straight from the feed.
//
// MOAT RULE (load-bearing): this generator publishes ONLY counts that are already
// derivable from the public feed. `new_this_issue` is a public per-row field and the
// active count is a public row filter. It NEVER copies withheld counts, corpus totals,
// ingest timestamps, or any cadence signal beyond the public generated/issue_id.
// latest.json is assembled from an explicit whitelist, so a new sensitive field added
// upstream cannot leak through.
//
// Usage:
//   node build_changelog.mjs                       # fetch https://asaptic.com/tender/rows.json
//   node build_changelog.mjs path/to/rows.json     # read a local fixture
//   node build_changelog.mjs --url https://…       # explicit URL
//   node build_changelog.mjs <src> --out <file>    # override output path (default changelog/data/latest.json)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_URL = "https://asaptic.com/tender/rows.json";
const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = resolve(HERE, "data", "latest.json");

// A row is "deadline passed" if either the boolean field is set (fixture style) or the
// public closing_bucket carries the "deadline_passed" sentinel (real feed style).
export function isDeadlinePassed(row) {
  return row.deadline_passed === true || row.closing_bucket === "deadline_passed";
}

// Pure core: given the parsed feed object, return the whitelisted latest.json payload.
// Only issue_id / generated / per-market new+active counts / summed totals are emitted.
export function computeChangelog(feed) {
  const rows = Array.isArray(feed) ? feed : feed && Array.isArray(feed.rows) ? feed.rows : null;
  if (!rows) throw new Error("feed has no rows array");

  const byMarket = new Map(); // market -> { new, active }
  for (const r of rows) {
    const market = r.market;
    if (market == null) continue;
    let cell = byMarket.get(market);
    if (!cell) { cell = { new: 0, active: 0 }; byMarket.set(market, cell); }
    if (r.new_this_issue === true) cell.new += 1;
    if (!isDeadlinePassed(r)) cell.active += 1;
  }

  const per_market = [...byMarket.entries()]
    .map(([market, c]) => ({ market, new: c.new, active: c.active }))
    .sort((a, b) => a.market.localeCompare(b.market));

  const totals = per_market.reduce(
    (t, m) => ({ new: t.new + m.new, active: t.active + m.active }),
    { new: 0, active: 0 }
  );

  // WHITELIST ONLY — never spread `feed`. issue_id / generated are the sole public stamps.
  return {
    issue_id: feed && feed.issue_id != null ? String(feed.issue_id) : null,
    generated: feed && feed.generated != null ? String(feed.generated) : null,
    per_market,
    totals,
  };
}

async function loadFeed(src) {
  if (src && !src.startsWith("http")) {
    return JSON.parse(await readFile(src, "utf8"));
  }
  const url = src || DEFAULT_URL;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`fetch ${url} -> HTTP ${res.status}`);
  return res.json();
}

function parseArgs(argv) {
  let src = null, out = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url" || a === "--src") src = argv[++i];
    else if (a === "--out") out = resolve(argv[++i]);
    else if (!a.startsWith("--")) src = a;
  }
  return { src, out };
}

async function main() {
  const { src, out } = parseArgs(process.argv.slice(2));
  const feed = await loadFeed(src);
  const payload = computeChangelog(feed);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(payload, null, 2) + "\n");
  const src_label = src ? src : DEFAULT_URL;
  process.stderr.write(
    `[changelog] issue ${payload.issue_id} · ${payload.per_market.length} markets · ` +
    `${payload.totals.new} new / ${payload.totals.active} active · from ${src_label} -> ${out}\n`
  );
}

// Run only when invoked directly (not when imported by the test file).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { process.stderr.write(`[changelog] ERROR: ${e.message}\n`); process.exit(1); });
}
