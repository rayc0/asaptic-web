// Regenerates standard/llms.txt (lightweight per-comparison index) AND
// standard/llms-full.txt (full corpus map with summaries + page/data URLs)
// from standard/data/_index.json + each live dataset. Run after registration,
// before deploy. Keeps both AI-crawler maps complete & current (no stale counts,
// no /browse dead-ends, every live comparison present).
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const SITE = "https://asaptic.com";
const ROOT = "standard/data";
const idx = JSON.parse(readFileSync(`${ROOT}/_index.json`, "utf8"));
const prods = idx.products;
const live = idx.comparisons.filter((c) => c.status === "live");
const nComp = live.length;
const nMark = new Set(live.map((c) => c.market)).size;
const nProd = prods.length;
const today = new Date().toISOString().slice(0, 10);

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
writeFileSync("standard/llms.txt", lite);

// ---- llms-full.txt (full corpus map) ----
let full = "# Asaptic Cross-Standard — full corpus map (llms-full.txt)\n";
full += "# Public-interest, source-linked China-export compliance comparisons. AI-compiled, multi-model cross-verified, NOT human-verified; informational only — verify with the official regulator. Trilingual (en/zh-Hans/zh-Hant). License CC-BY-4.0.\n";
full += `# Updated: ${today} | ${nComp} comparisons · ${nProd} product categories · ${nMark} markets\n`;
full += `# Machine-readable index: ${SITE}/standard/exports/index.json\n\n`;
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
writeFileSync("standard/llms-full.txt", full);

console.log(`build-llms: llms.txt + llms-full.txt regenerated — ${nComp} comparisons · ${nMark} markets · ${nProd} categories`);
