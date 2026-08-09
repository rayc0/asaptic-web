// node --test suite for the asaptic.tender.v1 contract kit and the /developers surface.
// Zero dependencies. Run from anywhere: `node --test developers/contract/test/`
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACT_DIR = resolve(HERE, "..");
const DEV_DIR = resolve(CONTRACT_DIR, "..");
const REPO_ROOT = resolve(DEV_DIR, "..");
const VALIDATE = join(CONTRACT_DIR, "validate.mjs");
const FIXTURES = join(CONTRACT_DIR, "fixtures");

const { validate, loadSchema, extractRows } = await import(join(CONTRACT_DIR, "validate.mjs"));
const schema = loadSchema();

// ---------------------------------------------------------------- schema × fixtures

test("every positive fixture validates against asaptic.tender.v1", () => {
  const names = readdirSync(FIXTURES).filter((f) => f.startsWith("positive-") && f.endsWith(".json"));
  assert.ok(names.length >= 3, `expected >= 3 positive fixtures, found ${names.length}`);
  for (const name of names) {
    const doc = JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));
    const errors = validate(doc, schema);
    assert.deepEqual(errors, [], `${name} should validate, got: ${JSON.stringify(errors)}`);
  }
});

test("the negative 403 fixture is rejected by the schema", () => {
  const doc = JSON.parse(readFileSync(join(FIXTURES, "negative-403-spec-denied.json"), "utf8"));
  const errors = validate(doc, schema);
  assert.ok(errors.length > 0, "negative fixture must NOT validate against the feed schema");
});

test("schema rejects targeted mutations of a valid row", () => {
  const base = JSON.parse(readFileSync(join(FIXTURES, "positive-minimal.json"), "utf8"));
  const mutate = (fn) => {
    const doc = structuredClone(base);
    fn(doc);
    return validate(doc, schema).length;
  };
  assert.ok(mutate((d) => (d.rows[0].asaptic_id = "AT-XX-99")) > 0, "bad id shape");
  assert.ok(mutate((d) => (d.rows[0].market = "US")) > 0, "unknown market");
  assert.ok(mutate((d) => (d.rows[0].closing_bucket = "tomorrow")) > 0, "unknown bucket");
  assert.ok(mutate((d) => (d.rows[0].value_band = "5m")) > 0, "unknown value band");
  assert.ok(mutate((d) => (d.rows[0].sort_key = "xyz")) > 0, "bad sort key");
  assert.ok(mutate((d) => delete d.rows[0].summary_zht) > 0, "missing required field");
  assert.ok(mutate((d) => (d.rows[0].extra_field = 1)) > 0, "additional property");
  assert.ok(mutate((d) => (d.withheld = -1)) > 0, "negative withheld");
  assert.ok(mutate((d) => (d.issue_id = "week 32")) > 0, "bad issue id");
});

// ---------------------------------------------------------------- validate.mjs exit codes

test("validate.mjs exit codes: 0 pass, 1 fail, 2 usage error", () => {
  const run = (args, input) =>
    spawnSync(process.execPath, [VALIDATE, ...args], { input, encoding: "utf8" });

  assert.equal(run([join(FIXTURES, "positive-minimal.json")]).status, 0, "valid file -> 0");
  assert.equal(run([join(FIXTURES, "negative-403-spec-denied.json")]).status, 1, "invalid file -> 1");
  assert.equal(run(["/nonexistent/nope.json"]).status, 2, "missing file -> 2");
  assert.equal(run([]).status, 0, "fixture self-test -> 0");
  assert.equal(run(["--stdin"], "not json").status, 2, "bad JSON on stdin -> 2");
  assert.equal(
    run(["--stdin"], readFileSync(join(FIXTURES, "positive-multirow.json"), "utf8")).status,
    0,
    "valid stdin -> 0"
  );
  assert.equal(run(["--stdin", "--sample", "zero"], "{}").status, 2, "bad --sample -> 2");

  // self-test must flip to 1 if a negative fixture wrongly passes
  const dir = mkdtempSync(join(tmpdir(), "at-contract-"));
  writeFileSync(join(dir, "x.json"), "{}");
  assert.equal(run([join(dir, "x.json")]).status, 1, "empty object -> 1");
});

// ---------------------------------------------------------------- --rows (REST plane)

