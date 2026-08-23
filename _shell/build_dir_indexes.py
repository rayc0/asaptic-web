#!/usr/bin/env python3
"""Build plain crawlable index pages for directories that had none
(standard/market, standard/product, standard/guides, tender/c) × locales.
Each page = <h1> + a link list built from the child pages' own <title>s.
Run apply_shell.py --write afterwards (it adds the shell, canonical, hreflang).
"""
import os, re, html, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
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
        items = "\n".join('      <li><a href="/%s%s/%s">%s</a></li>' % (cfg["pre"], sec, href, html.escape(title_of(p))) for href, p in kids)
        page = f'''<!DOCTYPE html>
<html lang="{cfg["lang"]}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{html.escape(h1)} | Asaptic</title>
  <meta name="description" content="{html.escape(intro)}" />
  <meta name="robots" content="index, follow" />
</head>
<body>
  <main>
    <section class="standard-section">
      <div class="container">
        <h1>{html.escape(h1)}</h1>
        <p class="section-intro">{html.escape(intro)}</p>
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
