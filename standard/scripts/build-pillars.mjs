#!/usr/bin/env node
// Static Cross-Standard pillar pages for product and market topic clusters.
// Splices the methodology.html chrome so the generated pages stay consistent
// with the public-interest section while exposing crawlable comparison links.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { footer } from "../templates/partials/footer.mjs";
import { esc, escAttr, label, safeHttpsUrl, t } from "../templates/partials/i18n.mjs";
import { nav } from "../templates/partials/nav.mjs";
import { renderHeadLinks } from "../templates/partials/shell.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const STD = join(ROOT, "standard");
const DATA = join(STD, "data");
const SITE = "https://asaptic.com";
// See generate-standard.mjs's STANDARD_OUT_ROOT comment: redirects WRITES only.
// The methodology.html splice SOURCE (`src` below) and shell.mjs's own existence
// checks always read the real ROOT, never WRITE_ROOT.
const WRITE_ROOT = process.env.STANDARD_OUT_ROOT ? resolve(ROOT, process.env.STANDARD_OUT_ROOT) : ROOT;

const locales = [
  { locale: "en", lang: "en", htmlLang: "en", prefix: "", outRoot: join(WRITE_ROOT, "standard"), src: join(STD, "methodology.html") },
  { locale: "zh", lang: "zh", htmlLang: "zh-Hans", prefix: "/zh", outRoot: join(WRITE_ROOT, "zh/standard"), src: join(ROOT, "zh/standard/methodology.html") },
  { locale: "zht", lang: "zht", htmlLang: "zh-Hant", prefix: "/zht", outRoot: join(WRITE_ROOT, "zht/standard"), src: join(ROOT, "zht/standard/methodology.html") }
];

const ui = {
  en: {
    productTitle: "China export standards for {name}",
    marketTitle: "China export standards for {name}",
    productDescription: "Cross-Standard comparison pages for {name}, grouped by destination market.",
    marketDescription: "Cross-Standard comparison pages for exports to {name}, grouped by product category.",
    eyebrow: "CROSS-STANDARD · TOPIC PILLAR",
    browseHub: "Browse all comparisons",
    siblingProducts: "Related product pillars",
    siblingMarkets: "Related market pillars",
    comparisonsByMarket: "Comparisons by destination market",
    comparisonsByProduct: "Comparisons by product category",
    viewComparison: "View comparison",
    noComparisons: "No live comparison pages are published for this pillar yet.",
    collection: "Comparison collection",
    updated: "Index updated",
    keyBodies: "Key bodies referenced across comparisons",
    primarySourcesMarket: "Primary official sources cited for this market",
    primarySourcesProduct: "Primary official sources cited for this product",
    sourcesEmpty: "No source-linked comparison rows are published for this pillar yet.",
    statusSourceRows: "{rows} source rows",
    statusVerifiedRange: "Verified {range}"
  },
  zh: {
    productTitle: "{name}中国出口标准",
    marketTitle: "出口至{name}的中国标准",
    productDescription: "{name}的 Cross-Standard 对照页面，按目标市场分组。",
    marketDescription: "出口至{name}的 Cross-Standard 对照页面，按产品类别分组。",
    eyebrow: "CROSS-STANDARD · 主题支柱页",
    browseHub: "浏览全部对照",
    siblingProducts: "相关产品支柱页",
    siblingMarkets: "相关市场支柱页",
    comparisonsByMarket: "按目标市场查看对照",
    comparisonsByProduct: "按产品类别查看对照",
    viewComparison: "查看对照",
    noComparisons: "该支柱页暂未发布在线对照页面。",
    collection: "对照集合",
    updated: "索引更新",
    keyBodies: "各对照页引用的主要机构",
    primarySourcesMarket: "该市场对照所引用的主要官方来源",
    primarySourcesProduct: "该产品对照所引用的主要官方来源",
    sourcesEmpty: "该支柱页尚未发布带来源的对照行。",
    statusSourceRows: "{rows} 条来源记录",
    statusVerifiedRange: "核验区间 {range}"
  },
  zht: {
    productTitle: "{name}中國出口標準",
    marketTitle: "出口至{name}的中國標準",
    productDescription: "{name}的 Cross-Standard 對照頁面，按目標市場分組。",
    marketDescription: "出口至{name}的 Cross-Standard 對照頁面，按產品類別分組。",
    eyebrow: "CROSS-STANDARD · 主題支柱頁",
    browseHub: "瀏覽全部對照",
    siblingProducts: "相關產品支柱頁",
    siblingMarkets: "相關市場支柱頁",
    comparisonsByMarket: "按目標市場查看對照",
    comparisonsByProduct: "按產品類別查看對照",
    viewComparison: "查看對照",
    noComparisons: "該支柱頁暫未發布線上對照頁面。",
    collection: "對照集合",
    updated: "索引更新",
    keyBodies: "各對照頁引用的主要機構",
    primarySourcesMarket: "該市場對照所引用的主要官方來源",
    primarySourcesProduct: "該產品對照所引用的主要官方來源",
    sourcesEmpty: "該支柱頁尚未發布附來源的對照行。",
    statusSourceRows: "{rows} 條來源記錄",
    statusVerifiedRange: "核驗區間 {range}"
  }
};

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function fmt(key, lang, vars = {}) {
  return String(ui[lang]?.[key] ?? ui.en[key] ?? "").replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? "");
}

