import os
import re

ROOT = "/Users/tunai/Projects/asaptic-web"

for root, dirs, files in os.walk(ROOT):
    dirs[:] = [d for d in dirs if not d.startswith('.') and d != "scripts" and d != "node_modules"]
    for file in files:
        if file.endswith(".html"):
            path = os.path.join(root, file)
            with open(path, "r") as f:
                content = f.read()
            
            # fix double prefixes
            content = content.replace('href="/zh/zh/', 'href="/zh/')
            content = content.replace('href="/zht/zht/', 'href="/zht/')
            content = content.replace('href="/pt/pt/', 'href="/pt/')
            
            # fix trailing slash on standard routes (e.g. href="/standard/wireless-device-china-to-oman/")
            # using regex
            content = re.sub(r'href="(/[^"]+standard/[^"/]+)/"', r'href="\1"', content)
            
            with open(path, "w") as f:
                f.write(content)

print("Links fixed.")
