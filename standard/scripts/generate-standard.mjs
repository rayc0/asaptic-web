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
const DATA_FILE = join(ROOT, "standard/data/pv-inverter-eu.v2026-06-11.json");
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

function fragmentFiles() {
  if (!existsSync(FRAGMENT_DIR)) return [];
  return readdirSync(FRAGMENT_DIR)
    .filter((file) => /^eu-.*\.json$/.test(file))
    .sort()
    .map((file) => join(FRAGMENT_DIR, file));
}

function rowsFor(data) {
  const rows = [...(data.rows || [])];
  for (const file of fragmentFiles()) {
    const fragment = readJson(file);
    if (!Array.isArray(fragment)) throw new Error(`${file} must contain an array.`);
    rows.push(...fragment);
  }
  return rows;
}

function answerFirst({ data, rows, lang }) {
  const reviewed = data.human_reviewed && rows.length > 0 && rows.every((row) => row.source?.verified === true);
  const status = reviewed
    ? {
        en: "Reviewed source matrix published.",
        zh: "已发布经审校来源矩阵。",
        zht: "已發布經審校來源矩陣。"
      }
    : {
        en: "Draft spine: no human-reviewed compliance conclusion is published yet.",
        zh: "草稿骨架：尚未发布经人工审校的合规结论。",
        zht: "草稿骨架：尚未發布經人工審校的合規結論。"
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

function eeat({ data, lang }) {
  return `<section class="standard-section">
    <div class="container standard-eeat">
      <div>
        <p class="section-label">${esc(label("eeat", lang))}</p>
        <h2 class="section-title">${esc(label("namedEditorialReview", lang))}</h2>
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
        <h2 class="section-title">${esc(label("faqTitle", lang))}</h2>
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
  ${nav({ locale })}

  <main>
    ${answerFirst({ data, rows, lang })}
    <section class="standard-section">
      <div class="container">
        <p class="section-label">${esc(label("gapMatrix", lang))}</p>
        <h2 class="section-title">${esc(label("gapMatrixTitle", lang))}</h2>
        ${comparisonTable({ rows, lang })}
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

  ${footer({ lang, locale })}
  <script>
    document.querySelectorAll('.fade-in').forEach((el) => el.classList.add('visible'));
  </script>
</body>
</html>
`;
}

const data = readJson(DATA_FILE);
const rows = rowsFor(data);
const faq = existsSync(FAQ_FILE) ? readJson(FAQ_FILE) : data.faq || [];
if (!Array.isArray(faq)) throw new Error(`${FAQ_FILE} must contain an array.`);
for (const locale of locales) {
  const outDir = join(ROOT, locale.outDir);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, `${data.slug}.html`),
    page({ data, rows, faq, ...locale })
  );
}

console.log(`generate-standard: wrote ${locales.length} pages for ${data.dataset_id} (${rows.length} rows, ${faq.length} FAQ entries).`);
