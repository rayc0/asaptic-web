import os
import re

def fix_browse_file(filepath, lang_code, text_title, text_desc):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Fix Canonical and Hreflang
    # Find links like href="https://asaptic.com/standard/methodology" or href="https://asaptic.com/zh/standard/methodology"
    content = re.sub(r'href="(https://asaptic\.com/(?:[a-z]{2,3}/)?standard/)methodology"', r'href="\1browse.html"', content)

    # 2. Fix OG URL
    content = re.sub(r'content="(https://asaptic\.com/(?:[a-z]{2,3}/)?standard/)methodology"', r'content="\1browse.html"', content)

    # 3. Fix Meta Tags (Title, Desc)
    content = re.sub(r'<meta property="og:title" content="[^"]+" />', f'<meta property="og:title" content="{text_title} — Cross-Standard | Asaptic" />', content)
    content = re.sub(r'<meta name="twitter:title" content="[^"]+" />', f'<meta name="twitter:title" content="{text_title} — Cross-Standard | Asaptic" />', content)
    content = re.sub(r'<meta name="description" content="[^"]+" />', f'<meta name="description" content="{text_desc}" />', content)
    content = re.sub(r'<meta property="og:description" content="[^"]+" />', f'<meta property="og:description" content="{text_desc}" />', content)
    content = re.sub(r'<meta name="twitter:description" content="[^"]+" />', f'<meta name="twitter:description" content="{text_desc}" />', content)

    # 4. Fix JSON-LD Graph
    content = re.sub(r'"headline": "[^"]+",', f'"headline": "{text_title} — Cross-Standard",', content)
    content = re.sub(r'"description": "[^"]+",', f'"description": "{text_desc}",', content)
    
    # 5. Fix Nav Links which were incorrectly labeled and linked
    # E.g. <a href="/standard/browse.html" class="active">Methodology</a> -> <a href="/standard/methodology.html">Methodology</a>
    if lang_code == "en":
        content = content.replace('<a href="/standard/browse.html" class="active">Methodology</a>', '<a href="/standard/methodology.html">Methodology</a>')
        content = content.replace('"name": "Methodology & Data Governance",', f'"name": "{text_title}",')
        content = content.replace('"name": "Standards comparison methodology and data governance"', f'"name": "{text_title}"')
    elif lang_code == "zh":
        content = content.replace('<a href="/zh/standard/browse.html" class="active">方法论</a>', '<a href="/zh/standard/methodology.html">方法论</a>')
        content = content.replace('"name": "方法论与数据治理",', f'"name": "{text_title}",')
        content = content.replace('"name": "标准比对方法论与数据治理"', f'"name": "{text_title}"')
    elif lang_code == "zht":
        content = content.replace('<a href="/zht/standard/browse.html" class="active">方法論</a>', '<a href="/zht/standard/methodology.html">方法論</a>')
        content = content.replace('"name": "方法論與數據治理",', f'"name": "{text_title}",')
        content = content.replace('"name": "標準比對方法論與數據治理"', f'"name": "{text_title}"')

    # Fix Dataset JSON-LD name
    content = re.sub(r'"name": "Methodology.*?Dataset"', '"name": "Browse all comparisons - Export Compliance Dataset"', content)
    content = re.sub(r'"name": "方法论.*?数据集"', '"name": "浏览全部对照 - 出口合规数据集"', content)
    content = re.sub(r'"name": "方法論.*?數據集"', '"name": "瀏覽全部對照 - 出口合規數據集"', content)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

base = "/Users/tunai/Projects/asaptic-web"

files_to_fix = [
    (f"{base}/standard/browse.html", "en", "Browse all comparisons", "Directory of all live cross-border standards comparisons by product and market."),
    (f"{base}/zh/standard/browse.html", "zh", "浏览全部对照", "按产品和市场分类的所有在线跨境标准合规对照表目录。"),
    (f"{base}/zht/standard/browse.html", "zht", "瀏覽全部對照", "按產品和市場分類的所有在線跨境標準合規對照表目錄。")
]

for filepath, lang, title, desc in files_to_fix:
    if os.path.exists(filepath):
        fix_browse_file(filepath, lang, title, desc)
        print(f"Fixed {filepath}")
    else:
        print(f"Not found: {filepath}")
