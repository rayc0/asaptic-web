import os
from datetime import datetime

ROOT = "/Users/tunai/Projects/asaptic-web"
BASE_URL = "https://asaptic.com"

def generate_sitemap():
    html_files = []
    for root, dirs, files in os.walk(ROOT):
        # skip hidden dirs or drafts
        dirs[:] = [d for d in dirs if not d.startswith('.') and d != "scripts" and d != "node_modules"]
        for file in files:
            if file.endswith(".html"):
                path = os.path.join(root, file)
                rel_path = os.path.relpath(path, ROOT).replace("\\", "/")
                
                if rel_path == "index.html":
                    route = f"{BASE_URL}/"
                elif rel_path.endswith("/index.html"):
                    route = f"{BASE_URL}/" + rel_path[:-11] + "/"
                else:
                    route = f"{BASE_URL}/{rel_path}"
                
                html_files.append(route)
                
    # Generate XML
    xml = ['<?xml version="1.0" encoding="UTF-8"?>']
    xml.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    
    today = datetime.utcnow().strftime("%Y-%m-%d")
    for url in sorted(html_files):
        xml.append('  <url>')
        xml.append(f'    <loc>{url}</loc>')
        xml.append(f'    <lastmod>{today}</lastmod>')
        xml.append('    <changefreq>weekly</changefreq>')
        xml.append('  </url>')
        
    xml.append('</urlset>')
    
    with open(os.path.join(ROOT, "sitemap.xml"), "w") as f:
        f.write("\n".join(xml))

if __name__ == "__main__":
    generate_sitemap()
    print("Sitemap generated.")
