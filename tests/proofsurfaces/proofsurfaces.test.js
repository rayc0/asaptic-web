"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const { scanText, SHIPPED_FILES } = require("./sentinel.js");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const readJSON = (rel) => JSON.parse(read(rel));

/* ---------------- 1. proof manifest JSON validity + shape ---------------- */
test("asaptic-proof.json is valid JSON with a falsifiable shape", () => {
  const m = readJSON(".well-known/asaptic-proof.json");
  assert.equal(m.issuer, "asaptic.com");
  assert.ok(m.manifest_version, "manifest_version present");
  assert.ok(m.endpoints && typeof m.endpoints === "object", "endpoints object present");
  for (const key of ["tender_feed", "mcp", "tenders_api", "health"]) {
    const e = m.endpoints[key];
    assert.ok(e, `endpoint ${key} present`);
    assert.match(e.url, /^https:\/\/asaptic\.com\//, `${key} url canonical`);
    assert.ok(["live", "pending_rollout"].includes(e.state), `${key} state honest`);
  }
  // schema pin
  assert.equal(m.schema.id, "asaptic.tender.v1");
  assert.match(m.schema.sha256, /^[0-9a-f]{64}$/, "schema sha256 is 64-hex");
  // snapshot digest
  assert.match(m.snapshot.sha256, /^[0-9a-f]{64}$/, "snapshot sha256 is 64-hex");
  assert.match(m.snapshot.issue_id, /^[0-9]{4}-W[0-9]{2}$/, "issue_id ISO-week form");
  // conformance
  assert.ok(["pass", "fail"].includes(m.conformance.result), "conformance result present");
});

test("proof manifest exposes only artifact-transparent snapshot fields", () => {
  const m = readJSON(".well-known/asaptic-proof.json");
  const snap = JSON.stringify(m.snapshot) + JSON.stringify(m.conformance);
  // must not leak corpus totals / per-market counts / withheld counts
  assert.doesNotMatch(snap, /"total"|"withheld"|per_market|market_count/i,
    "no corpus totals or per-market counts in the manifest");
});

/* ---------------- 2. security.txt RFC 9116 ---------------- */
function parseSecurityTxt(text) {
  const fields = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    (fields[k] = fields[k] || []).push(v);
  }
  return fields;
}

for (const rel of [".well-known/security.txt", "security.txt"]) {
  test(`RFC 9116 required fields present in ${rel}`, () => {
    const f = parseSecurityTxt(read(rel));
    assert.ok(f.Contact && f.Contact.length >= 1, "Contact present");
    assert.match(f.Contact[0], /^mailto:[^@\s]+@asaptic\.com$/, "Contact is a real asaptic.com mailto");
    assert.ok(f.Expires && f.Expires.length === 1, "exactly one Expires");
    assert.ok(f.Canonical && f.Canonical.length >= 1, "Canonical present");
    assert.ok(f["Preferred-Languages"], "Preferred-Languages present");
  });

  test(`Expires in ${rel} parses and is in the future`, () => {
    const f = parseSecurityTxt(read(rel));
    const t = Date.parse(f.Expires[0]);
    assert.ok(!Number.isNaN(t), "Expires is a parseable date");
    assert.ok(t > Date.now(), "Expires is in the future");
    // RFC 9116 recommends < ~1 year out
    const oneYearOneWeek = 372 * 24 * 3600 * 1000;
    assert.ok(t - Date.now() < oneYearOneWeek, "Expires within ~1 year");
  });
}

test("Contact email matches a real address used elsewhere on the site", () => {
  // engage@asaptic.com is the address published across demos/engage pages.
  const f = parseSecurityTxt(read(".well-known/security.txt"));
  assert.equal(f.Contact[0], "mailto:engage@asaptic.com");
});

/* ---------------- 3. sentinel scan + self-test ---------------- */
test("sentinel: every shipped artifact is clean", () => {
  for (const rel of SHIPPED_FILES) {
    const hits = scanText(read(rel));
    assert.deepEqual(hits, [], `${rel} tripped sentinel: ${JSON.stringify(hits)}`);
  }
});

test("sentinel self-test: a dirty fixture trips every rule", () => {
  // Built by concatenation so the literal strings live only in this (unscanned) test.
  const dirty = [
    "issuer via " + "PC" + "MS" + " portal",          // forbidden token, built at runtime (never a literal)
    "see " + "source_url" + " and " + "closing_iso", // forbidden tokens with underscores
    "record " + "AT-HK-1234-567",                    // live-shaped id (not AT-TEST-)
  ].join("\n");
  const hits = scanText(dirty);
  const tokens = hits.filter((h) => h.kind === "token").map((h) => h.token);
  assert.ok(tokens.includes("pcms"), "catches pcms");
  assert.ok(tokens.includes("source_url"), "catches source_url");
  assert.ok(tokens.includes("closing_iso"), "catches closing_iso");
  assert.ok(hits.some((h) => h.kind === "live_id" && h.match === "AT-HK-1234-567"),
    "catches a non-AT-TEST live id");
});

