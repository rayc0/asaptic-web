#!/usr/bin/env python3
"""Add Dataset JSON-LD to standard/ cross-standard pages."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STANDARD_DIR = ROOT / "standard"

def get_h1(source: str) -> str:
    match = re.search(r"<h1[^>]*>(.*?)</h1>", source, re.IGNORECASE)
    if match:
        return re.sub(r"<[^>]+>", "", match.group(1)).strip()
    return "Cross-Standard Compliance Data"

def get_locale(path: Path) -> str:
    rel = path.relative_to(STANDARD_DIR)
    if rel.parts[0] in ("zh", "zht", "pt"):
        if rel.parts[0] == "zh": return "zh-Hans"
        if rel.parts[0] == "zht": return "zh-Hant"
        return rel.parts[0]
    return "en"

def dataset_jsonld(path: Path, source: str) -> str:
    title = get_h1(source)
    payload = {
        "@context": "https://schema.org",
        "@type": "Dataset",
        "name": f"{title} - Export Compliance Dataset",
        "description": f"Detailed export compliance and regulatory capability mapping for {title}, compiled by Asaptic.",
        "creator": {
            "@type": "Organization",
            "name": "Asaptic"
        },
        "inLanguage": get_locale(path),
        "license": "https://asaptic.com/standard/"
    }
    return (
        '  <script type="application/ld+json">\n'
        f"{json.dumps(payload, ensure_ascii=False, indent=2)}\n"
        "  </script>\n"
    )

def apply_to_file(path: Path) -> bool:
    source = path.read_text(encoding="utf-8")
    
    if '"@type": "Dataset"' in source:
        return False
        
    block = dataset_jsonld(path, source)
    if "</head>" not in source:
        return False
        
    updated = source.replace("</head>", f"{block}</head>", 1)
    
    if updated != source:
        path.write_text(updated, encoding="utf-8")
        return True
    return False

def main():
    count = 0
    for path in STANDARD_DIR.rglob("*.html"):
        if path.name == "index.html":
            continue
        if apply_to_file(path):
            count += 1
            
    print(f"Added Dataset schema to {count} standard pages.")

if __name__ == "__main__":
    main()
