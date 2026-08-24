#!/usr/bin/env python3
"""
build_tender_chunk_pages.py — create the STATIC SHELLS for the crawlable
tender chunk pages that scripts/bake-tender-rows.mjs fills at bake time.

Why this exists
---------------
/tender/ used to carry all 2,653 row cards + a ~841KB JSON-LD ItemList in a
single 2.5MB document, with client-side-only filters — i.e. no crawlable
chunking at all. The ledger is now split:

  * /tender/            — the live UX: this issue's NEW rows + everything
                          closing within 14 days, topped up to a hard cap
                          (see MAIN_ROW_CAP in the baker).
  * /tender/c/<slug>/   — ONE page per canonical category, carrying EVERY row
                          in that category. 13 categories = a complete,
                          non-overlapping partition of the full row set.
  * /tender/all/        — the compact full ledger: every published listing as
                          one line (id · market · category · closing window),
                          each linking into its category page's full card.

This script only ever writes the PAGE SHELLS (head, masthead, copy, marker
pairs). The rows themselves and the ItemList JSON-LD are baked between the
markers by scripts/bake-tender-rows.mjs on every 6-hourly refresh, so this
script never needs to run again unless the category taxonomy changes.

It is deliberately NON-DESTRUCTIVE for pages that already exist: the four
pre-existing category pages (construction-works, it-software,
medical-equipment, medical-services-pharma, EN + 简) keep their hand-written
FAQ/prose and are only PATCHED — marker pairs and the row-card CSS are
inserted if absent, nothing else is touched.

Run apply_shell.py --write --family tender afterwards (it adds the shell,
canonical and hreflang; it never touches <title>, <meta name=description>,
og:* or JSON-LD, so all of that is baked in here).

Usage:
    python3 _shell/build_tender_chunk_pages.py            # write
    python3 _shell/build_tender_chunk_pages.py --dry-run
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://asaptic.com"

ROWS_START = "<!-- TENDER_ROWS_START -->"
ROWS_END = "<!-- TENDER_ROWS_END -->"
JSONLD_START = "<!-- ROWS_JSONLD_START -->"
JSONLD_END = "<!-- ROWS_JSONLD_END -->"

# Locales that get a /tender/c/ tree. zht deliberately has none: it has never
# had one on disk, and the four hand-written category pages exist only in EN
# and 简. zht still gets /zht/tender/all/ so its capped main page has a
# same-locale route to the complete ledger.
CAT_LOCALES = ("en", "zh")
ALL_LOCALES = ("en", "zh", "zht")

LOC = {
    "en": {"pre": "", "lang": "en"},
    "zh": {"pre": "zh/", "lang": "zh-Hans"},
    "zht": {"pre": "zht/", "lang": "zh-Hant"},
}

# Canonical taxonomy order, mirroring CANONICAL_CATEGORY_ORDER_EN in
# scripts/bake-tender-rows.mjs (which mirrors asaptic-trade-ai's
# src/lib/tender-category.js). name_en -> (slug, name_zh, name_zht).
CATEGORIES = [
    ("Medical equipment",         "medical-equipment",        "医疗设备",      "醫療設備"),
    ("Medical services & pharma", "medical-services-pharma",  "医疗服务与药品", "醫療服務與藥品"),
    ("IT & software",             "it-software",              "IT与软件",      "IT與軟件"),
    ("Networking & security",     "networking-security",      "网络与安全",    "網絡與安全"),
    ("Food & catering",           "food-catering",            "食品与餐饮",    "食品與餐飲"),
    ("Facilities & cleaning",     "facilities-cleaning",      "设施与保洁",    "設施與清潔"),
    ("Vehicles & logistics",      "vehicles-logistics",       "车辆与物流",    "車輛與物流"),
    ("Construction & works",      "construction-works",       "工程与建造",    "工程與建造"),
    ("Consultancy & studies",     "consultancy-studies",      "顾问与研究",    "顧問與研究"),
    ("Printing & publishing",     "printing-publishing",      "印刷与出版",    "印刷與出版"),
    ("Lab & scientific",          "lab-scientific",           "实验室与科研",  "實驗室與科研"),
    ("Office supplies",           "office-supplies",          "办公用品",      "辦公用品"),
    ("Other",                     "other",                    "其他",          "其他"),
]

CAT_NAME = {"en": 0, "zh": 2, "zht": 3}  # index into the tuple above

# ── copy ────────────────────────────────────────────────────────────────
S = {
    "en": {
        "eyebrow": "Asaptic Tender Bulletin",
        "issue_line": 'Issue No. <strong id="tw-issue-no">&mdash;</strong> &middot; Week of <strong id="tw-week-date">&mdash;</strong>',
        "cat_title": "{name} Public-Sector Tenders",
        "cat_h1": "{name} &mdash; public-sector tenders",
        "cat_desc": (
            "Every public-sector tender Asaptic publishes in the {name} category, across the seven "
            "markets tracked (Hong Kong, Singapore, Macau, the UK, Australia, Canada and the EU). "
            "Public opportunity data only — category, summary, rough value band and closing window."
        ),
        "cat_intro": (
            "This page carries the complete {name} section of the Asaptic tender ledger — every listing "
            "published in this category, still-open first and past requirements below, across all seven "
            "markets tracked (Hong Kong, Singapore, Macau, the UK, Australia, Canada and the EU). "
            "Public opportunity data only: category, summary, rough value band and closing window. "
            "No procuring-body identity, reference numbers or exact dates are published."
        ),
        "stat_total": "Listings in this category",
        "stat_open": "Still open",
        "rows_heading": "Ledger — still open first, past requirements below",
        "all_title": "Full Tender Ledger — Every Published Listing",
        "all_h1": "Full tender ledger &mdash; every published listing",
        "all_desc": (
            "The complete index of every public-sector tender Asaptic has published this issue across "
            "seven markets — one line per listing, linking through to the full summary on its category page."
        ),
        "all_intro": (
            "One line per listing for the complete ledger: opportunity ID, market, category and closing "
            "window. Follow any ID through to its category page for the full summary, rough value band "
            "and the supplier specification request. Public opportunity data only — no procuring-body "
            "identity, reference numbers or exact dates are published."
        ),
        "all_stat_total": "Listings indexed",
        "all_stat_open": "Still open",
        "all_rows_heading": "Complete ledger index",
        "browse_h": "Browse by category",
        "browse_all": "Full ledger — every listing on one page",
        "browse_back": "Back to this week's digest",
        "browse_hub": "All categories",
        "past_note": (
            "Listings are summarized from publicly available government and public-body tender sources "
            "in the seven markets Asaptic tracks. Asaptic is not the procuring body for any tender "
            "referenced here and is not affiliated with any of those governments."
        ),
        "updated": "Updated &mdash;",
    },
    "zh": {
        "eyebrow": "Asaptic 招标简报",
        "issue_line": '第 <strong id="tw-issue-no">&mdash;</strong> 期 &middot; <strong id="tw-week-date">&mdash;</strong> 当周',
        "cat_title": "{name}公共采购招标",
        "cat_h1": "{name} &mdash; 公共采购招标",
        "cat_desc": "Asaptic 刊登的全部{name}类公共采购需求，覆盖所追踪的七个市场（香港、新加坡、澳门、英国、澳大利亚、加拿大、欧盟）。仅公开机会数据——类别、摘要、粗估金额区间与截止窗口。",
        "cat_intro": "本页收录 Asaptic 招标索引中完整的{name}板块——该类别下已刊登的全部需求，未截止者在前、已过截止者在后，覆盖所追踪的七个市场（香港、新加坡、澳门、英国、澳大利亚、加拿大、欧盟）。仅公开机会数据：类别、摘要、粗估金额区间与截止窗口；不刊登采购机构身份、编号或精确日期。",
        "stat_total": "本类别刊登数",
        "stat_open": "未截止",
        "rows_heading": "索引 — 未截止在前，已过截止在后",
        "all_title": "完整招标索引 — 全部已刊登需求",
        "all_h1": "完整招标索引 &mdash; 全部已刊登需求",
        "all_desc": "Asaptic 本期在七个市场刊登的全部公共采购需求的完整索引——每条一行，可跳转至所属类别页查看完整摘要。",
        "all_intro": "完整索引每条一行：机会编号、市场、类别与截止窗口。点击编号进入所属类别页，查看完整摘要、粗估金额区间与供应商规格包申请。仅公开机会数据——不刊登采购机构身份、编号或精确日期。",
        "all_stat_total": "已收录需求",
        "all_stat_open": "未截止",
        "all_rows_heading": "完整索引",
        "browse_h": "按类别浏览",
        "browse_all": "完整索引 — 全部需求单页浏览",
        "browse_back": "返回本周简报",
        "browse_hub": "全部类别",
        "past_note": "内容摘自 Asaptic 所追踪七个市场的政府及公营机构公开招标来源。Asaptic 并非任何相关招标的采购机构，亦与上述任何政府无隶属关系。",
        "updated": "更新于 &mdash;",
    },
    "zht": {
        "eyebrow": "Asaptic 招標簡報",
        "issue_line": '第 <strong id="tw-issue-no">&mdash;</strong> 期 &middot; <strong id="tw-week-date">&mdash;</strong> 當週',
        "cat_title": "{name}公共採購招標",
        "cat_h1": "{name} &mdash; 公共採購招標",
        "cat_desc": "Asaptic 刊登的全部{name}類公共採購需求。",
        "cat_intro": "",
        "stat_total": "本類別刊登數",
        "stat_open": "未截止",
        "rows_heading": "索引 — 未截止在前，已過截止在後",
        "all_title": "完整招標索引 — 全部已刊登需求",
        "all_h1": "完整招標索引 &mdash; 全部已刊登需求",
        "all_desc": "Asaptic 本期在七個市場刊登的全部公共採購需求的完整索引——每條一行，可跳轉至所屬類別頁查看完整摘要。",
        "all_intro": "完整索引每條一行：機會編號、市場、類別與截止窗口。點擊編號進入所屬類別頁，查看完整摘要、粗估金額區間與供應商規格包申請。僅公開機會數據——不刊登採購機構身份、編號或精確日期。",
        "all_stat_total": "已收錄需求",
        "all_stat_open": "未截止",
        "all_rows_heading": "完整索引",
        "browse_h": "按類別瀏覽",
        "browse_all": "完整索引 — 全部需求單頁瀏覽",
        "browse_back": "返回本週簡報",
        "browse_hub": "全部類別",
        "past_note": "內容摘自 Asaptic 所追蹤七個市場的政府及公營機構公開招標來源。Asaptic 並非任何相關招標的採購機構，亦與上述任何政府無隸屬關係。",
        "updated": "更新於 &mdash;",
    },
}

# ── page-scoped CSS ─────────────────────────────────────────────────────
# Design tokens for the light "paper sheet" surface the /tender/c/ pages
# already use. Kept byte-identical to the tokens block on the four
# hand-written category pages so the whole /tender/c/ family looks the same.
TOKENS_CSS = """    .tw-frame {
      --tw-paper: #F6F3EC;
      --tw-ink: #191B1E;
      --tw-seal: #BE3A2B;
      --tw-stone: #6E7378;
      --tw-line: #D8D2C4;
      --tw-serif: "Source Serif 4", Georgia, "Songti SC", "Songti TC", "Noto Serif CJK SC", serif;
      --tw-body: Inter, "PingFang SC", "PingFang TC", system-ui, -apple-system, sans-serif;
      --tw-mono: "JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;

      max-width: 1000px;
      margin: 0 auto;
      padding: 72px 24px 96px;
      font-family: var(--tw-body);
    }
    .tw-sheet {
      background: var(--tw-paper);
      color: var(--tw-ink);
      border-radius: 2px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.35), 0 2px 0 rgba(0, 0, 0, 0.08);
      padding: 48px 44px 40px;
    }
    .tw-masthead-row { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    .tw-eyebrow { display: block; font-family: var(--tw-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: var(--tw-stone); }
    .tw-langs { display: flex; align-items: baseline; gap: 8px; font-family: var(--tw-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; white-space: nowrap; position: static; height: auto; background: transparent; border: 0; backdrop-filter: none; z-index: auto; }
    .tw-langs a { color: var(--tw-stone); text-decoration: none; padding-bottom: 2px; }
    .tw-langs a:hover { color: var(--tw-ink); }
    .tw-langs a[aria-current="page"] { color: var(--tw-ink); text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--tw-seal); text-decoration-thickness: 2px; }
    .tw-langs .tw-lang-sep { color: var(--tw-line); }
    .tw-rule { margin: 12px 0 16px; }
    .tw-rule .tw-rule-thin { height: 1px; background: var(--tw-ink); }
    .tw-rule .tw-rule-thick { height: 3px; background: var(--tw-seal); margin-top: 2px; }
    .tw-issue-line { font-family: var(--tw-mono); font-size: 13px; letter-spacing: 0.02em; color: var(--tw-stone); font-variant-numeric: tabular-nums; margin-bottom: 8px; }
    .tw-issue-line strong { color: var(--tw-ink); font-weight: 700; }
    .tw-title { font-family: var(--tw-serif); font-size: clamp(26px, 3.6vw, 36px); font-weight: 600; line-height: 1.2; margin: 4px 0 18px; }
    .tw-intro { font-size: 14.5px; color: var(--tw-stone); line-height: 1.85; max-width: 700px; margin: 0 0 24px; }
    .tw-stats { display: flex; flex-wrap: wrap; gap: 32px; padding: 20px 0 28px; border-top: 1px solid var(--tw-line); border-bottom: 1px solid var(--tw-line); margin: 0 0 28px; align-items: flex-end; justify-content: space-between; }
    .tw-stat-num { font-family: var(--tw-mono); font-size: 30px; font-weight: 700; color: var(--tw-ink); line-height: 1; font-variant-numeric: tabular-nums; }
    .tw-stat-label { font-size: 11px; letter-spacing: 0.04em; color: var(--tw-stone); margin-top: 6px; }
    .tw-stats-updated { font-family: var(--tw-mono); font-size: 11px; color: var(--tw-stone); letter-spacing: 0.03em; }
    .tw-badge { display: inline-block; font-family: var(--tw-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.03em; padding: 2px 7px; border-radius: 20px; white-space: nowrap; }
    .tw-badge.red { background: rgba(190, 58, 43, 0.14); color: var(--tw-seal); }
    .tw-badge.amber { background: rgba(180, 130, 20, 0.14); color: #9A6B10; }
    .tw-badge.green { background: rgba(60, 110, 70, 0.14); color: #3E7248; }
    .tw-footer-note { margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--tw-line); font-size: 11.5px; color: var(--tw-stone); line-height: 1.7; }
    @media (max-width: 640px) {
      .tw-frame { padding: 56px 16px 72px; }
      .tw-sheet { padding: 32px 20px 32px; }
      .tw-stats { flex-direction: column; align-items: flex-start; gap: 20px; }
    }
"""

# The row-card + browse-block CSS. This is the ONLY CSS the baked markup
# needs, so it is also the block patched into the four hand-written category
# pages (guarded by the ROWCARD_CSS_MARK sentinel below).
ROWCARD_CSS_MARK = "/* tw-rowcards:v1 */"
ROWCARD_CSS = f"""    {ROWCARD_CSS_MARK}
    .tw-browse {{ margin: 0 0 30px; padding: 16px 18px; border: 1px solid var(--tw-line); border-radius: 2px; background: rgba(255, 255, 255, 0.45); }}
    .tw-browse-h {{ font-family: var(--tw-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: var(--tw-stone); margin: 0 0 10px; }}
    .tw-browse-links {{ font-size: 13px; line-height: 2; margin: 0; color: var(--tw-stone); }}
    .tw-browse-links a {{ color: var(--tw-seal); text-decoration: none; border-bottom: 1px solid rgba(190, 58, 43, 0.25); }}
    .tw-browse-links a:hover {{ border-bottom-color: var(--tw-seal); }}
    .tw-browse-links a[aria-current="page"] {{ color: var(--tw-ink); border-bottom-color: var(--tw-ink); font-weight: 600; }}
    .tw-browse-sep {{ color: var(--tw-line); padding: 0 4px; }}
    .tw-index-heading {{ font-family: var(--tw-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: var(--tw-seal); margin-bottom: 14px; }}
    .tw-index-heading-past {{ color: var(--tw-stone); margin-top: 34px; }}
    .tw-badge.stone {{ background: rgba(110, 115, 120, 0.12); color: var(--tw-stone); }}
    .tw-rows {{ margin-bottom: 32px; }}
    .tw-rc {{ border: 1px solid var(--tw-line); border-radius: 2px; padding: 16px 18px; margin-bottom: 12px; background: rgba(255, 255, 255, 0.45); scroll-margin-top: 90px; }}
    .tw-rc-top {{ display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 8px; }}
    .tw-rc-id {{ font-family: var(--tw-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.03em; color: var(--tw-seal); background: rgba(190, 58, 43, 0.08); border-radius: 5px; padding: 2px 7px; }}
    .tw-rc-cat {{ font-family: var(--tw-mono); font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--tw-stone); }}
    .tw-rc-summary {{ font-size: 14px; line-height: 1.7; color: var(--tw-ink); margin-bottom: 10px; }}
    .tw-rc-chips {{ display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }}
    .tw-rc-cta {{ display: inline-block; font-size: 12.5px; font-weight: 600; color: var(--tw-seal); text-decoration: none; border-bottom: 1px solid rgba(190, 58, 43, 0.35); }}
    .tw-rc-cta:hover {{ border-bottom-color: var(--tw-seal); }}
    .tw-al-list {{ list-style: none; margin: 0 0 32px; padding: 0; font-family: var(--tw-mono); font-size: 12px; line-height: 1.9; }}
    .tw-al {{ display: flex; flex-wrap: wrap; gap: 10px; align-items: baseline; padding: 4px 0; border-bottom: 1px solid rgba(216, 210, 196, 0.55); }}
    .tw-al-id {{ font-weight: 700; letter-spacing: 0.03em; color: var(--tw-seal); text-decoration: none; }}
    .tw-al-id:hover {{ text-decoration: underline; }}
    .tw-al-m {{ font-weight: 700; color: var(--tw-stone); }}
    .tw-al-c {{ flex: 1 1 220px; color: var(--tw-ink); font-family: var(--tw-body); font-size: 13px; }}
    .tw-al-d {{ color: var(--tw-stone); }}
    .tw-al.is-past .tw-al-id {{ color: var(--tw-stone); }}
"""


def esc(s: str) -> str:
    return html.escape(s, quote=True)


def strip_ents(s: str) -> str:
    """Plain-text form of a copy string that may carry &mdash; etc."""
    return html.unescape(s)


def cat_name(cat, loc):
    return cat[CAT_NAME[loc]]


def url_for(loc, path):
    return f"{SITE}/{LOC[loc]['pre']}{path}"


def cat_href(loc, slug):
    """Category page href for a locale, falling back to EN when that locale
    has no /tender/c/ tree on disk (zht)."""
    use = loc if loc in CAT_LOCALES else "en"
    return f"/{LOC[use]['pre']}tender/c/{slug}/"


def all_href(loc):
    return f"/{LOC[loc]['pre']}tender/all/"


def digest_href(loc):
    return f"/{LOC[loc]['pre']}tender/"


def hub_href(loc):
    use = loc if loc in CAT_LOCALES else "en"
    return f"/{LOC[use]['pre']}tender/c/"


def langs_nav(loc, path_suffix, available):
    """Decorative in-sheet language switcher (qc.py treats .tw-langs as
    decorative, so it never counts toward the one-top-level-nav rule)."""
    labels = {"en": "EN", "zh": "简", "zht": "繁"}
    parts = []
    for l in ("en", "zh", "zht"):
        if l not in available:
            continue
        href = f"/{LOC[l]['pre']}{path_suffix}"
        cur = ' aria-current="page"' if l == loc else ""
        parts.append(f'<a href="{href}"{cur}>{labels[l]}</a>')
    return (
        '<nav class="tw-langs" aria-label="Language">\n          '
        + '\n          <span class="tw-lang-sep">&middot;</span>\n          '.join(parts)
        + "\n        </nav>"
    )


def browse_block(loc, current_slug=None, on_all=False):
    """Cross-links to every category page + the full ledger + the digest.
    A <div>, deliberately NOT a <nav>: qc.py check 2 allows exactly one
    non-decorative top-level <nav> per page and that one is the shell header."""
    s = S[loc]
    links = []
    for cat in CATEGORIES:
        slug = cat[1]
        cur = ' aria-current="page"' if slug == current_slug else ""
        links.append(f'<a href="{cat_href(loc, slug)}"{cur}>{esc(cat_name(cat, loc))}</a>')
    sep = '<span class="tw-browse-sep">&middot;</span>'
    tail = [f'<a href="{digest_href(loc)}">{esc(s["browse_back"])}</a>']
    if not on_all:
        tail.append(f'<a href="{all_href(loc)}">{esc(s["browse_all"])}</a>')
    tail.append(f'<a href="{hub_href(loc)}">{esc(s["browse_hub"])}</a>')
    return (
        '      <div class="tw-browse">\n'
        f'        <p class="tw-browse-h">{esc(s["browse_h"])}</p>\n'
        f'        <p class="tw-browse-links">{sep.join(links)}</p>\n'
        f'        <p class="tw-browse-links">{sep.join(tail)}</p>\n'
        "      </div>"
    )


def head_jsonld(loc, page_url, page_title, description, crumb_name):
    ld = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Asaptic", "item": url_for(loc, "")},
                    {"@type": "ListItem", "position": 2, "name": "Live Tenders", "item": url_for(loc, "tender/")},
                    {"@type": "ListItem", "position": 3, "name": crumb_name, "item": page_url},
                ],
            },
            {
                "@type": "CollectionPage",
                "@id": page_url + "#webpage",
                "url": page_url,
                "name": page_title,
                "description": description,
                "inLanguage": LOC[loc]["lang"],
                "isPartOf": {"@id": f"{SITE}/#website"},
            },
        ],
    }
    return json.dumps(ld, ensure_ascii=False, separators=(",", ":"))


def render_page(*, loc, page_url, page_title, description, crumb_name, h1,
                intro, stat_total_label, stat_open_label, rows_heading,
                browse_html, path_suffix, langs_available, extra_ids=""):
    s = S[loc]
    title_tag = f"{page_title} | Asaptic"
    return f"""<!DOCTYPE html>
<html lang="{LOC[loc]['lang']}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{esc(title_tag)}</title>
  <meta name="description" content="{esc(description)}" />
  <meta name="robots" content="index, follow" />

  <meta property="og:type" content="website" />
  <meta property="og:title" content="{esc(title_tag)}" />
  <meta property="og:description" content="{esc(description)}" />
  <meta property="og:url" content="{page_url}" />
  <meta property="og:site_name" content="Asaptic" />
  <meta property="og:image" content="{SITE}/img/og-image.jpg" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{esc(title_tag)}" />
  <meta name="twitter:description" content="{esc(description)}" />
  <meta name="twitter:image" content="{SITE}/img/og-image.jpg" />

  <script type="application/ld+json">{head_jsonld(loc, page_url, title_tag, description, crumb_name)}</script>

  {JSONLD_START}
  {JSONLD_END}

  <style>
{TOKENS_CSS}{ROWCARD_CSS}  </style>
</head>
<body>
  <main class="tw-frame">
    <div class="tw-sheet">
      <div class="tw-masthead-row">
        <span class="tw-eyebrow">{esc(s['eyebrow'])}</span>
        {langs_nav(loc, path_suffix, langs_available)}
      </div>
      <div class="tw-rule">
        <div class="tw-rule-thin"></div>
        <div class="tw-rule-thick"></div>
      </div>
      <p class="tw-issue-line">{s['issue_line']}</p>

      <h1 class="tw-title">{h1}</h1>
      <p class="tw-intro">{esc(intro)}</p>

      <div class="tw-stats">
        <div>
          <div class="tw-stat-num" id="tw-cat-count">&mdash;</div>
          <div class="tw-stat-label">{esc(stat_total_label)}</div>
        </div>
        <div>
          <div class="tw-stat-num" id="tw-cat-open">&mdash;</div>
          <div class="tw-stat-label">{esc(stat_open_label)}</div>
        </div>
        <span class="tw-stats-updated" id="tw-updated">{s['updated']}</span>
      </div>

{browse_html}

      <h2 class="tw-index-heading">{esc(rows_heading)}</h2>
      {ROWS_START}
      {ROWS_END}

      <div class="tw-footer-note">{esc(s['past_note'])}</div>
    </div>
  </main>
</body>
</html>
"""


# ── patching the four hand-written category pages ───────────────────────
STYLE_CLOSE_RE = re.compile(r"\n(\s*)</style>")


def patch_existing(path: Path, loc: str, slug: str, dry: bool) -> str:
    """Insert the marker pairs + row-card CSS into a pre-existing category
    page without disturbing anything else on it. Idempotent."""
    text = path.read_text(encoding="utf-8")
    orig = text
    notes = []

    # 1. row-card CSS — append to the LAST </style> in the head block.
    if ROWCARD_CSS_MARK not in text:
        m = None
        for m in STYLE_CLOSE_RE.finditer(text):
            pass
        if m is None:
            return f"SKIP {path} — no </style> to extend"
        text = text[: m.start()] + "\n" + ROWCARD_CSS + text[m.start() + 1 :]
        notes.append("css")

    # 2. JSON-LD markers — just before the first <style> in the head.
    if JSONLD_START not in text:
        anchor = text.find("\n  <style>")
        if anchor == -1:
            anchor = text.find("<style>")
            if anchor == -1:
                return f"SKIP {path} — no <style> anchor for JSON-LD markers"
            text = text[:anchor] + f"{JSONLD_START}\n  {JSONLD_END}\n\n  " + text[anchor:]
        else:
            text = text[:anchor] + f"\n\n  {JSONLD_START}\n  {JSONLD_END}" + text[anchor:]
        notes.append("jsonld-markers")

    # 3. Row markers + browse block — immediately before the FAQ block, so the
    #    ledger sits under the existing prose and above the FAQ.
    if ROWS_START not in text:
        anchor = text.find('      <div class="tw-faq">')
        if anchor == -1:
            anchor = text.find('<div class="tw-footer-note">')
            if anchor == -1:
                return f"SKIP {path} — no anchor for row markers"
            anchor = text.rfind("\n", 0, anchor) + 1
        block = (
            browse_block(loc, current_slug=slug)
            + "\n\n"
            + f'      <h2 class="tw-index-heading">{esc(S[loc]["rows_heading"])}</h2>\n'
            + f"      {ROWS_START}\n      {ROWS_END}\n\n"
        )
        text = text[:anchor] + block + text[anchor:]
        notes.append("rows-markers+browse")

    if text == orig:
        return f"ok   {path.relative_to(ROOT)} (already patched)"
    if not dry:
        path.write_text(text, encoding="utf-8")
    return f"PATCH {path.relative_to(ROOT)} [{', '.join(notes)}]"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    dry = args.dry_run
    out = []

    # ── category pages ──────────────────────────────────────────────────
    for cat in CATEGORIES:
        name_en, slug = cat[0], cat[1]
        for loc in CAT_LOCALES:
            rel = f"{LOC[loc]['pre']}tender/c/{slug}/index.html"
            path = ROOT / rel
            if path.exists():
                out.append(patch_existing(path, loc, slug, dry))
                continue
            s = S[loc]
            name = cat_name(cat, loc)
            page = render_page(
                loc=loc,
                page_url=url_for(loc, f"tender/c/{slug}/"),
                page_title=s["cat_title"].format(name=name),
                description=s["cat_desc"].format(name=name),
                crumb_name=strip_ents(s["cat_title"].format(name=name)),
                h1=s["cat_h1"].format(name=esc(name)),
                intro=s["cat_intro"].format(name=name),
                stat_total_label=s["stat_total"],
                stat_open_label=s["stat_open"],
                rows_heading=s["rows_heading"],
                browse_html=browse_block(loc, current_slug=slug),
                path_suffix=f"tender/c/{slug}/",
                langs_available=CAT_LOCALES,
            )
            if not dry:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(page, encoding="utf-8")
            out.append(f"NEW   {rel}")

    # ── the full-ledger page ────────────────────────────────────────────
    for loc in ALL_LOCALES:
        rel = f"{LOC[loc]['pre']}tender/all/index.html"
        path = ROOT / rel
        if path.exists():
            # Never regenerate: the shell is already there and the baker owns
            # everything between the markers. Delete the file to rebuild it.
            out.append(f"ok    {rel} (exists)")
            continue
        s = S[loc]
        page = render_page(
            loc=loc,
            page_url=url_for(loc, "tender/all/"),
            page_title=s["all_title"],
            description=s["all_desc"],
            crumb_name=strip_ents(s["all_title"]),
            h1=s["all_h1"],
            intro=s["all_intro"],
            stat_total_label=s["all_stat_total"],
            stat_open_label=s["all_stat_open"],
            rows_heading=s["all_rows_heading"],
            browse_html=browse_block(loc, on_all=True),
            path_suffix="tender/all/",
            langs_available=ALL_LOCALES,
        )
        if not dry:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(page, encoding="utf-8")
        out.append(f"NEW   {rel}")

    for line in out:
        print(line)
    print(f"\n{len(out)} page(s){' (dry run — nothing written)' if dry else ''}")


if __name__ == "__main__":
    main()
