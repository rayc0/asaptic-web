#!/usr/bin/env node
/**
 * validate.mjs — zero-dependency conformance validator for asaptic.tender.v1
 *
 * Implements the minimal JSON Schema 2020-12 subset the contract uses:
 *   type, enum, required, properties, additionalProperties(false), items,
 *   pattern, minLength, maxLength, minimum, $ref (#/$defs/... within document).
 *
 * Usage:
 *   node validate.mjs                      # self-test: fixtures/ against the schema
 *   node validate.mjs <file.json>          # validate one envelope file
 *   node validate.mjs --stdin [--sample N] # validate JSON piped on stdin;
 *                                          #   --sample N validates envelope + N randomly sampled rows
 *
 * Exit codes: 0 = pass · 1 = validation failed / expectations unmet · 2 = usage or I/O error
 *
 * On failure it reports the JSON Pointer path and the failed rule ONLY —
 * never the offending value — so output stays safe to publish in CI logs.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(HERE, "asaptic.tender.v1.schema.json");
const FIXTURES_DIR = join(HERE, "fixtures");

function resolveRef(schema, root) {
  if (schema && typeof schema === "object" && typeof schema.$ref === "string") {
    const pointer = schema.$ref;
    if (!pointer.startsWith("#/")) throw new Error(`unsupported $ref: ${pointer}`);
    let node = root;
    for (const part of pointer.slice(2).split("/")) {
      node = node?.[part.replace(/~1/g, "/").replace(/~0/g, "~")];
      if (node === undefined) throw new Error(`unresolvable $ref: ${pointer}`);
    }
    return node;
  }
  return schema;
}

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

/** Validate `value` against `schema`; append {path, rule} objects to `errors`. */
export function validate(value, schema, root = schema, path = "", errors = []) {
  schema = resolveRef(schema, root);

  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    const t = typeOf(value);
    const ok = allowed.some((a) => a === t || (a === "number" && t === "integer"));
    if (!ok) {
      errors.push({ path, rule: `type must be ${allowed.join("|")}, got ${t}` });
      return errors; // no point checking further constraints
    }
  }

  if (schema.enum !== undefined) {
    if (!schema.enum.some((e) => e === value)) {
      errors.push({ path, rule: "value not in enum" });
    }
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({ path, rule: `minLength ${schema.minLength}` });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({ path, rule: `maxLength ${schema.maxLength}` });
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, "u").test(value)) {
      errors.push({ path, rule: "pattern mismatch" });
    }
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({ path, rule: `minimum ${schema.minimum}` });
    }
  }

  if (Array.isArray(value) && schema.items !== undefined) {
    value.forEach((item, i) => validate(item, schema.items, root, `${path}/${i}`, errors));
  }

  if (typeOf(value) === "object") {
    const props = schema.properties ?? {};
    for (const req of schema.required ?? []) {
      if (!(req in value)) errors.push({ path, rule: `missing required property "${req}"` });
    }
    for (const [k, v] of Object.entries(value)) {
      if (k in props) {
        validate(v, props[k], root, `${path}/${k}`, errors);
      } else if (schema.additionalProperties === false) {
        errors.push({ path, rule: `unexpected additional property "${k}"` });
      }
    }
  }

  return errors;
}

export function loadSchema() {
  return JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
}

function report(label, errors) {
  if (errors.length === 0) {
    console.log(`PASS  ${label}`);
    return true;
  }
  console.log(`FAIL  ${label}`);
  for (const e of errors.slice(0, 20)) {
    console.log(`      at ${e.path || "/"} — ${e.rule}`);
  }
  if (errors.length > 20) console.log(`      … ${errors.length - 20} more`);
  return false;
}

function sampleRows(doc, n) {
  if (!doc || !Array.isArray(doc.rows)) return doc;
  const rows = [...doc.rows];
  const picked = [];
  while (picked.length < n && rows.length > 0) {
    picked.push(rows.splice(Math.floor(Math.random() * rows.length), 1)[0]);
  }
  return { ...doc, total: doc.total, rows: picked };
}

async function main() {
  const args = process.argv.slice(2);
  let schema;
  try {
    schema = loadSchema();
  } catch (err) {
    console.error(`cannot load schema: ${err.message}`);
    process.exit(2);
  }

  // Mode 1 — self-test over fixtures/
  if (args.length === 0) {
    let names;
    try {
      names = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".json")).sort();
    } catch (err) {
      console.error(`cannot read fixtures dir: ${err.message}`);
      process.exit(2);
    }
    if (names.length === 0) {
      console.error("no fixtures found");
      process.exit(2);
    }
    let ok = true;
    for (const name of names) {
      const doc = JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8"));
      const errors = validate(doc, schema);
      const expectFail = name.startsWith("negative-");
      if (expectFail) {
        if (errors.length > 0) {
          console.log(`PASS  ${name} (correctly rejected by schema)`);
        } else {
          console.log(`FAIL  ${name} (negative fixture unexpectedly validated)`);
          ok = false;
        }
      } else {
        ok = report(name, errors) && ok;
      }
    }
    process.exit(ok ? 0 : 1);
  }

  // Mode 2/3 — one document from file or stdin
  let raw;
  let label;
  const sampleIdx = args.indexOf("--sample");
  const sampleN = sampleIdx >= 0 ? parseInt(args[sampleIdx + 1], 10) : 0;
  if (sampleIdx >= 0 && (!Number.isInteger(sampleN) || sampleN <= 0)) {
    console.error("--sample requires a positive integer");
    process.exit(2);
  }

  if (args.includes("--stdin")) {
    label = "stdin";
    raw = readFileSync(0, "utf8");
  } else {
    label = args[0];
    if (label.startsWith("--")) {
      console.error("usage: validate.mjs [file.json | --stdin] [--sample N]");
      process.exit(2);
    }
    try {
      raw = readFileSync(label, "utf8");
    } catch (err) {
      console.error(`cannot read ${label}: ${err.message}`);
      process.exit(2);
    }
  }

  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (err) {
    console.error(`invalid JSON: ${err.message}`);
    process.exit(2);
  }

  if (sampleN > 0) {
    doc = sampleRows(doc, sampleN);
    label += ` (sampled ${Array.isArray(doc.rows) ? doc.rows.length : 0} rows)`;
  }

  const errors = validate(doc, schema);
  process.exit(report(label, errors) ? 0 : 1);
}

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  main();
}