function pillarUrl({ locale = "en", kind, id, site = "" }) {
  const prefix = locale === "en" ? "" : `/${locale}`;
  return `${site}${prefix}/standard/${kind}/${id}`;
}

function comparisonHref(comparison, locale) {
  const href = comparison.url?.[locale] || comparison.url?.en || "";
  return href.endsWith(".html") ? href.slice(0, -5) : href;
}

function labelMap(items) {
  return Object.fromEntries(items.map((item) => [item.id, item.label]));
}

const products = readJson(join(DATA, "_pillars/products.json"));
const markets = readJson(join(DATA, "_pillars/markets.json"));
const idx = readJson(join(DATA, "_index.json"));

// Backfill pillar entries for any product/market in the index that lacks authored copy,
// so EVERY live market/product gets a discoverable hub page (no homepage-fallback gaps).
const tri = (en, zh, zht) => ({ en, zh, zht });
for (const m of idx.markets || []) {
  if (markets[m.id]) continue;
  const lbl = m.label || tri(m.id, m.id, m.id);
  markets[m.id] = {
    label: lbl,
    intro: tri(
      `${lbl.en} applies its own conformity-assessment and market-access requirements to imported products. This page groups every Cross-Standard comparison of common China (GB / GB-T) documentation against ${lbl.en} requirements, by product category — a source-linked, informational reference to the gaps exporters most often need to close.`,
      `${lbl.zh || lbl.en}对进口产品适用其自身的合格评定与市场准入要求。本页按产品类别汇总所有将中国常用文件（GB / GB-T）与${lbl.zh || lbl.en}要求进行对照的 Cross-Standard 比较，提供带来源链接的信息性参考，帮助出口商了解最常见的合规差距。`,
      `${lbl.zht || lbl.en}對進口產品適用其自身的合格評定與市場准入要求。本頁按產品類別匯總所有將中國常用文件（GB / GB-T）與${lbl.zht || lbl.en}要求進行對照的 Cross-Standard 比較，提供附來源連結的資訊性參考，幫助出口商了解最常見的合規差距。`
    ),
    products: (idx.comparisons || []).filter((c) => c.market === m.id).map((c) => c.product)
  };
}
for (const p of idx.products || []) {
  if (products[p.id]) continue;
  const lbl = p.label || tri(p.id, p.id, p.id);
  products[p.id] = {
    label: lbl,
    intro: tri(
      `Exporting ${lbl.en} from China means meeting each destination market's standards and conformity requirements. This page groups every Cross-Standard comparison for ${lbl.en} by market — a source-linked, informational gap reference.`,
      `从中国出口${lbl.zh || lbl.en}需要满足各目标市场的标准与合格评定要求。本页按市场汇总所有关于${lbl.zh || lbl.en}的 Cross-Standard 比较，提供带来源链接的信息性差距参考。`,
      `從中國出口${lbl.zht || lbl.en}需要滿足各目標市場的標準與合格評定要求。本頁按市場匯總所有關於${lbl.zht || lbl.en}的 Cross-Standard 比較，提供附來源連結的資訊性差距參考。`
    ),
    markets: (idx.comparisons || []).filter((c) => c.product === p.id).map((c) => c.market)
  };
}
const productLabels = { ...labelMap(idx.products), ...Object.fromEntries(Object.entries(products).map(([id, p]) => [id, p.label])) };
const marketLabels = { ...labelMap(idx.markets), ...Object.fromEntries(Object.entries(markets).map(([id, m]) => [id, m.label])) };
const live = idx.comparisons.filter((comparison) => comparison.status === "live");

