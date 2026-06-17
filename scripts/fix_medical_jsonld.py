import os

filepath = "/Users/tunai/Projects/asaptic-web/blog/bioimpedance-clinical-evidence-malnutrition-sarcopenia.html"
with open(filepath, "r") as f:
    content = f.read()

content = content.replace('"@type": "MedicalWebPage"', '"@type": ["MedicalWebPage", "Article"]')

with open(filepath, "w") as f:
    f.write(content)
