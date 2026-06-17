import os
import re

filepath = "/Users/tunai/Projects/asaptic-web/index.html"
with open(filepath, "r") as f:
    content = f.read()

# 1. Update meta description (max 155 chars)
old_desc = '<meta name="description" content="Asaptic builds Physical AI for drones, marine, and robots — embodied autonomous systems across air, sea, and ground, including the HK300 heavy-lift unmanned helicopter. Certified components sourcing from China\'s deep-tech supply chain: energy (BESS, solar inverters, EV chargers), GaN, Na-ion, cold-plates, physical-AI actuators, e-skin, clinical devices, TFLN photonics, and RPM." />'
new_desc = '<meta name="description" content="Asaptic builds Physical AI (embodied autonomous systems) and provides a certified, Western-grade deep-tech sourcing gateway to China\'s supply chain." />'
content = content.replace(old_desc, new_desc)

# 2. Add og:image and twitter:image
og_title = '<meta property="og:title" content="Asaptic — Physical AI for drones, marine & robots" />'
og_image = '<meta property="og:image" content="https://asaptic.com/img/og-image.jpg" />\n  ' + og_title
content = content.replace(og_title, og_image)

tw_title = '<meta name="twitter:title" content="Asaptic — Physical AI for drones, marine & robots" />'
tw_image = '<meta name="twitter:image" content="https://asaptic.com/img/og-image.jpg" />\n  ' + tw_title
content = content.replace(tw_title, tw_image)

# 3. Add sameAs to JSON-LD Organization
org_start = '"@id": "https://asaptic.com/#organization",'
org_replacement = org_start + '\n        "sameAs": [\n          "https://www.linkedin.com/company/asaptic-labs",\n          "https://x.com/asapticlabs"\n        ],'
content = content.replace(org_start, org_replacement)

with open(filepath, "w") as f:
    f.write(content)

print("index.html SEO fixes applied.")
