#!/usr/bin/env node
/**
 * build-market-teaser.mjs
 *
 * Reads a market tender registry (MO / GB / AU) and produces a teaser.json
 * in the same schema as tender/teaser.json (the HK bulletin), for use by
 * tender/<mkt>/index.html.
 *
 * Usage: node scripts/build-market-teaser.mjs <MO|GB|AU|SG>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const REGISTRY_ROOT =
  '/Users/tun/Library/CloudStorage/OneDrive-Personal/0 0 to do/00AIprojects/00Tender/_registry';

const MARKET = (process.argv[2] || '').toUpperCase();
if (!['MO', 'GB', 'AU', 'SG'].includes(MARKET)) {
  console.error('Usage: node scripts/build-market-teaser.mjs <MO|GB|AU|SG>');
  process.exit(1);
}

const MARKET_LC = MARKET.toLowerCase();

// ── Category list (reused from the HK bulletin, same fixed order) ────────
const CATEGORIES = [
  {
    key: 'medical_equipment',
    name_en: 'Medical equipment',
    name_zh: '医疗设备',
    name_zht: '醫療設備',
    en: ['medical equipment', 'medical device', 'x-ray', 'xray', 'mri', 'ct scan', 'ultrasound',
      'surgical', 'ventilator', 'imaging', 'dialysis', 'prosthetic', 'wheelchair', 'hospital bed',
      'defibrillator', 'diagnostic equipment'],
    zh: ['醫療設備', '医疗设备', '醫療儀器', '医疗仪器', '醫療器材', '医疗器材', 'X光', '手術',
      '呼吸機', '呼吸机', '病床', '輪椅', '轮椅', '透析', '洗腎', '洗肾', '假肢'],
  },
  {
    key: 'medical_services_pharma',
    name_en: 'Medical services & pharma',
    name_zh: '医疗服务与药品',
    name_zht: '醫療服務與藥品',
    en: ['pharma', 'pharmacy', 'drug', 'medicine', 'clinical', 'nursing', 'healthcare service',
      'health service', 'ambulance', 'dental', 'vaccine', 'laboratory service', 'pathology',
      'diagnostic service', 'sight testing', 'dispensing'],
    zh: ['藥物', '药物', '藥品', '药品', '醫療服務', '医疗服务', '診所', '诊所', '護理', '护理',
      '疫苗', '化驗', '化验', '衛生服務', '卫生服务', '救護', '救护', '藥劑', '药剂'],
  },
  {
    key: 'it_software',
    name_en: 'IT & software',
    name_zh: 'IT与软件',
    name_zht: 'IT與軟件',
    en: ['software', ' it ', 'information technology', 'i.t.', 'system', 'application',
      'database', 'cloud', 'cyber', 'digital', 'website', 'app development', 'licence',
      'license', 'erp', 'crm', 'data platform'],
    zh: ['資訊科技', '资讯科技', '軟件', '软件', '系統', '系统', '資訊系統', '资讯系统', '電腦',
      '电脑', '数字化', '數字化', '信息系統', '信息系统'],
  },
  {
    key: 'networking_security',
    name_en: 'Networking & security',
    name_zh: '网络与安全',
    name_zht: '網絡與安全',
    en: ['network', 'security service', 'cctv', 'surveillance', 'firewall', 'server room',
      'telecommunications', 'wifi', 'wi-fi', 'access control'],
    zh: ['網絡', '网络', '保安', '監控', '监控', '安全系統', '安全系统', '電訊', '电讯',
      '通訊系統', '通讯系统'],
  },
  {
    key: 'food_catering',
    name_en: 'Food & catering',
    name_zh: '食品与餐饮',
    name_zht: '食品與餐飲',
    en: ['food', 'catering', 'meal', 'kitchen', 'canteen', 'restaurant'],
    zh: ['餐飲', '餐饮', '食品', '膳食', '廚房', '厨房', '飯堂', '饭堂'],
  },
  {
    key: 'facilities_cleaning',
    name_en: 'Facilities & cleaning',
    name_zh: '设施与保洁',
    name_zht: '設施與清潔',
    en: ['cleaning', 'janitorial', 'facilities management', 'maintenance service', 'pest control',
      'security guard', 'landscaping', 'gardening', 'grounds maintenance'],
    zh: ['清潔', '清洁', '保潔', '保洁', '物業管理', '物业管理', '保養', '保养', '園藝', '园艺',
      '綠化', '绿化', '防治蟲鼠', '虫鼠'],
  },
  {
    key: 'vehicles_logistics',
    name_en: 'Vehicles & logistics',
    name_zh: '车辆与物流',
    name_zht: '車輛與物流',
    en: ['vehicle', 'truck', 'bus', 'transport', 'logistics', 'fleet', 'motor car', 'shipping',
      'freight', 'car park'],
    zh: ['車輛', '车辆', '物流', '運輸', '运输', '汽車', '汽车', '巴士', '貨車', '货车'],
  },
  {
    key: 'construction_works',
    name_en: 'Construction & works',
    name_zh: '工程与建造',
    name_zht: '工程與建造',
    en: ['construction', 'building works', 'renovation', 'civil works', 'infrastructure',
      'road works', 'repair works', 'engineering works', 'refurbishment', 'air conditioning',
      'installation of'],
    zh: ['工程', '建築', '建筑', '建造', '翻新', '維修工程', '维修工程', '基建', '土建',
      '優化', '优化', '污水處理', '污水处理'],
  },
  {
    key: 'consultancy_studies',
    name_en: 'Consultancy & studies',
    name_zh: '顾问与研究',
    name_zht: '顧問與研究',
    en: ['consultancy', 'consulting', 'feasibility study', 'advisory', 'research service',
      'review of', 'study on', 'assessment service'],
    zh: ['顧問', '顾问', '諮詢', '咨询', '研究', '評估', '评估'],
  },
  {
    key: 'printing_publishing',
    name_en: 'Printing & publishing',
    name_zh: '印刷与出版',
    name_zht: '印刷與出版',
    en: ['printing', 'publishing', 'print service', 'stationery'],
    zh: ['印刷', '出版', '文具'],
  },
];

function categorize(title) {
  const t = (title || '').toLowerCase();
  for (const cat of CATEGORIES) {
    for (const kw of cat.en) {
      if (t.includes(kw)) return cat.key;
    }
    for (const kw of cat.zh) {
      if (title && title.includes(kw)) return cat.key;
    }
  }
  return 'other';
}

// ── Org-class → government / public_bodies classification ────────────────
// GB: org values are already sanitized org-class strings.
// AU: org is either 'a federal government department' or null/unset.
// MO: org holds actual department names (not a judged org-class) — per spec,
//     fall back to counting everything as "government".
function classifyOrgGB(org) {
  if (!org) return 'government';
  const o = org.toLowerCase();
  if (o.includes('central government department')) return 'government';
  // NHS/health bodies, councils, universities, colleges, police/fire authorities,
  // and generic "UK contracting authority" all count as public bodies & institutions.
  return 'public_bodies';
}

function classifyOrgAU(org) {
  if (!org) return 'government';
  const o = org.toLowerCase();
  if (o.includes('federal government department') || o.includes('government department')) {
    return 'government';
  }
  return 'public_bodies';
}

// SG: org holds actual department/agency names (like MO), not a judged
// org-class string. Heuristic split: Ministries / MINDEF / government
// departments → government; statutory boards (HDB, LTA, NEA, PUB, town
// councils, universities, etc.) → public_bodies. Null/unset → government.
function classifyOrgSG(org) {
  if (!org) return 'government';
  const o = org.toLowerCase();
  if (o.includes('ministry') || o.includes('mindef') || o.startsWith('mnd') ||
      o.includes('government department') || o.includes('prime minister') ||
      o.includes("attorney-general") || o.includes('attorney general')) {
    return 'government';
  }
  return 'public_bodies';
}

// ── Load registry ──────────────────────────────────────────────────────────
const registryPath = path.join(REGISTRY_ROOT, MARKET, 'tenders_registry.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

const records = Object.values(registry).filter((r) => r.status === 'open');

const catCounts = {};
for (const cat of CATEGORIES) catCounts[cat.key] = { count: 0, soonest: null };
catCounts.other = { count: 0, soonest: null };

let govCount = 0;
let pubCount = 0;
const hasClosingDates = MARKET !== 'MO';

for (const rec of records) {
  const key = categorize(rec.title);
  catCounts[key].count += 1;

  if (hasClosingDates && rec.closing_iso) {
    if (!catCounts[key].soonest || rec.closing_iso < catCounts[key].soonest) {
      catCounts[key].soonest = rec.closing_iso;
    }
  }

  let cls;
  if (MARKET === 'GB') cls = classifyOrgGB(rec.org);
  else if (MARKET === 'AU') cls = classifyOrgAU(rec.org);
  else if (MARKET === 'SG') cls = classifyOrgSG(rec.org);
  else cls = 'government'; // MO — no judged org-class available, fallback per spec

  if (cls === 'government') govCount += 1;
  else pubCount += 1;
}

const categories = CATEGORIES
  .concat([{ key: 'other', name_en: 'Other', name_zh: '其他', name_zht: '其他' }])
  .map((cat) => {
    const c = catCounts[cat.key];
    if (!c || c.count === 0) return null;
    const entry = {
      name_en: cat.name_en,
      name_zh: cat.name_zh,
      name_zht: cat.name_zht,
      count: c.count,
    };
    // MOAT: public surface is coarse-bucket-only — NEVER an exact closing date.
    // Emitting soonest_closing (raw closing_iso) leaked the real deadline of a
    // specific tender for low-count categories; removed 2026-08-10. Per-tender
    // closing_bucket in the main feed already conveys "closing soon" safely.
    return entry;
  })
  .filter(Boolean)
  .sort((a, b) => b.count - a.count);

// ISO week of today (was hardcoded '2026-W28' — went stale; caught by the
// 2026-07-20 site audit).
function isoWeek(d = new Date()) {
  const u = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  u.setUTCDate(u.getUTCDate() + 4 - (u.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(u.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((u - yearStart) / 86400000 + 1) / 7);
  return `${u.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const teaser = {
  generated: new Date().toISOString(),
  week: isoWeek(),
  market: MARKET,
  total: records.length,
  sources: {
    government: govCount,
    public_bodies: pubCount,
  },
  categories,
};

const outDir = path.join(REPO_ROOT, 'tender', MARKET_LC);
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'teaser.json');
fs.writeFileSync(outPath, JSON.stringify(teaser, null, 2) + '\n');

console.log(`${MARKET}: ${records.length} open tenders → ${outPath}`);
console.log(`  sources: government=${govCount} public_bodies=${pubCount}`);
for (const c of categories) {
  console.log(`  ${c.name_en}: ${c.count}${c.soonest_closing ? ' (soonest ' + c.soonest_closing + ')' : ''}`);
}
