// shell.mjs — single source of truth for the v2 site shell inside the standard/
// generator (header.shell + footer.foot + the ASAPTIC:HEAD link block).
//
// Header/footer are produced by shelling out to the SAME sentinel injector that
// baked the v2 shell onto every migrated page (_shell/apply_shell.py --render),
// so there is exactly one renderer for that markup and generate-standard.mjs /
// build-guides.mjs / build-pillars.mjs / build-browse.mjs can never drift from it.
//
// apply_shell.py's `--render` only prints header+footer, not <head> (there's no
// `--part`/head switch on it — see its --render code path). Extending it is out
// of scope for this build: apply_shell.py is frozen (not in the allowed edit set
// for the theme-unify JS wiring). So `renderHeadLinks()` below is a hand-kept
// mirror of _shell/templates/head.html instead of a subprocess call — keep the
// two in lockstep if that template ever changes canonical/hreflang/shell.css shape.
//
// Version source: _shell/families.json's `css_ver` is read once here so the
// shell.css cache-buster can never fall out of sync between apply_shell.py and
// this generator.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanStandardUrl } from "./i18n.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const APPLY_SHELL = join(REPO_ROOT, "_shell/apply_shell.py");
const FAMILIES_JSON = join(REPO_ROOT, "_shell/families.json");

const SENT = {
  header: ["<!-- ASAPTIC:HEADER:START -->", "<!-- ASAPTIC:HEADER:END -->"],
  footer: ["<!-- ASAPTIC:FOOTER:START -->", "<!-- ASAPTIC:FOOTER:END -->"]
};

export const SHELL_CSS_VERSION = JSON.parse(readFileSync(FAMILIES_JSON, "utf8")).css_ver;

const LOCALES = ["en", "zh", "zht"];
const HREFLANG = { en: "en", zh: "zh-Hans", zht: "zh-Hant" };

/**
 * Repo-relative output path for a standard/ page, e.g. locale="zh" slug="market/japan"
 * -> "zh/standard/market/japan.html". This MUST be the path the page will actually live
 * at once committed (not a scratch/output path): apply_shell.py resolves sibling-locale
 * existence (lang chips, hreflang) and canonical URLs against ITS OWN default root (the
 * real repo), regardless of where the generator script is physically writing bytes via
 * STANDARD_OUT_ROOT. That is deliberate — see generate-standard.mjs's STANDARD_OUT_ROOT
 * comment for why, and the KNOWN LIMITATION below for the one case it doesn't cover.
 *
 * KNOWN LIMITATION (documented, not fixed here — apply_shell.py is frozen for this
 * build): for a slug that has never been baked in ANY locale before (a brand-new
 * dataset/page's very first generation), the sibling locale files genuinely do not
 * exist on disk yet, so apply_shell.py's own existence-based chip/hreflang computation
 * will under-count on that first bake. This self-heals the next time the slug is
 * regenerated, once all three locale files exist. Every slug in this build's scope
 * (the 4,547-page theme-unify migration) already has all three locale files committed,
 * so this limitation never triggers for the regen this build verifies.
 */
export function outputRelPath({ locale, slug }) {
  const dir = locale === "en" ? "standard" : `${locale}/standard`;
  return `${dir}/${slug}.html`;
}

const shellCache = new Map();

function extractSentinelBlock(text, [start, end], label) {
  const i = text.indexOf(start);
  const j = i === -1 ? -1 : text.indexOf(end, i);
  if (i === -1 || j === -1) {
    throw new Error(`shell.mjs: apply_shell.py --render output missing ${label} sentinels`);
  }
  return text.slice(i, j + end.length);
}

/**
 * header.shell + footer.foot HTML (each including its own sentinel comments),
 * byte-identical to what `_shell/apply_shell.py --render <path>` prints — because
 * this IS that renderer, invoked in-process.
 */
export function renderShell({ locale, slug, outputRelPath: relOverride } = {}) {
  const relPath = relOverride || outputRelPath({ locale, slug });
  if (shellCache.has(relPath)) return shellCache.get(relPath);
  const stdout = execFileSync("python3", [APPLY_SHELL, "--render", relPath], {
    cwd: REPO_ROOT,
    encoding: "utf8"
  });
  const result = {
    header: extractSentinelBlock(stdout, SENT.header, "HEADER"),
    footer: extractSentinelBlock(stdout, SENT.footer, "FOOTER")
  };
  shellCache.set(relPath, result);
  return result;
}

/**
 * ASAPTIC:HEAD sentinel block: canonical + the fixed 3-locale hreflang set (+
 * x-default) + fonts + shell.css. Mirrors _shell/templates/head.html line-for-line.
 * Every standard/ page ships all three locales (en/zh/zht — verified 1:1 across the
 * tree for this build), so this always emits the full alternate set, matching what
 * apply_shell.py's own existence-gated `lang_set()`/`render_alternates()` actually
 * produces for every page in scope today.
 */
export function renderHeadLinks({ locale, slug }) {
  const canonical = cleanStandardUrl({ site: "https://asaptic.com", locale, slug });
  const alternates = LOCALES.map(
    (L) =>
      `<link rel="alternate" hreflang="${HREFLANG[L]}" href="${cleanStandardUrl({
        site: "https://asaptic.com",
        locale: L,
        slug
      })}">`
  );
  alternates.push(
    `<link rel="alternate" hreflang="x-default" href="${cleanStandardUrl({
      site: "https://asaptic.com",
      locale: "en",
      slug
    })}">`
  );
  return [
    "<!-- ASAPTIC:HEAD:START -->",
    `<link rel="canonical" href="${canonical}">`,
    ...alternates,
    `<link rel="preconnect" href="https://fonts.googleapis.com">`,
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
    `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">`,
    `<link rel="stylesheet" href="/assets/v2/shell.css?v=${SHELL_CSS_VERSION}">`,
    "<!-- ASAPTIC:HEAD:END -->"
  ].join("\n");
}

/**
 * Replace one sentinel-delimited region of `html` with `block` (which itself
 * carries the sentinel comments). Throws rather than silently no-op'ing when the
 * region isn't found — same "refuse rather than guess" posture as apply_shell.py.
 * Used by scripts that splice chrome from an already-migrated template file
 * (build-browse.mjs) instead of building the page from scratch.
 */
export function replaceSentinelBlock(html, key, block) {
  const pair = SENT[key] || (key === "head" ? ["<!-- ASAPTIC:HEAD:START -->", "<!-- ASAPTIC:HEAD:END -->"] : null);
  if (!pair) throw new Error(`shell.mjs: unknown sentinel key "${key}"`);
  const [start, end] = pair;
  const i = html.indexOf(start);
  const j = i === -1 ? -1 : html.indexOf(end, i);
  if (i === -1 || j === -1) {
    throw new Error(`shell.mjs: ${key} sentinels not found in target HTML`);
  }
  return html.slice(0, i) + block + html.slice(j + end.length);
}
