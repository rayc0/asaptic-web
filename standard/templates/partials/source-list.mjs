import { esc, escAttr, label, safeHttpsUrl } from "./i18n.mjs";

export function sourceList({ rows, lang }) {
  const sources = rows.map((row) => row.source).filter(Boolean);
  const body = sources.length
    ? sources
        .map((source) => {
          const sourceUrl = safeHttpsUrl(source.url);
          const sourceName = esc(source.publisher);
          const sourceLabel = sourceUrl
            ? `<a href="${escAttr(sourceUrl)}" rel="noopener">${sourceName}</a>`
            : sourceName;
          return `<li>${sourceLabel} · ${esc(label("accessed", lang))} ${esc(source.accessed)} · ${esc(label(source.verified ? "verified" : "unverified", lang))}</li>`;
        })
        .join("\n")
    : `<li>${esc(label("sourceEmpty", lang))}</li>`;

  return `<section class="standard-section">
    <div class="container">
      <p class="section-label">${esc(label("sources", lang))}</p>
      <h2 class="section-title">${esc(label("sourceRegister", lang))}</h2>
      <ul class="standard-source-list">${body}</ul>
    </div>
  </section>`;
}
