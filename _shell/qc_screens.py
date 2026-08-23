#!/usr/bin/env python3
"""
qc_screens.py — visual/runtime QC helper for asaptic-web-theme.

qc.py checks the raw HTML on disk. It cannot see what the browser actually
renders (computed CSS, JS-mutated DOM, console errors, load failures).
Since this environment has no playwright/puppeteer available (only the
chrome-devtools MCP, which is a set of tools an *agent* calls, not something
a plain script can drive), this script does the next best thing: it picks a
representative sample of pages across every family/locale, converts them to
production URLs, and emits:

  1. urls.txt / urls.json  — the sample list an agent should visit
  2. probe.js               — a JS snippet an agent runs via
                               mcp__chrome-devtools__evaluate_script on each
                               loaded page; returns a JSON-serializable
                               diagnostic object (nav/footer counts, canonical,
                               hreflang, stylesheet, lang, inline scripts...)
  3. RUNBOOK.md              — exact step-by-step chrome-devtools MCP calls
                               an agent should make, and what to compare the
                               probe output against.

Usage:
    python3 _shell/qc_screens.py --out-dir /path/to/out
    python3 _shell/qc_screens.py --out-dir /path/to/out --family blog/ --per-family 5
    python3 _shell/qc_screens.py --out-dir /path/to/out --qc-json baseline.json

--qc-json (optional): a qc.py --json output. If given, pages that show up in
any HARD failure class are prioritized into the sample (so the agent's
visual pass actually looks at known-suspect pages, not just random ones).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from qc import (  # noqa: E402
    collect_html_files, canonical_path_for, locale_prefix_and_key, rel,
)

BASE_URL = "https://asaptic.com"

HARD_CLASSES = [
    "broken_links", "nav_count_bad", "footer_count_bad", "sentinel_issues",
    "canonical_issues", "hreflang_issues", "baker_marker_issues",
    "baker_span_regressions", "proof_lab_inline_script", "noindex_regressions",
]

PROBE_JS = r"""(() => {
  const allNavs = Array.from(document.querySelectorAll('nav'));
  const isNested = (n) => n.parentElement ? !!n.parentElement.closest('nav') : false;
  const isDecorative = (n) => /\bcrumbs\b|\btw-langs\b|\brb-langs\b/.test(n.className || '');
  const topLevelNavs = allNavs.filter(n => !isNested(n) && !isDecorative(n));
  const decorativeNavs = allNavs.filter(n => isDecorative(n));

  const allFooters = Array.from(document.querySelectorAll('footer'));
  const mainEl = document.querySelector('main');
  const topLevelFooters = allFooters.filter(f => !(mainEl && mainEl.contains(f)));

  const headerShell = document.querySelector('header.shell');
  const canonicalEl = document.querySelector('link[rel="canonical"]');
  const alternates = Array.from(document.querySelectorAll('link[rel="alternate"][hreflang]'))
    .map(l => ({ hreflang: l.getAttribute('hreflang'), href: l.getAttribute('href') }));
  const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"], link[href*=".css"]'))
    .map(l => l.getAttribute('href'));
  const inlineScripts = Array.from(document.querySelectorAll('script:not([src])'))
    .filter(s => s.textContent && s.textContent.trim().length > 0);
  const robotsMeta = document.querySelector('meta[name="robots"]');

  return {
    url: location.href,
    title: document.title,
    lang: document.documentElement.getAttribute('lang'),
    navCount: allNavs.length,
    topLevelNavCount: topLevelNavs.length,
    navClasses: allNavs.map(n => n.className || '(no class)'),
    decorativeNavCount: decorativeNavs.length,
    footerCount: allFooters.length,
    topLevelFooterCount: topLevelFooters.length,
    footerClasses: allFooters.map(f => f.className || '(no class)'),
    headerShellPresent: !!headerShell,
    canonical: canonicalEl ? canonicalEl.getAttribute('href') : null,
    alternates,
    stylesheetHrefs: stylesheets,
    inlineScriptCount: inlineScripts.length,
    robotsContent: robotsMeta ? robotsMeta.getAttribute('content') : null,
    bodyChildCount: document.body ? document.body.children.length : 0,
    hasReactRoot: !!document.getElementById('root') || !!document.querySelector('[data-reactroot]'),
  };
})()"""


def classify(relpath: str) -> tuple[str, str]:
    """(locale, family). locale in en/zh/zht/pt; family = first path segment
    after stripping locale prefix, or 'root' for top-level files."""
    prefix, key = locale_prefix_and_key(relpath)
    locale = prefix or "en"
    parts = key.split("/")
    family = parts[0] if len(parts) > 1 else "root"
    return locale, family


def to_url(relpath: str) -> str:
    path = canonical_path_for(relpath)
    return BASE_URL + path


def load_flagged(qc_json_path: str | None) -> set[str]:
    if not qc_json_path:
        return set()
    with open(qc_json_path) as f:
        data = json.load(f)
    results = data.get("results", data)
    flagged = set()
    for cls in HARD_CLASSES:
        for item in results.get(cls, []):
            if isinstance(item, (list, tuple)) and item:
                flagged.add(item[0])
    return flagged


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=None, help="worktree root (default: parent of _shell/)")
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--family", default=None, help="restrict sampling to this subpath, e.g. blog/")
    ap.add_argument("--per-family", type=int, default=3, help="max sample pages per (locale, family) bucket")
    ap.add_argument("--qc-json", default=None, help="qc.py --json output; prioritizes flagged pages into the sample")
    args = ap.parse_args()

    shell_dir = Path(__file__).resolve().parent
    root = Path(args.root).resolve() if args.root else shell_dir.parent
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    files = collect_html_files(root, args.family)
    flagged = load_flagged(args.qc_json)

    buckets: dict[tuple[str, str], list[str]] = {}
    for path in files:
        relpath = rel(root, path)
        if relpath.startswith("_shell/"):
            continue  # dev-only template partials, not a real deployed route
        locale, family = classify(relpath)
        buckets.setdefault((locale, family), []).append(relpath)

    sample = []  # list of dicts
    for (locale, family), relpaths in sorted(buckets.items()):
        relpaths.sort()
        flagged_here = [r for r in relpaths if r in flagged]
        index_here = [r for r in relpaths if r.endswith("index.html") or r.endswith("/index.html")]
        rest = [r for r in relpaths if r not in flagged_here and r not in index_here]
        ordered = []
        for group in (flagged_here, index_here, rest):
            for r in group:
                if r not in ordered:
                    ordered.append(r)
        picked = ordered[: args.per_family]
        for r in picked:
            sample.append({
                "locale": locale,
                "family": family,
                "relpath": r,
                "url": to_url(r),
                "flagged_in_qc": r in flagged,
            })

    sample.sort(key=lambda s: (s["locale"], s["family"], s["relpath"]))

    (out_dir / "urls.txt").write_text("\n".join(s["url"] for s in sample) + "\n")
    (out_dir / "urls.json").write_text(json.dumps(sample, indent=2, ensure_ascii=False) + "\n")
    (out_dir / "probe.js").write_text(PROBE_JS + "\n")

    n_flagged = sum(1 for s in sample if s["flagged_in_qc"])
    runbook = f"""# QC screens runbook

