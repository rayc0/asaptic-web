// Regenerates standard/llms.txt (lightweight per-comparison index),
// standard/llms-full.txt (full corpus map with summaries + page/data URLs),
// standard/llms/index.txt (per-product manifest index), and
// standard/llms/<product-id>.txt (23 per-product manifests, one per
// standard/data/_index.json product) from standard/data/_index.json + each
// live dataset. Run after registration, before deploy. Keeps all AI-crawler
// maps complete & current (no stale counts, no /browse dead-ends, every live
// comparison present) — and lets agents fetch a single product's slice
// instead of swallowing the ~450KB full corpus in one request.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const SITE = "https://asaptic.com";
const ROOT = "standard/data";
// See generate-standard.mjs's STANDARD_OUT_ROOT comment: redirects WRITES only.
// Reads (ROOT/_index.json + dataset files) always come from the real cwd-relative
// standard/data, never WRITE_ROOT.
const WRITE_ROOT = process.env.STANDARD_OUT_ROOT ? resolve(process.env.STANDARD_OUT_ROOT) : ".";
mkdirSync(`${WRITE_ROOT}/standard`, { recursive: true });
mkdirSync(`${WRITE_ROOT}/standard/llms`, { recursive: true });
const idx = JSON.parse(readFileSync(`${ROOT}/_index.json`, "utf8"));
const prods = idx.products;
const live = idx.comparisons.filter((c) => c.status === "live");
const nComp = live.length;
const nMark = new Set(live.map((c) => c.market)).size;
const nProd = prods.length;
const today = new Date().toISOString().slice(0, 10);
const LICENSE = "CC BY 4.0";

