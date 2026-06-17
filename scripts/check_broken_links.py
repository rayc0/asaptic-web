import os
import re

ROOT = "/Users/tunai/Projects/asaptic-web"

# Collect valid html files
html_files = []
for root, dirs, files in os.walk(ROOT):
    dirs[:] = [d for d in dirs if not d.startswith('.') and d != "scripts" and d != "node_modules"]
    for file in files:
        if file.endswith(".html"):
            html_files.append(os.path.join(root, file))

valid_routes = set()
for f in html_files:
    rel = os.path.relpath(f, ROOT).replace("\\", "/")
    valid_routes.add("/" + rel)
    if rel.endswith("index.html"):
        valid_routes.add("/" + rel[:-10])

valid_routes.add("/style.css")
valid_routes.add("/llms.txt")
valid_routes.add("/sitemap.xml")
valid_routes.add("/agent/capabilities.json")
valid_routes.add("/openapi.json")
valid_routes.add("/.well-known/ai-plugin.json")

broken = []
for f in html_files:
    with open(f, "r") as file:
        content = file.read()
    
    links = re.findall(r'href="(/[^"]+)"', content)
    for link in links:
        route = link.split('#')[0].split('?')[0]
        if route == "/" or route == "": continue
        
        if (route not in valid_routes and 
            route + "/" not in valid_routes and 
            route + ".html" not in valid_routes and 
            route + "index.html" not in valid_routes and 
            route + "/index.html" not in valid_routes):
            
            broken.append((f, link))

if broken:
    unique_broken = set([b[1] for b in broken])
    print(f"Found {len(broken)} broken links:")
    for b in list(unique_broken)[:20]:
        print(" ", b)
else:
    print("No internal broken links found.")
