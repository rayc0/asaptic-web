#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { comparisonTable } from "../templates/partials/comparison-table.mjs";
import { disclaimer } from "../templates/partials/disclaimer.mjs";
import { footer } from "../templates/partials/footer.mjs";
import { head } from "../templates/partials/head.mjs";
import { esc, label, t } from "../templates/partials/i18n.mjs";
import { nav } from "../templates/partials/nav.mjs";
import { sourceList } from "../templates/partials/source-list.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA_DIR = join(ROOT, "standard/data");
const FRAGMENT_DIR = join(ROOT, "standard/data/_fragments");
const FAQ_FILE = join(FRAGMENT_DIR, "faq-eu-inverter.json");

const locales = [
  { locale: "en", lang: "en", htmlLang: "en", outDir: "standard" },
  { locale: "zh", lang: "zh", htmlLang: "zh-CN", outDir: "zh/standard" },
  { locale: "zht", lang: "zht", htmlLang: "zh-TW", outDir: "zht/standard" }
];

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function datasetFiles() {
  return readdirSync(DATA_DIR)
    .filter((file) => /^[^_].*\.v2026-06-11\.json$/.test(file))
    .sort()
    .map((file) => join(DATA_DIR, file));
}

function normalizeData(data) {
  const targetMarket = data.target_market_label || data.markets?.find?.((market) => market.role === "target-market")?.label;
  return {
    ...data,
    slug: data.slug || data.page?.slug,
    category: {
      ...data.category,
      labels: data.category?.labels || data.category?.label
    },
    target_market_label:
      typeof targetMarket === "string"
        ? { en: targetMarket, zh: targetMarket, zht: targetMarket }
        : targetMarket
  };
}

function fragmentFiles(prefix) {
  if (!prefix) return [];
  if (!existsSync(FRAGMENT_DIR)) return [];
  return readdirSync(FRAGMENT_DIR)
    .filter((file) => file.startsWith(prefix) && file.endsWith(".json"))
    .sort()
    .map((file) => join(FRAGMENT_DIR, file));
}

function rowsFor(data) {
  const rows = [...(data.rows || [])];
  const fragmentErrors = [];
  for (const file of fragmentFiles(data.fragment_prefix)) {
    let fragment;
    try {
      fragment = readJson(file);
    } catch (error) {
      fragmentErrors.push(`${file}: ${error.message}`);
      continue;
    }
    if (!Array.isArray(fragment)) {
      fragmentErrors.push(`${file}: must contain an array.`);
      continue;
    }
    rows.push(...fragment);
  }
  return { rows, fragmentErrors };
}

function hero({ data, rows, lang }) {
  const reviewed = data.human_reviewed && rows.length > 0 && rows.every((row) => row.source?.verified === true);
  const status = reviewed
    ? {
        en: "Reviewed source matrix published.",
        zh: "已发布经审校来源矩阵。",
        zht: "已發布經審校來源矩陣。"
      }
    : {
        en: label("heroBetaStatus", "en"),
        zh: label("heroBetaStatus", "zh"),
        zht: label("heroBetaStatus", "zht")
      };

  return `<section class="hero standard-hero" id="top">
      <div class="hero-bg"></div>
      <div class="container">
        <div class="hero-copy fade-in">
          <p class="hero-eyebrow">CROSS-STANDARD ${esc(label("publicInterest", lang))} · ${esc(t(data.category.labels, lang))}</p>
          <h1 class="hero-title">${esc(t(data.page.title, lang))}</h1>
          <p class="hero-sub">${esc(t(status, lang))} ${esc(t(data.page.description, lang))}</p>
          <div class="standard-status">
            <span>${esc(label("dataset", lang))} ${esc(data.version)}</span>
            <span>${esc(label("lastVerified", lang))} ${esc(data.last_verified)}</span>
            <span>${rows.length} ${esc(label("rows", lang))}</span>
          </div>
        </div>
      </div>
    </section>`;
}

function answerFirst({ data, lang }) {
  const verdict = t(data.answer_first, lang) || label("answerFirstVerdict", lang);
  return `<section class="standard-section standard-section--compact">
    <div class="container">
      <aside class="answer-first">
        <span class="answer-first__label">${esc(label("answerFirstLabel", lang))}</span>
        <p class="answer-first__verdict">${esc(verdict)}</p>
      </aside>
      <aside class="standard-compact-disclaimer">
        <strong>${esc(label("informationalOnly", lang))}</strong>
        <p>${esc(label("compactDisclaimer", lang))}</p>
      </aside>
    </div>
  </section>`;
}