// The REST plane (/api/v1/tenders) serves the SAME rows under a {data, meta}
// envelope. --rows is what makes that surface conformance-checkable against the
// one contract; without it the envelope keys alone produce a spurious failure.
test("--rows unwraps every envelope the rows are served in", () => {
  const feed = JSON.parse(readFileSync(join(FIXTURES, "positive-multirow.json"), "utf8"));
  const row = feed.rows[0];

  assert.equal(extractRows(feed).length, feed.rows.length, "feed envelope");
  assert.equal(extractRows({ data: feed.rows, meta: {} }).length, feed.rows.length, "REST list envelope");
  assert.equal(extractRows({ data: row, meta: {} }).length, 1, "REST single-row envelope");
  assert.equal(extractRows(feed.rows).length, feed.rows.length, "bare array");
  assert.equal(extractRows(row).length, 1, "bare row object");
  assert.equal(extractRows({ error: { code: "SPEC_CODED_GATED" } }), null, "denied body has no rows");
  assert.equal(extractRows(null), null, "null");
});

test("--rows validates rows and ignores the envelope", () => {
  const run = (args, input) =>
    spawnSync(process.execPath, [VALIDATE, ...args], { input, encoding: "utf8" });
  const feed = JSON.parse(readFileSync(join(FIXTURES, "positive-multirow.json"), "utf8"));

  // Same rows, REST envelope: fails envelope mode, passes --rows.
  const rest = JSON.stringify({ data: feed.rows, meta: { issue_id: feed.issue_id } });
  assert.equal(run(["--stdin"], rest).status, 1, "REST envelope fails the feed-envelope check");
  assert.equal(run(["--stdin", "--rows"], rest).status, 0, "REST rows pass --rows");

  // A bad row is still caught in --rows mode.
  const bad = structuredClone(feed);
  bad.rows[0].closing_bucket = "tomorrow";
  assert.equal(run(["--stdin", "--rows"], JSON.stringify({ data: bad.rows })).status, 1, "bad row rejected");

  // lang-collapsed rows are a documented subset, out of contract scope.
  const collapsed = feed.rows.map(({ summary_zh, summary_zht, category, ...rest_ }) => ({
    ...rest_,
    category: { name_en: category.name_en },
  }));
  assert.equal(run(["--stdin", "--rows"], JSON.stringify({ data: collapsed })).status, 1, "lang subset is out of scope");

  // No row array anywhere -> usage error, not a false pass.
  assert.equal(run(["--stdin", "--rows"], JSON.stringify({ error: {} })).status, 2, "no rows -> exit 2");
  assert.equal(run(["--stdin", "--rows", "--sample", "1"], rest).status, 0, "--rows honours --sample");
});

// The published denied-access fixture must keep matching what the server really
// emits: clients branch on these exact keys.
test("negative 403 fixture matches the server's real denied-access key shape", () => {
  const doc = JSON.parse(readFileSync(join(FIXTURES, "negative-403-spec-denied.json"), "utf8"));
  assert.equal(doc.error.code, "SPEC_CODED_GATED", "error.code is the code clients branch on");
  assert.ok(typeof doc.error.message === "string" && doc.error.message.length > 0);
  assert.ok("at_id" in doc, "at_id is top-level, not nested under error");
  assert.ok("access_url" in doc, "access_url is top-level");
  assert.ok(!("asaptic_id" in doc.error), "denied body must not invent an error.asaptic_id");
  assert.ok(/SYNTHETIC/i.test(JSON.stringify(doc)), "fixture must be marked synthetic");
});

// ---------------------------------------------------------------- sentinel scan

// New files this branch introduces. Everything the branch adds must stay free of
// internal field names and of live-feed listing ids (fixtures use AT-TEST- only).
function newFiles() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(DEV_DIR);
  const extra = [
    join(REPO_ROOT, ".github", "workflows", "contract-check.yml"),
    join(REPO_ROOT, "MERGE_NOTES.md"),
  ];
  for (const p of extra) if (existsSync(p)) out.push(p);
  return out;
}

// Tokens are stored encoded so the enumerating list never appears in the public
// repo in plaintext; failure output redacts the matched term (index only).
const ENCODED_TOKENS = ["cmVm", "b3Jn", "ZGVwdA==", "Y2xvc2luZ19pc28=", "dGRy", "cGNtcw=="];

