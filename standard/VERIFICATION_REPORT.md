# Cross-Standard — Verification Report (2026-06-11)

AI verification pass over all 226 rows across 17 comparisons. Method: 17 Sonnet
web-verifiers (one per dataset) + Codex adversarial review of the medical datasets,
each checking every row's cited source URL, standard number, mandatory/voluntary
status, and gap claim against official sources. **AI verification is triage, not the
final human sign-off — every row remains `verified:false` / `noindex`.**

## Results
- Rows verified: **226**  ·  Initial: 137 confirmed / 46 uncertain / 43 likely_error / 84 needs_human
- **~50 dead/wrong source URLs auto-fixed** (e.g. IEEE/UL/FDA/ENA/EUR-Lex link rot, EESS erac→eess migration).
- **~40 substantive factual errors corrected** by a 15-agent correction wave (see git log). Highlights:
  - **India**: ALMM does NOT cover inverters (modules/cells only) — rewrote; corrected swapped IEC numbers (IS 16221=IEC 62109-2, IS 16169=IEC 62116); added IS 17980:2022.
  - **UK / EV-UK**: CE marking is **extended indefinitely** in GB (not withdrawn 2024/25); G98/G99 → Issue 2 (Mar 2025); EV connector is de-facto (SI 2023/1168 does not mandate it).
  - **Australia**: AS/NZS 4777.2 Amd 2:2024; Region B = South Australia only; EMC = AS/NZS CISPR 11 (not AS/NZS 4268).
  - **Japan**: anti-islanding = JIS C 8963 (not 8961); PV inverters are non-specified PSE (circle, self-declared).
  - **BESS-EU**: Battery Reg due-diligence postponed to 18 Aug 2027; IEC 62933-5-2:2025; UN 38.3 Rev.8.
  - **BESS-US**: UL 9540A 6th ed (2025).
  - **Medical-US**: 21 CFR 820.30 retired under QMSR (eff. 2 Feb 2026); QSIT → Compliance Program 7382.850.
  - **Medical-EU**: EUDAMED instrument = CIR 2021/2078; mandatory 28 May 2026; ISO 13485 is voluntary evidence (not legally mandated by MDR Art 10(9)); NMPA GMP Order 64 (2014)/107 (2025).
  - **Motor-EU**: GB 18613 Grade 3 = IE3 (not IE2); IE2+VSD exception abolished.

## Still needs a HUMAN regulatory reviewer (highest priority)
Even after correction, these remain YMYL / not AI-certifiable — a qualified human must sign off before `noindex` is lifted:
1. **All medical rows (US FDA + EU MDR)** — Codex flagged residual precision issues (Annex routes, AR/PRRC nuance, exact EUDAMED data scope). Highest risk: `medus-qms-02` (design-control law post-QMSR).
2. **Volatile dates** — EU Battery Reg phase-in, EUDAMED 28 May 2026, QMSR 2 Feb 2026, AFIR ISO 15118 thresholds: confirm against primary OJ/Federal Register before publish.
3. **Standard edition years** — several `[UNVERIFIED]` edition tags remain (IEC 62109 editions in Saudi/Brazil; SASO EMC reg number).
4. **Per-row verdicts**: `standard/data/_verify/*.json` (machine-readable, one file per comparison).

## How to lift noindex
For a comparison to go live/indexed: a human verifies its rows vs `standard/data/_sources.json` + the `_verify` verdicts, then flips `human_reviewed:true` in its dataset wrapper. The generator then drops `noindex` and the sitemap includes it.