// ── GEO enrichment data prep ────────────────────────────────────────────
// Extracts the bare comparison slug from a comparisons[].url.en value, same
// tolerant logic as slugFromEnUrl() in generate-standard.mjs (duplicated, not
// imported, so this build stays independent of that script's internals).
function slugFromEnUrl(enUrl) {
  return String(enUrl || "").replace(/\/+$/, "").replace(/\.html$/, "").split("/").pop();
}

const FRAGMENT_DIR = join(DATA, "_fragments");

function fragmentFiles(prefix) {
  if (!prefix || !existsSync(FRAGMENT_DIR)) return [];
  return readdirSync(FRAGMENT_DIR)
    .filter((file) => file.startsWith(prefix) && file.endsWith(".json"))
    .sort()
    .map((file) => join(FRAGMENT_DIR, file));
}

function rowsForDataset(data) {
  const rows = [...(data.rows || [])];
  for (const file of fragmentFiles(data.fragment_prefix)) {
    try {
      const fragment = readJson(file);
      if (Array.isArray(fragment)) rows.push(...fragment);
    } catch {
      // Skip malformed fragment — mirrors generate-standard.mjs's tolerant fallback.
    }
  }
  return rows;
}

// Dataset content (rows / sources / verdicts) is locale-independent — only its
// rendered strings vary by lang. Loaded once and reused across all three locale
// passes below (see the `locales` loop at the bottom of this file).
function loadDatasetIndex() {
  const bySlug = new Map();
  const files = readdirSync(DATA).filter((file) => /^[^_].*\.v2026-06-11\.json$/.test(file));
  for (const file of files) {
    let data;
    try {
      data = readJson(join(DATA, file));
    } catch {
      continue;
    }
    const slug = data.slug || data.page?.slug;
    if (!slug) continue;
    bySlug.set(slug, {
      last_verified: data.last_verified,
      answer_first: data.answer_first,
      rows: rowsForDataset(data)
    });
  }
  return bySlug;
}

const datasetIndex = loadDatasetIndex();

// Trims to the first sentence (Latin or CJK terminators) and hard-caps length so
// an answer_first verdict fits as a compact per-item summary line. A "." is only
// treated as a terminator when it isn't a decimal point inside a standard code
// (e.g. "UN 38.3", "AS/NZS 4777.2" must not be cut mid-number).
function firstSentence(str, max = 140) {
  if (!str) return "";
  const s = String(str).trim();
  const enders = new Set([".", "!", "?", "。", "！", "？"]);
  const isDigit = (ch) => ch >= "0" && ch <= "9";
  let cut = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (!enders.has(ch)) continue;
    if (ch === "." && isDigit(s[i - 1]) && isDigit(s[i + 1])) continue;
    cut = i;
    break;
  }
  let sentence = (cut === -1 ? s : s.slice(0, cut + 1)).trim();
  if (sentence.length > max) sentence = `${sentence.slice(0, max - 1).trimEnd()}…`;
  return sentence;
}

