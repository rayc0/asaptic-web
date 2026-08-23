import { jsonld } from "./jsonld.mjs";
import { cleanStandardUrl, escAttr, t } from "./i18n.mjs";
import { renderHeadLinks } from "./shell.mjs";

const site = "https://asaptic.com";

export function head({ data, lang, locale, slug, rows, faq }) {
  const title = t(data.page.title, lang);
  const description = t(data.page.description, lang);
  const canonical = cleanStandardUrl({ site, locale, slug });
  // Publication policy (Raymond 2026-06-13): pages publish under an AI-compiled +
  // prominent-disclaimer policy via `ai_published`, OR after human review. verified:false /
  // human_reviewed:false are kept as honest provenance (the disclaimer states AI-compiled).
  const robots =
    data.human_reviewed === true || data.ai_published === true
      ? data.robots || "index, follow"
      : "noindex, follow";

  // Canonical + hreflang + shell.css live in the ASAPTIC:HEAD sentinel block,
  // rendered by shell.mjs so it stays byte-identical to what apply_shell.py
  // baked onto every migrated page (see shell.mjs's renderHeadLinks doc for why
  // this is a hand-kept mirror rather than a subprocess call for <head>).
  return `<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escAttr(title)}</title>

  <meta name="description" content="${escAttr(description)}" />
  <meta name="robots" content="${escAttr(robots)}" />

  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escAttr(title)}" />
  <meta property="og:description" content="${escAttr(description)}" />
  <meta property="og:url" content="${escAttr(canonical)}" />
  <meta property="og:site_name" content="Asaptic" />

  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escAttr(title)}" />
  <meta name="twitter:description" content="${escAttr(description)}" />

  <script>document.documentElement.classList.add('js-anim');</script>
${renderHeadLinks({ locale, slug })}

  <link rel="stylesheet" href="/standard/standard.css?v=20260611b" />

  <script type="application/ld+json">
  ${jsonld({ data, lang, locale, slug, faq, rows })}
  </script>
</head>`;
}
