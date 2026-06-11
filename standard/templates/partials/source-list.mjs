import { esc, escAttr, label, safeHttpsUrl } from "./i18n.mjs";

export function sourceList({ rows, lang }) {
  const sourceMap = new Map();
  for (const row of rows) {
    if (!row.source) continue;
    const key = `${row.source.url || ""}::${row.source.publisher || ""}`;
    const existing = sourceMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      sourceMap.set(key, { source: row.source, count: 1 });
    }
  }
  const sources = [...sourceMap.values()];
  const body = sources.length
    ? sources
        .map((source) => {
          const sourceUrl = safeHttpsUrl(source.source.url);
          const sourceName = esc(source.source.publisher);
          const sourceLabel = sourceUrl
            ? `<a href="${escAttr(sourceUrl)}" rel="noopener">${sourceName}</a>`
            : sourceName;
          const usedCount = label("usedInRows", lang).replace("{count}", String(source.count));
          return `<li>${sourceLabel} · ${esc(label("accessed", lang))} ${esc(source.source.accessed)} · ${esc(label(source.source.verified ? "verified" : "unverified", lang))} · ${esc(usedCount)}</li>`;
        })
        .join("\n")
    : `<li>${esc(label("sourceEmpty", lang))}</li>`;

  return `<section class="standard-section">
    <div class="container">
      <p class="section-label">${esc(label("sources", lang))}</p>
      <h2 class="section-title standard-content-heading">${esc(label("sourceRegister", lang))}</h2>
      <ul class="standard-source-list">${body}</ul>
    </div>
  </section>`;
}
