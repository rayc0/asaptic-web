I will start by listing the contents of the workspace directory to understand the layout and locate the `standard/` directory and build scripts.
I will now list the contents of the `standard/` directory to locate the data file and build scripts.
I will list the directories `standard/scripts/`, `standard/templates/`, and `standard/data/` to identify the files we need to read.
I will now list the contents of the `standard/templates/` and `standard/data/` directories.
I will list `standard/templates/partials/` and `standard/data/`.
I will list `standard/data/` to locate the `_index.json` or similar files.
I will view the contents of the generator script `standard/scripts/generate-standard.mjs` to understand how comparisons are built and where templates are injected.
I will view the contents of the browse page builder `standard/scripts/build-browse.mjs` to understand how the browse index is generated.
I will view the first 200 lines of `standard/data/_index.json` to understand the schema and see what markets and products are available.
I will view the next segment of `standard/data/_index.json` to find products and comparisons.
I will perform a search in `_index.json` to find the line numbers for products and comparisons to read those specific sections.
I will search for the `"comparisons"` section in `_index.json`.
I will view the products section in `_index.json` to understand the list of products.
I will view the comparisons array section in `_index.json` to understand the schema of each comparison entry.
I will search for the word `"slug"` in `_index.json` to see if the comparisons array uses slugs directly or if we extract them from the URL/filenames.
I will search for `"status":` in `_index.json` to see what fields are available in the comparisons array.
I will view the beginning of `standard/data/bess-au.v2026-06-11.json` to see how the title is structured.
I will view the `nav.mjs` template partial to see how navigation links are built.
I will view the `footer.mjs` template partial to see how footer links are formatted.
I will view `standard/templates/partials/i18n.mjs` to check how localized string selections and translations are managed.
I will view the rest of `standard/templates/partials/i18n.mjs` to see the defined translation helper functions.
I will search for `"product": "bess"` in `_index.json` to verify the market names used for the BESS product category.
I will view the area around line 1298 in `_index.json` to see how a BESS comparison is structured.
I will search for `.container` or list styles in `standard/standard.css` to see how sections are laid out.
I will view the first 100 lines of `standard/standard.css` to see the structure of the CSS classes.
I will check if there are any existing CSS styles for related links in `standard.css`.
### RULE

To maximize crawl-depth, topical authority, and geographic relevance (GEO) while keeping page builds fast and self-contained, we use a regional hierarchy to fetch and order related comparisons. The selection is determined by a **Priority Queue (up to 6 slots)**.

