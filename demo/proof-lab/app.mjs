// app.mjs — page wiring for the Proof Lab. Extracted from an inline
// <script type="module"> so the page can ship a strict `script-src 'self'`
// CSP (no 'unsafe-inline' for scripts). All render logic lives in prooflab.mjs
// and is unit-tested; this file only reads the DOM and assigns innerHTML.

import {
  runGate, lookupById, scoreAll, CLEAN_SAMPLE,
  renderGateHtml, renderLookupHtml, renderMatchHtml,
} from './prooflab.mjs';

const $ = (id) => document.getElementById(id);

// ---- Panel 1: gate ----
const cleanText = JSON.stringify(CLEAN_SAMPLE, null, 2);
const dirtyText = JSON.stringify({
  ...CLEAN_SAMPLE,
  closing_bucket: '2026-04-17',           // exact date where a band belongs
  value_band: 29962990,                    // a precise number, not a band
  summary_en: 'Supply of microscopes — code ABC/2026/0417',
  issuing_body: 'Some Government Department', // a 12th field
  category: { name_en: 'Lab', name_zh: '实验室', name_zht: '實驗室', name_secret: 'leak' },
}, null, 2);

$('gate-in').value = cleanText;

function renderGate() {
  $('gate-out').innerHTML = renderGateHtml(runGate($('gate-in').value));
}
$('gate-run').addEventListener('click', renderGate);
$('gate-reset').addEventListener('click', () => { $('gate-in').value = cleanText; renderGate(); });
$('gate-dirty').addEventListener('click', () => { $('gate-in').value = dirtyText; renderGate(); });
renderGate();

// ---- Panel 1b: 404 lookup ----
function renderLookup() {
  $('lk-out').innerHTML = renderLookupHtml(lookupById($('lk-in').value.trim()));
}
$('lk-run').addEventListener('click', renderLookup);
$('lk-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') renderLookup(); });
renderLookup();

// ---- Panel 2: match glass-box ----
function profile() {
  const cat = $('p-cat').value; const mkt = $('p-mkt').value;
  return {
    category: cat === '(none)' ? '' : cat,
    market: mkt === '(none)' ? '' : mkt,
    keywords: $('p-kw').value.split(',').map((s) => s.trim()).filter(Boolean),
  };
}
function renderMatch() {
  $('match-out').innerHTML = renderMatchHtml(scoreAll(profile()));
}
['p-cat', 'p-mkt'].forEach((id) => $(id).addEventListener('change', renderMatch));
$('p-kw').addEventListener('input', renderMatch);
renderMatch();
