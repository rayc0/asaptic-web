"use strict";
// Leak sentinel for the proof-surfaces artifacts.
// Scans shipped text for tokens that must never appear on a public surface and
// for live-shaped Asaptic ids that are not the sanctioned AT-TEST- fixtures.
//
// Scope note: this module DEFINES the forbidden token list, so it must never be
// one of its own scan targets. The scan runs against the shipped artifacts only
// (see SHIPPED_FILES); the tests/ directory is deliberately excluded.

// Whole-token forbidden terms (case-insensitive, word-boundary anchored).
const FORBIDDEN_TOKENS = [
  "pcms",
  "ref",
  "org",
  "closing_iso",
  "tdr",
  "source_url",
];

// AT-<MARKET>-####-### ids that are NOT AT-TEST- (i.e. live-shaped ids).
const LIVE_ID_RE = /\bAT-(?!TEST-)[A-Z]{2}-[0-9]{4}-[0-9]{3}\b/g;

function scanText(text) {
  const hits = [];
  for (const tok of FORBIDDEN_TOKENS) {
    const re = new RegExp("\\b" + tok + "\\b", "gi");
    let m;
    while ((m = re.exec(text)) !== null) {
      hits.push({ kind: "token", token: tok, match: m[0], index: m.index });
    }
  }
  let m;
  while ((m = LIVE_ID_RE.exec(text)) !== null) {
    hits.push({ kind: "live_id", match: m[0], index: m.index });
  }
  LIVE_ID_RE.lastIndex = 0;
  return hits;
}

// The shipped artifacts this branch owns — the only files the scan targets.
const SHIPPED_FILES = [
  ".well-known/asaptic-proof.json",
  ".well-known/security.txt",
  "security.txt",
  "security/index.html",
  "status/index.html",
  "status/history.json",
];

module.exports = { FORBIDDEN_TOKENS, LIVE_ID_RE, scanText, SHIPPED_FILES };