test("sentinel: no internal field names in any new file", () => {
  const tokens = ENCODED_TOKENS.map((t) => Buffer.from(t, "base64").toString("utf8"));
  const findings = [];
  for (const file of newFiles()) {
    const text = readFileSync(file, "utf8").toLowerCase();
    tokens.forEach((tok, i) => {
      // Boundaries: skip hits inside identifiers, dotted domains, and $-prefixed
      // JSON Schema keywords (e.g. the standard pointer keyword).
      const re = new RegExp(`(?<![a-z0-9_.$-])${tok}(?![a-z0-9_-])`, "g");
      const lines = text.split("\n");
      lines.forEach((line, ln) => {
        if (re.test(line)) findings.push(`token#${i} in ${file.replace(REPO_ROOT, "")}:${ln + 1}`);
        re.lastIndex = 0;
      });
    });
  }
  // Redacted on purpose: report position, never the term itself.
  assert.deepEqual(findings, [], `sentinel hits (terms redacted): ${findings.join("; ")}`);
});

test("sentinel: only AT-TEST ids appear in new files, never live-shaped ids", () => {
  const liveShaped = /AT-(?!TEST-)[A-Z]{2}-[0-9]{4}-[0-9]{3}/g;
  const findings = [];
  for (const file of newFiles()) {
    const text = readFileSync(file, "utf8");
    const m = text.match(liveShaped);
    if (m) findings.push(`${file.replace(REPO_ROOT, "")}: ${[...new Set(m)].join(",")}`);
  }
  assert.deepEqual(findings, [], `live-shaped listing ids found: ${findings.join("; ")}`);
});

// ---------------------------------------------------------------- HTML sanity

test("developers/index.html links resolve and contain no file:// or broken local paths", () => {
  const html = readFileSync(join(DEV_DIR, "index.html"), "utf8");
  assert.ok(!/file:\/\//i.test(html), "no file:// links allowed");

  const links = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(links.length > 10, "expected a linked page");

  const mustLink = ["/tender/rows.json", "/mcp", "/llms.txt", "/openapi.json",
    "/developers/contract/asaptic.tender.v1.schema.json", "/developers/conformance.md"];
  for (const need of mustLink) {
    assert.ok(links.includes(need), `page must link ${need}`);
  }

  for (const link of links) {
    if (/^(https?:|mailto:|#)/.test(link)) continue;
    assert.ok(link.startsWith("/"), `local link should be site-absolute: ${link}`);
    const clean = link.split(/[?#]/)[0];
    if (clean === "/" || clean === "/mcp") continue; // worker-served routes
    const fsPath = join(REPO_ROOT, clean.slice(1));
    const ok =
      existsSync(fsPath) ||
      (clean.endsWith("/") && existsSync(join(fsPath, "index.html")));
    assert.ok(ok, `linked path not found in repo: ${link}`);
  }
});

test("status board data is well-formed and honest about statuses", () => {
  const data = JSON.parse(readFileSync(join(DEV_DIR, "status.json"), "utf8"));
  assert.ok(Array.isArray(data.items) && data.items.length >= 8);
  const allowed = new Set(["live", "private_beta", "in_build"]);
  for (const item of data.items) {
    for (const k of ["id", "name", "url", "detail", "status", "last_verified"]) {
      assert.ok(k in item, `status item ${item.id ?? "?"} missing ${k}`);
    }
    assert.ok(allowed.has(item.status), `bad status: ${item.status}`);
    assert.match(item.last_verified, /^\d{4}-\d{2}-\d{2}$/);
  }
  // Claims that are NOT live today must not be marked live.
  for (const id of ["rest_api", "health", "cli", "license", "conformance_cron"]) {
    const row = data.items.find((i) => i.id === id);
    assert.ok(row, `expected status row ${id}`);
    assert.equal(row.status, "in_build", `${id} must be in_build until its gate merges`);
  }
});

// ---------------------------------------------------------------- live feed conformance

test("live feed: 20 sampled rows validate against asaptic.tender.v1", { timeout: 90_000 }, async (t) => {
  let doc;
  try {
    const res = await fetch("https://asaptic.com/tender/rows.json", {
      signal: AbortSignal.timeout(60_000),
    });
    assert.equal(res.status, 200);
    doc = await res.json();
  } catch (err) {
    t.skip(`network unavailable, skipping live conformance: ${err.message}`);
    return;
  }
  assert.ok(Array.isArray(doc.rows) && doc.rows.length > 0, "live feed has rows");

  const rows = [...doc.rows];
  const sample = [];
  while (sample.length < 20 && rows.length) {
    sample.push(rows.splice(Math.floor(Math.random() * rows.length), 1)[0]);
  }
  const sampled = { ...doc, rows: sample };
  const errors = validate(sampled, schema);
  assert.deepEqual(errors, [], `live feed sample failed contract: ${JSON.stringify(errors.slice(0, 5))}`);
});
