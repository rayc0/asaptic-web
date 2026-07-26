#!/usr/bin/env node
/**
 * bake-tender-rows.mjs — render the per-tender row cards STATICALLY into
 * the tender digest pages (EN /tender/, 简 /zh/tender/, 繁 /zht/tender/)
 * from tender/rows.json, so a cold fetch (crawler, link-unfurl, no-JS)
 * sees real tenders, not just headline counts.
 *
 * Mirrors bake-teaser.mjs's idiom: idempotent re-bake between HTML comment
 * markers, refuse-and-leave-untouched on bad/stale input, self-check the
 * emitted HTML for forbidden internal-source tokens before committing to
 * the write.
 *
 * rows.json schema (pre-sorted, pre-sanitized by the upstream pipeline —
 * see asaptic-trade-ai docs/WEEKLY_TENDER_SYNC.md "Public per-row listing"):
 *   {
 *     generated, issue_id ("YYYY-Www"), market: "HK", total, withheld,
 *     rows: [{
 *       asaptic_id, market ("HK" | "SG" | ... — 2-letter code, OURS, same as
 *         asaptic_id — defaults to "HK" upstream for legacy records),
 *       category: { name_en, name_zh, name_zht },
 *       summary_zh, summary_en?, summary_zht?,
 *       value_band: "lt_500k" | "500k_2m" | "2m_10m" | "gt_10m" | null,
 *       closing_bucket: "le_2w" | "2_4w" | "gt_4w" | "deadline_passed",
 *       new_this_issue, sort_key
 *     }]
 *   }
 *
 * Market filter (2026-07-17 follow-up — feedback_tender_market_dimension):
 * every card is additionally stamped `data-market="HK"` etc. A THIRD baked
 * chip group (class `tw-market-bar`, buttons `tw-market-btn`) lets visitors
 * filter by market, AND-combined with category + status by the page-shell
 * JS — but ONLY when the baked rows span more than one market; a
 * single-market bake renders no market bar at all, so the page looks
 * exactly as it did before this dimension existed. Rows themselves are
 * NEVER grouped/re-sorted by market — the existing open-then-deadline-passed
 * sort_key ordering is global across all markets (see
 * asaptic-trade-ai docs/WEEKLY_TENDER_SYNC.md's ordering-contract note);
 * grouping by market here would recreate the exact source-block
 * identification signal that ordering exists to avoid.
 * `value_band` / `closing_bucket` are canonical, locale-neutral enum keys —
 * this baker is the ONLY place they get localized into display labels (EN /
 * 简 / 繁), via VALUE_BAND_LABELS / STRINGS[lang].closing below.
 *
 * `closing_bucket: "deadline_passed"` rows (2026-07-17 policy — old/closed
 * tenders stay on the public page instead of disappearing, so visitors see
 * the volume of content) are rendered AFTER all non-deadline-passed rows,
 * under a separate "Past requirements (deadline passed)" subheading — see
 * renderRows(). rows.json is already pre-sorted open-rows-first, so the
 * split point is just the first row with closing_bucket === 'deadline_passed'.
 *
 * Two independent, AND-combined filter dimensions (2026-07-17 follow-up):
 * every card is stamped `data-status="open"` or `data-status="deadline_passed"`
 * (derived from closing_bucket) alongside the pre-existing `data-cat`. A
 * second baked chip group (class `tw-status-bar`, buttons `tw-status-btn`)
 * lets visitors filter to still-open tenders independently of category. The
 * page-shell JS (outside the bake markers, see tender/index.html /
 * zh|zht/tender/index.html) combines both with AND and hides the "Past
 * requirements" subheading whenever no deadline_passed card is visible.
 *
 * Usage: node scripts/bake-tender-rows.mjs <page.html> <rows.json> <lang>
 *   lang is one of: en | zh | zht
 *   (the refresh pipeline calls it once per locale after bake-teaser.mjs)
 */
import { readFileSync, writeFileSync } from 'node:fs';

