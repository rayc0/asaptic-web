#!/usr/bin/env python3
"""Build plain crawlable index pages for directories that had none
(standard/market, standard/product, standard/guides, tender/c) × locales.
Each page = <h1> + a link list built from the child pages' own <title>s,
plus a CollectionPage+BreadcrumbList+ItemList JSON-LD block, Open Graph /
Twitter tags, and a second intro paragraph with real counts.
Run apply_shell.py --write afterwards (it adds the shell, canonical, hreflang;
it never touches <title>, <meta name=description>, og:*, or JSON-LD, so all
of that must be baked in here).
"""
import os, re, html, json, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://asaptic.com"
L = {
 "en": {"pre": "", "lang": "en"},
 "zh": {"pre": "zh/", "lang": "zh-Hans"},
 "zht": {"pre": "zht/", "lang": "zh-Hant"},
}
SECTIONS = {
 "standard/market": {"en": ("China export standards by destination market", "Every destination market covered by the Cross-Standard library. Each market page lists the product comparisons available for that country."),
                     "zh": ("按目标市场浏览中国出口标准", "Cross-Standard 公益库覆盖的全部目标市场。每个市场页面列出该国可用的产品对照。"),
                     "zht": ("按目標市場瀏覽中國出口標準", "Cross-Standard 公益庫覆蓋的全部目標市場。每個市場頁面列出該國可用的產品對照。")},
 "standard/product": {"en": ("China export standards by product category", "Every product category in the Cross-Standard library, each listing the destination markets with a compliance gap matrix."),
                      "zh": ("按产品类别浏览中国出口标准", "Cross-Standard 公益库的全部产品类别，每个类别列出已有合规差距矩阵的目标市场。"),
                      "zht": ("按產品類別瀏覽中國出口標準", "Cross-Standard 公益庫的全部產品類別，每個類別列出已有合規差距矩陣的目標市場。")},
 "standard/guides": {"en": ("Cross-Standard export compliance guides", "Practitioner guides that sit above the product-by-market matrices: checklists, pathways and comparisons."),
                     "zh": ("Cross-Standard 出口合规指南", "位于产品×市场矩阵之上的实务指南：清单、路径与对比。"),
                     "zht": ("Cross-Standard 出口合規指南", "位於產品×市場矩陣之上的實務指南：清單、路徑與對比。")},
 "tender/c": {"en": ("Hong Kong government tenders by category", "Live Hong Kong public-sector tenders grouped by category. Public opportunity data only — no procuring-body identity, reference numbers, or exact dates."),
              "zh": ("按类别浏览香港政府招标", "香港公营机构实时招标按类别分组。仅公开机会数据——不含采购机构身份、编号或精确日期。"),
              "zht": ("按類別瀏覽香港政府招標", "香港公營機構實時招標按類別分組。僅公開機會數據——不含採購機構身份、編號或精確日期。")},
}
# Section breadcrumb parent (hub name + path) — the sub-nav hub each section hangs off.
HUBS = {
 "standard/market": {"en": ("Cross-Standard", "/standard/"), "zh": ("跨标准", "/zh/standard/"), "zht": ("跨標準", "/zht/standard/")},
 "standard/product": {"en": ("Cross-Standard", "/standard/"), "zh": ("跨标准", "/zh/standard/"), "zht": ("跨標準", "/zht/standard/")},
 "standard/guides": {"en": ("Cross-Standard", "/standard/"), "zh": ("跨标准", "/zh/standard/"), "zht": ("跨標準", "/zht/standard/")},
 "tender/c": {"en": ("Live Tenders", "/tenders"), "zh": ("实时招标", "/zh/tenders"), "zht": ("實時招標", "/zht/tenders")},
}
# Second intro paragraph, filled with the real per-locale item count. {n} = count.
EXTRA = {
 "standard/market": {
   "en": "The library currently indexes {n} destination markets, each cross-referenced against the product categories in the Cross-Standard collection, published across three languages (EN/简体/繁體).",
   "zh": "该库目前收录 {n} 个目标市场，均与 Cross-Standard 合集中的产品类别交叉对照，以三种语言（EN/简体/繁體）发布。",
   "zht": "該庫目前收錄 {n} 個目標市場，均與 Cross-Standard 合集中的產品類別交叉對照，以三種語言（EN/簡體/繁體）發布。",
 },
 "standard/product": {
   "en": "{n} product categories are indexed here, each cross-referenced against its available destination markets and a compliance gap matrix, published across three languages (EN/简体/繁體).",
   "zh": "此处收录 {n} 个产品类别，均与其可用目标市场及合规差距矩阵交叉对照，以三种语言（EN/简体/繁體）发布。",
   "zht": "此處收錄 {n} 個產品類別，均與其可用目標市場及合規差距矩陣交叉對照，以三種語言（EN/簡體/繁體）發布。",
 },
 "standard/guides": {
   "en": "{n} practitioner guides are published to date, sitting above the market-by-product matrices, available across three languages (EN/简体/繁體).",
   "zh": "目前已发布 {n} 篇实务指南，位于产品×市场矩阵之上，以三种语言（EN/简体/繁體）提供。",
   "zht": "目前已發布 {n} 篇實務指南，位於產品×市場矩陣之上，以三種語言（EN/簡體/繁體）提供。",
 },
 "tender/c": {
   "en": "{n} tender categories are tracked here, mirrored across two languages (EN/简体).",
   "zh": "此处追踪 {n} 个招标类别，以两种语言（EN/简体）同步发布。",
   "zht": "此處追蹤 {n} 個招標類別，以兩種語言（EN/簡體）同步發布。",
 },
}
TITLE_RE = re.compile(r"<title>([^<]*)</title>", re.I)

