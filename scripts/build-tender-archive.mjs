#!/usr/bin/env node
/**
 * build-tender-archive.mjs — Asaptic Tender Bulletin issue archive generator.
 *
 * Reads all committed weekly snapshots in tender/archive/data/<YYYY-wNN>.json
 * (same shape as tender/teaser.json) and writes STATIC archive pages:
 *   - /tender/archive/index.html            (+ /zh/ + /zht/)  — list of issues
 *   - /tender/archive/<YYYY-wNN>/index.html (+ /zh/ + /zht/)  — frozen issue page
 *
 * No dependencies. Plain Node (fs/path only).
 *
 * Usage:
 *   node scripts/build-tender-archive.mjs
 *     Discovers every tender/archive/data/*.json snapshot and (re)builds all
 *     archive pages (index + per-issue, ×3 languages: en, zh, zht).
 *
 *   node scripts/build-tender-archive.mjs 2026-w28
 *     Rebuilds only that single issue's per-issue pages (×3 languages) plus
 *     regenerates the archive index (which always reflects every snapshot).
 *
 * Design: follows DESIGN_asaptic_tender_bulletin.md — paper-sheet bulletin,
 * masthead + double rule, gazette leader-dot index, seal-red accents.
 * Reuses the page-scoped CSS approach + tokens from /tender/index.html.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://asaptic.com';
const DATA_DIR = path.join(ROOT, 'tender', 'archive', 'data');

// ---------------------------------------------------------------------------
// Snapshot discovery
// ---------------------------------------------------------------------------

function loadSnapshots(filterKey) {
  const files = fs.readdirSync(DATA_DIR).filter((f) => /^\d{4}-w\d{1,2}\.json$/.test(f));
  const snapshots = files.map((f) => {
    const key = f.replace(/\.json$/, ''); // e.g. "2026-w28"
    const [yearStr, weekStr] = key.split('-w');
    const year = parseInt(yearStr, 10);
    const week = parseInt(weekStr, 10);
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    return { key, year, week, data };
  });
  snapshots.sort((a, b) => (b.year - a.year) || (b.week - a.week)); // newest first
  if (filterKey) {
    return snapshots.filter((s) => s.key === filterKey);
  }
  return snapshots;
}

// ISO week -> Monday date (UTC), matches the logic in tender/index.html
function isoWeekMonday(year, week) {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay() || 7;
  if (dow <= 4) simple.setUTCDate(simple.getUTCDate() - dow + 1);
  else simple.setUTCDate(simple.getUTCDate() + 8 - dow);
  return simple;
}

function fmtMonday(year, week, locale) {
  const d = isoWeekMonday(year, week);
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function fmtMondayShort(year, week, locale) {
  const d = isoWeekMonday(year, week);
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// ---------------------------------------------------------------------------
// Language config
// ---------------------------------------------------------------------------

const LANGS = {
  en: {
    prefix: '',
    htmlLang: 'en',
    locale: 'en-US',
    dirLabel: '',
    eyebrow: 'Asaptic Tender Bulletin',
    archiveTitle: 'Tender Bulletin Archive',
    archiveEyebrow: 'Asaptic Tender Bulletin — Archive',
    archiveIntro:
      'Every past issue of the Asaptic Tender Bulletin, frozen as published — Hong Kong government & public-body tender counts by category, for suppliers tracking the weekly cadence.',
    archiveMetaTitle: 'Tender Bulletin Archive — Past Issues | Asaptic',
    archiveMetaDesc:
      'Browse past issues of the Asaptic Tender Bulletin — Hong Kong government and public-body tender counts by category, week by week.',
    breadcrumbHome: 'Home',
    breadcrumbTender: 'Tender Digest',
    breadcrumbArchive: 'Archive',
    issueListHeading: 'Past issues',
    issueLinkPrefix: 'Issue No.',
    weekOf: 'Week of',
    openTenders: 'open tenders',
    viewIssue: 'View issue →',
    backToArchive: '← Archive index',
    backToSite: '← Asaptic Labs',
    archivedBand: 'ARCHIVED ISSUE — this snapshot is frozen as originally published.',
    viewCurrent: 'View the current bulletin →',
    indexHeading: 'Index — open tenders by category',
    statTotal: 'Total open tenders',
    statGov: 'Government departments',
    statPub: 'Public bodies & institutions',
    closesFrom: 'closes from',
    countOnlyNote: 'Category counts as published in this issue.',
    footerNote:
      'Listings are summarized from publicly available Hong Kong government and public-body tender sources. Asaptic is not the procuring body for any tender referenced here and is not affiliated with the Government of the Hong Kong Special Administrative Region.',
    ctaText: 'Register free to read the full bulletin →',
    ctaHref: 'https://portal.asaptic.com/register.html?src=asaptic_tender_archive',
    issueTitleFor: (issueNo) => `Hong Kong Tender Weekly Digest — Issue No. ${issueNo}`,
  },
  zh: {
    prefix: 'zh',
    htmlLang: 'zh-CN',
    locale: 'zh-CN',
    eyebrow: 'Asaptic 招标周报',
    archiveTitle: '招标周报存档',
    archiveEyebrow: 'Asaptic 招标周报 — 存档',
    archiveIntro:
      'Asaptic 招标周报的历史期刊存档，按发布时原样保留——香港政府部门及公营机构招标数量按类别统计，方便供应商追踪每周节奏。',
    archiveMetaTitle: '招标周报存档 — 历史期刊 | Asaptic',
    archiveMetaDesc: '浏览 Asaptic 招标周报历史期刊——香港政府部门与公营机构招标数量按类别、按周统计。',
    breadcrumbHome: '首页',
    breadcrumbTender: '招标简报',
    breadcrumbArchive: '存档',
    issueListHeading: '历史期刊',
    issueLinkPrefix: '第',
    weekOf: '当周始于',
    openTenders: '项开放招标',
    viewIssue: '查看本期 →',
    backToArchive: '← 存档目录',
    backToSite: '← Asaptic Labs',
    archivedBand: '历史期刊 — 本快照按原始发布内容冻结保留。',
    viewCurrent: '查看最新一期 →',
    indexHeading: '目录 — 按类别统计的开放招标',
    statTotal: '本期开放招标总数',
    statGov: '政府部门',
    statPub: '公营机构',
    closesFrom: '最快截止',
    countOnlyNote: '类别数量为本期发布时的统计。',
    footerNote:
      '以上信息摘要自公开的香港政府及公营机构招标来源。Asaptic 并非本页所述任何招标的招标机构，亦与香港特别行政区政府无任何关联。',
    ctaText: '免费注册查看完整清单 →',
    ctaHref: 'https://portal.asaptic.com/register.html?src=asaptic_tender_archive',
    issueTitleFor: (issueNo) => `香港招标每周简报 — 第 ${issueNo} 期`,
    issueSuffix: '期', // e.g. 第 28 期
  },
  zht: {
    prefix: 'zht',
    htmlLang: 'zh-TW',
    locale: 'zh-HK',
    eyebrow: 'Asaptic 招標週報',
    archiveTitle: '招標週報存檔',
    archiveEyebrow: 'Asaptic 招標週報 — 存檔',
    archiveIntro:
      'Asaptic 招標週報的歷史期刊存檔，按發佈時原樣保留——香港政府部門及公營機構招標數量按類別統計，方便供應商追蹤每週節奏。',
    archiveMetaTitle: '招標週報存檔 — 歷史期刊 | Asaptic',
    archiveMetaDesc: '瀏覽 Asaptic 招標週報歷史期刊——香港政府部門與公營機構招標數量按類別、按週統計。',
    breadcrumbHome: '首頁',
    breadcrumbTender: '招標簡報',
    breadcrumbArchive: '存檔',
    issueListHeading: '歷史期刊',
    issueLinkPrefix: '第',
    weekOf: '當週始於',
    openTenders: '項開放招標',
    viewIssue: '查看本期 →',
    backToArchive: '← 存檔目錄',
    backToSite: '← Asaptic Labs',
    archivedBand: '歷史期刊 — 本快照按原始發佈內容凍結保留。',
    viewCurrent: '查看最新一期 →',
    indexHeading: '目錄 — 按類別統計的開放招標',
    statTotal: '本期開放招標總數',
    statGov: '政府部門',
    statPub: '公營機構',
    closesFrom: '最快截止',
    countOnlyNote: '類別數量為本期發佈時的統計。',
    footerNote:
      '以上資訊摘要自公開的香港政府及公營機構招標來源。Asaptic 並非本頁所述任何招標的招標機構，亦與香港特別行政區政府無任何關聯。',
    ctaText: '免費登記查看完整清單 →',
    ctaHref: 'https://portal.asaptic.com/register.html?src=asaptic_tender_archive',
    issueTitleFor: (issueNo) => `香港招標每週簡報 — 第 ${issueNo} 期`,
    issueSuffix: '期',
  },
};

const LANG_KEYS = ['en', 'zh', 'zht'];

function urlFor(langKey, rel) {
  const prefix = LANGS[langKey].prefix;
  return prefix ? `${SITE}/${prefix}${rel}` : `${SITE}${rel}`;
}

function hreflangLinks(rel) {
  return [
    `  <link rel="alternate" hreflang="en" href="${SITE}${rel}" />`,
    `  <link rel="alternate" hreflang="zh-Hans" href="${SITE}/zh${rel}" />`,
    `  <link rel="alternate" hreflang="zh-Hant" href="${SITE}/zht${rel}" />`,
    `  <link rel="alternate" hreflang="x-default" href="${SITE}${rel}" />`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Shared page-scoped CSS (bulletin paper-sheet system — matches /tender/index.html)
// ---------------------------------------------------------------------------

const BULLETIN_CSS = `
    .tw-frame {
      --tw-paper: #F6F3EC;
      --tw-ink: #191B1E;
      --tw-seal: #BE3A2B;
      --tw-stone: #6E7378;
      --tw-line: #D8D2C4;
      --tw-serif: "Source Serif 4", "Songti SC", "Songti TC", "Noto Serif CJK SC", serif;
      --tw-body: Inter, "PingFang SC", "PingFang TC", system-ui, -apple-system, sans-serif;
      --tw-mono: "JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;

      max-width: 1000px;
      margin: 0 auto;
      padding: 72px 24px 96px;
      font-family: var(--tw-body);
    }

    .tw-back {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: var(--tw-mono);
      font-size: 12px;
      letter-spacing: 0.08em;
      color: var(--gray);
      text-decoration: none;
      margin-bottom: 32px;
      transition: color 0.2s;
    }
    .tw-back:hover { color: var(--tw-paper); }
    .tw-back:focus-visible {
      outline: 2px solid var(--tw-paper);
      outline-offset: 3px;
      border-radius: 2px;
    }
    .tw-back + .tw-back { margin-left: 16px; }

    .tw-sheet {
      background: var(--tw-paper);
      color: var(--tw-ink);
      border-radius: 2px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.35), 0 2px 0 rgba(0, 0, 0, 0.08);
      padding: 48px 44px 40px;
      opacity: 1;
    }

    @media (prefers-reduced-motion: no-preference) {
      .tw-sheet {
        opacity: 0;
        transform: translateY(8px);
        animation: tw-sheet-in 250ms ease-out forwards;
      }
    }
    @keyframes tw-sheet-in {
      to { opacity: 1; transform: translateY(0); }
    }

    .tw-masthead-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .tw-eyebrow {
      display: block;
      font-family: var(--tw-mono);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: var(--tw-stone);
    }

    /* Quiet language switcher (replaces the site-wide blue pill on these pages) */
    .tw-langs {
      display: flex;
      align-items: baseline;
      gap: 8px;
      font-family: var(--tw-mono);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .tw-langs a {
      color: var(--tw-stone);
      text-decoration: none;
      padding-bottom: 2px;
      transition: color 0.2s;
    }
    .tw-langs a:hover { color: var(--tw-ink); }
    .tw-langs a[aria-current="page"] {
      color: var(--tw-ink);
      text-decoration: underline;
      text-underline-offset: 3px;
      text-decoration-color: var(--tw-seal);
      text-decoration-thickness: 2px;
    }
    .tw-langs a:focus-visible {
      outline: 2px solid var(--tw-ink);
      outline-offset: 2px;
      border-radius: 2px;
    }
    .tw-langs .tw-lang-sep { color: var(--tw-line); }
    .tw-rule { margin: 12px 0 16px; }
    .tw-rule .tw-rule-thin { height: 1px; background: var(--tw-ink); }
    .tw-rule .tw-rule-thick { height: 3px; background: var(--tw-seal); margin-top: 2px; }

    .tw-issue-line {
      font-family: var(--tw-mono);
      font-size: 13px;
      letter-spacing: 0.02em;
      color: var(--tw-stone);
      font-variant-numeric: tabular-nums;
      margin-bottom: 8px;
    }
    .tw-issue-line strong { color: var(--tw-ink); font-weight: 700; }

    .tw-title {
      font-family: var(--tw-serif);
      font-size: clamp(28px, 4vw, 40px);
      font-weight: 600;
      line-height: 1.2;
      margin: 4px 0 18px;
    }

    .tw-intro {
      font-size: 15px;
      color: var(--tw-stone);
      line-height: 1.8;
      max-width: 640px;
      margin-bottom: 36px;
    }

    /* Archived-issue band */
    .tw-archived-band {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      justify-content: space-between;
      background: rgba(190, 58, 43, 0.08);
      border: 1px solid rgba(190, 58, 43, 0.3);
      border-radius: 2px;
      padding: 12px 18px;
      margin-bottom: 32px;
      font-size: 13px;
      color: var(--tw-ink);
    }
    .tw-archived-band a {
      font-weight: 600;
      color: var(--tw-seal);
      text-decoration: none;
      white-space: nowrap;
    }
    .tw-archived-band a:hover { text-decoration: underline; }

    .tw-stats {
      display: flex;
      flex-wrap: wrap;
      gap: 32px;
      padding: 20px 0 28px;
      border-top: 1px solid var(--tw-line);
      border-bottom: 1px solid var(--tw-line);
      margin-bottom: 36px;
      align-items: flex-end;
      justify-content: space-between;
    }
    .tw-stats-nums { display: flex; flex-wrap: wrap; gap: 36px; }
    .tw-stat-num {
      font-family: var(--tw-mono);
      font-size: 30px;
      font-weight: 700;
      color: var(--tw-ink);
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .tw-stat-label {
      font-size: 11px;
      letter-spacing: 0.04em;
      color: var(--tw-stone);
      margin-top: 6px;
    }
    .tw-stats-updated {
      font-family: var(--tw-mono);
      font-size: 11px;
      color: var(--tw-stone);
      letter-spacing: 0.03em;
    }

    .tw-index-heading {
      font-family: var(--tw-mono);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--tw-stone);
      margin-bottom: 14px;
    }
    .tw-index { margin-bottom: 40px; }
    .tw-index-row {
      display: flex;
      align-items: baseline;
      gap: 10px;
      padding: 11px 0;
      border-bottom: 1px solid var(--tw-line);
      opacity: 1;
    }
    @media (prefers-reduced-motion: no-preference) {
      .tw-index-row {
        opacity: 0;
        animation: tw-row-in 320ms ease-out forwards;
      }
      .tw-index-row:nth-child(1)  { animation-delay: 0ms; }
      .tw-index-row:nth-child(2)  { animation-delay: 30ms; }
      .tw-index-row:nth-child(3)  { animation-delay: 60ms; }
      .tw-index-row:nth-child(4)  { animation-delay: 90ms; }
      .tw-index-row:nth-child(5)  { animation-delay: 120ms; }
      .tw-index-row:nth-child(6)  { animation-delay: 150ms; }
      .tw-index-row:nth-child(7)  { animation-delay: 180ms; }
      .tw-index-row:nth-child(8)  { animation-delay: 210ms; }
      .tw-index-row:nth-child(9)  { animation-delay: 240ms; }
      .tw-index-row:nth-child(10) { animation-delay: 270ms; }
      .tw-index-row:nth-child(11) { animation-delay: 300ms; }
      .tw-index-row:nth-child(12) { animation-delay: 330ms; }
      .tw-index-row:nth-child(13) { animation-delay: 360ms; }
      .tw-index-row:nth-child(14) { animation-delay: 390ms; }
      .tw-index-row:nth-child(15) { animation-delay: 420ms; }
    }
    @keyframes tw-row-in { to { opacity: 1; } }
    .tw-index-row:last-child { border-bottom: none; }

    .tw-cat-name {
      flex: 0 1 auto;
      font-size: 14.5px;
      color: var(--tw-ink);
      white-space: nowrap;
    }
    .tw-dots {
      flex: 1 1 auto;
      overflow: hidden;
      white-space: nowrap;
      min-width: 24px;
      font-size: 14.5px;
      color: var(--tw-line);
    }
    .tw-dots::after {
      content: " . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . ";
    }
    .tw-count {
      flex: 0 0 auto;
      font-family: var(--tw-mono);
      font-size: 14px;
      font-weight: 700;
      color: var(--tw-ink);
      font-variant-numeric: tabular-nums;
      text-align: right;
      min-width: 22px;
    }
    .tw-closing {
      flex: 0 0 auto;
      font-family: var(--tw-mono);
      font-size: 11.5px;
      color: var(--tw-stone);
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* Issue-list rows (archive index) */
    .tw-issue-list { margin-bottom: 8px; }
    .tw-issue-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px 16px;
      padding: 18px 0;
      border-bottom: 1px solid var(--tw-line);
    }
    .tw-issue-row:last-child { border-bottom: none; }
    .tw-issue-row-main { flex: 1 1 auto; min-width: 220px; }
    .tw-issue-no {
      font-family: var(--tw-mono);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: var(--tw-seal);
      border-left: 3px solid var(--tw-seal);
      padding-left: 8px;
      margin-right: 8px;
    }
    .tw-issue-week {
      font-family: var(--tw-serif);
      font-size: 17px;
      color: var(--tw-ink);
    }
    .tw-issue-meta {
      font-family: var(--tw-mono);
      font-size: 12px;
      color: var(--tw-stone);
      font-variant-numeric: tabular-nums;
      margin-top: 3px;
    }
    .tw-issue-link {
      flex: 0 0 auto;
      font-family: var(--tw-body);
      font-size: 13.5px;
      font-weight: 600;
      color: var(--tw-seal);
      text-decoration: none;
      white-space: nowrap;
    }
    .tw-issue-link:hover { text-decoration: underline; }

    .tw-cta {
      display: inline-block;
      background: var(--tw-seal);
      color: var(--tw-paper) !important;
      font-family: var(--tw-body);
      font-weight: 600;
      font-size: 14px;
      padding: 13px 24px;
      border-radius: 4px;
      text-decoration: none;
      white-space: nowrap;
      transition: opacity 0.2s;
    }
    .tw-cta:hover { opacity: 0.88; }
    .tw-cta:focus-visible {
      outline: 2px solid var(--tw-ink);
      outline-offset: 3px;
    }

    .tw-footer-note {
      margin-top: 32px;
      padding-top: 20px;
      border-top: 1px solid var(--tw-line);
      font-size: 11.5px;
      color: var(--tw-stone);
      line-height: 1.7;
    }
    .tw-count-note {
      font-size: 11.5px;
      color: var(--tw-stone);
      margin: -24px 0 36px;
    }

    a.tw-back:focus-visible,
    .tw-sheet a:focus-visible,
    .tw-sheet button:focus-visible {
      outline: 2px solid var(--tw-ink);
      outline-offset: 2px;
      border-radius: 2px;
    }

    @media (max-width: 640px) {
      .tw-frame { padding: 56px 16px 72px; }
      .tw-sheet { padding: 32px 20px 32px; }
      .tw-stats { flex-direction: column; align-items: flex-start; gap: 20px; }
      .tw-index-row { flex-wrap: wrap; row-gap: 4px; }
      .tw-cat-name { flex-basis: 100%; order: 1; }
      .tw-dots { display: none; }
      .tw-count { order: 2; }
      .tw-closing { order: 3; margin-left: auto; }
      .tw-cta { width: 100%; text-align: center; }
      .tw-issue-row { flex-direction: column; align-items: flex-start; }
      .tw-issue-link { width: 100%; }
    }
`;

function navHtml() {
  return `  <nav>
    <div class="container">
      <a href="/" class="nav-logo">ASAPTIC LABS</a>
    </div>
  </nav>`;
}

// Quiet small-caps "EN · 简 · 繁" masthead switcher — matches /tender/index.html.
// relPath is the language-neutral path (no lang prefix), e.g. '/tender/archive/'
// or '/tender/archive/2026-w28/'.
function langSwitcherHtml(langKey, relPath) {
  const labels = { en: 'EN', zh: '简', zht: '繁' };
  const links = LANG_KEYS.map((k) => {
    const prefix = LANGS[k].prefix ? `/${LANGS[k].prefix}` : '';
    const current = k === langKey ? ' aria-current="page"' : '';
    return `<a href="${prefix}${relPath}"${current}>${labels[k]}</a>`;
  });
  return `        <nav class="tw-langs" aria-label="Language">
          ${links.join('\n          <span class="tw-lang-sep">&middot;</span>\n          ')}
        </nav>`;
}

function footerHtml() {
  return `  <footer class="cx-footer" style="border-top:1px solid var(--border); padding:32px 0; text-align:center; font-size:12px; color:var(--gray-dim);">
    <div class="container">
      <p>&copy; 2026 Asaptic Labs</p>
    </div>
  </footer>`;
}

// ---------------------------------------------------------------------------
// Archive INDEX page (list of issues)
// ---------------------------------------------------------------------------

function buildArchiveIndexHtml(langKey, snapshots) {
  const L = LANGS[langKey];
  const rel = '/tender/archive/';
  const canonical = urlFor(langKey, rel);

  const issueRows = snapshots
    .map((s) => {
      const issueNo = s.week;
      const weekLabel = fmtMonday(s.year, s.week, L.locale);
      const total = s.data.total;
      const issuePath = langKey === 'en' ? `/tender/archive/${s.key}/` : `/${L.prefix}/tender/archive/${s.key}/`;
      const issueNoLabel = langKey === 'en' ? `Issue No. ${issueNo}` : `${L.issueLinkPrefix} ${issueNo} ${L.issueSuffix}`;
      return `      <div class="tw-issue-row">
        <div class="tw-issue-row-main">
          <span class="tw-issue-no">${issueNoLabel}</span>
          <span class="tw-issue-week">${L.weekOf} ${weekLabel}</span>
          <div class="tw-issue-meta">${total} ${L.openTenders}</div>
        </div>
        <a href="${issuePath}" class="tw-issue-link">${L.viewIssue}</a>
      </div>`;
    })
    .join('\n');

  const breadcrumbJsonLd = `  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "${L.breadcrumbHome}", "item": "${SITE}/" },
      { "@type": "ListItem", "position": 2, "name": "${L.breadcrumbTender}", "item": "${urlFor(langKey, '/tender/')}" },
      { "@type": "ListItem", "position": 3, "name": "${L.breadcrumbArchive}", "item": "${canonical}" }
    ]
  }
  </script>`;

  const webPageJsonLd = `  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "${L.archiveTitle}",
    "url": "${canonical}",
    "description": "${L.archiveMetaDesc}",
    "inLanguage": "${langKey === 'en' ? 'en' : langKey === 'zh' ? 'zh-Hans' : 'zh-Hant'}"
  }
  </script>`;

  const currentIssuePath = langKey === 'en' ? '/tender/' : `/${L.prefix}/tender/`;

  return `<!DOCTYPE html>
