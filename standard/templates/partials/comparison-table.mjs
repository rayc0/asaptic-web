import { esc, escAttr, label, safeHttpsUrl, t } from "./i18n.mjs";

function laws(list = []) {
  return list.map(esc).join("<br />") || "—";
}

export function comparisonTable({ rows, lang }) {
  const empty = `<tr><td colspan="5">${esc(label("tableEmpty", lang))}</td></tr>`;
  const body = rows.length
    ? rows
        .map((row) => {
          const sourceUrl = safeHttpsUrl(row.source?.url);
          const sourceName = esc(row.source?.publisher);
          const source = sourceUrl
            ? `<a href="${escAttr(sourceUrl)}" rel="noopener">${sourceName}</a>`
            : sourceName;
          return `<tr>
          <th scope="row">${esc(t(row.requirement_topic, lang))}</th>
          <td>${esc(t(row.cn_common_equivalent?.summary, lang))}<small>${laws(row.cn_common_equivalent?.standards_or_laws)}</small></td>
          <td>${esc(t(row.eu_requirement?.summary, lang))}<small>${laws(row.eu_requirement?.standards_or_laws)}</small></td>
          <td>${esc(t(row.gap, lang))}<small>${esc(t(row.compliance_verdict, lang))}</small></td>
          <td>${source}<small>${esc(row.source?.accessed)} · ${esc(label(row.source?.verified ? "verified" : "unverified", lang))}</small></td>
        </tr>`;
        })
        .join("\n")
    : empty;

  return `<div class="standard-table-wrap">
    <table class="standard-table">
      <caption>${esc(label("tableCaption", lang))}</caption>
      <thead>
        <tr>
          <th scope="col">${esc(label("colTopic", lang))}</th>
          <th scope="col">${esc(label("colCn", lang))}</th>
          <th scope="col">${esc(label("colEu", lang))}</th>
          <th scope="col">${esc(label("colGap", lang))}</th>
          <th scope="col">${esc(label("colSource", lang))}</th>
        </tr>
      </thead>
      <tbody>
        ${body}
      </tbody>
    </table>
  </div>`;
}
