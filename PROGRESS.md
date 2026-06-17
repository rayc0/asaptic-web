# Asaptic Cross-Standard Build Pipeline — Progress Document

**Last updated:** 2026-06-17  
**Current state:** 1,039 comparisons / 185 markets / 23 categories  
**Live at:** https://asaptic.com

---

## What This Project Is

Asaptic generates wireless-device compliance comparison pages for Chinese exporters — one page per target market, comparing China's MIIT/SRRC/CCC standards against the target country's requirements. Pages are trilingual (en/zh/zht), SEO-indexed, and built from JSON data files.

**Stack:** Cloudflare Pages · `wrangler pages deploy` · Node.js build pipeline · IndexNow

---

## Non-Stop Wave Pipeline — How It Works

Each **wave** = 4 market lanes × 6 files = 24 files total.

### File structure per lane (e.g. market code `xx`):
```
standard/data/wireless-device-xx.v2026-06-11.json     ← dataset (rows:[], faq:[], ai_published:true)
standard/data/_fragments/wirxx-<topic>.json            ← 5+ fragment files (bare JSON arrays)
```

### Wave execution sequence:
1. Write 4 spec files → `/tmp/asaptic_lanes/cat/wNN_wd_XX.md`
2. Launch 4 parallel Claude agents: `claude -p "$(cat spec.md)" --allowedTools Edit,Write,Read --output-format text > wNN_xx.log 2>&1 &`
3. Monitor fragments with `until` loop watching `wirxx-*.json` counts ≥5
4. On `WAVE_NN_DONE`: validate all JSON → fix errors → upsert `_index.json` → build → git commit → `wrangler pages deploy . --project-name asaptic-web --branch main` → IndexNow POST (12 URLs: 3 langs × 4 markets)
5. Launch next wave agents while writing wave+2 specs — **zero idle time**

### Critical rules:
- `--branch main` is MANDATORY on every wrangler deploy
- `_index.json` dedup by `(product, market)` tuple before appending
- Fragment prefix convention: `wir{code}-` e.g. `wirua-`, `wirma-`
- Dataset `slug` = `wireless-device-china-to-{market-slug}`
- All fragments = bare JSON arrays (not wrapped in object)
- `human_reviewed: false`, `verified: false` on all rows
- Verdict prefix: `[INFORMATIONAL] ` / `[仅供参考] ` / `[僅供參考] `

### JSON auto-fix hierarchy (run after every wave):
1. `json.loads` round-trip → if clean, done
2. CJK regex: `re.sub(r'"([一-鿿　-〿＀-￯]+)"', ...)` 
3. Column-level escape at `JSONDecodeError` position

### IndexNow:
```
POST https://api.indexnow.org/indexnow
key: fdacead9b14100a77ab8cdb49a51c49a
host: asaptic.com
keyLocation: https://asaptic.com/fdacead9b14100a77ab8cdb49a51c49a.txt
```
12 URLs per wave = `/standard/wireless-device-china-to-{slug}/` × 3 langs (no prefix / `/zh/` / `/zht/`)

### Build pipeline (run in order):
```bash
node generate-standard.mjs
node build-browse.mjs
node build-llms.mjs
node generate-sitemap.mjs
```

### Agent crash recovery:
- If log only shows proxy line and process gone → relaunch immediately
- Old fragment files from crashed agent remain — new agent overwrites them; count still progresses

---

## _index.json Upsert Pattern

```python
path = 'standard/data/_index.json'
d = json.load(open(path))
comps = d['comparisons']
existing = {(e['product'], e['market']) for e in comps}
added = 0
for market, slug in [...]:
    entry = {'product':'wireless-device','market':market,'status':'live','url':{
        'en':f'/standard/wireless-device-china-to-{slug}/',
        'zh':f'/zh/standard/wireless-device-china-to-{slug}/',
        'zht':f'/zht/standard/wireless-device-china-to-{slug}/'}}
    if ('wireless-device', market) not in existing:
        comps.append(entry); existing.add(('wireless-device', market)); added += 1
d['comparisons'] = comps
d['updated'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
json.dump(d, open(path,'w'), ensure_ascii=False, indent=2)
```

---

## Completed Waves — Git History