<html lang="${L.htmlLang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${L.archiveMetaTitle}</title>

  <meta name="description" content="${L.archiveMetaDesc}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${canonical}" />
${hreflangLinks('/tender/archive/')}

  <meta property="og:type" content="website" />
  <meta property="og:title" content="${L.archiveMetaTitle}" />
  <meta property="og:description" content="${L.archiveMetaDesc}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:site_name" content="Asaptic" />

${breadcrumbJsonLd}
${webPageJsonLd}

  <link rel="stylesheet" href="/style.css" />
  <style>
${BULLETIN_CSS}
  </style>
</head>
<body>

${navHtml()}

  <main class="tw-frame">
    <a href="/" class="tw-back">${L.backToSite}</a>
    <a href="${currentIssuePath}" class="tw-back">${L.viewCurrent}</a>

    <div class="tw-sheet">
      <div class="tw-masthead-row">
        <span class="tw-eyebrow">${L.archiveEyebrow}</span>
${langSwitcherHtml(langKey, '/tender/archive/')}
      </div>
      <div class="tw-rule">
        <div class="tw-rule-thin"></div>
        <div class="tw-rule-thick"></div>
      </div>

      <h1 class="tw-title">${L.archiveTitle}</h1>
      <p class="tw-intro">${L.archiveIntro}</p>

      <h2 class="tw-index-heading">${L.issueListHeading}</h2>
      <div class="tw-issue-list">
