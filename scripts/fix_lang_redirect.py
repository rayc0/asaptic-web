import os

ROOT = "/Users/tunai/Projects/asaptic-web"

for root, dirs, files in os.walk(ROOT):
    dirs[:] = [d for d in dirs if not d.startswith('.') and d != "scripts" and d != "node_modules"]
    for file in files:
        if file.endswith(".html"):
            path = os.path.join(root, file)
            with open(path, "r") as f:
                content = f.read()

            old_apply = "    function applyLang(lang) {\n      if (!CONTENT[lang]) lang = 'en';"
            new_apply = """    function applyLang(lang) {
      if (lang === 'pt') {
        if (!window.location.pathname.startsWith('/pt/')) window.location.href = '/pt/index.html';
        return;
      }
      if (window.location.pathname.startsWith('/pt/')) {
        localStorage.setItem('asaptic-lang', lang);
        window.location.href = '/';
        return;
      }
      if (!CONTENT[lang]) lang = 'en';"""
            
            if old_apply in content:
                content = content.replace(old_apply, new_apply)
                with open(path, "w") as f:
                    f.write(content)

print("Patched language redirect logic in all html files.")
