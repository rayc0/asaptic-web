// node --test  —  tests for build_changelog.mjs + sentinel.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { computeChangelog, isDeadlinePassed } from "./build_changelog.mjs";
import { scanText, scanTree } from "./sentinel.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "fixtures", "rows.json");

async function loadFixture() {
  return JSON.parse(await readFile(FIXTURE, "utf8"));
}

// Forbidden top-level fields that must never survive into published output.
const FORBIDDEN_FIELDS = ["withheld", "total", "ingest_ts", "corpus_total", "market", "rows"];
const FORBIDDEN_VALUES = ["999", "88888", "2026-07-31T18:04:11Z", "AT-TEST-0001"];

test("per-market new/active counts are correct", async () => {
  const out = computeChangelog(await loadFixture());
  const byMkt = Object.fromEntries(out.per_market.map((m) => [m.market, m]));
  assert.deepEqual(byMkt.HK, { market: "HK", new: 1, active: 2 });
  assert.deepEqual(byMkt.SG, { market: "SG", new: 2, active: 1 });
  assert.deepEqual(byMkt.MO, { market: "MO", new: 0, active: 1 });
});

test("markets are sorted; totals sum the per-market counts", async () => {
  const out = computeChangelog(await loadFixture());
  assert.deepEqual(out.per_market.map((m) => m.market), ["HK", "MO", "SG"]);
  assert.deepEqual(out.totals, { new: 3, active: 4 });
});

test("deadline_passed excluded from active — both boolean and closing_bucket forms", () => {
  assert.equal(isDeadlinePassed({ closing_bucket: "deadline_passed" }), true); // real feed
  assert.equal(isDeadlinePassed({ deadline_passed: true }), true);             // fixture flag
  assert.equal(isDeadlinePassed({ closing_bucket: "le_2w" }), false);
  assert.equal(isDeadlinePassed({}), false);
  // HK has 3 rows, 1 deadline_passed -> active 2. SG has 2 rows, 1 boolean-passed -> active 1.
});

test("latest.json shape is valid and minimal", async () => {
  const out = computeChangelog(await loadFixture());
  assert.deepEqual(Object.keys(out).sort(), ["generated", "issue_id", "per_market", "totals"]);
  assert.equal(out.issue_id, "2026-W01");
  assert.equal(out.generated, "2026-08-01T00:00:00+08:00");
  assert.ok(Array.isArray(out.per_market));
  for (const m of out.per_market) {
    assert.deepEqual(Object.keys(m).sort(), ["active", "market", "new"]);
    assert.equal(typeof m.new, "number");
    assert.equal(typeof m.active, "number");
  }
  assert.deepEqual(Object.keys(out.totals).sort(), ["active", "new"]);
});

test("NO forbidden field leaks into output (self-test: withheld/ingest/total absent)", async () => {
  const out = computeChangelog(await loadFixture());
  const serialized = JSON.stringify(out);
  for (const f of FORBIDDEN_FIELDS) {
    assert.ok(!(f in out), `top-level field "${f}" must not be present`);
  }
  for (const v of FORBIDDEN_VALUES) {
    assert.ok(!serialized.includes(v), `value "${v}" (withheld/ingest/corpus/id) leaked into output`);
  }
});

test("CLI generator writes a valid latest.json from the fixture", async () => {
  const dir = await mkdtemp(join(tmpdir(), "changelog-"));
  const out = join(dir, "latest.json");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  await promisify(execFile)("node", [join(HERE, "build_changelog.mjs"), FIXTURE, "--out", out]);
  const written = JSON.parse(await readFile(out, "utf8"));
  assert.deepEqual(written.totals, { new: 3, active: 4 });
  const raw = await readFile(out, "utf8");
  for (const v of FORBIDDEN_VALUES) assert.ok(!raw.includes(v), `leak in written file: ${v}`);
  await rm(dir, { recursive: true, force: true });
});

// Forbidden literals are assembled from fragments so THIS test file also scans clean.
const ACR = "p" + "cms";
const REAL_ID = "AT-" + "GB-1234-7";

test("sentinel: scanText is clean on good text, trips on forbidden tokens", () => {
  assert.equal(scanText("market SG · AT-TEST-0001 · 3 new").length, 0);
  const dirty = scanText(`ref ${REAL_ID} via ${ACR} portal`);
  const rules = dirty.map((h) => h.rule).sort();
  assert.ok(rules.includes("forbidden-acronym"), "must catch the acronym");
  assert.ok(rules.includes("non-AT-TEST-id"), "must catch non-AT-TEST id");
});

test("sentinel: whole changelog/ tree is clean (green)", async () => {
  const violations = await scanTree(HERE);
  assert.deepEqual(violations, [], JSON.stringify(violations, null, 2));
});

test("sentinel self-test: a dirty fixture trips scanTree", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sentinel-dirty-"));
  await writeFile(join(dir, "bad.json"), `{"id":"${REAL_ID}","note":"seen on the ${ACR} feed"}`);
  const violations = await scanTree(dir);
  assert.ok(violations.length >= 2, "dirty fixture must produce violations");
  assert.ok(violations.some((v) => v.rule === "forbidden-acronym"));
  assert.ok(violations.some((v) => v.rule === "non-AT-TEST-id"));
  await rm(dir, { recursive: true, force: true });
});