def child_pages(absdir):
    out = []
    for name in sorted(os.listdir(absdir)):
        p = os.path.join(absdir, name)
        if name.startswith("_") or name == "index.html":
            continue
        if os.path.isdir(p) and os.path.isfile(os.path.join(p, "index.html")):
            out.append((name + "/", os.path.join(p, "index.html")))
        elif name.endswith(".html"):
            out.append((name[:-5], p))
    return out

def title_of(path):
    s = open(path, encoding="utf-8", errors="ignore").read(200000)
    m = TITLE_RE.search(s)
    t = html.unescape(m.group(1)) if m else os.path.basename(path)
    return re.sub(r"\s*[|—–-]\s*(Cross-Standard|Asaptic).*$", "", t).strip()

written = 0
for sec, texts in SECTIONS.items():
    for loc, cfg in L.items():
        absdir = os.path.join(ROOT, cfg["pre"] + sec)
        if not os.path.isdir(absdir) or loc not in texts:
            continue
        kids = child_pages(absdir)
        if not kids:
            continue
        h1, intro = texts[loc]
        page_url = f"{SITE}/{cfg['pre']}{sec}/"
        page_title = f"{h1} | Asaptic"
        links = [(href, title_of(p)) for href, p in kids]
        items = "\n".join('      <li><a href="/%s%s/%s">%s</a></li>' % (cfg["pre"], sec, href, html.escape(t)) for href, t in links)

        extra = EXTRA[sec][loc].format(n=len(links)) if sec in EXTRA and loc in EXTRA.get(sec, {}) else ""

        hub_name, hub_path = HUBS[sec][loc]
        item_list = [
            {"@type": "ListItem", "position": i + 1, "name": t, "url": f"{SITE}/{cfg['pre']}{sec}/{href}"}
            for i, (href, t) in enumerate(links)
        ]
        ld = {
            "@context": "https://schema.org",
            "@graph": [
                {
                    "@type": "BreadcrumbList",
                    "itemListElement": [
                        {"@type": "ListItem", "position": 1, "name": "Asaptic", "item": f"{SITE}/{cfg['pre']}"},
                        {"@type": "ListItem", "position": 2, "name": hub_name, "item": f"{SITE}{hub_path}"},
                        {"@type": "ListItem", "position": 3, "name": h1, "item": page_url},
                    ],
                },
                {
                    "@type": "CollectionPage",
                    "@id": f"{page_url}#webpage",
                    "url": page_url,
                    "name": page_title,
                    "description": intro,
                    "inLanguage": cfg["lang"],
                    "isPartOf": {"@id": f"{SITE}/#website"},
                    "mainEntity": {
                        "@type": "ItemList",
                        "numberOfItems": len(item_list),
                        "itemListElement": item_list,
                    },
                },
            ],
        }
        ld_json = json.dumps(ld, ensure_ascii=False, separators=(",", ":"))

        page = f'''<!DOCTYPE html>
<html lang="{cfg["lang"]}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{html.escape(page_title)}</title>
  <meta name="description" content="{html.escape(intro)}" />
  <meta name="robots" content="index, follow" />

  <script type="application/ld+json">{ld_json}</script>

  <meta property="og:type" content="website" />
  <meta property="og:title" content="{html.escape(page_title)}" />
  <meta property="og:description" content="{html.escape(intro)}" />
  <meta property="og:url" content="{page_url}" />
  <meta property="og:site_name" content="Asaptic" />
  <meta property="og:image" content="{SITE}/img/og-image.jpg" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{html.escape(page_title)}" />
  <meta name="twitter:description" content="{html.escape(intro)}" />
  <meta name="twitter:image" content="{SITE}/img/og-image.jpg" />
</head>
<body>
  <main>
    <section class="standard-section">
      <div class="container">
        <h1>{html.escape(h1)}</h1>
        <p class="section-intro">{html.escape(intro)}</p>
        {f'<p class="section-intro">{html.escape(extra)}</p>' if extra else ''}
        <ul class="dir-index">
{items}
        </ul>
      </div>
    </section>
  </main>
</body>
</html>
'''
        out = os.path.join(absdir, "index.html")
        open(out, "w", encoding="utf-8").write(page)
        written += 1
        print("wrote", os.path.relpath(out, ROOT), len(kids), "links")
print("total", written)
