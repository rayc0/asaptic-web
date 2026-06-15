#!/usr/bin/env node
/**
 * build-locales.mjs — zero-dependency locale prerenderer for asaptic.com
 *
 * Reads content.js (the CONTENT dict) and the EN source pages, then emits
 * /zh/, /zht/, /pt/ copies with translated text baked into the data-key
 * elements (so non-JS crawlers + AI bots see real localized copy), correct
 * <html lang>, per-locale canonical, an hreflang cluster, localized internal
 * links, and a forced client-side applyLang(locale) so JS render matches.
 *
 * Run from repo root:  node build-locales.mjs
 * The emitted dirs are committed and deployed as static files (no CF build step).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// 1. Extract CONTENT dict from content.js without running browser code.
const contentSrc = readFileSync(join(ROOT, "content.js"), "utf8");
const m = contentSrc.match(/const\s+CONTENT\s*=\s*(\{[\s\S]*\n\});/);
if (!m) throw new Error("Could not locate CONTENT dict in content.js");
// eslint-disable-next-line no-new-func
const CONTENT = new Function(`return ${m[1]}`)();

// locale code (URL segment) -> html lang attr + hreflang code
const LOCALES = [
  { code: "zh", lang: "zh-CN", hreflang: "zh-Hans" },
  { code: "zht", lang: "zh-TW", hreflang: "zh-Hant" },
  { code: "pt", lang: "pt-PT", hreflang: "pt-PT" },
];

// pages to localize: source file -> { canonical path suffix }
const PAGES = [
  { file: "index.html", suffix: "" },          // canonical /<loc>/
  { file: "sourcing.html", suffix: "sourcing.html" },
  { file: "bess-uflpa-compliance.html", suffix: "bess-uflpa-compliance.html" },
];

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function hreflangBlock(suffix) {
  const en = `https://asaptic.com/${suffix}`;
  const lines = [
    `    <link rel="alternate" hreflang="en" href="${en}" />`,
    ...LOCALES.map(
      (l) =>
        `    <link rel="alternate" hreflang="${l.hreflang}" href="https://asaptic.com/${l.code}/${suffix}" />`
    ),
    `    <link rel="alternate" hreflang="x-default" href="${en}" />`,
  ];
  return lines.join("\n");
}

let emitted = 0;
for (const { file, suffix } of PAGES) {
  const srcPath = join(ROOT, file);
  if (!existsSync(srcPath)) {
    console.warn(`skip (missing): ${file}`);
    continue;
  }
  const src = readFileSync(srcPath, "utf8");

  for (const loc of LOCALES) {
    const dict = CONTENT[loc.code];
    if (!dict) throw new Error(`No CONTENT['${loc.code}'] dict`);
    let html = src;

    // <html lang="en"> -> locale
    html = html.replace(/<html lang="[^"]*">/, `<html lang="${loc.lang}">`);

    // canonical -> locale URL (the hreflang cluster already present in the
    // EN source is identical across alternates, so it is copied as-is — do
    // NOT inject a second one).
    const prettySuffix = suffix.endsWith(".html") ? suffix.slice(0, -5) : suffix;
    const canonical = `https://asaptic.com/${loc.code}/${prettySuffix}`;
    html = html.replace(
      /<link rel="canonical" href="[^"]*" \/>/,
      `<link rel="canonical" href="${canonical}" />`
    );

    // bake translated text into each data-key element (text-only elements)
    for (const [key, val] of Object.entries(dict)) {
      const re = new RegExp(
        `(<[^>]*\\sdata-key="${key}"[^>]*>)[^<]*`,
        "g"
      );
      html = html.replace(re, `$1${esc(val)}`);
    }

    // asset refs -> absolute so they resolve from /<loc>/ subdir
    html = html.replace(/(href|src)="(style\.css|content\.js)/g, '$1="/$2');

    // localize internal links that have a locale version
    html = html.replace(/href="\/"/g, `href="/${loc.code}/"`);
    html = html.replace(/href="\/sourcing\.html"/g, `href="/${loc.code}/sourcing.html"`);
    html = html.replace(/href="\/#physical-ai"/g, `href="/${loc.code}/#physical-ai"`);
    html = html.replace(/href="#physical-ai"/g, `href="/${loc.code}/#physical-ai"`);

    // force the client to render this locale (so WRS/Googlebot render matches baked text)
    html = html.replace(
      /\(async \(\) => applyLang\(await detectLang\(\)\)\)\(\);/,
      `applyLang('${loc.code}');`
    );

    const outDir = join(ROOT, loc.code);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, file), html);
    emitted++;
  }
}
console.log(`build-locales: emitted ${emitted} files across ${LOCALES.length} locales.`);
