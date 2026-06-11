#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { comparisonTable } from "../templates/partials/comparison-table.mjs";
import { disclaimer } from "../templates/partials/disclaimer.mjs";
import { footer } from "../templates/partials/footer.mjs";
import { head } from "../templates/partials/head.mjs";
import { nav } from "../templates/partials/nav.mjs";
import { sourceList } from "../templates/partials/source-list.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA_FILE = join(ROOT, "standard/data/pv-inverter-eu.v2026-06-11.json");
const FRAGMENT_DIR = join(ROOT, "standard/data/_fragments");

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

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
          <p class="hero-eyebrow">CROSS-STANDARD 公益 · ${esc(data.category.labels[lang])}</p>
          <h1 class="hero-title">${esc(data.page.title[lang])}</h1>
          <p class="hero-sub">${esc(status[lang])} ${esc(data.page.description[lang])}</p>
          <div class="standard-status">
            <span>Dataset ${esc(data.version)}</span>
            <span>Last verified ${esc(data.last_verified)}</span>
            <span>${rows.length} rows</span>
          </div>
        </div>
      </div>
    </section>`;
}

function eeat({ data, lang }) {
  const labels = {
    en: ["Named editorial review", "Pending named reviewer", "Editorial controls"],
    zh: ["具名审校", "待具名审校人", "编辑控制"],
    zht: ["具名審校", "待具名審校人", "編輯控制"]
  }[lang];

  return `<section class="standard-section">
    <div class="container standard-eeat">
      <div>
        <p class="section-label">E-E-A-T</p>
        <h2 class="section-title">${labels[0]}</h2>
      </div>
      <div class="provenance-panel">
        <strong>${labels[1]}</strong>
        <p>${esc(data.editorial_controls.source_policy)}</p>
        <strong>${labels[2]}</strong>
        <p>${esc(data.editorial_controls.change_control)}</p>
      </div>
    </div>
  </section>`;
}

function page({ data, rows, lang, locale, htmlLang }) {
  const slug = data.slug;
  return `<!DOCTYPE html>
<html lang="${htmlLang}">
${head({ data, lang, locale, slug, rows })}
<body>
  ${nav({ locale })}

  <main>
    ${answerFirst({ data, rows, lang })}
    <section class="standard-section">
      <div class="container">
        <p class="section-label">GAP MATRIX</p>
        <h2 class="section-title">合规项 / 中国常见已有 / EU要求 / 差距动作</h2>
        ${comparisonTable({ rows, lang })}
      </div>
    </section>
    <section class="standard-section">
      <div class="container">
        ${disclaimer({ data, lang })}
      </div>
    </section>
    ${eeat({ data, lang })}
    ${sourceList({ rows })}
  </main>

  ${footer()}
  <script>
    document.querySelectorAll('.fade-in').forEach((el) => el.classList.add('visible'));
  </script>
</body>
</html>
`;
}

const data = readJson(DATA_FILE);
const rows = rowsFor(data);
for (const locale of locales) {
  const outDir = join(ROOT, locale.outDir);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, `${data.slug}.html`),
    page({ data, rows, ...locale })
  );
}

console.log(`generate-standard: wrote ${locales.length} pages for ${data.dataset_id} (${rows.length} rows).`);
