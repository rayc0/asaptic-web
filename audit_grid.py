import os
import json
import re

FRAG_DIR = "/Users/tun/Projects/asaptic-web/standard/data/_fragments"
markets = {
    "ec": "Ecuador",
    "do": "Dominican Republic",
    "pa": "Panama",
    "cr": "Costa Rica",
    "sv": "El Salvador",
    "gt": "Guatemala",
    "hn": "Honduras",
    "ni": "Nicaragua",
    "gy": "Guyana",
    "sr": "Suriname"
}

all_files = os.listdir(FRAG_DIR)
matched_files = []
for f in all_files:
    for code in markets:
        if f.startswith(f"si{code}-") or f.startswith(f"bess{code}-") or f.startswith(f"ev{code}-") or \
           f == f"si{code}.json" or f == f"bess{code}.json" or f == f"ev{code}.json":
            matched_files.append((f, code))
            break

matched_files.sort()

print(f"Auditing {len(matched_files)} files...")

for f, code in matched_files:
    path = os.path.join(FRAG_DIR, f)
    with open(path, "r", encoding="utf-8") as file:
        try:
            data = json.load(file)
        except Exception as e:
            print(f"Error loading {f}: {e}")
            continue
        
        for idx, item in enumerate(data):
            # Extract target/destination fields
            topic = item.get("requirement_topic", {}).get("en", "")
            summary = item.get("target_requirement", {}).get("summary", {}).get("en", "")
            gap = item.get("gap", {}).get("en", "")
            verdict = item.get("compliance_verdict", {}).get("en", "")
            mandatory = item.get("mandatory_status", {}).get("target", "")
            
            dest_text = " | ".join([topic, summary, gap, verdict, mandatory])
            
            # Check 1: 50 Hz in destination text
            # We want to make sure it doesn't specify 50 Hz as the destination frequency
            # (Sometimes it might mention "50 Hz" when comparing to China's 50 Hz, e.g. "different from China's 50 Hz", 
            # so we need to be careful. Let's find all mentions of 50 Hz or 50Hz and inspect context)
            matches_50hz = re.findall(r'(?i)\b50\s*hz\b', dest_text)
            if matches_50hz:
                # Let's print the sentence containing 50 Hz to see if it is wrong
                sentences = re.split(r'[.!?|]', dest_text)
                for s in sentences:
                    if re.search(r'(?i)\b50\s*hz\b', s):
                        print(f"POSSIBLE 50Hz ISSUE: {f} [{idx}] | {s.strip()}")
            
            # Check 2: 220 V / 380 V / 220-380 V in destination text
            matches_380v = re.findall(r'(?i)\b380\s*v\b|\b220-380\b|\b220/380\b', dest_text)
            if matches_380v:
                sentences = re.split(r'[.!?|]', dest_text)
                for s in sentences:
                    if re.search(r'(?i)\b380\s*v\b|\b220-380\b|\b220/380\b', s):
                        print(f"POSSIBLE 380V ISSUE: {f} [{idx}] | {s.strip()}")
                        
            # Check 3: Check if destination doesn't mention 60 Hz in grid files
            if "grid" in f or "frequency" in f:
                if not re.search(r'(?i)\b60\s*hz\b', dest_text):
                    print(f"MISSING 60Hz: {f} [{idx}] | Topic: {topic}")
                    
            # Check 4: Check if EV connector files don't reference J1772/CCS1 or wrongly force Type 2/CCS2
            if "connector" in f:
                # Does it mention J1772 or CCS1?
                has_j1772 = re.search(r'(?i)j1772|ccs1|type\s*1', dest_text)
                # Does it mention Type 2 or CCS2?
                has_type2 = re.search(r'(?i)type\s*2|ccs2', dest_text)
                if not has_j1772:
                    print(f"NO J1772/CCS1 IN CONNECTOR: {f} [{idx}] | Topic: {topic} | summary: {summary[:100]}...")
                if has_type2 and not has_j1772:
                    print(f"ONLY TYPE2/CCS2 IN CONNECTOR: {f} [{idx}] | Topic: {topic} | summary: {summary[:100]}...")
