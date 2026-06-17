import json
import os

blog_files = [
    "blog/bioimpedance-clinical-evidence-malnutrition-sarcopenia.html",
    "blog/directory-health-canada-mdall-body-composition-devices.html",
    "blog/directory-tga-approved-bioimpedance-analyzers-australia.html",
    "blog/tfln-lnoi-wafer-suppliers-2026-sourcing-guide.html"
]

for filepath in blog_files:
    full_path = os.path.join("/Users/tunai/Projects/asaptic-web", filepath)
    if not os.path.isfile(full_path): continue
    
    with open(full_path, "r") as f:
        content = f.read()
    
    # Change "@type": "Dataset" to "@type": ["Dataset", "Article"]
    content = content.replace('"@type": "Dataset"', '"@type": ["Dataset", "Article"]')
    
    with open(full_path, "w") as f:
        f.write(content)

# For index.html
index_path = "/Users/tunai/Projects/asaptic-web/blog/index.html"
with open(index_path, "r") as f:
    content = f.read()

# Change "@type": "Blog" to "@type": ["Blog", "Article"]
content = content.replace('"@type": "Blog"', '"@type": ["Blog", "Article"]')

with open(index_path, "w") as f:
    f.write(content)

print("Fixed JSON-LD Article type")