// Parses regulator/body codes out of a curated market label's trailing
// parenthetical, e.g. "Japan (PSE/JET)" -> ["PSE", "JET"]. Always parsed from the
// English label since the codes themselves aren't translated between locales.
// Markets without a curated parenthetical (backfilled pillars) yield [].
function regulatorBodies(labelObj) {
  const raw = (labelObj && labelObj.en) || "";
  const m = raw.match(/\(([^)]+)\)\s*$/);
  if (!m) return [];
  return m[1].split("/").map((s) => s.trim()).filter(Boolean);
}

// Aggregates, once per pillar (cached across the 3 locale passes), the source
// register and coverage stats across every live comparison under that
// market/product — the data backing the "Primary official sources" list and the
// comparison/source-row/last-verified counts in the hero status line.
const pillarAggCache = new Map();
function aggregatePillar(kind, id) {
  const cacheKey = `${kind}:${id}`;
  if (pillarAggCache.has(cacheKey)) return pillarAggCache.get(cacheKey);
  const comparisons = live.filter((c) => c[kind] === id);
  const sourceMap = new Map();
  let sourceRowsTotal = 0;
  const verifiedDates = [];
  for (const c of comparisons) {
    const ds = datasetIndex.get(slugFromEnUrl(c.url.en));
    if (!ds) continue;
    if (ds.last_verified) verifiedDates.push(ds.last_verified);
    sourceRowsTotal += ds.rows.length;
    for (const row of ds.rows) {
      const publisher = row.source?.publisher;
      const url = row.source?.url;
      if (!publisher && !url) continue;
      const key = `${url || ""}::${publisher || ""}`;
      const existing = sourceMap.get(key);
      if (existing) existing.count += 1;
      else sourceMap.set(key, { publisher, url, count: 1 });
    }
  }
  verifiedDates.sort();
  const agg = {
    comparisonsCount: comparisons.length,
    sourceRowsTotal,
    verifiedMin: verifiedDates[0] || "",
    verifiedMax: verifiedDates[verifiedDates.length - 1] || "",
    sources: [...sourceMap.values()].sort((a, b) => b.count - a.count)
  };
  pillarAggCache.set(cacheKey, agg);
  return agg;
}

function collectionJsonLd({ kind, id, pillar, title, description, lang, locale, items }) {
  const url = pillarUrl({ locale, kind, id, site: SITE });
  const inLanguage = locale === "zht" ? "zh-Hant" : locale === "zh" ? "zh-Hans" : "en";
  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "CollectionPage",
          "@id": `${url}#collection`,
          "name": title,
          "description": description,
          "url": url,
          "isAccessibleForFree": true,
          "inLanguage": inLanguage,
          "about": { "@type": "Thing", "name": t(pillar.label, lang) },
          "publisher": { "@type": "Organization", "name": "Asaptic", "url": SITE },
          "mainEntity": {
            "@type": "ItemList",
            "numberOfItems": items.length,
            "itemListElement": items.map((item, index) => ({
              "@type": "ListItem",
              "position": index + 1,
              "name": item.name,
              "url": item.url
            }))
          }
        },
        {
          "@type": "BreadcrumbList",
          "@id": `${url}#breadcrumb`,
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": label("home", lang), "item": SITE },
            { "@type": "ListItem", "position": 2, "name": "Cross-Standard", "item": `${SITE}${locale === "en" ? "" : `/${locale}`}/standard/` },
            { "@type": "ListItem", "position": 3, "name": title, "item": url }
          ]
        }
      ]
    },
    null,
    2
  );
}

// Mirrors guideDatasetJsonLd() in build-guides.mjs: a standalone Dataset node so
// the pillar's comparison corpus is machine-discoverable independently of the
// CollectionPage graph. Regenerating the pillars used to drop this block (it had
// only ever been injected out-of-band into the EN pages); emitting it here keeps
// all three locales consistent with the guides.
function pillarDatasetJsonLd({ title, locale, url }) {
  const inLanguage = locale === "zht" ? "zh-Hant" : locale === "zh" ? "zh-Hans" : "en";
  const licenseRoot = `${SITE}${locale === "en" ? "" : `/${locale}`}/standard/`;
  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      "name": `${title} - Export Compliance Dataset`,
      "description": `Detailed export compliance and regulatory capability mapping for ${title}, compiled by Asaptic.`,
      "creator": { "@type": "Organization", "name": "Asaptic" },
      "inLanguage": inLanguage,
      "license": licenseRoot,
      "url": url
    },
    null,
    2
  );
}

