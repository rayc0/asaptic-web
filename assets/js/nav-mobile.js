/* ============================================================
   Asaptic — mobile nav toggle
   Save as a NEW shared file: /assets/js/nav-mobile.js
   Include on every core navy page, right before </body>:
     <script src="/assets/js/nav-mobile.js" defer></script>
   No dependencies. No-ops safely if #navBurger isn't present
   (e.g. on pages that don't use SHARED_NAV.html).
   ============================================================ */
(function () {
  'use strict';

  function init() {
    var burger = document.getElementById('navBurger');
    var drawer = document.getElementById('navDrawer');
    var nav = burger ? burger.closest('nav') : null;
    if (!burger || !drawer || !nav) return;

    var lastFocused = null;

    function open() {
      lastFocused = document.activeElement;
      nav.classList.add('nav-open');
      burger.setAttribute('aria-expanded', 'true');
      burger.setAttribute('aria-label', 'Close menu');
      document.body.style.overflow = 'hidden';
      var firstLink = drawer.querySelector('a');
      if (firstLink) firstLink.focus();
      document.addEventListener('keydown', onKeydown);
    }

    function close() {
      nav.classList.remove('nav-open');
      burger.setAttribute('aria-expanded', 'false');
      burger.setAttribute('aria-label', 'Open menu');
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKeydown);
      if (lastFocused && typeof lastFocused.focus === 'function') {
        lastFocused.focus();
      } else {
        burger.focus();
      }
    }

    function isOpen() {
      return nav.classList.contains('nav-open');
    }

    function toggle() {
      if (isOpen()) close(); else open();
    }

    function onKeydown(e) {
      if (e.key === 'Escape' || e.key === 'Esc') {
        close();
        return;
      }
      // simple focus trap: keep Tab cycling within the drawer + burger
      if (e.key === 'Tab') {
        var focusable = drawer.querySelectorAll('a, button');
        if (!focusable.length) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          burger.focus();
        } else if (!e.shiftKey && document.activeElement === burger) {
          e.preventDefault();
          first.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          burger.focus();
        }
      }
    }

    burger.addEventListener('click', toggle);

    // Close on link click (so navigating actually navigates, no stuck-open drawer)
    drawer.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') close();
    });

    // Close if resized back to desktop width
    var mq = window.matchMedia('(min-width: 981px)');
    function handleMq(e) {
      if (e.matches && isOpen()) close();
    }
    if (mq.addEventListener) mq.addEventListener('change', handleMq);
    else if (mq.addListener) mq.addListener(handleMq); // Safari <14 fallback
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
