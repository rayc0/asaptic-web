# visual_qa report — `before`

- Target: /Users/tun/Projects/asaptic-web-cncompat/demos/index.html
- Run: 2026-08-09T18:30:54.645Z
- Page title: Asaptic — 客户如何赢下一份 HK$29,962,990 政府合同的最难一段
- Gate thresholds: min font 11px · WCAG AA 4.5:1 (3:1 large/bold) · overflow 0px · console errors 0

| Viewport | Overflow | Console errors | Fonts <11px | Contrast fails | Verdict |
|---|---|---|---|---|---|
| desktop-1280 | 0px | 1 | 5 | 0 | **FAIL** |
| tablet-768 | 0px | 1 | 5 | 0 | **FAIL** |
| mobile-390 | 0px | 1 | 5 | 0 | **FAIL** |

## Overall: **FAIL**

---
## desktop-1280 (1280×800) — screenshot: `desktop-1280.png`

### Horizontal overflow — PASS
scrollWidth 1280px vs viewport 1280px (0px beyond)

### Console errors — **FAIL**
- `Failed to load resource: net::ERR_FILE_NOT_FOUND`

### Computed font sizes below 11px — **FAIL**

| px | count | element | sample |
|---|---|---|---|
| 10.0 | 1 | `nav.bridge.z > div.row > a.logo > span.mk` | A |
| 10.0 | 2 | `header.hero.z > div.wrap > div.credgrp > p.credlbl` | 公开可查（政府中标通知书 / /demo） |
| 10.5 | 1 | `div.wrap > div.split > div.col.fog > div.ct` | 原始需求 · 非标 |
| 10.5 | 1 | `div.wrap > div.split > div.col.map > div.ct` | AI 结构化提取 |
| 10.5 | 1 | `div.wrap > div.grid2 > div.loa > div.cap` | 签约证据 · GLD C0009/2026 中标通知书（已公开于 /demo） |

### Contrast (approx WCAG AA via computed styles) — PASS

⚠ 4 low-ratio combo(s) sit over a background-image — verify manually:
- 1.04:1 #04121a on ~#0a0a0f → `nav.bridge.z > div.row > a.logo > span.mk`
- 1.00:1 #0a0a0f on ~#0a0a0f → `header.hero.z > div.wrap > h1 > span.grad`
- 1.04:1 #04121a on ~#0a0a0f → `header.hero.z > div.wrap > div.cta > a.btn.pri`
- 1.00:1 #0a0a0f on ~#0a0a0f → `div.wall > div.wcell > div.n.accent > span`

_Audited 111 visible text elements._

---
## tablet-768 (768×1024) — screenshot: `tablet-768.png`

### Horizontal overflow — PASS
scrollWidth 768px vs viewport 768px (0px beyond)

### Console errors — **FAIL**
- `Failed to load resource: net::ERR_FILE_NOT_FOUND`

### Computed font sizes below 11px — **FAIL**

| px | count | element | sample |
|---|---|---|---|
| 10.0 | 1 | `nav.bridge.z > div.row > a.logo > span.mk` | A |
| 10.0 | 2 | `header.hero.z > div.wrap > div.credgrp > p.credlbl` | 公开可查（政府中标通知书 / /demo） |
| 10.5 | 1 | `div.wrap > div.split > div.col.fog > div.ct` | 原始需求 · 非标 |
| 10.5 | 1 | `div.wrap > div.split > div.col.map > div.ct` | AI 结构化提取 |
| 10.5 | 1 | `div.wrap > div.grid2 > div.loa > div.cap` | 签约证据 · GLD C0009/2026 中标通知书（已公开于 /demo） |

### Contrast (approx WCAG AA via computed styles) — PASS

⚠ 4 low-ratio combo(s) sit over a background-image — verify manually:
- 1.04:1 #04121a on ~#0a0a0f → `nav.bridge.z > div.row > a.logo > span.mk`
- 1.00:1 #0a0a0f on ~#0a0a0f → `header.hero.z > div.wrap > h1 > span.grad`
- 1.04:1 #04121a on ~#0a0a0f → `header.hero.z > div.wrap > div.cta > a.btn.pri`
- 1.00:1 #0a0a0f on ~#0a0a0f → `div.wall > div.wcell > div.n.accent > span`

_Audited 111 visible text elements._

---
## mobile-390 (390×844) — screenshot: `mobile-390.png`

### Horizontal overflow — PASS
scrollWidth 390px vs viewport 390px (0px beyond)

### Console errors — **FAIL**
- `Failed to load resource: net::ERR_FILE_NOT_FOUND`

### Computed font sizes below 11px — **FAIL**

| px | count | element | sample |
|---|---|---|---|
| 10.0 | 1 | `nav.bridge.z > div.row > a.logo > span.mk` | A |
| 10.0 | 2 | `header.hero.z > div.wrap > div.credgrp > p.credlbl` | 公开可查（政府中标通知书 / /demo） |
| 10.5 | 1 | `div.wrap > div.split > div.col.fog > div.ct` | 原始需求 · 非标 |
| 10.5 | 1 | `div.wrap > div.split > div.col.map > div.ct` | AI 结构化提取 |
| 10.5 | 1 | `div.wrap > div.grid2 > div.loa > div.cap` | 签约证据 · GLD C0009/2026 中标通知书（已公开于 /demo） |

### Contrast (approx WCAG AA via computed styles) — PASS

⚠ 4 low-ratio combo(s) sit over a background-image — verify manually:
- 1.04:1 #04121a on ~#0a0a0f → `nav.bridge.z > div.row > a.logo > span.mk`
- 1.00:1 #0a0a0f on ~#0a0a0f → `header.hero.z > div.wrap > h1 > span.grad`
- 1.04:1 #04121a on ~#0a0a0f → `header.hero.z > div.wrap > div.cta > a.btn.pri`
- 1.00:1 #0a0a0f on ~#0a0a0f → `div.wall > div.wcell > div.n.accent > span`

_Audited 111 visible text elements._
