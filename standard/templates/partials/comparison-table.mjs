const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function laws(list = []) {
  return list.map(esc).join("<br />") || "—";
}

export function comparisonTable({ rows, lang }) {
  const empty = `<tr><td colspan="5">No verified comparison rows are published yet. This page remains noindex until human review is complete.</td></tr>`;
  const body = rows.length
    ? rows
        .map((row) => `<tr>
          <th scope="row">${esc(row.requirement_topic?.[lang])}</th>
          <td>${esc(row.cn_common_equivalent?.summary?.[lang])}<small>${laws(row.cn_common_equivalent?.standards_or_laws)}</small></td>
          <td>${esc(row.eu_requirement?.summary?.[lang])}<small>${laws(row.eu_requirement?.standards_or_laws)}</small></td>
          <td>${esc(row.gap?.[lang])}<small>${esc(row.compliance_verdict?.[lang])}</small></td>
          <td><a href="${esc(row.source?.url)}" rel="noopener">${esc(row.source?.publisher)}</a><small>${esc(row.source?.accessed)} · ${row.source?.verified ? "verified" : "unverified"}</small></td>
        </tr>`)
        .join("\n")
    : empty;

  return `<div class="standard-table-wrap">
    <table class="standard-table">
      <caption>Gap matrix</caption>
      <thead>
        <tr>
          <th>合规项</th>
          <th>中国常见已有</th>
          <th>EU要求</th>
          <th>差距 · 动作</th>
          <th>依据 + 核验日</th>
        </tr>
      </thead>
      <tbody>
        ${body}
      </tbody>
    </table>
  </div>`;
}
