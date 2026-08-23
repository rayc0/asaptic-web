# apply_shell.py — dry-run report

generated: 2026-08-23T15:14:48+00:00  ·  css ver `20260823a`  ·  hrefs: root-relative

## Counts per status per family

| family | OK | SKIP | total |
|---|---|---|---|
| tender | 14 | 30 | 44 |
| **all** | **14** | **30** | 44 |

## Refusal / skip reasons

* **9** — glob tender/archive/*
    * `tender/archive/2026-w27/index.html`
    * `tender/archive/2026-w28/index.html`
    * `tender/archive/2026-w29/index.html`
* **9** — glob zh/tender/archive/*
    * `zh/tender/archive/2026-w27/index.html`
    * `zh/tender/archive/2026-w28/index.html`
    * `zh/tender/archive/2026-w29/index.html`
* **9** — glob zht/tender/archive/*
    * `zht/tender/archive/2026-w27/index.html`
    * `zht/tender/archive/2026-w28/index.html`
    * `zht/tender/archive/2026-w29/index.html`
* **3** — already-v2 / flat page
    * `tender/index.html`
    * `zh/tender/index.html`
    * `zht/tender/index.html`

## Idempotency

* re-applying the transform to its own output is byte-identical for **14 / 14** OK pages.

## 10 largest pages touched

* `pt/tender/mo/index.html` — 28,217 → 28,217 bytes · anchor=sentinel · footer=sentinel · chips=enzhtpt
* `tender/mo/index.html` — 27,978 → 27,978 bytes · anchor=sentinel · footer=sentinel · chips=enzhtpt
* `tender/sg/index.html` — 27,461 → 27,618 bytes · anchor=sentinel · footer=sentinel · chips=(none)
* `tender/gb/index.html` — 27,436 → 27,593 bytes · anchor=sentinel · footer=sentinel · chips=(none)
* `tender/au/index.html` — 27,377 → 27,534 bytes · anchor=sentinel · footer=sentinel · chips=(none)
* `zht/tender/mo/index.html` — 26,540 → 26,540 bytes · anchor=sentinel · footer=sentinel · chips=enzhtpt
* `tender/c/medical-equipment/index.html` — 22,819 → 22,819 bytes · anchor=sentinel · footer=sentinel · chips=enzh
* `tender/c/medical-services-pharma/index.html` — 22,758 → 22,758 bytes · anchor=sentinel · footer=sentinel · chips=enzh
* `tender/c/construction-works/index.html` — 22,514 → 22,514 bytes · anchor=sentinel · footer=sentinel · chips=enzh
* `tender/c/it-software/index.html` — 22,502 → 22,502 bytes · anchor=sentinel · footer=sentinel · chips=enzh

## Handling matrix (anchor x footer mode)

| header anchor | footer mode | pages | examples |
|---|---|---|---|
| sentinel | sentinel | 14 | `pt/tender/mo/index.html` · `tender/au/index.html` · `tender/c/construction-works/index.html` |

## Note kinds

* **14** — `head:sentinel-refresh` — e.g. `pt/tender/mo/index.html` · `tender/au/index.html`

## Oddest pages

* `pt/tender/mo/index.html` — family=tender · anchor=sentinel · footer=sentinel · chips=enzhtpt · head:sentinel-refresh