const MAX_AGE_DAYS = 10;
const ROWS_START = '<!-- TENDER_ROWS_START -->';
const ROWS_END = '<!-- TENDER_ROWS_END -->';
const JSONLD_START = '<!-- ROWS_JSONLD_START -->';
const JSONLD_END = '<!-- ROWS_JSONLD_END -->';

const FORBIDDEN_TOKENS = [
  { name: 'pcms', re: /pcms/i },
  { name: 'TDR- ref', re: /TDR-/ },
  { name: '"ref" key', re: /"ref"\s*:/i },
  { name: '"dept" key', re: /"dept"\s*:/i },
  { name: '\\bref\\b word', re: /\bref\b/i },
  { name: '\\bdept\\b word', re: /\bdept\b/i },
];

// Canonical value_band enum → per-locale display label. Keys must match
// scripts/weekly-tender-sync.mjs's VALUE_BAND_KEYS in asaptic-trade-ai
// exactly (est_wan bands <50万/50–200万/200–1000万/>1000万).
const VALUE_BAND_LABELS = {
  en: { lt_500k: '<HK$0.5M', '500k_2m': 'HK$0.5–2M', '2m_10m': 'HK$2–10M', gt_10m: '>HK$10M' },
  zh: { lt_500k: '<50万', '500k_2m': '50–200万', '2m_10m': '200–1000万', gt_10m: '>1000万' },
  zht: { lt_500k: '<50萬', '500k_2m': '50–200萬', '2m_10m': '200–1000萬', gt_10m: '>1000萬' },
};

// Canonical 13-category taxonomy order, replicated from asaptic-trade-ai's
// src/lib/tender-category.js (TENDER_CATEGORIES) — asaptic-web has no shared
// dependency on that repo, so the order is mirrored here by name_en, which is
// always present on every row.category and stable across locales. Filter
// chips are ordered by this list, not by first-appearance in rows.json.
const CANONICAL_CATEGORY_ORDER_EN = [
  'Medical equipment',
  'Medical services & pharma',
  'IT & software',
  'Networking & security',
  'Food & catering',
  'Facilities & cleaning',
  'Vehicles & logistics',
  'Construction & works',
  'Consultancy & studies',
  'Printing & publishing',
  'Lab & scientific',
  'Office supplies',
  'Other',
];

const VALID_CLOSING_BUCKETS = new Set(['le_2w', '2_4w', 'gt_4w', 'deadline_passed']);
const VALID_VALUE_BANDS = new Set(['lt_500k', '500k_2m', '2m_10m', 'gt_10m']);
const VALID_MARKET_RE = /^[A-Z]{2}$/;

// Known market codes get a proper per-locale name; any other 2-letter
// uppercase code still validates (VALID_MARKET_RE) and just renders as the
// raw code itself, so a brand-new market never blocks a bake.
const MARKET_NAMES = {
  en: { HK: 'Hong Kong', SG: 'Singapore', MO: 'Macau', GB: 'UK', AU: 'Australia', CA: 'Canada', EU: 'EU' },
  zh: { HK: '香港', SG: '新加坡', MO: '澳门', GB: '英国', AU: '澳大利亚', CA: '加拿大', EU: '欧盟' },
  zht: { HK: '香港', SG: '新加坡', MO: '澳門', GB: '英國', AU: '澳大利亞', CA: '加拿大', EU: '歐盟' },
};

function marketName(code, lang) {
  return (MARKET_NAMES[lang] && MARKET_NAMES[lang][code]) || code;
}

