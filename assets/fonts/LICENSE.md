# Font licenses

Both typefaces below are self-hosted here (previously loaded from
`fonts.googleapis.com` / `fonts.gstatic.com`) and are licensed under the
**SIL Open Font License, Version 1.1** — free to embed, modify, and
redistribute, including in a commercial product, with no per-site or
per-project fee. Full license text: https://openfontlicense.org/

## Inter

- Designer: Rasmus Andersson
- Source: https://github.com/rsms/inter
- License: SIL OFL 1.1
- Files here: `inter-latin.woff2`, `inter-latin-ext.woff2`
- These are the variable-font builds served by Google Fonts (`wght` axis
  100–900); one file per subset covers every static weight the site uses
  (300/400/500/600/700/800) — see `assets/v2/shell.css` section 0 for the
  `@font-face` declarations using `font-weight: 300 800`.

## JetBrains Mono

- Publisher: JetBrains s.r.o.
- Source: https://github.com/JetBrains/JetBrainsMono
- License: SIL OFL 1.1
- Files here: `jetbrains-mono-latin.woff2`, `jetbrains-mono-latin-ext.woff2`
- Variable-font builds (`wght` axis 400–800); one file per subset covers the
  weights the site uses (400/700) via `font-weight: 400 700` in shell.css.

## Subsets kept

Only `latin` and `latin-ext` were downloaded (cyrillic, cyrillic-ext, greek,
greek-ext, vietnamese were dropped — asaptic.com content does not use those
scripts). `unicode-range` on each `@font-face` rule is copied verbatim from
Google Fonts' own subsetting so the browser only fetches the file a page
actually needs to render.

## Why variable-font files instead of one file per static weight

`https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800...`
requested with a modern Chrome UA returns **the same variable-font woff2
URL** for all six declared Inter weights (verified by byte-identical MD5
across the six responses; same for JetBrains Mono's two weights) — Google
now serves one variable instance and lets `font-weight` in each `@font-face`
select the static appearance. Saving one deduplicated file per subset
(instead of 6/2 duplicate copies) cuts the self-hosted payload from ~867KB
to ~176KB with zero loss of weight coverage.