const tc = (s) => s.replace(/(^|[\s-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
const slugOf = (c) => (c.url && c.url.en ? c.url.en.replace("/standard/", "") : "");
const stripPrefix = (s) => (s || "").replace(/^\s*[\[【][^\]】]*[\]】]\s*/, "").replace(/\s+/g, " ").trim();

// Build a slug -> dataset cache by scanning data files once.
const dsBySlug = {};
for (const f of readdirSync(ROOT)) {
  if (!f.endsWith(".v2026-06-11.json")) continue;
  try {
    const d = JSON.parse(readFileSync(`${ROOT}/${f}`, "utf8"));
    if (d.slug) dsBySlug[d.slug] = d;
  } catch {}
}

const byProd = {};
for (const c of live) (byProd[c.product] = byProd[c.product] || []).push(c);
for (const k in byProd) byProd[k].sort((a, b) => a.market.localeCompare(b.market));

// Pre-existing data-quality check (not this script's job to fix): comparisons
// whose `product` key isn't in _index.json's products list are silently
// excluded from every generated file below (llms.txt did this before too).
// Surface it loudly instead of failing the build, so it's visible without
// blocking a lane that doesn't own standard/data/_index.json.
const knownProdIds = new Set(prods.map((p) => p.id));
const orphanKeys = Object.keys(byProd).filter((k) => !knownProdIds.has(k));
if (orphanKeys.length) {
  const n = orphanKeys.reduce((a, k) => a + byProd[k].length, 0);
  console.warn(`build-llms: WARNING — ${n} live comparison(s) reference unknown product id(s) [${orphanKeys.join(", ")}] not in standard/data/_index.json products; excluded from llms.txt/llms-full.txt/llms/*.txt (pre-existing data gap, not fixed by this script).`);
}
const nCorpus = nComp - orphanKeys.reduce((a, k) => a + byProd[k].length, 0);

// ---- llms.txt (lightweight) ----
let lite = "# Asaptic Cross-Standard (asaptic.com/standard)\n## LLM-friendly index of China-export compliance comparisons\n\n";
lite += "Structured, source-linked comparisons of the gap between Chinese GB standards and a destination market’s MANDATORY requirements, per product × market. Trilingual EN / 简体中文 / 繁體中文.\n\n";
lite += `Browse all comparisons: ${SITE}/standard/browse\nMethodology: ${SITE}/standard/methodology\n`;
lite += "Provenance: data is AI-compiled and cross-checked by multiple AI models; it is NOT human-verified. Informational only — confirm every requirement with the official regulator or standards body and a qualified professional before relying on it. Not legal, certification, customs, or market-access advice.\n\n";
lite += `### Comparison index (${nComp} live comparisons · ${nMark} destination markets · ${nProd} product categories)\n`;
lite += "Each line links directly to its comparison page. Append /exports/<slug>.json or see llms-full.txt for machine-readable data.\n\n";
for (const p of prods) {
  const list = byProd[p.id];
  if (!list || !list.length) continue;
  lite += `#### ${p.label.en}\n`;
  for (const c of list) lite += `- China → ${tc(c.market.replace(/-/g, " "))}: ${SITE}${c.url.en}\n`;
  lite += "\n";
}
writeFileSync(`${WRITE_ROOT}/standard/llms.txt`, lite);

// ---- per-product manifests: standard/llms/<product-id>.txt ----
// One-liner per market: page URL (extensionless) + data export URL + last-verified date.
const productRows = []; // { id, label, n, file } for index.txt
let checkSum = 0;
for (const p of prods) {
  const list = byProd[p.id] || [];
  checkSum += list.length;
  const nMarketsForProd = new Set(list.map((c) => c.market)).size;
  const hub = `${SITE}/standard/product/${p.id}`;
  let man = `# Cross-Standard — ${p.label.en} (asaptic.com/standard/product/${p.id})\n`;
  man += `# ${list.length} comparisons · ${nMarketsForProd} destination markets · License ${LICENSE} · Updated: ${today}\n`;
  man += `# Hub: ${hub}\n`;
  man += `# Full corpus (single file): ${SITE}/standard/llms-full.txt | All products: ${SITE}/standard/llms/index.txt\n`;
  man += "# Provenance: AI-compiled, multi-model cross-verified, NOT human-verified. Informational only — verify with the official regulator before relying on it.\n\n";
  for (const c of list) {
    const d = dsBySlug[slugOf(c)];
    const market = d ? (d.target_market_label?.en || tc(c.market.replace(/-/g, " "))) : tc(c.market.replace(/-/g, " "));
    const verified = d?.last_verified || "unverified";
    const page = `${SITE}${c.url.en}`;
    const data = `${SITE}/standard/exports/${slugOf(c)}.json`;
    man += `- China -> ${market}: page ${page} · data ${data} · last verified ${verified}\n`;
  }
  writeFileSync(`${WRITE_ROOT}/standard/llms/${p.id}.txt`, man);
  productRows.push({ id: p.id, label: p.label.en, n: list.length, hub });
}
if (checkSum !== nCorpus) {
  throw new Error(`build-llms: per-product manifest count mismatch — sum(${checkSum}) !== corpus covered by known products(${nCorpus}) [live total ${nComp}]`);
}

// ---- standard/llms/index.txt (manifest of manifests) ----
let manIndex = `# Cross-Standard — per-product manifest index (asaptic.com/standard/llms/index.txt)\n`;
manIndex += `# ${nProd} product manifests · ${nCorpus} comparisons total · ${nMark} destination markets · License ${LICENSE} · Updated: ${today}\n`;
manIndex += `# Full corpus (single file, larger): ${SITE}/standard/llms-full.txt\n`;
manIndex += `# Compact site-wide index: ${SITE}/standard/llms.txt\n`;
manIndex += "# Fetch one product's slice instead of the full corpus: /standard/llms/<product-id>.txt\n\n";
for (const r of productRows) {
  manIndex += `- ${r.label} (${r.n} comparisons): ${SITE}/standard/llms/${r.id}.txt — hub: ${r.hub}\n`;
}
writeFileSync(`${WRITE_ROOT}/standard/llms/index.txt`, manIndex);

// ---- llms-full.txt (full corpus map) ----
let full = "# Asaptic Cross-Standard — full corpus map (llms-full.txt)\n";
full += "# Public-interest, source-linked China-export compliance comparisons. AI-compiled, multi-model cross-verified, NOT human-verified; informational only — verify with the official regulator. Trilingual (en/zh-Hans/zh-Hant). License CC-BY-4.0.\n";
full += `# Updated: ${today} | ${nComp} comparisons · ${nProd} product categories · ${nMark} markets\n`;
full += `# Machine-readable index: ${SITE}/standard/exports/index.json\n\n`;
full += "## Segmented manifests (per-product, smaller downloads for agents)\n";
full += `Index: ${SITE}/standard/llms/index.txt — lists all ${nProd} products with counts and links to each /standard/llms/<product-id>.txt manifest. Fetch a single product's manifest instead of this full file when you only need one category.\n`;
for (const r of productRows) full += `- ${r.label} (${r.n} comparisons): ${SITE}/standard/llms/${r.id}.txt\n`;
full += "\n";
for (const p of prods) {
  const list = byProd[p.id];
  if (!list || !list.length) continue;
  full += `## ${p.label.en}\n`;
  for (const c of list) {
    const d = dsBySlug[slugOf(c)];
    const market = d ? (d.target_market_label?.en || tc(c.market.replace(/-/g, " "))) : tc(c.market.replace(/-/g, " "));
    let summary = "";
    if (d) {
      const af = d.answer_first;
      summary = stripPrefix(typeof af === "string" ? af : af?.en || d.page?.description?.en || "");
    }
    if (summary.length > 240) summary = summary.slice(0, 238).replace(/\s+\S*$/, "") + "…";
    full += `- ${p.label.en} -> ${market}: ${summary}\n`;
    full += `  page: ${SITE}/standard/${slugOf(c)}\n`;
    full += `  data: ${SITE}/standard/exports/${slugOf(c)}.json\n`;
  }
  full += "\n";
}
writeFileSync(`${WRITE_ROOT}/standard/llms-full.txt`, full);

// ---- QC: every manifest must stay under the per-file size budget, UTF-8 clean ----
const BUDGET = 40 * 1024;
const sizes = [];
for (const r of productRows) {
  const p = `${WRITE_ROOT}/standard/llms/${r.id}.txt`;
  const buf = readFileSync(p);
  sizes.push({ file: `standard/llms/${r.id}.txt`, bytes: buf.length, n: r.n });
  // UTF-8 clean check: round-trip must be lossless (no replacement chars introduced)
  const text = buf.toString("utf8");
  if (Buffer.byteLength(text, "utf8") !== buf.length) {
    throw new Error(`build-llms: ${p} is not clean UTF-8`);
  }
}
{
  const idxBuf = readFileSync(`${WRITE_ROOT}/standard/llms/index.txt`);
  sizes.push({ file: "standard/llms/index.txt", bytes: idxBuf.length, n: nProd });
}
const overBudget = sizes.filter((s) => s.file !== "standard/llms/index.txt" && s.bytes > BUDGET);
if (overBudget.length) {
  throw new Error(`build-llms: manifest(s) exceed ${BUDGET} byte budget: ${overBudget.map((s) => `${s.file}=${s.bytes}b`).join(", ")}`);
}
const maxRow = sizes.reduce((a, b) => (b.bytes > a.bytes ? b : a));

console.log(`build-llms: llms.txt + llms-full.txt + llms/index.txt + ${nProd} per-product manifests regenerated — ${nComp} comparisons · ${nMark} markets · ${nProd} categories`);
console.log(`build-llms: largest manifest = ${maxRow.file} (${maxRow.bytes} bytes, ${maxRow.n} rows), budget ${BUDGET} bytes/file`);
console.log(`build-llms: checksum OK — sum(per-product comparisons)=${checkSum} === corpus covered by known products=${nCorpus}`);
