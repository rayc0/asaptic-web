import { esc, label, t } from "./i18n.mjs";

export function disclaimer({ data, lang }) {
  return `<aside class="standard-disclaimer">
    <p class="section-label">${esc(label("informationalOnly", lang))}</p>
    <h2>${esc(label("disclaimerTitle", lang))}</h2>
    <p class="standard-disclaimer__ai"><strong>${esc(label("aiCompiledNotice", lang))}</strong></p>
    <p>${esc(t(data.disclaimer, lang))}</p>
  </aside>`;
}