const STRINGS = {
  en: {
    closing: { le_2w: '≤2 weeks', '2_4w': '2–4 weeks', gt_4w: '>4 weeks', deadline_passed: 'Deadline passed' },
    valuePrefix: 'rough est. ',
    newBadge: 'NEW',
    cta: 'Request supplier specification pack',
    filterAll: 'All categories',
    fmtUpdated: (d) => 'Updated ' + d.toLocaleDateString('en-HK', { year: 'numeric', month: 'short', day: 'numeric' }),
    lang: 'en',
    listName: "This Week's Public-Sector Tenders (HK · SG · MO · UK · AU)",
    pastHeading: 'Past requirements (deadline passed)',
    statusAll: 'All statuses',
    statusOpen: 'Still open',
    statusPassed: 'Deadline passed',
    marketAll: 'All markets',
  },
  zh: {
    closing: { le_2w: '≤2周', '2_4w': '2–4周', gt_4w: '>4周', deadline_passed: '已过截止' },
    valuePrefix: '粗估 ',
    newBadge: '新',
    cta: '申请供应商规格包',
    filterAll: '全部类别',
    fmtUpdated: (d) => '更新于 ' + d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }),
    lang: 'zh',
    listName: '本周环球公共采购招标',
    pastHeading: '过往需求（已过截止）',
    statusAll: '全部',
    statusOpen: '未截止',
    statusPassed: '已过截止',
    marketAll: '全部市场',
  },
  zht: {
    closing: { le_2w: '≤2週', '2_4w': '2–4週', gt_4w: '>4週', deadline_passed: '已過截止' },
    valuePrefix: '粗估 ',
    newBadge: '新',
    cta: '申請供應商規格包',
    filterAll: '全部類別',
    fmtUpdated: (d) => '更新於 ' + d.toLocaleDateString('zh-HK', { year: 'numeric', month: 'short', day: 'numeric' }),
    lang: 'zht',
    listName: '本週環球公共採購招標',
    pastHeading: '過往需求（已過截止）',
    statusAll: '全部',
    statusOpen: '未截止',
    statusPassed: '已過截止',
    marketAll: '全部市場',
  },
};