function eeat({ data, lang }) {
  return `<section class="standard-section">
    <div class="container standard-eeat">
      <div>
        <p class="section-label">${esc(label("eeat", lang))}</p>
        <h2 class="section-title standard-content-heading">${esc(label("namedEditorialReview", lang))}</h2>
      </div>
      <div class="provenance-panel">
        <strong>${esc(label("pendingNamedReviewer", lang))}</strong>
        <p>${esc(label("sourcePolicyText", lang) || data.editorial_controls.source_policy)}</p>
        <strong>${esc(label("editorialControls", lang))}</strong>
        <p>${esc(label("changeControlText", lang) || data.editorial_controls.change_control)}</p>
      </div>
    </div>
  </section>`;
}

function validFaqEntries(faq, lang) {
  return (faq || []).filter((item) => t(item.question, lang) && t(item.answer, lang));
}

function faqSection({ faq, lang }) {
  const entries = validFaqEntries(faq, lang);
  if (!entries.length) return "";
  return `<section class="standard-section" id="faq">
      <div class="container">
        <p class="section-label">${esc(label("faq", lang))}</p>
        <h2 class="section-title standard-content-heading">${esc(label("faqTitle", lang))}</h2>
        <div class="standard-faq">
          ${entries
            .map(
              (item) => `<details>
            <summary>${esc(t(item.question, lang))}</summary>
            <p>${esc(t(item.answer, lang))}</p>
          </details>`
            )
            .join("\n")}
        </div>
      </div>
    </section>`;
}

function page({ data, rows, faq, lang, locale, htmlLang }) {
  const slug = data.slug;
  return `<!DOCTYPE html>
<html lang="${htmlLang}">
${head({ data, lang, locale, slug, rows, faq })}
<body>
  ${nav({ locale, slug })}

  <main>
    ${hero({ data, rows, lang })}
    ${answerFirst({ data, lang })}
    <section class="standard-section">
      <div class="container">
        <p class="section-label">${esc(label("gapMatrix", lang))}</p>
        <h2 class="section-title standard-content-heading">${esc(label("gapMatrixTitle", lang))}</h2>
        ${comparisonTable({ data, rows, lang })}
      </div>
    </section>
    ${faqSection({ faq, lang })}
    <section class="standard-section">
      <div class="container">
        ${disclaimer({ data, lang })}
      </div>
    </section>
    ${eeat({ data, lang })}
    ${sourceList({ rows, lang })}
  </main>

  ${footer({ lang, locale, slug })}
  <script>
    document.querySelectorAll('.fade-in').forEach((el) => el.classList.add('visible'));
  </script>
</body>
</html>
`;
}

let written = 0;
let skipped = 0;

for (const file of datasetFiles()) {
  const data = normalizeData(readJson(file));
  if (!data.dataset_id) throw new Error(`${file} requires dataset_id.`);
  if (!data.slug) throw new Error(`${file} requires slug.`);
  if (!data.category?.labels) throw new Error(`${file} requires category.labels.`);
  if (!data.target_market_label) throw new Error(`${file} requires target_market_label.`);
  if (!data.fragment_prefix) throw new Error(`${file} requires fragment_prefix.`);

  const { rows, fragmentErrors } = rowsFor(data);
  const faq =
    data.dataset_id === "pv-inverter-eu-vs-cn-grid-tied" && existsSync(FAQ_FILE)
      ? readJson(FAQ_FILE)
      : data.faq || [];
  if (!Array.isArray(faq)) throw new Error(`${file} faq must contain an array.`);

  if (fragmentErrors.length) {
    skipped += 1;
    console.warn(`generate-standard: SKIP ${data.dataset_id} (${data.slug}) because fragment data is not ready:`);
    for (const warning of fragmentErrors) console.warn(`- ${warning}`);
    continue;
  }

  if (rows.length === 0) {
    skipped += 1;
    console.warn(
      `generate-standard: SKIP ${data.dataset_id} (${data.slug}) because no rows were found for fragment_prefix=${data.fragment_prefix}.`
    );
    continue;
  }

  for (const locale of locales) {
    const outDir = join(ROOT, locale.outDir);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      join(outDir, `${data.slug}.html`),
      page({ data, rows, faq, ...locale })
    );
    written += 1;
  }

  console.log(`generate-standard: wrote ${locales.length} pages for ${data.dataset_id} (${rows.length} rows, ${faq.length} FAQ entries).`);
}
console.log(`generate-standard: complete (${written} page files written, ${skipped} dataset(s) skipped).`);
