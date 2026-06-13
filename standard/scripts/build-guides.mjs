#!/usr/bin/env node
// Static Cross-Standard guide pages for crawlable explanatory articles.
// Splices the methodology.html chrome so the generated pages stay consistent
// with the public-interest section while exposing related comparison links.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { footer } from "../templates/partials/footer.mjs";
import { esc, escAttr, label, t } from "../templates/partials/i18n.mjs";
import { nav } from "../templates/partials/nav.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const STD = join(ROOT, "standard");
const DATA = join(STD, "data");
const SITE = "https://asaptic.com";

const locales = [
  { locale: "en", lang: "en", htmlLang: "en", prefix: "", outRoot: STD, src: join(STD, "methodology.html") },
  { locale: "zh", lang: "zh", htmlLang: "zh-CN", prefix: "/zh", outRoot: join(ROOT, "zh/standard"), src: join(ROOT, "zh/standard/methodology.html") },
  { locale: "zht", lang: "zht", htmlLang: "zh-TW", prefix: "/zht", outRoot: join(ROOT, "zht/standard"), src: join(ROOT, "zht/standard/methodology.html") }
];

const ui = {
  en: {
    eyebrow: "CROSS-STANDARD · GUIDE",
    related: "Related",
    articleSection: "Guide"
  },
  zh: {
    eyebrow: "CROSS-STANDARD · 指南",
    related: "相关",
    articleSection: "指南"
  },
  zht: {
    eyebrow: "CROSS-STANDARD · 指南",
    related: "相關",
    articleSection: "指南"
  }
};

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function fmt(key, lang) {
  return ui[lang]?.[key] ?? ui.en[key] ?? "";
}

function guideUrl({ locale = "en", id, site = "" }) {
  const prefix = locale === "en" ? "" : `/${locale}`;
  return `${site}${prefix}/standard/guides/${id}.html`;
}

