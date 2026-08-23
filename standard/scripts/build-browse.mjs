#!/usr/bin/env node
// Static, crawlable "browse all comparisons" hub — grouped by product + by market, linking
// every comparison page. Fixes JS-only discovery (crawlers/LLMs see all links) + distributes
// internal-link authority across all pages. Additive: builds standard/browse.html (+ zh/zht)
// by splicing the existing methodology.html chrome (same head/header/footer sentinel blocks),
// then re-rendering just those sentinel blocks for browse's OWN slug — the spliced-in copies
// point at methodology (wrong canonical + wrong lang-switcher URLs) otherwise.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { footer } from "../templates/partials/footer.mjs";
import { nav } from "../templates/partials/nav.mjs";
import { renderHeadLinks, replaceSentinelBlock } from "../templates/partials/shell.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const STD = join(ROOT, "standard");
// See generate-standard.mjs's STANDARD_OUT_ROOT comment: redirects WRITES only.
// The methodology.html splice SOURCE and shell.mjs's own existence checks always
// read the real ROOT, never WRITE_ROOT.
const WRITE_ROOT = process.env.STANDARD_OUT_ROOT ? resolve(ROOT, process.env.STANDARD_OUT_ROOT) : ROOT;
const idx = JSON.parse(readFileSync(join(STD, "data/_index.json"), "utf8"));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const prodLabel = Object.fromEntries(idx.products.map((p) => [p.id, p.label]));
const mktLabel = Object.fromEntries(idx.markets.map((m) => [m.id, m.label]));
const live = idx.comparisons.filter((c) => c.status === "live");

const T = {
  en: { lang: "en", htmlLang: "en", pref: "", title: "Browse all comparisons", intro: "Every China-export compliance comparison, grouped by product and by destination market.", byProduct: "By product category", byMarket: "By destination market", count: "live comparisons" },
  zh: { lang: "zh", htmlLang: "zh-CN", pref: "/zh", title: "浏览全部对照", intro: "全部中国出口合规对照，按产品与目标市场分组。", byProduct: "按产品类别", byMarket: "按目标市场", count: "个在线对照" },
  zht: { lang: "zht", htmlLang: "zh-Hant", pref: "/zht", title: "瀏覽全部對照", intro: "全部中國出口合規對照，按產品與目標市場分組。", byProduct: "按產品類別", byMarket: "按目標市場", count: "個在線對照" }
};

function mainHtml(loc) {
  const L = T[loc];
  const byProd = {};
  const byMkt = {};
  for (const c of live) {
    (byProd[c.product] = byProd[c.product] || []).push(c);
    (byMkt[c.market] = byMkt[c.market] || []).push(c);
  }
  const link = (c) => `<a href="${L.pref}${c.url[loc] || c.url.en}">${esc((mktLabel[c.market]?.[loc]) || c.market)}</a>`;
  const linkP = (c) => `<a href="${L.pref}${c.url[loc] || c.url.en}">${esc((prodLabel[c.product]?.[loc]) || c.product)}</a>`;
  let prodSec = "";
  for (const pid of Object.keys(byProd).sort()) {
    const items = byProd[pid].sort((a, b) => a.market.localeCompare(b.market)).map(link).join(" · ");
    prodSec += `<h3>${esc((prodLabel[pid]?.[loc]) || pid)}</h3><p>${items}</p>`;
  }
  let mktSec = "";
  for (const mid of Object.keys(byMkt).sort()) {
    const items = byMkt[mid].sort((a, b) => a.product.localeCompare(b.product)).map(linkP).join(" · ");
    mktSec += `<h3>${esc((mktLabel[mid]?.[loc]) || mid)}</h3><p>${items}</p>`;
  }
  return `  <main>
    <section class="hero standard-hero" id="top"><div class="hero-bg"></div><div class="container"><div class="hero-copy">
      <p class="hero-eyebrow">CROSS-STANDARD</p>
      <h1 class="hero-title">${esc(L.title)}</h1>
      <p class="hero-sub">${esc(L.intro)} ${live.length} ${esc(L.count)}.</p>
    </div></div></section>
    <section class="standard-section"><div class="container">
      <h2>${esc(L.byProduct)}</h2>${prodSec}
      <h2>${esc(L.byMarket)}</h2>${mktSec}
    </div></section>
  </main>`;
}

const map = [
  { loc: "en", src: join(STD, "methodology.html"), out: join(WRITE_ROOT, "standard/browse.html") },
  { loc: "zh", src: join(ROOT, "zh/standard/methodology.html"), out: join(WRITE_ROOT, "zh/standard/browse.html") },
  { loc: "zht", src: join(ROOT, "zht/standard/methodology.html"), out: join(WRITE_ROOT, "zht/standard/browse.html") }
];
let n = 0;
for (const m of map) {
  if (!existsSync(m.src)) continue;
  let html = readFileSync(m.src, "utf8");
  html = html.replace(/<main>[\s\S]*?<\/main>/, mainHtml(m.loc));
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(T[m.loc].title)} — Cross-Standard | Asaptic</title>`);
  // Re-render the head/header/footer sentinel blocks for browse's OWN slug — the
  // spliced-in copies (from methodology.html) still point at methodology (wrong
  // canonical, wrong lang-switcher URLs) until replaced here.
  html = replaceSentinelBlock(html, "head", renderHeadLinks({ locale: m.loc, slug: "browse" }));
  html = replaceSentinelBlock(html, "header", nav({ locale: m.loc, slug: "browse" }));
  html = replaceSentinelBlock(html, "footer", footer({ locale: m.loc, slug: "browse" }));
  // og:url / JSON-LD @id / the trailing locale-redirect script's location.replace(...)
  // calls are untouched by the sentinel swap above (matches apply_shell.py's own policy
  // of never touching og:*/JSON-LD) and still literally say "methodology" — fix those
  // residual refs so they point at browse instead. methodology.html's own JSON-LD still
  // carries the .html suffix (site-wide legacy inconsistency, out of scope here), so that
  // form is normalized to browse.html; its og:url/canonical are already extensionless
  // (matching the site's clean-URL convention), so that bare form must be caught too —
  // otherwise og:url on the built browse.html silently keeps pointing at methodology
  // (wrong page, not just a wrong extension). The og:url replacement is scoped to the
  // og:url meta tag specifically so it can never touch the genuine "Methodology" nav
  // link that the re-rendered footer/header sentinel blocks already emit correctly.
  html = html.replace(/standard\/methodology\.html/g, "standard/browse.html");
  html = html.replace(/(["'(])methodology\.html/g, "$1browse.html");
  html = html.replace(
    /(<meta property="og:url" content="[^"]*)\/standard\/methodology(")/,
    "$1/standard/browse$2"
  );
  mkdirSync(dirname(m.out), { recursive: true });
  writeFileSync(m.out, html);
  n++;
}
console.log(`build-browse: wrote ${n} browse pages (${live.length} comparisons linked)`);
