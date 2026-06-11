/**
 * Cross-Standard 公益 — client-side search engine
 * Plain <script defer> compatible — no ES modules, no bundler required.
 *
 * Element-ID contract (must exist in HTML):
 *   #cs-finder   <form>  — the guided finder form
 *   #cs-product  <select> — product picker (populated dynamically)
 *   #cs-market   <select> — market picker (populated dynamically)
 *   #cs-search   <input>  — free-text filter / auto-select
 *   #cs-result   <div>    — hidden initially; revealed to show outcome card
 */

(function () {
  'use strict';

  /* ── Locale detection ─────────────────────────────────────────────────── */
  function detectLocale() {
    var lang = (document.documentElement.lang || '').toLowerCase();
    if (lang === 'zh-hans' || lang === 'zh-cn' || lang === 'zh') return 'zh';
    if (lang === 'zh-hant' || lang === 'zh-tw' || lang === 'zht')  return 'zht';
    return 'en';
  }

  var locale = detectLocale();

  /* ── i18n strings ─────────────────────────────────────────────────────── */
  var i18n = {
    en: {
      selectProduct:   'Select a product category',
      selectMarket:    'Select a target market',
      verifyingTitle:  'Under Verification',
      verifyingBody:   'This comparison is being indexed and verified.',
      requestLink:     'Request this comparison →',
      liveExamplePrefix: 'See a live example: ',
      openComparison:  'View this comparison →',
      errorFetch:      'Could not load the comparisons index. Please refresh the page.',
      noMatch:         'No comparison found for this combination.'
    },
    zh: {
      selectProduct:   '选择产品类别',
      selectMarket:    '选择目标市场',
      verifyingTitle:  '数据校验中',
      verifyingBody:   '此对照表正在整理和校验中。',
      requestLink:     '申请此对照表 →',
      liveExamplePrefix: '查看一个已上线示例：',
      openComparison:  '查看此对照 →',
      errorFetch:      '无法加载对照表索引，请刷新页面。',
      noMatch:         '未找到此组合的对照表。'
    },
    zht: {
      selectProduct:   '選擇產品類別',
      selectMarket:    '選擇目標市場',
      verifyingTitle:  '數據校驗中',
      verifyingBody:   '此對照表正在整理和校驗中。',
      requestLink:     '申請此對照表 →',
      liveExamplePrefix: '查看一個已上線示例：',
      openComparison:  '查看此對照 →',
      errorFetch:      '無法載入對照表索引，請重新整理頁面。',
      noMatch:         '未找到此組合的對照表。'
    }
  };

  function t(key) {
    return (i18n[locale] || i18n.en)[key] || key;
  }

  /* ── Report-error page path by locale ────────────────────────────────── */
  var reportErrorPath = {
    en:  '/standard/report-error.html',
    zh:  '/zh/standard/report-error.html',
    zht: '/zht/standard/report-error.html'
  };

  /* ── Safe DOM helpers ─────────────────────────────────────────────────── */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'className') {
          node.className = attrs[k];
        } else {
          node.setAttribute(k, attrs[k]);
        }
      });
    }
    if (children) {
      children.forEach(function (c) {
        if (typeof c === 'string') {
          node.appendChild(document.createTextNode(c));
        } else if (c) {
          node.appendChild(c);
        }
      });
    }
    return node;
  }

  /* ── Populate selects ─────────────────────────────────────────────────── */
  function populateSelect(selectEl, items, labelFn) {
    // Keep the existing disabled placeholder (first option)
    while (selectEl.options.length > 1) {
      selectEl.remove(1);
    }
    items.forEach(function (item) {
      var opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = labelFn(item);
      selectEl.appendChild(opt);
    });
  }

  /* ── Free-text filter ─────────────────────────────────────────────────── */
  function filterProducts(query, products, productSelect) {
    var q = query.trim().toLowerCase();

    // Reset all options to visible
    for (var i = 1; i < productSelect.options.length; i++) {
      productSelect.options[i].hidden = false;
    }

    if (!q) return;

    var matches = [];
    products.forEach(function (product) {
      var label = (product.label[locale] || product.label.en || '').toLowerCase();
      var keywordsMatch = (product.keywords || []).some(function (kw) {
        return kw.toLowerCase().indexOf(q) !== -1;
      });
      if (label.indexOf(q) !== -1 || keywordsMatch) {
        matches.push(product.id);
      }
    });

    // Hide non-matching options
    for (var j = 1; j < productSelect.options.length; j++) {
      var opt = productSelect.options[j];
      if (matches.indexOf(opt.value) === -1) {
        opt.hidden = true;
      }
    }

    // Auto-select if exactly one match
    if (matches.length === 1) {
      productSelect.value = matches[0];
    }
  }

  /* ── Result card: "under verification" ───────────────────────────────── */
  function showVerifyingCard(resultDiv, liveExample) {
    // Clear previous content safely
    while (resultDiv.firstChild) {
      resultDiv.removeChild(resultDiv.firstChild);
    }

    var reportHref = reportErrorPath[locale] || reportErrorPath.en;

    var children = [
      el('p', {className: 'cs-verifying__title'}, [t('verifyingTitle')]),
      el('p', {className: 'cs-verifying__body'},  [t('verifyingBody')]),
      el('a', {href: reportHref, className: 'cs-verifying__link'}, [t('requestLink')])
    ];

    // Guide the user to a comparison that IS live, so they can see the real thing.
    if (liveExample && liveExample.href) {
      children.push(
        el('a', {href: liveExample.href, className: 'cs-verifying__example'},
          [t('liveExamplePrefix') + liveExample.label + ' →'])
      );
    }

    resultDiv.appendChild(el('div', {className: 'cs-verifying'}, children));
    resultDiv.hidden = false;
  }

  /* ── Result card: live suggestion (from free-text) ───────────────────── */
  function showLiveSuggestion(resultDiv, productLabel, marketLabel, href) {
    while (resultDiv.firstChild) { resultDiv.removeChild(resultDiv.firstChild); }
    resultDiv.appendChild(el('div', {className: 'cs-verifying'}, [
      el('p', {className: 'cs-verifying__title'}, [productLabel + ' → ' + marketLabel]),
      el('a', {href: href, className: 'cs-verifying__example'}, [t('openComparison')])
    ]));
    resultDiv.hidden = false;
  }

  /* ── Result card: error / no match ───────────────────────────────────── */
  function showMessage(resultDiv, msg) {
    while (resultDiv.firstChild) {
      resultDiv.removeChild(resultDiv.firstChild);
    }
    var p = el('p', {className: 'cs-message'}, [msg]);
    resultDiv.appendChild(p);
    resultDiv.hidden = false;
  }

  /* ── Main init (runs after fetch) ─────────────────────────────────────── */
  function init(data) {
    var formEl       = document.getElementById('cs-finder');
    var productSelect = document.getElementById('cs-product');
    var marketSelect  = document.getElementById('cs-market');
    var searchInput  = document.getElementById('cs-search');
    var resultDiv    = document.getElementById('cs-result');

    // Defensive: bail if required elements are missing
    if (!formEl || !productSelect || !marketSelect || !resultDiv) return;

    var products = data.products || [];
    var markets  = data.markets  || [];
    var comparisons = data.comparisons || [];

    /* Pre-compute the first LIVE comparison so we can point testers to it
       whenever they land on an unpublished combination. */
    function labelOf(list, id) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) return list[i].label[locale] || list[i].label.en;
      }
      return id;
    }
    var liveExample = null;
    for (var k = 0; k < comparisons.length; k++) {
      var c = comparisons[k];
      if (c.status === 'live' && c.url) {
        liveExample = {
          href: c.url[locale] || c.url.en,
          label: labelOf(products, c.product) + ' → ' + labelOf(markets, c.market)
        };
        break;
      }
    }

    /* Populate selects */
    populateSelect(productSelect, products, function (p) {
      return p.label[locale] || p.label.en;
    });
    populateSelect(marketSelect, markets, function (m) {
      return m.label[locale] || m.label.en;
    });

    /* Free-text search listener: filter products, and when the typed text
       resolves to a product that HAS a live comparison, surface a direct
       clickable result so testers can "just type and go". */
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        filterProducts(searchInput.value, products, productSelect);
        var q = searchInput.value.trim();
        var pid = productSelect.value;
        if (!q || !pid) { resultDiv.hidden = true; return; }
        var live = null;
        for (var i = 0; i < comparisons.length; i++) {
          if (comparisons[i].product === pid && comparisons[i].status === 'live' && comparisons[i].url) {
            live = comparisons[i]; break;
          }
        }
        if (live) {
          marketSelect.value = live.market; // keep the guided form in sync
          showLiveSuggestion(resultDiv, labelOf(products, pid),
            labelOf(markets, live.market), live.url[locale] || live.url.en);
        } else {
          resultDiv.hidden = true;
        }
      });
    }

    /* Form submit */
    formEl.addEventListener('submit', function (e) {
      e.preventDefault();

      var productId = productSelect.value;
      var marketId  = marketSelect.value;

      // Guard: both must be selected
      if (!productId || !marketId) return;

      // Find matching comparison entry
      var entry = null;
      for (var i = 0; i < comparisons.length; i++) {
        if (comparisons[i].product === productId && comparisons[i].market === marketId) {
          entry = comparisons[i];
          break;
        }
      }

      if (entry && entry.status === 'live') {
        // Navigate to the comparison page
        var urls = entry.url || {};
        var dest = urls[locale] || urls.en;
        if (dest) {
          window.location.href = dest;
        }
        return;
      }

      if (entry && entry.status === 'verifying') {
        showVerifyingCard(resultDiv, liveExample);
        return;
      }

      // No entry found — treat as verifying / not yet indexed
      showVerifyingCard(resultDiv);
    });

    /* Hide result on any select change */
    function hideResult() {
      if (resultDiv) resultDiv.hidden = true;
    }
    productSelect.addEventListener('change', hideResult);
    marketSelect.addEventListener('change', hideResult);
  }

  /* ── Bootstrap: fetch index ───────────────────────────────────────────── */
  function bootstrap() {
    var resultDiv = document.getElementById('cs-result');

    fetch('/standard/data/_index.json')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        init(data);
      })
      .catch(function () {
        if (resultDiv) {
          showMessage(resultDiv, t('errorFetch'));
        }
      });
  }

  /* ── Wait for DOM ─────────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

}());