function head({ kind, id, pillar, title, description, lang, locale }) {
  const canonical = pillarUrl({ locale, kind, id, site: SITE });
  const datasetJson = pillarDatasetJsonLd({ title, locale, url: canonical });
  const json = collectionJsonLd({
    kind,
    id,
    pillar,
    title,
    description,
    lang,
    locale,
    items: live
      .filter((comparison) => comparison[kind] === id)
      .map((comparison) => {
        const product = t(productLabels[comparison.product], lang) || comparison.product;
        const market = t(marketLabels[comparison.market], lang) || comparison.market;
        return {
          name: `${product} - ${market}`,
          url: `${SITE}${comparisonHref(comparison, locale)}`
        };
      })
  });
  return `<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escAttr(title)} - Cross-Standard | Asaptic</title>

  <meta name="description" content="${escAttr(description)}" />
  <meta name="robots" content="index, follow" />

  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escAttr(title)} - Cross-Standard | Asaptic" />
  <meta property="og:description" content="${escAttr(description)}" />
  <meta property="og:url" content="${escAttr(canonical)}" />
  <meta property="og:site_name" content="Asaptic" />

  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escAttr(title)} - Cross-Standard | Asaptic" />
  <meta name="twitter:description" content="${escAttr(description)}" />

  <script>document.documentElement.classList.add('js-anim');</script>
${renderHeadLinks({ locale, slug: `${kind}/${id}` })}

  <link rel="stylesheet" href="/standard/standard.css?v=20260611b" />

  <script type="application/ld+json">
  ${json}
  </script>
  <script type="application/ld+json">
${datasetJson}
  </script>
</head>`;
}

function comparisonList({ comparisons, groupBy, lang, locale }) {
  if (!comparisons.length) return `<p>${esc(fmt("noComparisons", lang))}</p>`;
  const groups = new Map();
  for (const comparison of comparisons) {
    const key = comparison[groupBy];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(comparison);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([groupId, rows]) => {
      const groupLabel = groupBy === "market" ? t(marketLabels[groupId], lang) || groupId : t(productLabels[groupId], lang) || groupId;
      return `<div class="provenance-panel">
          <h3>${esc(groupLabel)}</h3>
          <ul class="standard-source-list">
            ${rows
              .sort((a, b) => (a.product + a.market).localeCompare(b.product + b.market))
              .map((comparison) => {
                const product = t(productLabels[comparison.product], lang) || comparison.product;
                const market = t(marketLabels[comparison.market], lang) || comparison.market;
                const linkText = groupBy === "market" ? market : product;
                const context = groupBy === "market" ? product : market;
                const href = comparisonHref(comparison, locale);
                // Per-item one-line verdict (GEO enrichment): first sentence of that
                // comparison's own answer_first, linked back to the comparison page.
                const ds = datasetIndex.get(slugFromEnUrl(comparison.url.en));
                const verdict = ds ? firstSentence(t(ds.answer_first, lang)) : "";
                const verdictHtml = verdict
                  ? `<br /><small><a href="${escAttr(href)}" style="color:var(--steel);">${esc(verdict)}</a></small>`
                  : "";
                return `<li><a href="${escAttr(href)}">${esc(linkText)}</a> <span style="color:var(--steel);">- ${esc(context)} · ${esc(fmt("viewComparison", lang))}</span>${verdictHtml}</li>`;
              })
              .join("\n")}
          </ul>
        </div>`;
    })
    .join("\n");
}

