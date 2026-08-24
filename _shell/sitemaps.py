#!/usr/bin/env python3
"""
sitemaps.py — generates sitemap-core.xml and sitemap-blog.xml FROM THE PAGES
THEMSELVES (stdlib only, no hand-maintained URL lists).

For every indexable page in scope it reads:
  - <link rel="canonical" href="...">  -> <loc>
  - <link rel="alternate" hreflang="X" href="...">  -> <xhtml:link rel="alternate" .../>
    (copied verbatim from the page's own head -- this script does not compute
    hreflang, it only relays what the page already declares)
  - lastmod = `git log -1 --format=%cs -- <path>` (last commit date of the
    file), falling back to today's date if the file has no git history yet
    (e.g. it's staged/new and not yet committed).

Scope (matches the theme's existing family boundaries):
  CORE  = every in-scope .html file EXCEPT blog/** and EXCEPT standard/**
          (the country x product combinator pages, standard/market/**,
          standard/guides/**, standard/product/** etc. are owned by the
          other, generator-specific sitemaps -- sitemap-bess.xml,
          sitemap-markets.xml, sitemap-guides.xml, ... -- and are
          deliberately NOT touched here), except that standard/index.html,
          standard/browse.html, standard/methodology.html,
          standard/report-error.html and standard/macau-public-interest.html
          ARE core hub pages and stay in-scope.
          This naturally includes: root marketing pages (incl. the 7 v2
          slugs x 4 locales), legal/*, standards/compliance-matrix,
          sourcing/*, the standard/ hub pages above, tender/** (hubs +
          tender/archive/**), robot/** and university/** (both were already
          sitemap-core residents before this generator existed; they stay
          in scope so nothing gets silently de-indexed).
  BLOG  = blog/** (+ zh/zht/pt mirrors).

Excluded everywhere: 404.html, *_TEMPLATE.html, any page whose <meta
name="robots"> contains "noindex", and the non-content directories listed
in EXCLUDE_DIRS below (assets, demo/demos/scout -- these carry static
noindex per _shell/qc.py's STATIC_NOINDEX_DIR_PREFIXES -- _qc, _shell,
node_modules, .git, .wrangler, _design_previews*, test/tests, public, lib,
agent).

Usage:
    python3 _shell/sitemaps.py            # writes sitemap-core.xml + sitemap-blog.xml
    python3 _shell/sitemaps.py --dry-run   # report counts only, write nothing
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from datetime import date, timezone, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://asaptic.com"

EXCLUDE_DIRS = {
    "_qc", "_shell", "node_modules", ".git", ".wrangler",
    "assets", "demo", "demos", "scout", "test", "tests", "public", "lib", "agent",
}
EXCLUDE_DIR_PREFIXES = ("_design_previews",)

# standard/ hub pages that stay in CORE scope (everything else under
# standard/ -- the country x product combinators, standard/market/**,
# standard/guides/**, standard/product/**, standard/data, standard/exports,
# standard/scripts, standard/templates, standard/og -- belongs to the other
# generator-owned sitemaps and is skipped here).
STANDARD_CORE_FILES = {
    "standard/index.html",
    "standard/browse.html",
    "standard/methodology.html",
    "standard/report-error.html",
    "standard/macau-public-interest.html",
    # directory hub indexes added 2026-08-24 (crawl-orphan fix)
    "standard/market/index.html",
    "standard/product/index.html",
    "standard/guides/index.html",
}

CANON_RE = re.compile(r'<link[^>]+rel\s*=\s*["\']canonical["\'][^>]*>', re.I)
HREF_RE = re.compile(r'href\s*=\s*"([^"]*)"|href\s*=\s*\'([^\']*)\'', re.I)
ALT_RE = re.compile(r'<link[^>]+rel\s*=\s*["\']alternate["\'][^>]*>', re.I)
HREFLANG_RE = re.compile(r'hreflang\s*=\s*"([^"]*)"|hreflang\s*=\s*\'([^\']*)\'', re.I)
ROBOTS_RE = re.compile(r'<meta[^>]+name\s*=\s*["\']robots["\'][^>]*>', re.I)
CONTENT_RE = re.compile(r'content\s*=\s*"([^"]*)"|content\s*=\s*\'([^\']*)\'', re.I)


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def get_href(tag: str) -> str | None:
    m = HREF_RE.search(tag)
    if not m:
        return None
    return m.group(1) if m.group(1) is not None else m.group(2)


def get_content(tag: str) -> str | None:
    m = CONTENT_RE.search(tag)
    if not m:
        return None
    return m.group(1) if m.group(1) is not None else m.group(2)


def get_canonical(s: str) -> str | None:
    m = CANON_RE.search(s)
    return get_href(m.group(0)) if m else None


def get_alternates(s: str) -> list[tuple[str, str]]:
    out = []
    for m in ALT_RE.finditer(s):
        tag = m.group(0)
        hl = HREFLANG_RE.search(tag)
        href = get_href(tag)
        if hl and href:
            hreflang = hl.group(1) if hl.group(1) is not None else hl.group(2)
            out.append((hreflang, href))
    return out


def is_noindex(s: str) -> bool:
    m = ROBOTS_RE.search(s)
    if not m:
        return False
    content = (get_content(m.group(0)) or "").lower()
    return "noindex" in content


def in_scope_dirs(rel: str) -> bool:
    parts = Path(rel).parts[:-1]
    for p in parts:
        if p in EXCLUDE_DIRS or p.startswith(EXCLUDE_DIR_PREFIXES):
            return False
    return True


def classify(rel: str) -> str | None:
    """Return 'core', 'blog', or None (out of scope) for a repo-relative path."""
    if not in_scope_dirs(rel):
        return None
    fn = Path(rel).name
    if fn == "404.html" or fn.endswith("_TEMPLATE.html"):
        return None

    # strip a leading locale prefix to find the "family" (first path segment
    # after the locale) -- this is what decides core vs blog vs skip.
    parts = rel.split("/")
    if parts[0] in ("zh", "zht", "pt"):
        rest = parts[1:]
    else:
        rest = parts

    if not rest:
        return None
    family = rest[0]

    if family == "blog":
        return "blog"

    if family == "standard":
        # only the whitelisted hub pages stay in CORE; everything else under
        # standard/ (country x product combinators, market/, guides/,
        # product/, data/, exports/, scripts/, templates/, og/) belongs to
        # the other generator-owned sitemaps.
        stripped = "/".join(rest)  # e.g. "standard/browse.html"
        return "core" if stripped in STANDARD_CORE_FILES else None

    return "core"


def collect_pages() -> dict[str, str]:
    """rel path -> scope ('core'/'blog') for every in-scope .html file."""
    pages: dict[str, str] = {}
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [
            d for d in dirnames
            if d not in EXCLUDE_DIRS and not d.startswith(EXCLUDE_DIR_PREFIXES)
        ]
        for fn in filenames:
            if not fn.endswith(".html"):
                continue
            rel = os.path.relpath(os.path.join(dirpath, fn), ROOT)
            scope = classify(rel)
            if scope:
                pages[rel] = scope
    return pages


_GIT_LOG_CACHE: dict[str, str] = {}


def git_lastmod(rel: str) -> str:
    if rel in _GIT_LOG_CACHE:
        return _GIT_LOG_CACHE[rel]
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%cs", "--", rel],
            cwd=ROOT, capture_output=True, text=True, timeout=10,
        )
        d = out.stdout.strip()
    except Exception:
        d = ""
    if not d:
        d = date.today().isoformat()
    _GIT_LOG_CACHE[rel] = d
    return d


def priority_for(rel: str, is_home: bool) -> str:
    parts = rel.split("/")
    locale_prefixed = parts[0] in ("zh", "zht", "pt")
    if is_home:
        return "0.7" if locale_prefixed else "1.0"
    # shallow, top-level marketing pages get a slightly higher priority than
    # deep archive/lesson pages
    depth = len(parts) - (1 if locale_prefixed else 0)
    base = 0.8 if depth <= 1 else 0.6
    return f"{base - 0.2:.1f}" if locale_prefixed else f"{base:.1f}"


def build_sitemap(pages: dict[str, str], scope: str) -> tuple[str, int]:
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ]
    n = 0
    skipped_noindex = 0
    skipped_nocanon = 0
    for rel in sorted(k for k, v in pages.items() if v == scope):
        path = ROOT / rel
        s = read(path)
        if is_noindex(s):
            skipped_noindex += 1
            continue
        loc = get_canonical(s)
        if not loc:
            skipped_nocanon += 1
            print(f"  WARN no canonical, skipped: {rel}", file=sys.stderr)
            continue
        alts = get_alternates(s)
        lastmod = git_lastmod(rel)
        is_home = rel in ("index.html", "zh/index.html", "zht/index.html", "pt/index.html")
        pr = priority_for(rel, is_home)

        lines.append("  <url>")
        lines.append(f"    <loc>{loc}</loc>")
        lines.append(f"    <lastmod>{lastmod}</lastmod>")
        lines.append(f"    <priority>{pr}</priority>")
        for hreflang, href in alts:
            lines.append(f'    <xhtml:link rel="alternate" hreflang="{hreflang}" href="{href}" />')
        lines.append("  </url>")
        n += 1
    lines.append("</urlset>")
    lines.append("")
    if skipped_noindex or skipped_nocanon:
        print(f"  [{scope}] skipped noindex={skipped_noindex} no-canonical={skipped_nocanon}", file=sys.stderr)
    return "\n".join(lines), n


def update_sitemap_index():
    idx_path = ROOT / "sitemap-index.xml"
    s = read(idx_path)
    today = date.today().isoformat()
    # bump lastmod only for the two entries this generator owns
    def bump(m):
        loc = m.group(1)
        if loc.endswith("sitemap-core.xml") or loc.endswith("sitemap-blog.xml"):
            return f"<loc>{loc}</loc>\n    <lastmod>{today}</lastmod>"
        return m.group(0)
    new_s = re.sub(r"<loc>([^<]*)</loc>\s*\n\s*<lastmod>[^<]*</lastmod>", bump, s)
    idx_path.write_text(new_s, encoding="utf-8")


def validate(scope: str, xml_text: str) -> tuple[int, int]:
    """Parse the XML and confirm every <loc> resolves to a real file.
    Returns (total_locs, unresolved_count)."""
    root = ET.fromstring(xml_text)
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    total = 0
    unresolved = 0
    for url in root.findall("sm:url", ns):
        loc_el = url.find("sm:loc", ns)
        if loc_el is None or not loc_el.text:
            continue
        total += 1
        loc = loc_el.text.strip()
        if not loc.startswith(SITE):
            unresolved += 1
            continue
        p = loc[len(SITE):].lstrip("/")
        if p == "":
            p = "index.html"
        elif p.endswith("/"):
            p = p + "index.html"
        candidates = [p, p + ".html", p + "/index.html"]
        if not any((ROOT / c).exists() for c in candidates):
            unresolved += 1
            print(f"  UNRESOLVED <loc> in {scope}: {loc}", file=sys.stderr)
    return total, unresolved


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    pages = collect_pages()
    n_core_candidates = sum(1 for v in pages.values() if v == "core")
    n_blog_candidates = sum(1 for v in pages.values() if v == "blog")
    print(f"discovered in-scope pages: core={n_core_candidates} blog={n_blog_candidates}")

    core_xml, n_core = build_sitemap(pages, "core")
    blog_xml, n_blog = build_sitemap(pages, "blog")

    core_total, core_unresolved = validate("core", core_xml)
    blog_total, blog_unresolved = validate("blog", blog_xml)
    print(f"sitemap-core.xml: {n_core} <url> entries written, {core_unresolved}/{core_total} unresolved <loc>")
    print(f"sitemap-blog.xml: {n_blog} <url> entries written, {blog_unresolved}/{blog_total} unresolved <loc>")

    if args.dry_run:
        return

    (ROOT / "sitemap-core.xml").write_text(core_xml, encoding="utf-8")
    (ROOT / "sitemap-blog.xml").write_text(blog_xml, encoding="utf-8")
    update_sitemap_index()
    print("wrote sitemap-core.xml, sitemap-blog.xml, and bumped sitemap-index.xml lastmod")


if __name__ == "__main__":
    main()