test("sentinel: AT-TEST- ids are allowed, live-shaped ids are not", () => {
  assert.deepEqual(scanText("sample AT-TEST-HK-0000-001 ok"), []);
  assert.equal(scanText("leak AT-SG-2632-609").length, 1);
});

/* ---------------- 4. HTML + embedded JSON sanity ---------------- */
function embeddedJsonScripts(html) {
  const out = [];
  const re = /<script[^>]*type=["'](application\/(?:ld\+json|json))["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[2]);
  return out;
}

for (const rel of ["security/index.html", "status/index.html"]) {
  test(`HTML ${rel}: any embedded JSON/JSON-LD parses`, () => {
    for (const block of embeddedJsonScripts(read(rel))) {
      assert.doesNotThrow(() => JSON.parse(block), `embedded JSON in ${rel} parses`);
    }
  });

  test(`HTML ${rel}: is indexable and bridges back to asaptic.com`, () => {
    const html = read(rel);
    assert.doesNotMatch(html, /noindex/i, "page is indexable (no noindex)");
    assert.match(html, /class="bridge/, "uses the demos bridge nav");
    assert.match(html, /href="\/"/, "links back to asaptic.com root");
  });

  test(`HTML ${rel}: internal artifact links resolve to real files`, () => {
    const html = read(rel);
    const re = /href="(\/[^"#?]*)"/g;
    let m;
    const map = {
      "/security": "security/index.html",
      "/status": "status/index.html",
      "/": "index.html",
    };
    while ((m = re.exec(html)) !== null) {
      const href = m[1];
      // Only assert on the surfaces this branch owns; site-wide links are out of scope.
      let target = null;
      if (map[href]) target = map[href];
      else if (href.startsWith("/.well-known/") || href.startsWith("/status/") || href.startsWith("/security/")) {
        target = href.replace(/^\//, "");
      } else if (href === "/tender/rows.json") continue; // R2-served, no static file
      if (target) {
        assert.ok(fs.existsSync(path.join(ROOT, target)), `${href} -> ${target} exists (from ${rel})`);
      }
    }
  });
}

/* ---------------- 5. no false-live ---------------- */
test("no-false-live: nothing is marked live/green for a non-JSON endpoint", () => {
  const verdicts = readJSON("tests/proofsurfaces/probe_verdicts.json").endpoints;
  const manifest = readJSON(".well-known/asaptic-proof.json");
  const history = readJSON("status/history.json");

  for (const [key, v] of Object.entries(verdicts)) {
    const mState = manifest.endpoints[key] && manifest.endpoints[key].state;
    if (!v.is_json) {
      assert.notEqual(mState, "live", `manifest must not mark ${key} live (probe was ${v.content_type})`);
    }
  }
  // history checks must agree with recorded verdicts
  for (const c of history.checks) {
    const v = verdicts[c.key];
    assert.ok(v, `history references a probed endpoint ${c.key}`);
    if (!v.is_json) {
      assert.notEqual(c.state, "live", `history must not mark ${c.key} live (probe was ${v.content_type})`);
    }
    if (c.state === "live") {
      assert.ok(v.is_json, `history marks ${c.key} live only if probe was JSON`);
    }
  }
});

test("no-false-live: status HTML ships no pre-rendered green dots", () => {
  const html = read("status/index.html");
  // Initial state for every endpoint row must be 'checking', never 'live'.
  // (Green is only ever set by the client-side probe at runtime.)
  assert.doesNotMatch(html, /id="dot-[a-z_]+"\s+class="dot live"/i, "no hardcoded live dot");
  assert.doesNotMatch(html, /class="dot live"[^>]*id="dot-/i, "no hardcoded live dot");
});

test("manifest live states agree with recorded JSON verdicts", () => {
  const verdicts = readJSON("tests/proofsurfaces/probe_verdicts.json").endpoints;
  const manifest = readJSON(".well-known/asaptic-proof.json");
  for (const [key, e] of Object.entries(manifest.endpoints)) {
    if (e.state === "live") {
      assert.ok(verdicts[key] && verdicts[key].is_json, `${key} marked live and probe was JSON`);
    }
  }
});