function siblingLinks({ kind, id, lang, locale }) {
  const source = kind === "product" ? products : markets;
  const entries = Object.entries(source).filter(([otherId]) => otherId !== id).slice(0, 18);
  return entries
    .map(([otherId, pillar]) => `<a href="${escAttr(pillarUrl({ locale, kind, id: otherId }))}">${esc(t(pillar.label, lang) || otherId)}</a>`)
    .join(" · ");
}

// Top-N (by row count) official-source register for a pillar, reusing the exact
// "used in {count} rows" phrasing/i18n key that source-list.mjs already uses on
// each individual comparison page, so the wording is consistent site-wide.
function sourcesListHtml({ sources, limit, lang }) {
  const top = sources.slice(0, limit);
  if (!top.length) return `<p>${esc(fmt("sourcesEmpty", lang))}</p>`;
  return `<ul class="standard-source-list">
    ${top
      .map((source) => {
        const url = safeHttpsUrl(source.url);
        const name = esc(source.publisher || url || "—");
        const linkText = url ? `<a href="${escAttr(url)}" rel="noopener">${name}</a>` : name;
        const usedCount = label("usedInRows", lang).replace("{count}", String(source.count));
        return `<li>${linkText} <span style="color:var(--steel);">· ${esc(usedCount)}</span></li>`;
      })
      .join("\n")}
  </ul>`;
}

// GEO enrichment panel: regulator-body names parsed from the market label (market
// pillars only) + the aggregated "Primary official sources" register (top 8 for a
// market, top 5 — "lighter" — for a product, since it aggregates across up to 182
// markets rather than up to 23 products).
function insightsHtml({ kind, id, pillar, lang, agg }) {
  const isMarket = kind === "market";
  const bodies = isMarket ? regulatorBodies(pillar.label) : [];
  const sourceLimit = isMarket ? 8 : 5;
  const primarySourcesLabel = fmt(isMarket ? "primarySourcesMarket" : "primarySourcesProduct", lang);
  return `<section class="standard-section standard-section--compact">
      <div class="container">
        <div class="standard-faq">
          <div class="provenance-panel">
            ${
              bodies.length
                ? `<h3>${esc(fmt("keyBodies", lang))}</h3>
            <p>${esc(bodies.join(" · "))}</p>`
                : ""
            }
            <h3>${esc(primarySourcesLabel)}</h3>
            ${sourcesListHtml({ sources: agg.sources, limit: sourceLimit, lang })}
          </div>
        </div>
      </div>
    </section>`;
}

function mainHtml({ kind, id, pillar, lang, locale, comparisons, agg }) {
  const name = t(pillar.label, lang) || id;
  const title = fmt(kind === "product" ? "productTitle" : "marketTitle", lang, { name });
  const groupedTitle = fmt(kind === "product" ? "comparisonsByMarket" : "comparisonsByProduct", lang);
  const siblingTitle = fmt(kind === "product" ? "siblingProducts" : "siblingMarkets", lang);
  const groupBy = kind === "product" ? "market" : "product";
  return `  <main>
    <section class="hero standard-hero" id="top">
      <div class="hero-bg"></div>
      <div class="container">
        <div class="hero-copy fade-in" style="max-width:920px;">
          <p class="hero-eyebrow">${esc(fmt("eyebrow", lang))}</p>
          <h1 class="hero-title" style="font-size:clamp(32px,4.8vw,60px);">${esc(title)}</h1>
          <p class="hero-sub">${esc(t(pillar.intro, lang))}</p>
          <div class="standard-status">
            <span>${comparisons.length} ${esc(fmt("collection", lang))}</span>
            ${agg.sourceRowsTotal ? `<span>${esc(fmt("statusSourceRows", lang, { rows: agg.sourceRowsTotal }))}</span>` : ""}
            ${agg.verifiedMin ? `<span>${esc(fmt("statusVerifiedRange", lang, { range: agg.verifiedMin === agg.verifiedMax ? agg.verifiedMin : `${agg.verifiedMin} – ${agg.verifiedMax}` }))}</span>` : ""}
            <span>${esc(fmt("updated", lang))}: ${esc(idx.updated)}</span>
            <span><a href="${escAttr(locale === "en" ? "/standard/browse.html" : `/${locale}/standard/browse.html`)}">${esc(fmt("browseHub", lang))}</a></span>
          </div>
        </div>
      </div>
    </section>
    ${insightsHtml({ kind, id, pillar, lang, agg })}
    <section class="standard-section">
      <div class="container">
        <p class="section-label">${esc(fmt("collection", lang))}</p>
        <h2 class="section-title standard-content-heading">${esc(groupedTitle)}</h2>
        <div class="standard-faq">
          ${comparisonList({ comparisons, groupBy, lang, locale })}
        </div>
      </div>
    </section>
    <section class="standard-section standard-section--compact">
      <div class="container">
        <aside class="answer-first">
          <span class="answer-first__label">${esc(fmt("browseHub", lang))}</span>
          <p class="answer-first__verdict"><a href="${escAttr(locale === "en" ? "/standard/browse.html" : `/${locale}/standard/browse.html`)}">${esc(fmt("browseHub", lang))}</a></p>
        </aside>
        <aside class="standard-compact-disclaimer">
          <strong>${esc(siblingTitle)}</strong>
          <p>${siblingLinks({ kind, id, lang, locale })}</p>
        </aside>
      </div>
    </section>
  </main>`;
}