function isoWeekMonday(year, week) {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay() || 7;
  if (dow <= 4) simple.setUTCDate(simple.getUTCDate() - dow + 1);
  else simple.setUTCDate(simple.getUTCDate() + 8 - dow);
  return simple;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function categoryName(cat, lang) {
  if (lang === 'zh') return cat.name_zh || cat.name_en;
  if (lang === 'zht') return cat.name_zht || cat.name_zh || cat.name_en;
  return cat.name_en || cat.name_zh;
}

function summaryFor(row, lang) {
  if (lang === 'en') {
    if (row.summary_en) return { text: row.summary_en, lang: null };
    return { text: row.summary_zh, lang: 'zh' };
  }
  if (lang === 'zht') {
    if (row.summary_zht) return { text: row.summary_zht, lang: null };
    return { text: row.summary_zh, lang: 'zh' };
  }
  // zh
  return { text: row.summary_zh, lang: null };
}

/**
 * Derive the coarse two-state STATUS filter dimension from a row's
 * closing_bucket — independent of, and AND-combined with, the category
 * filter dimension by the page-shell JS. 'deadline_passed' rows are
 * 'deadline_passed'; every other (still-open) bucket is 'open'.
 */
function rowStatus(row) {
  return row.closing_bucket === 'deadline_passed' ? 'deadline_passed' : 'open';
}

function renderRowCard(row, lang, S) {
  const catName = categoryName(row.category, lang);
  const status = rowStatus(row);
  const market = row.market || 'HK';
  const summary = summaryFor(row, lang);
  const langAttr = summary.lang ? ` lang="${summary.lang}"` : '';
  const newBadge = row.new_this_issue
    ? `<span class="tw-badge red">${S.newBadge}</span>`
    : '';
  const closingLabel = S.closing[row.closing_bucket] || row.closing_bucket;
  const chips = [];
  const bandLabel = row.value_band ? VALUE_BAND_LABELS[lang][row.value_band] : null;
  if (bandLabel) {
    chips.push(`<span class="tw-badge stone">${escapeHtml(S.valuePrefix + bandLabel)}</span>`);
  }
  chips.push(`<span class="tw-badge amber">${escapeHtml(closingLabel)}</span>`);

  return [
    `<div class="tw-rc" data-cat="${escapeHtml(catName)}" data-status="${status}" data-market="${escapeHtml(market)}">`,
    `  <div class="tw-rc-top">`,
    `    <span class="tw-rc-id">${escapeHtml(row.asaptic_id)}</span>`,
    `    <span class="tw-rc-cat">${escapeHtml(catName)}</span>`,
    `    ${newBadge}`,
    `  </div>`,
    `  <p class="tw-rc-summary"${langAttr}>${escapeHtml(summary.text)}</p>`,
    `  <div class="tw-rc-chips">${chips.join('')}</div>`,
    `  <a href="https://portal.asaptic.com/register.html?src=tender_public&amp;tid=${encodeURIComponent(row.asaptic_id)}" class="tw-rc-cta">${escapeHtml(S.cta)}</a>`,
    `</div>`,
  ].join('\n');
}

/**
 * Group rows by their category (keyed by name_en, stable across locales),
 * ordered by the CANONICAL_CATEGORY_ORDER_EN taxonomy order rather than
 * first-appearance in rows.json. Any category not found in the canonical
 * order (should not happen against the real taxonomy) is appended at the
 * end, sorted by name_en, so nothing is silently dropped.
 *
 * @returns {{ name: string, count: number }[]} localized chip entries, plus
 *   a running total that must equal rows.length (checked by the caller).
 */
function categoryChipCounts(rows, lang) {
  const byNameEn = new Map(); // name_en -> { localizedName, count }
  for (const row of rows) {
    const nameEn = row.category.name_en;
    const localizedName = categoryName(row.category, lang);
    const entry = byNameEn.get(nameEn) ?? { localizedName, count: 0 };
    entry.count += 1;
    byNameEn.set(nameEn, entry);
  }
  const ordered = [];
  for (const nameEn of CANONICAL_CATEGORY_ORDER_EN) {
    const entry = byNameEn.get(nameEn);
    if (entry) {
      ordered.push({ name: entry.localizedName, count: entry.count });
      byNameEn.delete(nameEn);
    }
  }
  // Any leftover category not in the canonical taxonomy — append, sorted for
  // determinism, rather than silently dropping it.
  const leftovers = [...byNameEn.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  for (const [, entry] of leftovers) {
    ordered.push({ name: entry.localizedName, count: entry.count });
  }
  return ordered;
}

function renderFilterBar(rows, lang, S) {
  const chipCounts = categoryChipCounts(rows, lang);
  const btns = [
    `<button type="button" class="tw-filter-btn is-active" data-filter="__all__" aria-pressed="true">${escapeHtml(S.filterAll)} (${rows.length})</button>`,
  ];
  for (const { name, count } of chipCounts) {
    btns.push(
      `<button type="button" class="tw-filter-btn" data-filter="${escapeHtml(name)}" aria-pressed="false">${escapeHtml(name)} (${count})</button>`,
    );
  }
  // tw-cat-bar is a scoping hook for the page-shell JS (mirrors tw-status-bar
  // below) — reuses tw-filter-bar for layout/spacing, distinguishable from
  // the status bar for is-active bookkeeping.
  return `<div class="tw-filter-bar tw-cat-bar" role="group">\n${btns.join('\n')}\n</div>`;
}

/**
 * Second, independent filter dimension (2026-07-17 follow-up): still-open
 * vs deadline-passed, AND-combined with the category filter by the
 * page-shell JS. Counts are computed fresh from `rows` on every bake so they
 * never drift from the category chip counts / masthead totals.
 */
function renderStatusFilterBar(rows, lang, S) {
  const openCount = rows.filter((r) => rowStatus(r) === 'open').length;
  const passedCount = rows.filter((r) => rowStatus(r) === 'deadline_passed').length;
  const btns = [
    `<button type="button" class="tw-filter-btn tw-status-btn is-active" data-status="__all__" aria-pressed="true">${escapeHtml(S.statusAll)} (${rows.length})</button>`,
    `<button type="button" class="tw-filter-btn tw-status-btn" data-status="open" aria-pressed="false">${escapeHtml(S.statusOpen)} (${openCount})</button>`,
    `<button type="button" class="tw-filter-btn tw-status-btn" data-status="deadline_passed" aria-pressed="false">${escapeHtml(S.statusPassed)} (${passedCount})</button>`,
  ];
  return `<div class="tw-filter-bar tw-status-bar" role="group">\n${btns.join('\n')}\n</div>`;
}

/**
 * Third, independent filter dimension (2026-07-17 follow-up): market,
 * AND-combined with category + status by the page-shell JS. ONLY rendered
 * (returns '') when the baked rows span a single market — a single-market
 * bake must look exactly like it did before this dimension existed. Counts
 * are computed fresh from `rows` on every bake, same as the status bar.
 */
function renderMarketFilterBar(rows, lang, S) {
  const counts = new Map(); // code -> count, insertion order = first-appearance
  for (const row of rows) {
    const code = row.market || 'HK';
    counts.set(code, (counts.get(code) || 0) + 1);
  }
  if (counts.size <= 1) return '';

  const codes = [...counts.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const btns = [
    `<button type="button" class="tw-filter-btn tw-market-btn is-active" data-market="__all__" aria-pressed="true">${escapeHtml(S.marketAll)} (${rows.length})</button>`,
  ];
  for (const code of codes) {
    btns.push(
      `<button type="button" class="tw-filter-btn tw-market-btn" data-market="${escapeHtml(code)}" aria-pressed="false">${escapeHtml(marketName(code, lang))} (${counts.get(code)})</button>`,
    );
  }
  return `<div class="tw-filter-bar tw-market-bar" role="group">\n${btns.join('\n')}\n</div>`;
}

function renderRows(data, lang) {
  const S = STRINGS[lang];
  // rows.json is already pre-sorted by sort_key WITHIN two groups — all
  // non-deadline-passed rows first, then all deadline_passed rows (see
  // asaptic-trade-ai's buildPublicRows() ordering) — no re-sort here.
  const rows = data.rows || [];
  const openRows = rows.filter((r) => r.closing_bucket !== 'deadline_passed');
  const closedRows = rows.filter((r) => r.closing_bucket === 'deadline_passed');

  // Filter bar / category chip counts span ALL rows (open + deadline-passed)
  // so the counts reflect the full volume of content on the page, not just
  // the open subset. Same for the second (status) filter dimension.
  const filterBar = renderFilterBar(rows, lang, S);
  const statusBar = renderStatusFilterBar(rows, lang, S);
  const marketBar = renderMarketFilterBar(rows, lang, S);
  const openCards = openRows.map((r) => renderRowCard(r, lang, S)).join('\n');

  let pastSection = '';
  if (closedRows.length > 0) {
    const closedCards = closedRows.map((r) => renderRowCard(r, lang, S)).join('\n');
    pastSection =
      `\n<h2 class="tw-index-heading tw-index-heading-past">${escapeHtml(S.pastHeading)}</h2>\n` +
      `<div class="tw-rows tw-rows-past">\n${closedCards}\n</div>`;
  }

  return (
    `${ROWS_START}\n<div class="tw-rows">\n${filterBar}\n${statusBar}\n${marketBar}\n${openCards}\n</div>` +
    `${pastSection}\n${ROWS_END}`
  );
}

function renderJsonLd(data, lang) {
  const S = STRINGS[lang];
  const rows = data.rows || [];
  const itemListElement = rows.map((r, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    item: {
      '@type': 'Thing',
      identifier: r.asaptic_id,
      category: categoryName(r.category, lang),
      description: summaryFor(r, lang).text,
    },
  }));
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: S.listName,
    itemListElement,
  };
  return `${JSONLD_START}\n<script type="application/ld+json">\n${JSON.stringify(ld, null, 2)}\n</script>\n${JSONLD_END}`;
}

function replaceBetweenMarkers(html, startMarker, endMarker, replacement, label) {
  const startIdx = html.indexOf(startMarker);
  const endIdx = html.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(`markers for ${label} not found or malformed in page`);
  }
  return html.slice(0, startIdx) + replacement + html.slice(endIdx + endMarker.length);
}