#### 1. Region Mapping (GEO Groups)
We define a region lookup map (`REGION_MAP`) that categorizes all countries/markets in [standard/data/_index.json](file:///Users/tun/Projects/asaptic-web/standard/data/_index.json) into distinct geographic cohorts:
*   `na` (North America): `us`, `canada`, `mexico`
*   `latam` (Latin America): `brazil`, `argentina`, `chile`, `colombia`, `bolivia`, `ecuador`, `paraguay`, `uruguay`, `peru`, `suriname`, `guyana`, `dominican-republic`, `costa-rica`, `el-salvador`, `guatemala`, `honduras`, `nicaragua`, `panama`
*   `europe` (Europe): `eu`, `uk`, `turkey`, `armenia`, `georgia`, `azerbaijan`
*   `oceania` (Oceania): `australia`, `new-zealand`
*   `asia-east-se` (East & Southeast Asia): `japan`, `south-korea`, `mongolia`, `indonesia`, `vietnam`, `thailand`, `philippines`, `singapore`, `malaysia`, `brunei`, `laos`, `cambodia`
*   `asia-south-central` (South & Central Asia): `india`, `pakistan`, `bangladesh`, `nepal`, `sri-lanka`, `kazakhstan`, `uzbekistan`, `kyrgyzstan`, `tajikistan`
*   `me` (Middle East): `saudi`, `uae`, `bahrain`, `kuwait`, `qatar`, `oman`, `iraq`, `israel`, `jordan`, `lebanon`
*   `africa` (Africa): `south-africa`, `nigeria`, `egypt`, `kenya`, `algeria`, `zambia`, `zimbabwe`, `mozambique`, `angola`, `benin`, `botswana`, `burkina-faso`, `cameroon`, `congo-brazzaville`, `cote-divoire`, `ethiopia`, `gabon`, `gambia`, `ghana`, `guinea`, `liberia`, `madagascar`, `malawi`, `mali`, `mauritania`, `namibia`, `niger`, `rwanda`, `senegal`, `sierra-leone`, `togo`, `tunisia`, `uganda`

#### 2. Tiered Relatedness Selection
For any comparison page (e.g., product: `bess`, market: `australia`), the up-to-6 related links are selected sequentially using these priority tiers:
1.  **Tier 1 (Cross-Product / Same-Geo)**: Live comparisons for the **same market** but for the **other products** (e.g., `pv-inverter` in `australia` and `ev-charger` in `australia`). This reinforces local market topical authority.
2.  **Tier 2 (Same-Product / Near-Geo)**: Live comparisons for the **same product** in other markets belonging to the **same region** (e.g., `bess` in `new-zealand`).
3.  **Tier 3 (Same-Product / Global)**: Live comparisons for the **same product** in any other region (e.g., `bess` in `eu`, `us`, `uk`, `brazil`, `india`). This ensures a complete list of 6 links for products with sparse regional representation.

***

### CODE

The following pure JS helper functions should be added to [standard/scripts/generate-standard.mjs](file:///Users/tun/Projects/asaptic-web/standard/scripts/generate-standard.mjs). They are self-contained and require no external dependencies.

```javascript
// Region lookup table mapping markets to geographical regions
const REGION_MAP = {
  us: "na", canada: "na", mexico: "na",
  eu: "europe", uk: "europe", turkey: "europe", armenia: "europe", georgia: "europe", azerbaijan: "europe",
  australia: "oceania", "new-zealand": "oceania",
  japan: "asia-east-se", "south-korea": "asia-east-se", mongolia: "asia-east-se",
  indonesia: "asia-east-se", vietnam: "asia-east-se", thailand: "asia-east-se", philippines: "asia-east-se",
  singapore: "asia-east-se", malaysia: "asia-east-se", brunei: "asia-east-se", laos: "asia-east-se", cambodia: "asia-east-se",
  india: "asia-south-central", pakistan: "asia-south-central", bangladesh: "asia-south-central",
  nepal: "asia-south-central", "sri-lanka": "asia-south-central",
  kazakhstan: "asia-south-central", uzbekistan: "asia-south-central", kyrgyzstan: "asia-south-central", tajikistan: "asia-south-central",
  saudi: "me", uae: "me", bahrain: "me", kuwait: "me", qatar: "me", oman: "me", iraq: "me", israel: "me", jordan: "me", lebanon: "me",
  brazil: "latam", argentina: "latam", chile: "latam", colombia: "latam", bolivia: "latam",
  ecuador: "latam", paraguay: "latam", uruguay: "latam", peru: "latam", suriname: "latam", guyana: "latam",
  "dominican-republic": "latam", "costa-rica": "latam", "el-salvador": "latam", guatemala: "latam", honduras: "latam", nicaragua: "latam", panama: "latam",
  "south-africa": "africa", nigeria: "africa", egypt: "africa", kenya: "africa", algeria: "africa",
  zambia: "africa", zimbabwe: "africa", mozambique: "africa", angola: "africa", benin: "africa",
  botswana: "africa", "burkina-faso": "africa", cameroon: "africa", "congo-brazzaville": "africa",
  "cote-divoire": "africa", ethiopia: "africa", gabon: "africa", gambia: "africa", ghana: "africa",
  guinea: "africa", liberia: "africa", madagascar: "africa", malawi: "africa", mali: "africa",
  mauritania: "africa", namibia: "africa", niger: "africa", rwanda: "africa", senegal: "africa",
  "sierra-leone": "africa", togo: "africa", tunisia: "africa", uganda: "africa"
};

/**
 * Computes up to 6 related comparisons using a GEO-aware selection process.
 * 
 * @param {Object} idx - Parsed contents of standard/data/_index.json
 * @param {string} currentSlug - Current page slug (e.g. 'solar-inverter-china-to-australia')
 * @param {string} lang - Active language code ('en', 'zh', 'zht')
 * @returns {Array<{slug: string, url: string, title: string}>} Array of related items
 */
export function getRelatedComparisons(idx, currentSlug, lang = "en") {
  const current = idx.comparisons.find(c => c.url.en.split("/").pop() === currentSlug);
  if (!current) return [];

  const currentProduct = current.product;
  const currentMarket = current.market;
  const currentRegion = REGION_MAP[currentMarket] || "unknown";

  const prodLabel = Object.fromEntries(idx.products.map(p => [p.id, p.label]));
  const mktLabel = Object.fromEntries(idx.markets.map(m => [m.id, m.label]));

  const makeTitle = (c) => {
    const pLabel = prodLabel[c.product]?.[lang] || c.product;
    const mLabel = mktLabel[c.market]?.[lang] || c.market;
    if (lang === "zh") return `${pLabel} — 中国至${mLabel}`;
    if (lang === "zht") return `${pLabel} — 中國至${mLabel}`;
    return `${pLabel} — China to ${mLabel}`;
  };

  const makeUrl = (c) => {
    const pref = lang === "en" ? "/standard" : `/${lang}/standard`;
    return `${pref}/${c.url.en.split("/").pop()}.html`;
  };

  const pool = idx.comparisons.filter(
    c => c.status === "live" && c.url.en.split("/").pop() !== currentSlug
  );

  // Prioritization lists
  const sameMarketOtherProducts = pool.filter(c => c.market === currentMarket && c.product !== currentProduct);
  const sameProductNearRegion = pool.filter(c => c.product === currentProduct && c.market !== currentMarket && (REGION_MAP[c.market] || "unknown") === currentRegion);
  const sameProductOtherRegion = pool.filter(c => c.product === currentProduct && c.market !== currentMarket && (REGION_MAP[c.market] || "unknown") !== currentRegion);

  const results = [];
  const addedSlugs = new Set();

  const addItems = (items) => {
    for (const item of items) {
      if (results.length >= 6) break;
      const slug = item.url.en.split("/").pop();
      if (!addedSlugs.has(slug)) {
        addedSlugs.add(slug);
        results.push({
          slug,
          url: makeUrl(item),
          title: makeTitle(item)
        });
      }
    }
  };

  addItems(sameMarketOtherProducts);
  addItems(sameProductNearRegion);
  addItems(sameProductOtherRegion);

  return results;
}

/**
 * HTML Template renderer for the Related Comparisons section.
 */
function relatedSection({ related, lang }) {
  if (!related || related.length === 0) return "";
  const sectionLabel = lang === "zh" ? "相关对照" : lang === "zht" ? "相關對照" : "RELATED COMPARISONS";
  const sectionTitle = lang === "zh" ? "其他合规对照" : lang === "zht" ? "其他合規對照" : "Related Compliance Matrices";

  return `<section class="standard-section related-comparisons">
      <div class="container">
        <p class="section-label">${esc(sectionLabel)}</p>
        <h2 class="section-title standard-content-heading">${esc(sectionTitle)}</h2>
        <div class="related-grid">
          ${related
            .map(
              (item) => `<a class="related-card" href="${escAttr(item.url)}">
            <span class="related-card__title">${esc(item.title)}</span>
            <span class="related-card__arrow">&rarr;</span>
          </a>`
            )
            .join("\n")}
        </div>
      </div>
    </section>`;
}
```

***

### WIRING

#### 1. In [standard/scripts/generate-standard.mjs](file:///Users/tun/Projects/asaptic-web/standard/scripts/generate-standard.mjs)

Load the global index at the top of the file, around line 15:

```javascript
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DATA_DIR = join(ROOT, "standard/data");
// Insert: Load global index file
const INDEX = readJson(join(DATA_DIR, "_index.json"));
```

Update the [page](file:///Users/tun/Projects/asaptic-web/standard/scripts/generate-standard.mjs#L175-L210) template function (around line 175) to retrieve the related items and inject the HTML snippet right after the FAQ section:

```javascript
function page({ data, rows, faq, lang, locale, htmlLang }) {
  const slug = data.slug;
  const related = getRelatedComparisons(INDEX, slug, lang); // Retrieve computed related list

  return `<!DOCTYPE html>
<html lang="${htmlLang}">
${head({ data, lang, locale, slug, rows, faq })}
<body>
  ${nav({ locale, slug })}

  <main>
    ${hero({ data, rows, lang })}
    ${answerFirst({ data, lang })}
    <section class="standard-section">
      <div class="container">
        <p class="section-label">${esc(label("gapMatrix", lang))}</p>
        <h2 class="section-title standard-content-heading">${esc(label("gapMatrixTitle", lang))}</h2>
        ${comparisonTable({ data, rows, lang })}
      </div>
    </section>
    ${faqSection({ faq, lang })}
    ${relatedSection({ related, lang })} <!-- Injected here -->
    <section class="standard-section">
      <div class="container">
        ${disclaimer({ data, lang })}
      </div>
    </section>
    ${eeat({ data, lang })}
    ${sourceList({ rows, lang })}
  </main>

  ${footer({ lang, locale, slug })}
  <script>
    document.querySelectorAll('.fade-in').forEach((el) => el.classList.add('visible'));
  </script>
</body>
</html>
`;
}
```

#### 2. In [standard/standard.css](file:///Users/tun/Projects/asaptic-web/standard/standard.css)

Append the styling to the bottom of the stylesheet to match the website's visual system:

```css
/* ── Related comparisons grid ──────────────────────────────── */
.related-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-top: 32px;
}

.related-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: rgba(15, 30, 56, 0.4);
  border: 1px solid rgba(26, 56, 92, 0.8);
  border-radius: 6px;
  text-decoration: none;
  transition: all 0.22s ease-in-out;
}

.related-card:hover {
  background: rgba(41, 182, 246, 0.09);
  border-color: var(--accent);
  box-shadow: 0 4px 24px rgba(41, 182, 246, 0.06);
}

.related-card__title {
  font-size: 14px;
  font-weight: 500;
  color: var(--steel);
  line-height: 1.4;
  transition: color 0.22s ease;
}

.related-card:hover .related-card__title {
  color: var(--white);
}

.related-card__arrow {
  color: var(--gray-dim);
  font-size: 18px;
  margin-left: 12px;
  transition: transform 0.22s ease, color 0.22s ease;
}

.related-card:hover .related-card__arrow {
  color: var(--accent);
  transform: translateX(4px);
}
```
AGYEXIT=0
