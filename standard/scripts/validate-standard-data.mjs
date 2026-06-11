#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA_FILE = join(ROOT, "standard/data/pv-inverter-eu.v2026-06-11.json");
const FRAGMENT_DIR = join(ROOT, "standard/data/_fragments");

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

function mergedRows(data) {
  const rows = [...(data.rows || [])];
  for (const file of fragmentFiles()) {
    const fragment = readJson(file);
    if (!Array.isArray(fragment)) throw new Error(`${file} must contain an array of row objects.`);
    rows.push(...fragment);
  }
  return rows;
}

function isLocalPdf(url = "") {
  return /\.pdf(?:$|[?#])/i.test(url) && !/^https?:\/\//i.test(url);
}

const errors = [];
const warnings = [];
const data = readJson(DATA_FILE);

if (!data.last_verified) errors.push("page wrapper requires last_verified.");

const rows = mergedRows(data);
if (rows.length === 0) errors.push("no comparison rows found: add reviewed row objects to standard/data/_fragments/eu-*.json.");

rows.forEach((row, index) => {
  const label = row.id || `row[${index}]`;
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
const draftMode = data.human_reviewed === false && robots === "noindex,follow";
const pageWouldBeIndexable = data.human_reviewed === true || robots.startsWith("index");

if (data.human_reviewed === false && robots !== "noindex,follow") {
  errors.push("robots must be noindex,follow while human_reviewed=false.");
}

if (unverifiedRows.length && pageWouldBeIndexable) {
  errors.push(
    `page would be indexable while ${unverifiedRows.length} row(s) are unverified; keep human_reviewed=false and robots=noindex,follow until all sources are verified.`
  );
}

if (errors.length) {
  console.error("validate-standard-data: FAIL");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

if (warnings.length && draftMode) {
  console.warn("validate-standard-data: PASS WITH WARNINGS");
  for (const warning of warnings) console.warn(`- ${warning}`);
  console.log(`validate-standard-data: PASS (${rows.length} rows, robots=${data.robots || "index,follow"}, draft-mode)`);
} else {
  for (const warning of warnings) console.warn(`- ${warning}`);
  console.log(`validate-standard-data: PASS (${rows.length} rows, robots=${data.robots || "index,follow"})`);
}