Sample: {len(sample)} URLs across {len(buckets)} (locale, family) buckets,
up to {args.per_family} per bucket, generated {("prioritizing " + str(n_flagged) + " qc.py-flagged pages") if args.qc_json else "without qc.py prioritization (pass --qc-json to enable)"}.

Files in this directory:
- `urls.txt`  — one production URL per line
- `urls.json` — same list with locale/family/relpath/flagged_in_qc metadata
- `probe.js`  — a JS expression; its return value is a JSON-serializable
  diagnostic object for whatever page it's run on

This script cannot drive a browser itself (no playwright/puppeteer in this
worktree, and chrome-devtools is an MCP tool set only an *agent* can call).
An agent with chrome-devtools MCP access should do the following for each
URL in `urls.json`:

1. `mcp__chrome-devtools__navigate_page(url=<url>)`
2. `mcp__chrome-devtools__evaluate_script(function=<contents of probe.js>)`
   — capture the returned object.
3. `mcp__chrome-devtools__list_console_messages()` — capture any `error`
   level entries (JS exceptions, 404s for CSS/JS assets, CSP violations).
4. (optional, for a visual spot-check) `mcp__chrome-devtools__take_screenshot()`.

## What to check the probe result against

Compare each field to the same HARD rules `qc.py` enforces on the raw HTML
— if these disagree with `qc.py`'s static read, that itself is a finding
(e.g. JS at runtime removing/duplicating a nav or footer that looked fine
in the static HTML):

- `topLevelNavCount` should be **1** (mirrors qc.py check 2; `decorativeNavCount`
  is informational, same as qc.py's crumbs/tw-langs/rb-langs exclusion).
- `topLevelFooterCount` should be **1** (mirrors qc.py check 3).
- `canonical` should be a `https://asaptic.com/...` URL matching the page
  (mirrors qc.py check 5).
- `alternates` should cover the locale mirrors that actually exist for this
  page (mirrors qc.py check 6).
- `stylesheetHrefs` should include a `style.css?v=...` or
  `/assets/v2/shell.css?v=...` entry (mirrors qc.py SOFT check 10) — if it's
  empty at runtime but qc.py saw a `<link>` in the raw HTML, something is
  stripping/blocking it (check console for a 404 or CSP error first).
- `inlineScriptCount` should be **0** on `demo/proof-lab/` (mirrors qc.py
  check 8, CSP).
- Any `error`-level console message on ANY page is worth recording even if
  it doesn't map to one of qc.py's checks — it's exactly the class of
  runtime-only failure this script exists to surface.

Record findings per URL (pass/fail per field + any console errors) and roll
them into the same report format qc.py uses, or append a "runtime QC" section
to it — whichever the calling task asked for.
"""
    (out_dir / "RUNBOOK.md").write_text(runbook)

    print(f"Wrote {len(sample)} sample URLs across {len(buckets)} buckets to {out_dir}")
    print(f"  - {out_dir / 'urls.txt'}")
    print(f"  - {out_dir / 'urls.json'}")
    print(f"  - {out_dir / 'probe.js'}")
    print(f"  - {out_dir / 'RUNBOOK.md'}")


if __name__ == "__main__":
    main()
