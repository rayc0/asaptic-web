#!/usr/bin/env python3
"""Strip ".html" from ROOT-RELATIVE internal hrefs (href="/x/y.html" -> href="/x/y")
across the site. Cloudflare Pages serves clean URLs and 308s the .html form, so every
such link was a wasted redirect hop (22k of them on 2026-08-24). Only rewrites when the
target file exists; never touches external, relative (../), anchor-only or query links.
Idempotent. Run after any generator. --dry-run to count only.
"""
import os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = ("_qc", "_shell", "assets", "node_modules", ".git", ".wrangler", "test", "tests", "_design_previews_2026-07-07", "standard/exports")
RE = re.compile(r'(href|content)="(/(?:[A-Za-z0-9_\-]+/)*[A-Za-z0-9_\-]+)\.html((?:[?#][^"]*)?)"')
dry = "--dry-run" in sys.argv
files = changed = links = 0
for dp, dn, fn in os.walk(ROOT):
    dn[:] = [d for d in dn if d not in SKIP and not dp.endswith("standard/exports")]
    for f in fn:
        if not f.endswith(".html"):
            continue
        p = os.path.join(dp, f)
        rel = os.path.relpath(p, ROOT)
        if any(rel.startswith(s + "/") for s in SKIP):
            continue
        s = open(p, encoding="utf-8", errors="ignore").read()
        def sub(m):
            global links
            target = os.path.join(ROOT, m.group(2).lstrip("/") + ".html")
            if os.path.isfile(target):
                links += 1
                return '%s="%s%s"' % (m.group(1), m.group(2), m.group(3))
            return m.group(0)
        s2 = RE.sub(sub, s)
        files += 1
        if s2 != s:
            changed += 1
            if not dry:
                open(p, "w", encoding="utf-8").write(s2)
print("files scanned", files, "| files changed", changed, "| links rewritten", links, "| dry-run" if dry else "")
