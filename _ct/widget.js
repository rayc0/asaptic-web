/* Shared Control Tower launcher — injected on every page of both gated .dev
   instances (companyforge-internal + asaptic-internal). Self-contained, no deps.
   Three visibility states (localStorage 'ct_state'): 'open' | 'collapsed' | 'hidden'.
   Restore from hidden with Alt+` (Backquote). */
(function () {
  if (window.__ctLoaded) return; window.__ctLoaded = true;
  var CF = 'https://app.companyforge.dev', AS = 'https://app.asaptic.dev';
  var NAV = {
    companyforge: {
      label: 'CompanyForge', base: CF, tower: CF + '/', manual: CF + '/manual/',
      links: [
        ['🏠 Home', '/home'], ['About', '/about'], ['Pricing', '/pricing'],
        ['FAQ', '/faq'], ['Trust & security', '/trust'], ['Services', '/services/forgeops'],
        ['Funding & grants', '/funding/bud'], ['Blog / resources', '/resource-center'],
        ['Case studies', '/case-studies/pierforge'], ['📒 Bookkeep (Books)', '/books/'], ['⚙️ App', '/app']
      ]
    },
    asaptic: {
      label: 'Asaptic', base: AS, tower: AS + '/manual/', manual: AS + '/manual/',
      links: [
        ['🏭 Portal home', '/'], ['Login', '/login'], ['Dashboard', '/dashboard'],
        ['Deal rooms', '/dealroom'], ['Suppliers', '/supplier'], ['Tenders', '/tenders'],
        ['Ops console', '/ops'], ['R&D workbench', '/rd-workbench'], ['Compliance', '/compliance-workbench']
      ]
    }
  };
  // Which venture is THIS instance (so its own links are same-origin, other is cross-domain)
  var here = location.host.indexOf('asaptic') !== -1 ? 'asaptic' : 'companyforge';

  var state = localStorage.getItem('ct_state') || 'collapsed';
  function save(s) { state = s; localStorage.setItem('ct_state', s); render(); }

  var css = '' +
    '#ct-root{position:fixed;top:0;left:0;height:100%;z-index:2147483000;font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;pointer-events:none}' +
    '#ct-handle{position:fixed;left:0;top:50%;transform:translateY(-50%);background:linear-gradient(135deg,#5b6ee1,#8b5cf6);color:#fff;writing-mode:vertical-rl;padding:14px 6px;border-radius:0 8px 8px 0;cursor:pointer;pointer-events:auto;font-weight:600;letter-spacing:.05em;box-shadow:2px 0 8px rgba(0,0,0,.15);user-select:none}' +
    '#ct-panel{position:fixed;left:0;top:0;height:100%;width:300px;max-width:82vw;background:#fbfbfd;border-right:1px solid #e3e6ee;box-shadow:4px 0 24px rgba(20,24,40,.14);overflow-y:auto;padding:18px 16px 24px;pointer-events:auto;transform:translateX(-105%);transition:transform .18s ease}' +
    '#ct-root.open #ct-panel{transform:translateX(0)}' +
    '#ct-root.open #ct-handle{display:none}' +
    '#ct-root.hidden #ct-handle,#ct-root.hidden #ct-panel{display:none}' +
    '.ct-hd{display:flex;align-items:center;gap:10px;margin-bottom:6px}' +
    '.ct-logo{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,#5b6ee1,#8b5cf6)}' +
    '.ct-title{font-weight:700;color:#1a1d29}.ct-sub{color:#8a90a6;font:11px/1.3 ui-monospace,monospace}' +
    '.ct-tabs{display:flex;gap:4px;background:#eef0f6;border-radius:10px;padding:3px;margin:12px 0}' +
    '.ct-tab{flex:1;border:0;background:none;padding:7px;border-radius:7px;cursor:pointer;font-weight:600;color:#5a6076}' +
    '.ct-tab[aria-selected=true]{background:#fff;color:#1a1d29;box-shadow:0 1px 3px rgba(0,0,0,.08)}' +
    '.ct-lbl{font:10px/1.4 ui-monospace,monospace;letter-spacing:.12em;color:#9aa0b4;text-transform:uppercase;margin:14px 0 6px}' +
    '.ct-nav a{display:block;color:#333a4d;text-decoration:none;padding:5px 8px;border-radius:6px}' +
    '.ct-nav a:hover{background:#eef0f6;color:#111}' +
    '.ct-x{position:absolute;top:14px;right:12px;border:0;background:none;font-size:18px;cursor:pointer;color:#8a90a6;line-height:1}' +
    '.ct-foot{margin-top:16px;border-top:1px solid #e8eaf1;padding-top:12px;font-size:12px}' +
    '.ct-foot a{color:#5b6ee1;font-weight:600;text-decoration:none}.ct-foot button{border:0;background:none;color:#9aa0b4;cursor:pointer;font-size:11px;padding:6px 0 0;display:block}' +
    '@media(prefers-color-scheme:dark){#ct-panel{background:#141824;border-color:#232a3a}.ct-title{color:#eef1f7}.ct-tabs{background:#1c2130}.ct-tab[aria-selected=true]{background:#0e1119;color:#eef1f7}.ct-nav a{color:#c2c8da}.ct-nav a:hover{background:#1c2130;color:#fff}}';

  var root, activeTab = here;
  function render() {
    if (!root) {
      root = document.createElement('div'); root.id = 'ct-root';
      var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
      document.body.appendChild(root);
    }
    root.className = state === 'open' ? 'open' : (state === 'hidden' ? 'hidden' : '');
    var v = NAV[activeTab];
    var linkHtml = v.links.map(function (l) { return '<a href="' + v.base + l[1] + '">' + l[0] + '</a>'; }).join('');
    root.innerHTML =
      '<div id="ct-handle" title="Open Control Tower">CONTROL TOWER</div>' +
      '<div id="ct-panel"><button class="ct-x" title="Collapse">×</button>' +
      '<div class="ct-hd"><div class="ct-logo"></div><div><div class="ct-title">Control Tower</div><div class="ct-sub">*.dev · internal</div></div></div>' +
      '<div class="ct-tabs">' +
        '<button class="ct-tab" data-t="companyforge" aria-selected="' + (activeTab === 'companyforge') + '">CompanyForge</button>' +
        '<button class="ct-tab" data-t="asaptic" aria-selected="' + (activeTab === 'asaptic') + '">Asaptic</button>' +
      '</div>' +
      '<div class="ct-lbl">' + v.label + ' site</div><nav class="ct-nav">' + linkHtml + '</nav>' +
      '<div class="ct-foot"><a href="' + v.manual + '">🗺 Full Site Map &amp; Manual</a>' +
        (activeTab === 'companyforge' ? '<br><a href="' + v.tower + '">↗ Full Control Tower</a>' : '') +
        '<button id="ct-hide">Hide launcher (Alt+` to restore)</button></div></div>';
    root.querySelector('#ct-handle').onclick = function () { save('open'); };
    root.querySelector('.ct-x').onclick = function () { save('collapsed'); };
    root.querySelector('#ct-hide').onclick = function () { save('hidden'); };
    Array.prototype.forEach.call(root.querySelectorAll('.ct-tab'), function (b) {
      b.onclick = function () { activeTab = b.getAttribute('data-t'); render(); };
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.altKey && (e.key === '`' || e.code === 'Backquote')) { save(state === 'hidden' ? 'collapsed' : 'hidden'); }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
})();
