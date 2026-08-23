import { jsonld } from "./jsonld.mjs";
import { cleanStandardUrl, escAttr, t } from "./i18n.mjs";
import { renderHeadLinks } from "./shell.mjs";

const site = "https://asaptic.com";
const OG_IMAGE = `${site}/img/og-image.jpg`;

function isCjkChar(ch) {
  return /[㐀-鿿豈-﫿]/.test(ch);
}

/**
 * Splits text into sentence-like chunks, keeping the terminal punctuation (and any
 * closing quote/bracket that follows it) attached to the sentence it ends. Covers
 * both Latin (. ! ?) and CJK (。！？) sentence enders since description text is
 * per-language (en / zh-Hans / zh-Hant).
 *
 * CJK terminators are unambiguous and always end a sentence. A Latin terminator only
 * ends a sentence when it's followed by whitespace + an uppercase/CJK character, or by
 * end of string — this avoids false splits on abbreviations/numbering that are common
 * in this dataset, e.g. "Directive No. 1034/2024" (digit follows) or "U.S. market"
 * (lowercase follows).
 */
function splitSentences(text) {
  const sentences = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const isCjkEnder = ch === "。" || ch === "！" || ch === "？";
    const isLatinEnder = ch === "." || ch === "!" || ch === "?";
    if (!isCjkEnder && !isLatinEnder) continue;

    let end = i + 1;
    while (end < text.length && /["'）】)]/.test(text[end])) end++;

    if (isCjkEnder) {
      sentences.push(text.slice(start, end));
      start = end;
      continue;
    }

    let look = end;
    while (look < text.length && /\s/.test(text[look])) look++;
    const atEnd = look >= text.length;
    const nextChar = text[look];
    const nextIsUpperOrCjk = nextChar && (/[A-Z]/.test(nextChar) || isCjkChar(nextChar));
    if (atEnd || (look > end && nextIsUpperOrCjk)) {
      sentences.push(text.slice(start, look));
      start = look;
    }
  }
  if (start < text.length) sentences.push(text.slice(start));
  return sentences.length ? sentences : [text];
}

/**
 * Caps a meta-description-style string at maxLen characters for search/social
 * snippet limits, without truncating mid-word and without an ellipsis. Prefers
 * cutting on a whole-sentence boundary (accumulates sentences up to the limit);
 * if even the first sentence is longer than maxLen, falls back to the last word
 * boundary at or before the limit (CJK text has no spaces, so this naturally
 * becomes a hard character cut for zh/zht).
 */
function truncateDescription(text, maxLen) {
  if (!text) return "";
  const full = text.trim();
  if (full.length <= maxLen) return full;

  let result = "";
  for (const sentence of splitSentences(full)) {
    if ((result + sentence).trim().length > maxLen) break;
    result += sentence;
  }
  result = result.trim();
  if (result) return result;

  const hardCut = full.slice(0, maxLen);
  const lastSpace = hardCut.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.6) return hardCut.slice(0, lastSpace).trim();
  return hardCut.trim();
}

export function head({ data, lang, locale, slug, rows, faq }) {
  const title = t(data.page.title, lang);
  const descriptionMaxLen = lang === "en" ? 160 : 80;
  const description = truncateDescription(t(data.page.description, lang), descriptionMaxLen);
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
  <meta property="og:image" content="${escAttr(OG_IMAGE)}" />

  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escAttr(title)}" />
  <meta name="twitter:description" content="${escAttr(description)}" />
  <meta name="twitter:image" content="${escAttr(OG_IMAGE)}" />

  <script>document.documentElement.classList.add('js-anim');</script>
${renderHeadLinks({ locale, slug })}

  <link rel="stylesheet" href="/standard/standard.css?v=20260611b" />

  <script type="application/ld+json">
  ${jsonld({ data, lang, locale, slug, faq, rows })}
  </script>
</head>`;
}
