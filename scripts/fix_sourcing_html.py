import os
import re

INDEX_FILES = [
    "/Users/tunai/Projects/asaptic-web/index.html",
    "/Users/tunai/Projects/asaptic-web/zh/index.html",
    "/Users/tunai/Projects/asaptic-web/zht/index.html"
]

for filepath in INDEX_FILES:
    if not os.path.exists(filepath): continue
    
    with open(filepath, "r") as f:
        content = f.read()

    replacements = {
        '<h2 class="section-title">China Deep-Tech & Certified Components Sourcing</h2>': '<h2 class="section-title" data-key="src_title">China Deep-Tech & Certified Components Sourcing</h2>',
        '<p class="section-sub">Factory-direct supply from verified': '<p class="section-sub" data-key="src_sub">Factory-direct supply from verified',
        
        '<div class="domain-tag">Health Canada · TGA Certified</div>': '<div class="domain-tag" data-key="src_tag1">Health Canada · TGA Certified</div>',
        '<h3>Clinical Devices</h3>': '<h3 data-key="src_h1">Clinical Devices</h3>',
        '<p>Bioimpedance and body-composition analyzers': '<p data-key="src_p1">Bioimpedance and body-composition analyzers',
        '<a href="/sourcing/clinical-devices.html" class="domain-link">Clinical Device Sourcing →</a>': '<a href="/sourcing/clinical-devices.html" class="domain-link" data-key="src_l1">Clinical Device Sourcing →</a>',
        
        '<div class="domain-tag">Scarce Supply · 5-Day Sample</div>': '<div class="domain-tag" data-key="src_tag2">Scarce Supply · 5-Day Sample</div>',
        '<h3>Photonics — TFLN</h3>': '<h3 data-key="src_h2">Photonics — TFLN</h3>',
        '<p>Thin-film lithium niobate wafers and electro-optic': '<p data-key="src_p2">Thin-film lithium niobate wafers and electro-optic',
        '<a href="/deep-tech-sourcing.html" class="domain-link">TFLN Sourcing →</a>': '<a href="/deep-tech-sourcing.html" class="domain-link" data-key="src_l2">TFLN Sourcing →</a>',
        
        '<div class="domain-tag">Deposit-First · 30% PI</div>': '<div class="domain-tag" data-key="src_tag3">Deposit-First · 30% PI</div>',
        '<h3>How It Works</h3>': '<h3 data-key="src_h3">How It Works</h3>',
        '<p>30% proforma deposit reserves a certified': '<p data-key="src_p3">30% proforma deposit reserves a certified',
        '<a href="/process.html" class="domain-link">Our Process →</a>': '<a href="/process.html" class="domain-link" data-key="src_l3">Our Process →</a>',
        
        '<div class="domain-tag">BESS · Inverters · EV Chargers</div>': '<div class="domain-tag" data-key="src_tag4">BESS · Inverters · EV Chargers</div>',
        '<h3>Energy Systems</h3>': '<h3 data-key="src_h4">Energy Systems</h3>',
        '<p>Solar inverters, battery energy storage systems (BESS)': '<p data-key="src_p4">Solar inverters, battery energy storage systems (BESS)',
        '<a href="/bess-uflpa-compliance.html" class="domain-link">Energy Sourcing →</a>': '<a href="/bess-uflpa-compliance.html" class="domain-link" data-key="src_l4">Energy Sourcing →</a>',
        
        '<div class="domain-tag">GaN · Na-ion · Thermal</div>': '<div class="domain-tag" data-key="src_tag5">GaN · Na-ion · Thermal</div>',
        '<h3>Deep-Tech Components</h3>': '<h3 data-key="src_h5">Deep-Tech Components</h3>',
        '<p>GaN power electronics, sodium-ion battery cells': '<p data-key="src_p5">GaN power electronics, sodium-ion battery cells',
        '<a href="/deep-tech-sourcing.html" class="domain-link">Deep-Tech Sourcing →</a>': '<a href="/deep-tech-sourcing.html" class="domain-link" data-key="src_l5">Deep-Tech Sourcing →</a>',
        
        '<div class="domain-tag">Actuators · E-Skin · RPM</div>': '<div class="domain-tag" data-key="src_tag6">Actuators · E-Skin · RPM</div>',
        '<h3>Physical-AI &amp; Robotics</h3>': '<h3 data-key="src_h6">Physical-AI &amp; Robotics</h3>',
        '<p>Precision actuators, electronic-skin sensor arrays': '<p data-key="src_p6">Precision actuators, electronic-skin sensor arrays',
        '<a href="/physical-ai-robotics.html" class="domain-link">Robotics Components →</a>': '<a href="/physical-ai-robotics.html" class="domain-link" data-key="src_l6">Robotics Components →</a>',
        
        '<a href="/resources.html" class="domain-link">Explore all sourcing lanes →</a>': '<a href="/resources.html" class="domain-link" data-key="src_l7">Explore all sourcing lanes →</a>',
        '<a href="/blog/factory-direct-vs-trading-company-sourcing.html" class="domain-link">Factory-direct vs trading company: what buyers need to know →</a>': '<a href="/blog/factory-direct-vs-trading-company-sourcing.html" class="domain-link" data-key="src_l8">Factory-direct vs trading company: what buyers need to know →</a>'
    }

    for old, new in replacements.items():
        if old in content and new not in content:
            content = content.replace(old, new)
        elif new in content:
            pass # Already replaced
        else:
            # Try matching by prefix
            prefix = old[:50]
            if prefix in content:
                # Find the full line
                start = content.find(prefix)
                end = content.find("</p>", start)
                if end != -1:
                    full_old = content[start:end+4]
                    if 'data-key' not in full_old:
                        if old.startswith('<p class="section-sub">'):
                            content = content.replace(full_old, full_old.replace('<p class="section-sub">', '<p class="section-sub" data-key="src_sub">'))
                        elif old.startswith('<p>'):
                            # get the key
                            key_part = new.split('data-key="')[1].split('"')[0]
                            content = content.replace(full_old, full_old.replace('<p>', '<p data-key="' + key_part + '">'))

    with open(filepath, "w") as f:
        f.write(content)

print("Updated HTML files with data-key attributes.")
