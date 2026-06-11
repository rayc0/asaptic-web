#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA_DIR = join(ROOT, "standard/data");
const FRAGMENT_DIR = join(ROOT, "standard/data/_fragments");

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

function mergedRows(data) {
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
      fragmentErrors.push(`${file}: must contain an array of row objects.`);
      continue;
    }
    rows.push(...fragment);
  }
  return { rows, fragmentErrors };
}

function isLocalPdf(url = "") {
  return /\.pdf(?:$|[?#])/i.test(url) && !/^https?:\/\//i.test(url);
}

const errors = [];
const warnings = [];
let rowCount = 0;

for (const file of datasetFiles()) {
  const data = normalizeData(readJson(file));
  const dataset = data.dataset_id || file;

  if (!data.dataset_id) errors.push(`${file}: wrapper requires dataset_id.`);
  if (!data.slug) errors.push(`${dataset}: wrapper requires slug.`);
  if (!data.version) errors.push(`${dataset}: wrapper requires version.`);
  if (!data.last_verified) errors.push(`${dataset}: wrapper requires last_verified.`);
  if (!data.category?.labels) errors.push(`${dataset}: wrapper requires category.labels.`);
  if (!data.target_market_label) errors.push(`${dataset}: wrapper requires target_market_label.`);
  if (!data.page?.title || !data.page?.description) errors.push(`${dataset}: wrapper requires page.title and page.description.`);
  if (!data.disclaimer) errors.push(`${dataset}: wrapper requires disclaimer.`);
  if (!data.answer_first) errors.push(`${dataset}: wrapper requires answer_first.`);
  if (!data.fragment_prefix) errors.push(`${dataset}: wrapper requires fragment_prefix.`);

  const { rows, fragmentErrors } = mergedRows(data);
  rowCount += rows.length;
  for (const fragmentError of fragmentErrors) {
    warnings.push(`${dataset}: fragment skipped because it is not ready: ${fragmentError}`);
  }
  if (rows.length === 0) {
    warnings.push(`${dataset}: no comparison rows found for fragment_prefix=${data.fragment_prefix}; generator will skip this dataset.`);
  }

  rows.forEach((row, index) => {
    const label = `${dataset}:${row.id || `row[${index}]`}`;
    const targetRequirement = row.target_requirement || row.eu_requirement;
    const mandatoryStatusTarget = row.mandatory_status?.target || row.mandatory_status?.eu;
    if (!row.requirement_topic) errors.push(`${label}: missing requirement_topic.`);
    if (!targetRequirement) errors.push(`${label}: missing target_requirement or eu_requirement.`);
    if (!row.cn_common_equivalent) errors.push(`${label}: missing cn_common_equivalent.`);
    if (!mandatoryStatusTarget) warnings.push(`${label}: mandatory_status.target/eu is missing.`);
    if (!row.source) errors.push(`${label}: missing source object.`);
    if (!row.source?.url) errors.push(`${label}: missing source.url.`);
    if (!row.source?.publisher) errors.push(`${label}: missing source.publisher.`);
    if (!row.source?.accessed) errors.push(`${label}: missing source.accessed.`);
    if (typeof row.source?.verified !== "boolean") errors.push(`${label}: source.verified must be boolean.`);
    if (row.source?.verified !== true) warnings.push(`${label}: source.verified is false; page must remain noindex.`);
    if (isLocalPdf(row.source?.url)) errors.push(`${label}: local PDF links are rejected (${row.source.url}).`);
  });

  const robots = String(data.robots || "").replace(/\s+/g, "").toLowerCase();
  const unverifiedRows = rows.filter((row) => row.source?.verified !== true);
  const pageWouldBeIndexable = data.human_reviewed === true || robots.startsWith("index");

  if (data.human_reviewed === false && robots !== "noindex,follow") {
    errors.push(`${dataset}: robots must be noindex,follow while human_reviewed=false.`);
  }

  if (unverifiedRows.length && pageWouldBeIndexable) {
    errors.push(
      `${dataset}: page would be indexable while ${unverifiedRows.length} row(s) are unverified; keep human_reviewed=false and robots=noindex,follow until all sources are verified.`
    );
  }
}

if (errors.length) {
  console.error("validate-standard-data: FAIL");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

if (warnings.length) {
  console.warn("validate-standard-data: PASS WITH WARNINGS");
  for (const warning of warnings) console.warn(`- ${warning}`);
  console.log(`validate-standard-data: PASS (${rowCount} rows across ${datasetFiles().length} dataset(s), draft-mode)`);
} else {
  console.log(`validate-standard-data: PASS (${rowCount} rows across ${datasetFiles().length} dataset(s))`);
}
