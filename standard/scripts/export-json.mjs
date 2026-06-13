#!/usr/bin/env node
// Machine-readable JSON export per comparison (GEO/AIO: lets AI engines + developers
// fetch clean structured compliance data). Additive — does not touch page generation.
// Writes standard/exports/<slug>.json + standard/exports/index.json.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA_DIR = join(ROOT, "standard/data");
const FRAG_DIR = join(ROOT, "standard/data/_fragments");
const OUT_DIR = join(ROOT, "standard/exports");
const SITE = "https://asaptic.com";

const readJson = (f) => JSON.parse(readFileSync(f, "utf8"));
const t = (o) => (o && (o.en ?? o)) || "";

function datasetFiles() {
  return readdirSync(DATA_DIR)
    .filter((f) => /^[^_].*\.v2026-06-11\.json$/.test(f))
    .sort();
}
function rowsFor(prefix, wrapperRows) {
  const rows = [...(wrapperRows || [])];
  if (prefix && existsSync(FRAG_DIR)) {
    for (const f of readdirSync(FRAG_DIR).filter((x) => x.startsWith(prefix) && x.endsWith(".json")).sort()) {
      try {
        const frag = readJson(join(FRAG_DIR, f));
        if (Array.isArray(frag)) rows.push(...frag);
      } catch { /* skip malformed */ }
    }
  }
  return rows;
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
const index = [];
let count = 0;

for (const file of datasetFiles()) {
  const d = readJson(join(DATA_DIR, file));
  const slug = d.slug || d.page?.slug;
  if (!slug) continue;
  const rows = rowsFor(d.fragment_prefix, d.rows).map((r) => ({
    id: r.id,
    requirement: t(r.requirement_topic),
    target_requirement: t(r.target_requirement?.summary),
    target_standards: r.target_requirement?.standards_or_laws || [],
    china_equivalent: t(r.cn_common_equivalent?.summary),
    china_standards: r.cn_common_equivalent?.standards_or_laws || [],
    gap: t(r.gap),
    mandatory_status: r.mandatory_status || null,
    verdict: t(r.compliance_verdict),
    source: r.source || null
  }));
  const out = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    dataset_id: d.dataset_id,
    title: t(d.page?.title),
    product: t(d.category?.labels),
    target_market: t(d.target_market_label),
    canonical_url: `${SITE}/standard/${slug}`,
    version: d.version,
    last_verified: d.last_verified,
    provenance: "AI-compiled, multi-model cross-checked, not human-verified. Informational only; confirm with the official regulator and a qualified professional. Not legal/certification/customs/market-access advice.",
    license: "https://creativecommons.org/licenses/by/4.0/",
    row_count: rows.length,
    rows
  };
  writeFileSync(join(OUT_DIR, `${slug}.json`), JSON.stringify(out, null, 2) + "\n");
  index.push({ slug, product: out.product, market: out.target_market, rows: rows.length, json: `${SITE}/standard/exports/${slug}.json`, page: out.canonical_url });
  count++;
}

writeFileSync(join(OUT_DIR, "index.json"), JSON.stringify({
  name: "Cross-Standard machine-readable export index",
  updated: readJson(join(DATA_DIR, "_index.json")).updated,
  provenance: "AI-compiled, not human-verified; informational only.",
  count,
  comparisons: index
}, null, 2) + "\n");

console.log(`export-json: wrote ${count} comparison JSON files + index.json to standard/exports/`);
