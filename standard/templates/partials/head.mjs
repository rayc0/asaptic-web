import { jsonld } from "./jsonld.mjs";
import { cleanStandardUrl, escAttr, t } from "./i18n.mjs";

const site = "https://asaptic.com";

export function head({ data, lang, locale, slug, rows, faq }) {
  const title = t(data.page.title, lang);
  const description = t(data.page.description, lang);
  const canonical = cleanStandardUrl({ site, locale, slug });
  const robots =
    data.human_reviewed === false || rows.some((row) => row.source?.verified === false)
      ? "noindex, follow"
      : data.robots || "index, follow";

  return `<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escAttr(title)}</title>

  <meta name="description" content="${escAttr(description)}" />
  <meta name="robots" content="${escAttr(robots)}" />
  <link rel="canonical" href="${escAttr(canonical)}" />
  <link rel="alternate" hreflang="en" href="${escAttr(cleanStandardUrl({ site, locale: "en", slug }))}" />
  <link rel="alternate" hreflang="zh-Hans" href="${escAttr(cleanStandardUrl({ site, locale: "zh", slug }))}" />
  <link rel="alternate" hreflang="zh-Hant" href="${escAttr(cleanStandardUrl({ site, locale: "zht", slug }))}" />
  <link rel="alternate" hreflang="x-default" href="${escAttr(cleanStandardUrl({ site, locale: "en", slug }))}" />

  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escAttr(title)}" />
  <meta property="og:description" content="${escAttr(description)}" />
  <meta property="og:url" content="${escAttr(canonical)}" />
  <meta property="og:site_name" content="Asaptic" />

  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escAttr(title)}" />
  <meta name="twitter:description" content="${escAttr(description)}" />

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
  <script>document.documentElement.classList.add('js-anim');</script>
  <link rel="stylesheet" href="/style.css?v=20260609c" />
  <link rel="stylesheet" href="/standard/standard.css?v=20260611b" />

  <script type="application/ld+json">
  ${jsonld({ data, lang, locale, slug, faq })}
  </script>
</head>`;
}
