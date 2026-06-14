#!/usr/bin/env python3
"""Normalize canonical and hreflang hrefs on lane pages.

Rules:
- Only target 24 lane files in {root, zh/, zht/, pt/}.
- Update <link rel="canonical"> href and <link rel="alternate" hreflang="...") href only.
- Strip trailing ".html" from href values for clean URLs.
- Idempotent: already clean links are left unchanged.
"""

from __future__ import annotations

from pathlib import Path
import re

REPO_ROOT = Path(__file__).resolve().parent.parent

LOCALES = ["", "zh", "zht", "pt"]
LANES = [
    "deep-tech-sourcing",
    "medical-device-sourcing",
    "ev-charger-power-module-sourcing",
    "heavy-lift-uav",
    "physical-ai-robotics",
    "sourcing/clinical-devices",
]

LINK_TAG_RE = re.compile(r"<link\\b[^>]*>", re.IGNORECASE | re.DOTALL)
REL_RE = re.compile(r"\brel\\s*=\\s*([\"'])(.*?)\\1", re.IGNORECASE | re.DOTALL)
HREF_RE = re.compile(r"\bhref\\s*=\\s*([\"'])(.*?)\\1", re.IGNORECASE | re.DOTALL)
HREFLANG_RE = re.compile(r"\bhreflang\\s*=\\s*([\"'])(.*?)\\1", re.IGNORECASE | re.DOTALL)


def normalize_href(href: str) -> str:
    if href.endswith('.html'):
        return href[:-5]
    return href


def is_target_link(tag: str) -> bool:
    rel_match = REL_RE.search(tag)
    if not rel_match:
        return False

    rel_values = rel_match.group(2).lower().split()
    if not rel_values:
        return False

    if 'canonical' in rel_values:
        return True

    if 'alternate' not in rel_values:
        return False

    return bool(HREFLANG_RE.search(tag))


def normalize_links_in_html(html_text: str) -> tuple[str, int]:
    changed = 0

    def _replace_tag(match: re.Match[str]) -> str:
        nonlocal changed
        tag = match.group(0)

        if not is_target_link(tag):
            return tag

        href_match = HREF_RE.search(tag)
        if not href_match:
            return tag

        quote = href_match.group(1)
        old_href = href_match.group(2)
        new_href = normalize_href(old_href)

        if new_href == old_href:
            return tag

        changed += 1
        return HREF_RE.sub(f"href={quote}{new_href}{quote}", tag, count=1)

    new_html = LINK_TAG_RE.sub(_replace_tag, html_text)
    return new_html, changed


def process_target_files() -> None:
    total_changed = 0

    for locale in LOCALES:
        for lane in LANES:
            if locale:
                target = REPO_ROOT / locale / f"{lane}.html"
            else:
                target = REPO_ROOT / f"{lane}.html"

            html = target.read_text(encoding='utf-8')
            new_html, changed = normalize_links_in_html(html)
            total_changed += changed

            if changed:
                target.write_text(new_html, encoding='utf-8')

            print(f"{target.relative_to(REPO_ROOT)}: {changed} href(s) normalized")

    print(f"Total hrefs normalized: {total_changed}")


if __name__ == "__main__":
    process_target_files()
