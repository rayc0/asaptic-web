import { esc, escAttr, label } from "./i18n.mjs";

export function footer({ lang = "en", locale = "en", slug = "solar-inverter-china-to-eu" } = {}) {
  const standardHref = locale === "en" ? `/standard/${slug}.html` : `/${locale}/standard/${slug}.html`;
  return `<footer class="footer standard-footer">
    <div class="container">
      <div class="footer-top">
        <div class="footer-logo">Cross-Standard</div>
        <div class="footer-links">
          <a href="/">Asaptic</a>
          <a href="${escAttr(standardHref)}">${esc(label("standard", lang))}</a>
          <a href="https://creativecommons.org/licenses/by/4.0/" rel="license noopener">CC BY 4.0</a>
        </div>
      </div>
      <p class="standard-license">${esc(label("footerLicense", lang))}</p>
    </div>
  </footer>`;
}