| Wave | Markets | Commit | Comparisons |
|------|---------|--------|-------------|
| 61 | Iraq / Libya / Myanmar / Nepal | `15f78d0f` | 990 |
| 62 | Cambodia / Laos / Mongolia / Azerbaijan | `42741c67` | 993 |
| 63 | Georgia / Armenia / Slovakia / Bulgaria | `f0146eb5` | 997 |
| 64 | Croatia / Slovenia / Lithuania / Latvia 🎯 1001 | `5fba3629` | 1,001 |
| 65 | Estonia / Luxembourg / Cyprus / Malta (EU-27 complete) | `95fb656c` | 1,005 |
| 66 | Iceland / Montenegro / Bosnia / Albania | `b19b21be` | 1,009 |
| 67 | Kosovo / North Macedonia / Moldova / Kuwait | `ce4bb79d` | 1,012 |
| 68 | Qatar / Ethiopia / Tanzania / Uzbekistan | `b1443429` | 1,012 |
| 69 | Ghana / Côte d'Ivoire / Tajikistan / Turkmenistan | `e64d3e47` | 1,015 |
| 70 | Cameroon / Angola / Kenya / Uganda | `d872529c` | 1,016 |
| 71 | Rwanda / Zambia / Sudan / Yemen | `28061759` | 1,020 |
| 72 | Syria / Lebanon / Sri Lanka / Bangladesh | `ff8121f6` | 1,022 |
| 73 | Pakistan / Afghanistan / Maldives / Bhutan 🎯 200 markets | `7635de98` | 1,025 |
| 74 | Philippines / Myanmar / Cambodia / Nepal | `8868e7a6` | 1,025 |
| 75 | Laos / Mongolia / North Korea / Timor-Leste | `34a4427e` | 1,027 |
| 76 | Papua New Guinea / Fiji / Solomon Islands / Vanuatu | `1b7dd945` | 1,031 |
| 77 | Samoa / Tonga / Kiribati / Morocco | `985c600c` | 1,034 |
| 78 | Colombia / Mexico / Peru / Chile | `f826f62d` | 1,034 |
| 79 | Venezuela / Ecuador / Bolivia / Paraguay | `f0c2e1f4` | 1,035 |
| 80 | Uruguay / Guatemala / Cuba / Dominican Republic | `f17e1bc9` | **1,039** |

---

## Ready-to-Launch Waves (specs written, not yet run)

### Wave 81 — Central America
Spec files in `/tmp/asaptic_lanes/cat/`:
- `w81_wd_cr.md` → Costa Rica (SUTEL / INTECO), slug: `costa-rica`, prefix: `wircr-`
- `w81_wd_pa.md` → Panama (ASEP / MICI), slug: `panama`, prefix: `wirpa-`
- `w81_wd_hn.md` → Honduras (CONATEL / ONN), slug: `honduras`, prefix: `wirhn-`
- `w81_wd_ni.md` → Nicaragua (TELCOR / MIFIC), slug: `nicaragua`, prefix: `wirni-`

### Wave 82 — Mixed (Central America + North Africa)
Spec files in `/tmp/asaptic_lanes/cat/`:
- `w82_wd_sv.md` → El Salvador (SIGET / CNS), slug: `el-salvador`, prefix: `wirsv-`
- `w82_wd_tt.md` → Trinidad and Tobago (TATT / TTBS), slug: `trinidad-and-tobago`, prefix: `wirtt-`
- `w82_wd_tz.md` → Tunisia (INTT / INNORPI), slug: `tunisia`, prefix: `wirtz-`
- `w82_wd_ly.md` → Libya (GSIM / LNCSM), slug: `libya`, prefix: `wirly-`

> **Note:** `/tmp/` is ephemeral — spec files may be gone after reboot. Re-generate from the market facts below or write new specs for next logical region.

---

## Suggested Next Markets (not yet covered)

### Remaining Latin America / Caribbean:
- El Salvador (SIGET) · Costa Rica (SUTEL) · Panama (ASEP) · Honduras (CONATEL-HN) · Nicaragua (TELCOR)
- Trinidad and Tobago (TATT) · Barbados (TATT-BB) · Guyana (NTC) · Suriname (TAS)

### Remaining North Africa / Middle East:
- Tunisia (INTT) · Libya (GSIM) · Mauritania (ANRPTS) · Djibouti (ARPT)

### Remaining Sub-Saharan Africa:
- Senegal (ARTP) · Mali (CRT) · Burkina Faso (ARCEP-BF) · Niger (ARTP-N)
- Côte d'Ivoire already done · Guinea (ARPT-GUI) · Sierra Leone (NATCOM)
- Mozambique (INCM) · Madagascar (ARTEC) · Zimbabwe (POTRAZ) · Namibia (CRAN)
- Botswana (BOCRA) · Malawi (MACRA) · Zambia already done

### Remaining Asia-Pacific:
- Brunei (AITI) · East Timor already done · Papua New Guinea already done

### Remaining Europe:
- All EU-27 done · Andorra · Monaco · San Marino · Liechtenstein

---

## Market Codes Reference (fragment prefix pattern)