function setTextById(html, id, val) {
  const re = new RegExp('(id="' + id + '"[^>]*>)[^<]*(<)');
  return html.replace(re, `$1${val}$2`);
}

/**
 * Validate the parsed rows.json payload before touching any HTML. Returns
 * an array of error strings (empty = valid). Every check here is a
 * fail-without-writing guard — bad input must never reach replaceBetweenMarkers.
 */
function validateRows(data) {
  const errors = [];
  const rows = Array.isArray(data.rows) ? data.rows : [];

  if (typeof data.total === 'number' && rows.length !== data.total) {
    errors.push(`rows.length (${rows.length}) !== total (${data.total})`);
  }

  const seenIds = new Set();
  let prevSortKey;
  let sortKeyHasPrev = false;
  let inPassedGroup = false;

  rows.forEach((row, i) => {
    const where = `rows[${i}] (asaptic_id=${row?.asaptic_id ?? '(missing)'})`;

    // Rows arrive as TWO contiguous groups (2026-07-17 policy): open rows
    // first, then deadline_passed. sort_key ascending is enforced WITHIN
    // each group; the sequence resets at the group boundary.
    const isPassed = row?.closing_bucket === 'deadline_passed';
    if (isPassed && !inPassedGroup) {
      inPassedGroup = true;
      sortKeyHasPrev = false;
    } else if (!isPassed && inPassedGroup) {
      errors.push(`${where}: open row after the deadline_passed group (rows must be grouped open-first)`);
    }

    if (!row?.asaptic_id) {
      errors.push(`${where}: missing asaptic_id`);
    } else if (seenIds.has(row.asaptic_id)) {
      errors.push(`${where}: duplicate asaptic_id "${row.asaptic_id}"`);
    } else {
      seenIds.add(row.asaptic_id);
    }

    if (!VALID_CLOSING_BUCKETS.has(row?.closing_bucket)) {
      errors.push(`${where}: closing_bucket "${row?.closing_bucket}" not in {le_2w, 2_4w, gt_4w, deadline_passed}`);
    }

    if (row?.value_band !== null && row?.value_band !== undefined && !VALID_VALUE_BANDS.has(row.value_band)) {
      errors.push(`${where}: value_band "${row.value_band}" not in {lt_500k, 500k_2m, 2m_10m, gt_10m, null}`);
    }

    const cat = row?.category;
    if (!cat || !cat.name_en || !cat.name_zh || !cat.name_zht) {
      errors.push(`${where}: category missing name_en/name_zh/name_zht`);
    }

    if (!row?.summary_zh) {
      errors.push(`${where}: missing summary_zh`);
    }

    if (row?.market !== undefined && row?.market !== null && !VALID_MARKET_RE.test(row.market)) {
      errors.push(`${where}: market "${row.market}" is not a 2-letter uppercase code`);
    }

    if (row?.sort_key === undefined || row?.sort_key === null) {
      errors.push(`${where}: missing sort_key`);
    } else if (sortKeyHasPrev && prevSortKey > row.sort_key) {
      errors.push(`${where}: sort_key out of order (rows must already be sorted ascending by sort_key)`);
    }
    prevSortKey = row?.sort_key;
    sortKeyHasPrev = true;
  });

  return errors;
}

