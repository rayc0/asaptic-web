import { esc, escAttr, label } from "./i18n.mjs";

// Neutral 公益 nav for the /standard section. Deliberately scoped to the
// public-interest tool — NO commercial site links (Sourcing / Physical AI),
// so the surface stays gov-backlinkable and free of business 导流.
export function nav({ locale }) {
  const stdHome = locale === "en" ? "/standard/" : `/${locale}/standard/`;
  const methodology = `${stdHome}methodology.html`;
  const reportError = `${stdHome}report-error.html`;
  const lang = locale;
  const langAttrs = (target) => (locale === target ? ` aria-current="page"` : "");
  return `<nav>
    <div class="container nav-shell">
      <a class="nav-logo" href="${escAttr(stdHome)}" aria-label="Cross-Standard">CROSS&#8209;STANDARD</a>
      <div class="nav-links">
        <a href="${escAttr(stdHome)}">${esc(label("standards", lang))}</a>
        <a href="${escAttr(methodology)}">${esc(label("methodology", lang))}</a>
        <a href="${escAttr(reportError)}">${esc(label("reportError", lang))}</a>
      </div>
      <div class="lang-switcher">
        <a class="lang-btn${locale === "en" ? " active" : ""}" href="/standard/solar-inverter-china-to-eu.html"${langAttrs("en")}>EN</a>
        <a class="lang-btn${locale === "zh" ? " active" : ""}" href="/zh/standard/solar-inverter-china-to-eu.html"${langAttrs("zh")}>简</a>
        <a class="lang-btn${locale === "zht" ? " active" : ""}" href="/zht/standard/solar-inverter-china-to-eu.html"${langAttrs("zht")}>繁</a>
      </div>
    </div>
  </nav>`;
}