${issueRows}
      </div>

      <a href="${L.ctaHref}" class="tw-cta">${L.ctaText}</a>

      <div class="tw-footer-note">${L.footerNote}</div>
    </div>
  </main>

${footerHtml()}

</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Per-issue FROZEN page
// ---------------------------------------------------------------------------

function buildIssuePageHtml(langKey, snapshot, allSnapshots) {
  const L = LANGS[langKey];
  const issueNo = snapshot.week;
  const weekLabel = fmtMonday(snapshot.year, snapshot.week, L.locale);
  const rel = `/tender/archive/${snapshot.key}/`;
  const canonical = urlFor(langKey, rel);
  const data = snapshot.data;

  const isLatest = allSnapshots[0].key === snapshot.key;
  const currentIssuePath = langKey === 'en' ? '/tender/' : `/${L.prefix}/tender/`;
  const archiveIndexPath = langKey === 'en' ? '/tender/archive/' : `/${L.prefix}/tender/archive/`;

  const issueNoLabel = langKey === 'en' ? `Issue No. ${issueNo}` : `${L.issueLinkPrefix} ${issueNo} ${L.issueSuffix}`;
  const pageTitle = L.issueTitleFor(issueNo);
  const metaDesc =
    langKey === 'en'
      ? `Archived Asaptic Tender Bulletin, Issue No. ${issueNo} (week of ${weekLabel}) — ${data.total} open Hong Kong government & public-body tenders by category.`
      : langKey === 'zh'
      ? `Asaptic 招标周报存档，第 ${issueNo} 期（当周始于 ${weekLabel}）——共 ${data.total} 项香港政府及公营机构开放招标，按类别统计。`
      : `Asaptic 招標週報存檔，第 ${issueNo} 期（當週始於 ${weekLabel}）——共 ${data.total} 項香港政府及公營機構開放招標，按類別統計。`;

  const hasClosingDates = data.categories.some((c) => c.soonest_closing);

  const indexRows = data.categories
    .map((cat) => {
      const catName = langKey === 'en' ? cat.name_en : langKey === 'zh' ? cat.name_zh : cat.name_zht || cat.name_zh;
      let closingHtml = '';
      if (cat.soonest_closing) {
        const d = new Date(cat.soonest_closing + 'T00:00:00Z');
        const dateLabel = d.toLocaleDateString(L.locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
        closingHtml = `<span class="tw-closing">${L.closesFrom} ${dateLabel}</span>`;
      }
      return `        <div class="tw-index-row">
          <span class="tw-cat-name">${catName}</span>
          <span class="tw-dots"></span>
          <span class="tw-count">${cat.count}</span>
          ${closingHtml}
        </div>`;
    })
    .join('\n');

  const generatedDate = new Date(data.generated);
  const updatedLabel = generatedDate.toLocaleDateString(L.locale, { year: 'numeric', month: 'short', day: 'numeric' });

  const breadcrumbJsonLd = `  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "${L.breadcrumbHome}", "item": "${SITE}/" },
      { "@type": "ListItem", "position": 2, "name": "${L.breadcrumbTender}", "item": "${urlFor(langKey, '/tender/')}" },
      { "@type": "ListItem", "position": 3, "name": "${L.breadcrumbArchive}", "item": "${urlFor(langKey, '/tender/archive/')}" },
      { "@type": "ListItem", "position": 4, "name": "${issueNoLabel}", "item": "${canonical}" }
    ]
  }
  </script>`;

  const webPageJsonLd = `  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "${pageTitle}",
    "url": "${canonical}",
    "description": "${metaDesc}",
    "inLanguage": "${langKey === 'en' ? 'en' : langKey === 'zh' ? 'zh-Hans' : 'zh-Hant'}",
    "isPartOf": { "@type": "WebPage", "url": "${urlFor(langKey, '/tender/archive/')}" }
  }
  </script>`;

  return `<!DOCTYPE html>
<html lang="${L.htmlLang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${pageTitle} | Asaptic</title>

  <meta name="description" content="${metaDesc}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${canonical}" />
${hreflangLinks(rel)}

  <meta property="og:type" content="article" />
  <meta property="og:title" content="${pageTitle} | Asaptic" />
  <meta property="og:description" content="${metaDesc}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:site_name" content="Asaptic" />

${breadcrumbJsonLd}
${webPageJsonLd}

  <link rel="stylesheet" href="/style.css" />
  <style>
${BULLETIN_CSS}
  </style>
</head>
<body>

${navHtml()}

  <main class="tw-frame">
    <a href="/" class="tw-back">${L.backToSite}</a>
    <a href="${archiveIndexPath}" class="tw-back">${L.backToArchive}</a>

    <div class="tw-sheet">
      <div class="tw-masthead-row">
        <span class="tw-eyebrow">${L.eyebrow}</span>
${langSwitcherHtml(langKey, `/tender/archive/${snapshot.key}/`)}
      </div>
      <div class="tw-rule">
        <div class="tw-rule-thin"></div>
        <div class="tw-rule-thick"></div>
      </div>
      <p class="tw-issue-line"><strong>${issueNoLabel}</strong> &middot; ${L.weekOf} <strong>${weekLabel}</strong> &middot; <strong>${data.total}</strong> ${L.openTenders}</p>

      <h1 class="tw-title">${pageTitle}</h1>

      <div class="tw-archived-band">
        <span>${L.archivedBand}</span>
        <a href="${currentIssuePath}">${L.viewCurrent}</a>
      </div>

      <div class="tw-stats">
        <div class="tw-stats-nums">
          <div>
            <div class="tw-stat-num">${data.total}</div>
            <div class="tw-stat-label">${L.statTotal}</div>
          </div>
          <div>
            <div class="tw-stat-num">${data.sources && data.sources.government != null ? data.sources.government : '—'}</div>
            <div class="tw-stat-label">${L.statGov}</div>
          </div>
          <div>
            <div class="tw-stat-num">${data.sources && data.sources.public_bodies != null ? data.sources.public_bodies : '—'}</div>
            <div class="tw-stat-label">${L.statPub}</div>
          </div>
        </div>
        <span class="tw-stats-updated">${updatedLabel}</span>
      </div>

      <h2 class="tw-index-heading">${L.indexHeading}</h2>
      ${!hasClosingDates ? `<p class="tw-count-note">${L.countOnlyNote}</p>` : ''}
      <div class="tw-index">
${indexRows}
      </div>

      <a href="${L.ctaHref}" class="tw-cta">${L.ctaText}</a>

      <div class="tw-footer-note">${L.footerNote}</div>
    </div>
  </main>

${footerHtml()}

</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------

function writeFile(relDir, filename, content) {
  const dir = path.join(ROOT, relDir);
  fs.mkdirSync(dir, { recursive: true });
  const full = path.join(dir, filename);
  fs.writeFileSync(full, content, 'utf8');
  return path.relative(ROOT, full);
}

function main() {
  const filterKey = process.argv[2]; // optional single-issue key, e.g. "2026-w28"
  const allSnapshots = loadSnapshots(); // always full set (index reflects everything)
  if (allSnapshots.length === 0) {
    console.error(`No snapshots found in ${DATA_DIR}`);
    process.exit(1);
  }
  const targetSnapshots = filterKey ? loadSnapshots(filterKey) : allSnapshots;
  if (filterKey && targetSnapshots.length === 0) {
    console.error(`No snapshot matching "${filterKey}" found in ${DATA_DIR}`);
    process.exit(1);
  }

  const written = [];

  // Archive index — always rebuilt for all 3 langs (reflects full snapshot set)
  for (const langKey of LANG_KEYS) {
    const html = buildArchiveIndexHtml(langKey, allSnapshots);
    const dir = langKey === 'en' ? 'tender/archive' : `${langKey}/tender/archive`;
    written.push(writeFile(dir, 'index.html', html));
  }

  // Per-issue frozen pages — either all snapshots or just the filtered one
  for (const snapshot of targetSnapshots) {
    for (const langKey of LANG_KEYS) {
      const html = buildIssuePageHtml(langKey, snapshot, allSnapshots);
      const dir =
        langKey === 'en' ? `tender/archive/${snapshot.key}` : `${langKey}/tender/archive/${snapshot.key}`;
      written.push(writeFile(dir, 'index.html', html));
    }
  }

  console.log(`Built ${written.length} archive page(s):`);
  for (const f of written) console.log(`  ${f}`);
}

main();
