import { jsonld } from "./jsonld.mjs";

const site = "https://asaptic.com";

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function head({ data, lang, locale, slug, rows }) {
  const title = data.page.title[lang];
  const description = data.page.description[lang];
  const pathPrefix = locale === "en" ? "" : `/${locale}`;
  const canonical = `${site}${pathPrefix}/standard/${slug}.html`;
  const robots =
    data.human_reviewed === false || rows.some((row) => row.source?.verified === false)
      ? "noindex, follow"
      : data.robots || "index, follow";

  return `<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>

  <meta name="description" content="${esc(description)}" />
  <meta name="robots" content="${esc(robots)}" />
  <link rel="canonical" href="${canonical}" />
  <link rel="alternate" hreflang="en" href="${site}/standard/${slug}.html" />
  <link rel="alternate" hreflang="zh-Hans" href="${site}/zh/standard/${slug}.html" />
  <link rel="alternate" hreflang="zh-Hant" href="${site}/zht/standard/${slug}.html" />
  <link rel="alternate" hreflang="x-default" href="${site}/standard/${slug}.html" />

  <meta property="og:type" content="article" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:site_name" content="Asaptic" />

  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
  <script>document.documentElement.classList.add('js-anim');</script>
  <link rel="stylesheet" href="/style.css?v=20260609c" />

  <script type="application/ld+json">
  ${jsonld({ data, lang, locale, slug })}
  </script>
</head>`;
}
