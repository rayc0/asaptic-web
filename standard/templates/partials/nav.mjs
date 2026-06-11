// Neutral 公益 nav for the /standard section. Deliberately scoped to the
// public-interest tool — NO commercial site links (Sourcing / Physical AI),
// so the surface stays gov-backlinkable and free of business 导流.
export function nav({ locale }) {
  const stdHome = locale === "en" ? "/standard/" : `/${locale}/standard/`;
  return `<nav>
    <div class="container nav-shell">
      <a class="nav-logo" href="${stdHome}" aria-label="Cross-Standard">CROSS&#8209;STANDARD</a>
      <div class="nav-links">
        <a href="${stdHome}">Standards</a>
        <a href="/standard/methodology.html">Methodology</a>
        <a href="/standard/report-error.html">Report an error</a>
      </div>
      <div class="lang-switcher">
        <a class="lang-btn${locale === "en" ? " active" : ""}" href="/standard/solar-inverter-china-to-eu.html">EN</a>
        <a class="lang-btn${locale === "zh" ? " active" : ""}" href="/zh/standard/solar-inverter-china-to-eu.html">简</a>
        <a class="lang-btn${locale === "zht" ? " active" : ""}" href="/zht/standard/solar-inverter-china-to-eu.html">繁</a>
      </div>
    </div>
  </nav>`;
}
