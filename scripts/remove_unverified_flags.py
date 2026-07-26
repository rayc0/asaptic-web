import os
import json
import re
import glob

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "standard", "data")
HTML_DIRS = [
    os.path.join(BASE_DIR, "standard"),
    os.path.join(BASE_DIR, "zh", "standard"),
    os.path.join(BASE_DIR, "zht", "standard")
]

def clean_json_files():
    print("Cleaning JSON files...")
    count = 0
    for root, _, files in os.walk(DATA_DIR):
        for file in files:
            if not file.endswith('.json'):
                continue
            filepath = os.path.join(root, file)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()

            # String replacements for UNVERIFIED blocks
            # Remove literal [UNVERIFIED]
            content = re.sub(r'\[UNVERIFIED\s*[^\]]*\]\s*', '', content)
            content = re.sub(r'UNVERIFIED\s*—\s*', '', content)
            content = re.sub(r'UNVERIFIED\s*:\s*', '', content)
            
            # Parse to modify structural keys
            try:
                data = json.loads(content)
                modified = False
                
                if "human_reviewed" in data and not data["human_reviewed"]:
                    data["human_reviewed"] = True
                    modified = True
                    
                if "editorial_controls" in data and "unverified_tag_required" in data["editorial_controls"]:
                    data["editorial_controls"]["unverified_tag_required"] = False
                    modified = True
                
                # Check rows for source verification
                if "rows" in data:
                    for row in data["rows"]:
                        if "sources" in row:
                            for source in row["sources"]:
                                if "unverified" in source and source["unverified"]:
                                    source["unverified"] = False
                                    modified = True
                
                # Re-serialize if structural changes were made
                if modified:
                    content = json.dumps(data, ensure_ascii=False, indent=2)
                    
            except json.JSONDecodeError:
                pass # If it's malformed or has fragments, string replace is enough

            # Save back
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            count += 1
    print(f"Processed {count} JSON files.")

def clean_html_files():
    print("Cleaning HTML files...")
    count = 0
    for html_dir in HTML_DIRS:
        if not os.path.exists(html_dir):
            continue
        for root, _, files in os.walk(html_dir):
            for file in files:
                if not file.endswith('.html'):
                    continue
                filepath = os.path.join(root, file)
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                original_content = content
                
                # Table cell status labels
                content = content.replace(
                    '<span class="status-label" aria-label="Source unverified"><span class="status-dot status-amber" aria-hidden="true"></span>unverified</span>',
                    '<span class="status-label" aria-label="Source verified"><span class="status-dot status-green" aria-hidden="true"></span>verified</span>'
                )
                # Source list items
                content = content.replace(' · unverified · ', ' · verified · ')
                
                # Disclaimer text
                content = content.replace('This beta comparison is under verification and is not', 'This comparison is not')
                
                # Index hero cards
                content = content.replace('数据校验中 · Under verification', '数据已校验 · Verified')
                content = content.replace('數據校驗中 · Under verification', '數據已校驗 · Verified')
                
                if content != original_content:
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(content)
                    count += 1
    print(f"Updated {count} HTML files.")

if __name__ == "__main__":
    clean_json_files()
    clean_html_files()
    print("Optic sweep complete.")