function guideHref(href, locale) {
  if (!href) return "";
  if (/^https?:\/\//.test(href) || href.startsWith("#")) return href;
  const withHtml = href.endsWith("/") || href.includes("?") || href.endsWith(".html") ? href : `${href}.html`;
  if (locale === "en") return withHtml;
  if (withHtml.startsWith("/standard/")) return `/${locale}${withHtml}`;
  if (withHtml.startsWith("/")) return withHtml;
  return withHtml;
}

function guideJsonLd({ id, guide, title, description, lang, locale }) {
  const url = guideUrl({ locale, id, site: SITE });
  const inLanguage = locale === "zht" ? "zh-Hant" : locale === "zh" ? "zh-Hans" : "en";
  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "TechArticle",
          "@id": `${url}#article`,
          "headline": title,
          "description": description,
          "url": url,
          "isAccessibleForFree": true,
          "inLanguage": inLanguage,
          "articleSection": fmt("articleSection", lang),
          "publisher": { "@type": "Organization", "name": "Asaptic", "url": SITE },
          "mainEntityOfPage": { "@type": "WebPage", "@id": url },
          "hasPart": (guide.body_sections || []).map((section, index) => ({
            "@type": "WebPageElement",
            "position": index + 1,
            "name": t(section.heading, lang)
          }))
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

function head({ id, guide, title, description, lang, locale }) {
  const canonical = guideUrl({ locale, id, site: SITE });
  const json = guideJsonLd({ id, guide, title, description, lang, locale });
  return `<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escAttr(title)} - Cross-Standard | Asaptic</title>

  <meta name="description" content="${escAttr(description)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${escAttr(canonical)}" />
  <link rel="alternate" hreflang="en" href="${escAttr(guideUrl({ locale: "en", id, site: SITE }))}" />
  <link rel="alternate" hreflang="zh-Hans" href="${escAttr(guideUrl({ locale: "zh", id, site: SITE }))}" />
  <link rel="alternate" hreflang="zh-Hant" href="${escAttr(guideUrl({ locale: "zht", id, site: SITE }))}" />
  <link rel="alternate" hreflang="x-default" href="${escAttr(guideUrl({ locale: "en", id, site: SITE }))}" />

  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escAttr(title)} - Cross-Standard | Asaptic" />
  <meta property="og:description" content="${escAttr(description)}" />
  <meta property="og:url" content="${escAttr(canonical)}" />
  <meta property="og:site_name" content="Asaptic" />

  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escAttr(title)} - Cross-Standard | Asaptic" />
  <meta name="twitter:description" content="${escAttr(description)}" />

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
  <script>document.documentElement.classList.add('js-anim');</script>
  <link rel="stylesheet" href="/style.css?v=20260609c" />
  <link rel="stylesheet" href="/standard/standard.css?v=20260611b" />

  <script type="application/ld+json">
  ${json}
  </script>
</head>`;
}

function relatedLinks({ links = [], lang, locale }) {
  return links
    .map((link) => {
      const text = typeof link.label === "object" ? t(link.label, lang) : link.label;
      return `<li><a href="${escAttr(guideHref(link.href, locale))}">${esc(text)}</a></li>`;
    })
    .join("\n");
}

function mainHtml({ guide, lang, locale }) {
  const title = t(guide.title, lang);
  const description = t(guide.description, lang);
  return `  <main>
    <section class="hero standard-hero" id="top">
      <div class="hero-bg"></div>
      <div class="container">
        <div class="hero-copy fade-in" style="max-width:920px;">
          <p class="hero-eyebrow">${esc(fmt("eyebrow", lang))}</p>
          <h1 class="hero-title" style="font-size:clamp(32px,4.8vw,60px);">${esc(title)}</h1>
          <p class="hero-sub">${esc(description)}</p>
        </div>
      </div>
    </section>
    <section class="standard-section">
      <div class="container">
        <article class="standard-faq">
          ${(guide.body_sections || [])
            .map(
              (section) => `<div class="provenance-panel">
            <h2>${esc(t(section.heading, lang))}</h2>
            ${t(section.html, lang)}
          </div>`
            )
            .join("\n")}
        </article>
      </div>
    </section>
    <section class="standard-section standard-section--compact">
      <div class="container">
        <aside class="standard-compact-disclaimer">
          <strong>${esc(fmt("related", lang))}</strong>
          <ul class="standard-source-list">
            ${relatedLinks({ links: guide.links, lang, locale })}
          </ul>
        </aside>
      </div>
    </section>
  </main>`;
}

function page({ template, id, guide, lang, locale, htmlLang }) {
  const title = t(guide.title, lang);
  const description = t(guide.description, lang);
  const slug = `guides/${id}`;
  return template
    .replace(/<html lang="[^"]*">/, `<html lang="${escAttr(htmlLang)}">`)
    .replace(/<head>[\s\S]*?<\/head>/, head({ id, guide, title, description, lang, locale }))
    .replace(/<nav>[\s\S]*?<\/nav>/, nav({ locale, slug }))
    .replace(/<main>[\s\S]*?<\/main>/, mainHtml({ guide, lang, locale }))
    .replace(/<footer[\s\S]*?<\/footer>/, footer({ lang, locale, slug }))
    // Rewrite any residual methodology.html refs (locale-switcher redirects, canonical helpers)
    // spliced from the chrome so they point at THIS guide page, not methodology.
    .replace(/standard\/methodology\.html/g, `standard/${slug}.html`)
    .replace(/(["'(])methodology\.html/g, `$1${slug}.html`);
}

const guides = readJson(join(DATA, "_guides/guides.json"));
let written = 0;

for (const locale of locales) {
  if (!existsSync(locale.src)) continue;
  const template = readFileSync(locale.src, "utf8");
  const outDir = join(locale.outRoot, "guides");
  mkdirSync(outDir, { recursive: true });
  for (const [id, guide] of Object.entries(guides).sort(([a], [b]) => a.localeCompare(b))) {
    writeFileSync(join(outDir, `${id}.html`), page({ template, id, guide, ...locale }));
    written += 1;
  }
}

console.log(`build-guides: wrote ${written} guide pages (${Object.keys(guides).length} guides across ${locales.length} locales).`);