| Code | Market | Prefix |
|------|--------|--------|
| `pg` | Papua New Guinea | `wirpg-` |
| `fj` | Fiji | `wirfj-` |
| `sb` | Solomon Islands | `wirsb-` |
| `vu` | Vanuatu | `wirvu-` |
| `ws` | Samoa | `wirws-` |
| `to` | Tonga | `wirto-` |
| `ki` | Kiribati | `wirki-` |
| `ma` | Morocco | `wirma-` |
| `co` | Colombia | `wirco-` |
| `mx` | Mexico | `wirmx-` |
| `pe` | Peru | `wirpe-` |
| `cl` | Chile | `wircl-` |
| `ve` | Venezuela | `wirve-` |
| `ec` | Ecuador | `wirec-` |
| `bo` | Bolivia | `wirbo-` |
| `py` | Paraguay | `wirpy-` |
| `uy` | Uruguay | `wiruy-` |
| `gt` | Guatemala | `wirgt-` |
| `cu` | Cuba | `wircu-` |
| `do` | Dominican Republic | `wirdo-` |

---

## Infra Notes

- **Cloudflare project:** `asaptic-web`
- **Deploy command:** `wrangler pages deploy . --project-name asaptic-web --branch main` (`--branch main` is mandatory)
- **Repo path:** `/Users/tunai/Projects/asaptic-web` (Mac Mini M4, user `tunai`)
- **Proxy:** mihomo-claude on port 17890 (DMIT Tokyo via Reality) — active on this machine
- **IndexNow key:** `fdacead9b14100a77ab8cdb49a51c49a`

---

## Spec Template for New Waves

When writing a new spec file, use this structure:

```
LANE wir{code} — wireless-device -> {Country} ({Body}) (China-export Cross-Standard Wave NN).
REPO: /Users/tunai/Projects/asaptic-web. You MAY read standard/data/wireless-device-{ref}.v2026-06-11.json for STRUCTURE ONLY (rewrite for {country}; do NOT copy {ref} content).

WRITE EXACTLY 6 FILES:
  standard/data/wireless-device-{code}.v2026-06-11.json
     dataset_id "wireless-device-{code}-vs-cn", slug "wireless-device-china-to-{slug}", fragment_prefix "wir{code}-", markets ["{market}","cn"], target_market_label EN "..." / zh "..." / zht "...".
    standard/data/_fragments/wir{code}-{body}-type-approval.json  (1 row)
    standard/data/_fragments/wir{code}-emc-{standards}.json  (2 rows)
    standard/data/_fragments/wir{code}-electrical-safety.json  (1 row)
    standard/data/_fragments/wir{code}-importer-agent.json  (1 row)
    standard/data/_fragments/wir{code}-cybersecurity.json  (1 row)

MARKET FACTS ({market}): [regulatory bodies, electrical grid, lab reports accepted, CE/FCC/CCC recognition, importer req, language, China trade context]
  cn_common_equivalent = China MIIT/SRRC + CCC + MIIT NAL + GB standards baseline. Only TARGET reflects {market}. verified:false everywhere.

SCHEMA RULES (MANDATORY):
Dataset top keys exactly: schema_version "1.0.0", dataset_id, version "2026-06-11", last_verified "2026-06-17", human_reviewed false, robots "index, follow", slug, fragment_prefix, category{id,scope_note,labels{en,zh,zht}}, target_market_label{en,zh,zht}, markets ["{market}","cn"], page{title{en,zh,zht},description{en,zh,zht}}, disclaimer{en,zh,zht}, answer_first{en,zh,zht}, editorial_controls{owner,review_cycle,change_policy}, rows [] EMPTY, faq [] EMPTY, ai_published true. Each fragment = BARE JSON ARRAY. Row keys: id, requirement_topic{en,zh,zht}, target_requirement{summary{en,zh,zht},standards_or_laws:[...]}, cn_common_equivalent{summary{en,zh,zht},standards_or_laws:[...]}, gap{en,zh,zht}, mandatory_status{target,cn}, source{url,publisher,accessed "2026-06-17",verified false}, compliance_verdict{en,zh,zht} (prefix "[INFORMATIONAL] "/"[仅供参考] "/"[僅供參考] ").
CRITICAL JSON VALIDITY: STRICTLY VALID JSON; no unescaped inner double-quotes. No scratch files. Do NOT edit _index.json. Write ONLY the 6 files.
Reply: LANE_DONE wir{code} 6files
```

---

## Monitor Shell Pattern

```bash
until [ \
  $(ls /Users/tunai/Projects/asaptic-web/standard/data/_fragments/wir{a}-*.json 2>/dev/null | wc -l) -ge 5 ] && [ \
  $(ls /Users/tunai/Projects/asaptic-web/standard/data/_fragments/wir{b}-*.json 2>/dev/null | wc -l) -ge 5 ] && [ \
  ...]; do
  echo "wir{a}=$a wir{b}=$b ..."
  sleep 20
done
echo "WAVE_NN_DONE ..."
```

---

*This file lives at `/Users/tunai/Projects/asaptic-web/PROGRESS.md` and is committed to the repo. Read it at the start of any new Asaptic session to restore full context.*
