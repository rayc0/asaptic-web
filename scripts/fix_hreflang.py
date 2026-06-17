import os

def fix_hreflang(filename, route_name):
    filepath = os.path.join("/Users/tunai/Projects/asaptic-web", filename)
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Check if already fixed
    if 'hreflang="zh-Hans"' in content:
        return
        
    insertion = f"""
  <link rel="alternate" hreflang="zh-Hans" href="https://asaptic.com/zh/{route_name}" />
  <link rel="alternate" hreflang="zh-Hant" href="https://asaptic.com/zht/{route_name}" />
  <link rel="alternate" hreflang="pt-PT" href="https://asaptic.com/pt/{route_name}" />"""
  
    # Find the line with hreflang="en" and insert after it
    target = f'<link rel="alternate" hreflang="en" href="https://asaptic.com/{route_name}" />'
    
    if target in content:
        content = content.replace(target, target + insertion)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Fixed {filename}")
    else:
        print(f"Could not find target in {filename}")

fix_hreflang("ev-charger-power-module-sourcing.html", "ev-charger-power-module-sourcing")
fix_hreflang("heavy-lift-uav.html", "heavy-lift-uav")
fix_hreflang("physical-ai-robotics.html", "physical-ai-robotics")
