#!/usr/bin/env node
/**
 * generate-sitemap.mjs — rebuild sitemap.xml with real git lastmod dates,
 * the new pillar pages, and hreflang xhtml:link annotations for the
 * localized clusters (en / zh-Hans / zh-Hant / pt-PT / x-default).
 * Run from repo root after build-locales.mjs.
 */
import { execSync } from "node:child_process";
import { readdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";

const BASE = "https://asaptic.com";
const today = process.argv[2] || gitToday();
function gitToday() {
  try { return execSync("git log -1 --format=%ad --date=short").toString().trim(); }
  catch { return "2026-06-10"; }
}
function lastmod(file) {
  try {
    const d = execSync(`git log -1 --format=%ad --date=short -- "${file}"`).toString().trim();
    return d || today;
  } catch { return today; }
}

// localized clusters: [enLoc, suffix]
const CLUSTERS = [
  { en: `${BASE}/`, suffix: "" },
  { en: `${BASE}/sourcing.html`, suffix: "sourcing.html" },
  { en: `${BASE}/bess-uflpa-compliance.html`, suffix: "bess-uflpa-compliance.html" },
];
const LOCS = [
  { code: "zh", hreflang: "zh-Hans" },
  { code: "zht", hreflang: "zh-Hant" },
  { code: "pt", hreflang: "pt-PT" },
];
const STANDARD_LOCS = [
  { code: "zh", hreflang: "zh-Hans" },
  { code: "zht", hreflang: "zh-Hant" },
];
function altLinks(suffix) {
  const out = [`    <xhtml:link rel="alternate" hreflang="en" href="${BASE}/${suffix}"/>`];
  for (const l of LOCS)
    out.push(`    <xhtml:link rel="alternate" hreflang="${l.hreflang}" href="${BASE}/${l.code}/${suffix}"/>`);
  out.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${BASE}/${suffix}"/>`);
  return out.join("\n");
}
function standardAltLinks(suffix) {
  const out = [`    <xhtml:link rel="alternate" hreflang="en" href="${BASE}/${suffix}"/>`];
  for (const l of STANDARD_LOCS)
    out.push(`    <xhtml:link rel="alternate" hreflang="${l.hreflang}" href="${BASE}/${l.code}/${suffix}"/>`);
  out.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${BASE}/${suffix}"/>`);
  return out.join("\n");
}
function standardDatasetFiles() {
  if (!existsSync("standard/data")) return [];
  return readdirSync("standard/data")
    .filter((file) => /^[^_].*\.v2026-06-11\.json$/.test(file))
    .sort()
    .map((file) => `standard/data/${file}`);
}
function standardFragmentFiles(prefix) {
  if (!prefix || !existsSync("standard/data/_fragments")) return [];
  return readdirSync("standard/data/_fragments")
    .filter((file) => file.startsWith(prefix) && file.endsWith(".json"))
    .sort()
    .map((file) => `standard/data/_fragments/${file}`);
}
function standardRows(data) {
  const rows = [...(data.rows || [])];
  for (const file of standardFragmentFiles(data.fragment_prefix)) {
    try {
      const fragment = JSON.parse(readFileSync(file, "utf8"));
      if (Array.isArray(fragment)) rows.push(...fragment);
    } catch {
      return [];
    }
  }
  return rows;
}
function standardPillarFiles(kind) {
  const dir = `standard/${kind}`;
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".html"))
    .sort()
    .map((file) => `${dir}/${file}`);
}

const urls = [];
const seen = new Set();
const add = (loc, file, priority, alts) => {
  if (seen.has(loc)) return;
  seen.add(loc);
  urls.push(
    `  <url><loc>${loc}</loc><lastmod>${lastmod(file)}</lastmod><priority>${priority}</priority>` +
    (alts ? `\n${alts}\n  ` : "") + `</url>`
  );
};

// 1. localized clusters (en + each locale), all carrying the same alt links
for (const c of CLUSTERS) {
  const alts = altLinks(c.suffix);
  const enFile = c.suffix === "" ? "index.html" : c.suffix;
  add(c.en, enFile, c.suffix === "" ? "1.0" : "0.9", alts);
  for (const l of LOCS)
    add(`${BASE}/${l.code}/${c.suffix}`, `${l.code}/${enFile}`, "0.7", alts);
}

// 2. new pillar pages + other top-level pages
const __extra=["standard/browse.html","standard/methodology.html","standard/macau-public-interest.html"]; for(const __p of __extra){ try{ add(`${BASE}/${__p}`, __p, "0.6"); }catch(e){} }
for (const __p of [...standardPillarFiles("product"), ...standardPillarFiles("market")]) {
  const alts = standardAltLinks(__p);
  add(`${BASE}/${__p}`, __p, "0.65", alts);
  for (const l of STANDARD_LOCS)
    add(`${BASE}/${l.code}/${__p}`, `${l.code}/${__p}`, "0.55", alts);
}
  const pillars = ["heavy-lift-uav.html", "physical-ai-robotics.html", "deep-tech-sourcing.html", "medical-device-sourcing.html"];
for (const p of pillars) if (existsSync(p)) add(`${BASE}/${p}`, p, "0.8");
for (const p of ["engage.html", "thesis.html", "press.html", "crossings.html", "privacy.html"])
  if (existsSync(p)) add(`${BASE}/${p}`, p, "0.7");
add(`${BASE}/blog/`, "blog", "0.7");

// 3. blog posts (real git dates — fixes uniform fake lastmod)
if (existsSync("blog")) {
  for (const f of readdirSync("blog").filter((x) => x.endsWith(".html")).sort())
    add(`${BASE}/blog/${f}`, `blog/${f}`, "0.6");
}

// 4. Cross-Standard public-interest pages. Included once published — either human-reviewed
// or AI-published (ai_published:true) under the AI-compiled + prominent-disclaimer policy
// (Raymond 2026-06-13). Pages still carrying noindex robots are excluded.
for (const file of standardDatasetFiles()) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  const slug = data.slug || data.page?.slug;
  const noindex = String(data.robots || "").replace(/\s+/g, "").toLowerCase().startsWith("noindex");
  const published = data.human_reviewed === true || data.ai_published === true;
  if (!slug || !published || noindex) continue;
  const rows = standardRows(data);
  const sitemapEligible = rows.length > 0;
  if (sitemapEligible) {
    const suffix = `standard/${slug}.html`;
    const alts = standardAltLinks(suffix);
    add(`${BASE}/${suffix}`, suffix, "0.7", alts);
    for (const l of STANDARD_LOCS)
      add(`${BASE}/${l.code}/${suffix}`, `${l.code}/${suffix}`, "0.6", alts);
  }
}

// 4b. Cross-Standard topical pillar pages (per product + per market) — hub authority for GEO/SEO.
for (const dir of ["standard/product", "standard/market"]) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".html")).sort()) {
    const suffix = `${dir}/${f}`;
    const alts = standardAltLinks(suffix);
    add(`${BASE}/${suffix}`, suffix, "0.7", alts);
    for (const l of STANDARD_LOCS)
      add(`${BASE}/${l.code}/${suffix}`, `${l.code}/${suffix}`, "0.6", alts);
  }
}

const xml =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
  urls.join("\n") + `\n</urlset>\n`;
writeFileSync("sitemap.xml", xml);
console.log(`generate-sitemap: wrote ${urls.length} urls.`);
