#!/usr/bin/env python3
"""
Add the 6 new v2 marketing pages (trade-ai, tenders, suppliers, standards,
platform, contact) x 4 locales to sitemap-core.xml, and bump lastmod on the
existing homepage entries (/, /zh/, /zht/, /pt/) since index.html + locale
homes were also rewritten in commit db42dc8a (theme-unify restructure).

stdlib only. Idempotent: re-running after the new <url> blocks already exist
is a no-op (it checks each new <loc> isn't already present).

Usage: python3 _shell/sitemap_core.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITEMAP = ROOT / "sitemap-core.xml"
BASE = "https://asaptic.com"
LASTMOD = "2026-08-23"

# (slug, priority for EN, priority for zh/zht/pt)
NEW_PAGES = [
    ("trade-ai.html", "0.9", "0.7"),
    ("tenders.html", "0.9", "0.7"),
    ("suppliers.html", "0.9", "0.7"),
    ("standards.html", "0.9", "0.7"),
    ("platform.html", "0.9", "0.7"),
    ("contact.html", "0.9", "0.7"),
]

LOCALES = [
    ("", "en"),        # root
    ("zh/", "zh-Hans"),
    ("zht/", "zh-Hant"),
    ("pt/", "pt-PT"),
]

HREFLANG_ORDER = [
    ("en", ""),
    ("zh-Hans", "zh/"),
    ("zh-Hant", "zht/"),
    ("pt-PT", "pt/"),
]


def url_block(prefix, slug, priority):
    loc = f"{BASE}/{prefix}{slug}"
    lines = ["  <url>", f"    <loc>{loc}</loc>", f"    <lastmod>{LASTMOD}</lastmod>", f"    <priority>{priority}</priority>"]
    for hreflang, hprefix in HREFLANG_ORDER:
        lines.append(f'    <xhtml:link rel="alternate" hreflang="{hreflang}" href="{BASE}/{hprefix}{slug}" />')
    lines.append(f'    <xhtml:link rel="alternate" hreflang="x-default" href="{BASE}/{slug}" />')
    lines.append("  </url>")
    return "\n".join(lines) + "\n"


def main():
    text = SITEMAP.read_text(encoding="utf-8")

    # 1) Bump lastmod on the 4 homepage entries (/, /zh/, /zht/, /pt/) — they
    # were also rewritten in db42dc8a even though their URL didn't change.
    for loc in (f"{BASE}/", f"{BASE}/zh/", f"{BASE}/zht/", f"{BASE}/pt/"):
        pattern = re.compile(
            r"(<url>\s*<loc>" + re.escape(loc) + r"</loc>\s*<lastmod>)\d{4}-\d{2}-\d{2}(</lastmod>)"
        )
        new_text, n = pattern.subn(lambda m: m.group(1) + LASTMOD + m.group(2), text, count=1)
        if n == 0:
            print(f"WARN: homepage lastmod pattern not found for {loc}")
        text = new_text

    # 2) Insert the 24 new <url> blocks (6 pages x 4 locales) right before
    # the /sourcing block, unless already present (idempotent).
    insertion_marker = f"  <url>\n    <loc>{BASE}/sourcing</loc>"
    assert insertion_marker in text, "insertion marker not found — sitemap-core.xml structure changed"

    new_blocks = []
    for slug, prio_en, prio_other in NEW_PAGES:
        for prefix, _hreflang in LOCALES:
            loc = f"{BASE}/{prefix}{slug}"
            if f"<loc>{loc}</loc>" in text:
                continue  # already present, skip
            priority = prio_en if prefix == "" else prio_other
            new_blocks.append(url_block(prefix, slug, priority))

    if new_blocks:
        insertion_text = "".join(new_blocks)
        text = text.replace(insertion_marker, insertion_text + insertion_marker, 1)
        print(f"Inserted {len(new_blocks)} new <url> blocks.")
    else:
        print("No new <url> blocks to insert (already present).")

    SITEMAP.write_text(text, encoding="utf-8")
    print(f"Wrote {SITEMAP}")


if __name__ == "__main__":
    main()