function page({ template, kind, id, pillar, lang, locale, htmlLang }) {
  const name = t(pillar.label, lang) || id;
  const title = fmt(kind === "product" ? "productTitle" : "marketTitle", lang, { name });
  const description = fmt(kind === "product" ? "productDescription" : "marketDescription", lang, { name });
  const comparisons = live.filter((comparison) => comparison[kind] === id);
  const agg = aggregatePillar(kind, id);
  const slug = `${kind}/${id}`;
  return template
    .replace(/<html lang="[^"]*">/, `<html lang="${escAttr(htmlLang)}">`)
    .replace(/<head>[\s\S]*?<\/head>/, head({ kind, id, pillar, title, description, lang, locale }))
    // v2 shell chrome lives between the ASAPTIC:HEADER/FOOTER sentinel comments
    // (methodology.html's splice source already carries them, one line ahead of
    // <header>/<footer> themselves — matching only the tag would strand the old
    // leading sentinel comment and duplicate it against nav()'s/footer()'s own).
    .replace(/<!-- ASAPTIC:HEADER:START -->[\s\S]*?<!-- ASAPTIC:HEADER:END -->/, nav({ locale, slug }))
    .replace(/<main>[\s\S]*?<\/main>/, mainHtml({ kind, id, pillar, lang, locale, comparisons, agg }))
    .replace(/<!-- ASAPTIC:FOOTER:START -->[\s\S]*?<!-- ASAPTIC:FOOTER:END -->/, footer({ lang, locale, slug }))
    // Rewrite any residual methodology.html refs (locale-switcher redirects, canonical helpers)
    // spliced from the chrome so they point at THIS pillar page, not methodology.
    .replace(/standard\/methodology\.html/g, `standard/${slug}.html`)
    .replace(/(["'(])methodology\.html/g, `$1${slug}.html`);
}

let written = 0;
let productPages = 0;
let marketPages = 0;

for (const locale of locales) {
  if (!existsSync(locale.src)) continue;
  const template = readFileSync(locale.src, "utf8");
  for (const [kind, pillars] of [["product", products], ["market", markets]]) {
    const outDir = join(locale.outRoot, kind);
    mkdirSync(outDir, { recursive: true });
    for (const [id, pillar] of Object.entries(pillars).sort(([a], [b]) => a.localeCompare(b))) {
      writeFileSync(join(outDir, `${id}.html`), page({ template, kind, id, pillar, ...locale }));
      written += 1;
      if (kind === "product") productPages += 1;
      else marketPages += 1;
    }
  }
}

console.log(`build-pillars: wrote ${written} pillar pages (${productPages} product, ${marketPages} market; ${live.length} live comparisons linked).`);
