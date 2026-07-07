#!/usr/bin/env node
/**
 * build-market-teaser.mjs
 *
 * Reads a market tender registry (MO / GB / AU) and produces a teaser.json
 * in the same schema as tender/teaser.json (the HK bulletin), for use by
 * tender/<mkt>/index.html.
 *
 * Usage: node scripts/build-market-teaser.mjs <MO|GB|AU>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const REGISTRY_ROOT =
  '/Users/tun/Library/CloudStorage/OneDrive-Personal/0 0 to do/00AIprojects/00Tender/_registry';

const MARKET = (process.argv[2] || '').toUpperCase();
if (!['MO', 'GB', 'AU'].includes(MARKET)) {
  console.error('Usage: node scripts/build-market-teaser.mjs <MO|GB|AU>');
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
      '呼吸機', '呼吸机', '病床', '輪椅', '轮椅', '透析', '洗腎', '洗肾', '假肢',
      // MO zht keyword pack (00Tender/_registry/MO/MO_category_keywords_pt.json, key "medical")
      '醫院', '醫學中心', '衛生單位', '醫療消耗品', '化驗儀器', '分析儀'],
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
      '疫苗', '化驗', '化验', '衛生服務', '卫生服务', '救護', '救护', '藥劑', '药剂',
      // MO zht keyword pack (key "medical_services")
      '藥集', '試劑', '膠囊', '注射', '消耗品', '防護物品', '藥用產品', '病原體檢測', '滅蚊', '遺體清運'],
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
      '电脑', '数字化', '數字化', '信息系統', '信息系统',
      // MO zht keyword pack (key "software")
      '伺服器', '平台', '人工智能', '自動化', '數據', '雲端'],
  },
  {
    key: 'networking_security',
    name_en: 'Networking & security',
    name_zh: '网络与安全',
    name_zht: '網絡與安全',
    en: ['network', 'security service', 'cctv', 'surveillance', 'firewall', 'server room',
      'telecommunications', 'wifi', 'wi-fi', 'access control'],
    zh: ['網絡', '网络', '保安', '監控', '监控', '安全系統', '安全系统', '電訊', '电讯',
      '通訊系統', '通讯系统',
      // MO zht keyword pack (key "networking")
      '網路安全', '防火牆', '資訊保安', '監控系統', '門禁系統'],
  },
  {
    key: 'food_catering',
    name_en: 'Food & catering',
    name_zh: '食品与餐饮',
    name_zht: '食品與餐飲',
    en: ['food', 'catering', 'meal', 'kitchen', 'canteen', 'restaurant'],
    zh: ['餐飲', '餐饮', '食品', '膳食', '廚房', '厨房', '飯堂', '饭堂',
      // MO zht keyword pack (key "food")
      '伙食', '食物', '食堂', '美食', '冷凍真空包裝食品', '牛奶', '豆奶'],
  },
  {
    key: 'facilities_cleaning',
    name_en: 'Facilities & cleaning',
    name_zh: '设施与保洁',
    name_zht: '設施與清潔',
    en: ['cleaning', 'janitorial', 'facilities management', 'maintenance service', 'pest control',
      'security guard', 'landscaping', 'gardening', 'grounds maintenance'],
    zh: ['清潔', '清洁', '保潔', '保洁', '物業管理', '物业管理', '保養', '保养', '園藝', '园艺',
      '綠化', '绿化', '防治蟲鼠', '虫鼠',
      // MO zht keyword pack (key "facilities")
      '樓宇管理', '泊車', '停車場', '經營批給', '租賃', '燈飾', '管理服務', '看守', '護理服務',
      '維修保養', '營運', '冷凍空間'],
  },
  {
    key: 'vehicles_logistics',
    name_en: 'Vehicles & logistics',
    name_zh: '车辆与物流',
    name_zht: '車輛與物流',
    en: ['vehicle', 'truck', 'bus', 'transport', 'logistics', 'fleet', 'motor car', 'shipping',
      'freight', 'car park'],
    zh: ['車輛', '车辆', '物流', '運輸', '运输', '汽車', '汽车', '巴士', '貨車', '货车',
      // MO zht keyword pack (key "vehicles")
      '快艇', '消防車', '電動車', '巡邏艇', '飛機', '直升機', '工作車'],
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
      '優化', '优化', '污水處理', '污水处理',
      // MO zht keyword pack (key "construction")
      '建造工程', '建築工程', '土木工程', '擴建', '重建', '地基', '勘探', '道路工程',
      '裝修工程', '建築材料'],
  },
  {
    key: 'consultancy_studies',
    name_en: 'Consultancy & studies',
    name_zh: '顾问与研究',
    name_zht: '顧問與研究',
    en: ['consultancy', 'consulting', 'feasibility study', 'advisory', 'research service',
      'review of', 'study on', 'assessment service'],
    zh: ['顧問', '顾问', '諮詢', '咨询', '研究', '評估', '评估',
      // MO zht keyword pack (key "consultancy")
      '可行性研究', '統籌', '構思', '策劃', '宣傳服務'],
  },
  {
    key: 'printing_publishing',
    name_en: 'Printing & publishing',
    name_zh: '印刷与出版',
    name_zht: '印刷與出版',
    en: ['printing', 'publishing', 'print service', 'stationery'],
    zh: ['印刷', '出版', '文具',
      // MO zht keyword pack (key "printing")
      '期刊', '刊物', '雜誌製作'],
  },
];

// MO-only note: the pack (00Tender/_registry/MO/MO_category_keywords_pt.json) also
// ships "lab" (化驗/實驗室/...) and "office" (辦公用品/...) keys. This generator's
// CATEGORIES list has no matching buckets for those two ("化驗" was already present
// in medical_services_pharma's zh list before this change). Did not invent new
// category buckets here — out of scope per sprint instructions. Rows matching only
// "lab"/"office"-only terms still fall to "other".

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

// MO: org holds real department/entity names (繁體). Predicate measured 2026-07-07
// by W1-E against the live 200-row MO registry (raw_snapshot_2026-07-07.json):
// org matching 大學|基金|醫院|醫學中心|協會|博物館 → public_bodies (31/200 rows —
// universities, funds, hospitals/medical centres, associations, museums), else
// government (169/200 — 局/署/廳/會 direct government bureaus). See
// 00Tender/_registry/MO/MO_category_keywords_pt.json _meta.hide_zero_buckets_note
// for the full derivation.
const MO_PUBLIC_BODY_ORG_RE = /大學|基金|醫院|醫學中心|協會|博物館/;
function classifyOrgMO(org) {
  if (!org) return 'government';
  if (MO_PUBLIC_BODY_ORG_RE.test(org)) return 'public_bodies';
  return 'government';
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
  else cls = classifyOrgMO(rec.org);

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
    if (hasClosingDates && c.soonest) entry.soonest_closing = c.soonest;
    return entry;
  })
  .filter(Boolean)
  .sort((a, b) => b.count - a.count);

const teaser = {
  generated: new Date().toISOString(),
  week: '2026-W28',
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
