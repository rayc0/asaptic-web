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

def resolve_fallback(route):
    # try adding .html
    if route + ".html" in valid_routes:
        return route + ".html"
    
    # try stripping trailing slash and adding .html
    if route.endswith("/"):
        if route[:-1] + ".html" in valid_routes:
            return route[:-1] + ".html"
        if route[:-1] in valid_routes:
            return route[:-1]
            
    # Try falling back to English equivalent by stripping language prefix
    if route.startswith("/zh/"):
        en_route = route[3:] # /zh/foo -> /foo
        if en_route in valid_routes: return en_route
        if en_route + ".html" in valid_routes: return en_route + ".html"
        if en_route.endswith("/") and en_route[:-1] + ".html" in valid_routes: return en_route[:-1] + ".html"
        if en_route.endswith("/") and en_route[:-1] in valid_routes: return en_route[:-1]
    
    if route.startswith("/zht/"):
        en_route = route[4:]
        if en_route in valid_routes: return en_route
        if en_route + ".html" in valid_routes: return en_route + ".html"
        if en_route.endswith("/") and en_route[:-1] + ".html" in valid_routes: return en_route[:-1] + ".html"
        if en_route.endswith("/") and en_route[:-1] in valid_routes: return en_route[:-1]
        
    if route.startswith("/pt/"):
        en_route = route[3:]
        if en_route in valid_routes: return en_route
        if en_route + ".html" in valid_routes: return en_route + ".html"
        if en_route.endswith("/") and en_route[:-1] + ".html" in valid_routes: return en_route[:-1] + ".html"
        if en_route.endswith("/") and en_route[:-1] in valid_routes: return en_route[:-1]

    # Try mapping specific known missing directories
    if route.startswith("/comparisons/"):
        return "/standard/browse.html"
    if route == "/pt/crossings.html":
        return "/crossings.html"
        
    # If standard lane is missing entirely, fallback to browse
    if "/standard/" in route:
        return "/standard/browse.html"

    return None

fixed_count = 0
for f in html_files:
    with open(f, "r") as file:
        content = file.read()
    
    def replacer(match):
        global fixed_count
        full_href = match.group(0)
        link = match.group(1)
        
        route = link.split('#')[0].split('?')[0]
        if route == "/" or route == "":
            return full_href
            
        if (route in valid_routes or 
            route + "/" in valid_routes or 
            route + "index.html" in valid_routes or 
            route + "/index.html" in valid_routes):
            return full_href
            
        # Route is broken. Let's find a fallback
        fallback = resolve_fallback(route)
        if fallback:
            fixed_count += 1
            # rebuild link with hash/query if any
            suffix = link[len(route):]
            return f'href="{fallback}{suffix}"'
            
        return full_href

    new_content = re.sub(r'href="(/[^"]+)"', replacer, content)
    
    if new_content != content:
        with open(f, "w") as file:
            file.write(new_content)

print(f"Fixed {fixed_count} broken links across all files.")