function main() {
  const [page, rowsPath, lang] = process.argv.slice(2);
  if (!page || !rowsPath || !lang) {
    console.error('usage: bake-tender-rows.mjs <page.html> <rows.json> <en|zh|zht>');
    process.exit(1);
  }
  if (!STRINGS[lang]) {
    console.error(`[bake-tender-rows] unknown lang "${lang}" — expected en|zh|zht`);
    process.exit(1);
  }

  // ── Guard: rows.json missing/unreadable ──────────────────────────────
  let raw;
  try {
    raw = readFileSync(rowsPath, 'utf8');
  } catch (e) {
    console.error(`[bake-tender-rows] refuse to bake: cannot read ${rowsPath} (${e.message})`);
    process.exit(1);
  }

  // ── Guard: invalid/empty JSON ─────────────────────────────────────────
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error(`[bake-tender-rows] refuse to bake: ${rowsPath} is not valid JSON (${e.message})`);
    process.exit(1);
  }
  if (!data || !Array.isArray(data.rows) || data.rows.length === 0) {
    console.error(`[bake-tender-rows] refuse to bake: ${rowsPath} has no rows`);
    process.exit(1);
  }

  // ── Guard: stale data ──────────────────────────────────────────────────
  if (!data.generated) {
    console.error(`[bake-tender-rows] refuse to bake: ${rowsPath} missing "generated"`);
    process.exit(1);
  }
  const generatedDate = new Date(data.generated);
  if (Number.isNaN(generatedDate.getTime())) {
    console.error(`[bake-tender-rows] refuse to bake: ${rowsPath} "generated" is not a valid date`);
    process.exit(1);
  }
  const ageDays = (Date.now() - generatedDate.getTime()) / 86400000;
  if (ageDays > MAX_AGE_DAYS) {
    console.error(`[bake-tender-rows] refuse to bake: ${rowsPath} is ${ageDays.toFixed(1)} days old (max ${MAX_AGE_DAYS})`);
    process.exit(1);
  }

  // ── Guard: row-level input validation (fail without touching HTML) ────
  const validationErrors = validateRows(data);
  if (validationErrors.length > 0) {
    console.error(`[bake-tender-rows] refuse to bake: ${rowsPath} failed validation:`);
    for (const err of validationErrors) console.error(`  - ${err}`);
    process.exit(1);
  }

  const S = STRINGS[lang];
  const original = readFileSync(page, 'utf8');
  let html = original;

  // ── Masthead: issue week, generated date, total, withheld ────────────
  let issueNo = '', weekDate = '';
  if (data.issue_id && /^\d{4}-W\d{1,2}$/.test(data.issue_id)) {
    const [y, w] = data.issue_id.split('-W').map(Number);
    issueNo = String(w);
    weekDate = isoWeekMonday(y, w).toLocaleDateString(
      lang === 'en' ? 'en-HK' : lang === 'zht' ? 'zh-HK' : 'zh-CN',
      { day: 'numeric', month: 'long', year: 'numeric' }
    );
  }
  const total = data.total != null ? String(data.total) : '—';
  const withheld = data.withheld != null ? String(data.withheld) : '—';
  const updated = S.fmtUpdated(generatedDate);

  const masthead = {
    'tw-issue-no': issueNo || '—',
    'tw-week-date': weekDate || '—',
    'tw-issue-total': total,
    'tw-total': total,
    'tw-withheld': withheld,
    'tw-updated': updated,
  };
  for (const [id, val] of Object.entries(masthead)) {
    html = setTextById(html, id, val);
  }

  // ── Row cards + filter bar ────────────────────────────────────────────
  html = replaceBetweenMarkers(html, ROWS_START, ROWS_END, renderRows(data, lang), 'row cards');

  // ── JSON-LD ItemList (asaptic_id + category + localized summary only) ─
  html = replaceBetweenMarkers(html, JSONLD_START, JSONLD_END, renderJsonLd(data, lang), 'JSON-LD');

  // ── Self-check: forbidden internal-source tokens must never leak ─────
  for (const { name, re } of FORBIDDEN_TOKENS) {
    if (re.test(html)) {
      console.error(`[bake-tender-rows] ABORT: forbidden token "${name}" found in emitted HTML for ${page} — reverting, page left untouched`);
      process.exit(1);
    }
  }

  writeFileSync(page, html);
  console.log(`[bake-tender-rows] ${page}: baked ${data.rows.length} rows (issue ${issueNo || '—'}, total ${total}, withheld ${withheld}, lang=${lang})`);
}

main();
