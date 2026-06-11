const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export function sourceList({ rows }) {
  const sources = rows.map((row) => row.source).filter(Boolean);
  const body = sources.length
    ? sources
        .map((source) => `<li><a href="${esc(source.url)}" rel="noopener">${esc(source.publisher)}</a> · accessed ${esc(source.accessed)} · ${source.verified ? "verified" : "unverified"}</li>`)
        .join("\n")
    : "<li>No row-level sources have passed review yet.</li>";

  return `<section class="standard-section">
    <div class="container">
      <p class="section-label">SOURCES</p>
      <h2 class="section-title">Official-source register.</h2>
      <ul class="standard-source-list">${body}</ul>
    </div>
  </section>`;
}
