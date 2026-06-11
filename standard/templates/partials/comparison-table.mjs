import { esc, escAttr, label, safeHttpsUrl, t } from "./i18n.mjs";

function laws(list = []) {
  return list.map(esc).join("<br />") || "—";
}

export function comparisonTable({ rows, lang }) {
  const columns = {
    topic: label("colTopic", lang),
    cn: label("colCn", lang),
    eu: label("colEu", lang),
    gap: label("colGap", lang),
    source: label("colSource", lang)
  };
  const empty = `<tr><td colspan="5">${esc(label("tableEmpty", lang))}</td></tr>`;
  const body = rows.length
    ? rows
        .map((row) => {
          const sourceUrl = safeHttpsUrl(row.source?.url);
          const sourceName = esc(row.source?.publisher);
          const source = sourceUrl
            ? `<a href="${escAttr(sourceUrl)}" rel="noopener">${sourceName}</a>`
            : sourceName;
          const verified = row.source?.verified === true;
          const statusText = label(verified ? "statusVerified" : "statusUnverified", lang);
          const statusClass = verified ? "status-green" : "status-amber";
          return `<tr>
          <th scope="row" data-label="${escAttr(columns.topic)}">${esc(t(row.requirement_topic, lang))}</th>
          <td data-label="${escAttr(columns.cn)}">${esc(t(row.cn_common_equivalent?.summary, lang))}<small>${laws(row.cn_common_equivalent?.standards_or_laws)}</small></td>
          <td data-label="${escAttr(columns.eu)}">${esc(t(row.eu_requirement?.summary, lang))}<small>${laws(row.eu_requirement?.standards_or_laws)}</small></td>
          <td data-label="${escAttr(columns.gap)}">${esc(t(row.gap, lang))}<small>${esc(t(row.compliance_verdict, lang))}</small></td>
          <td data-label="${escAttr(columns.source)}"><span class="source-cell">${source}<small>${esc(row.source?.accessed)} · <span class="status-label" aria-label="${escAttr(statusText)}"><span class="status-dot ${statusClass}" aria-hidden="true"></span>${esc(label(verified ? "verified" : "unverified", lang))}</span></small></span></td>
        </tr>`;
        })
        .join("\n")
    : empty;

  return `<div class="gap-matrix-wrap">
    <table class="gap-matrix">
      <caption>${esc(label("tableCaption", lang))}</caption>
      <colgroup>
        <col style="width:17%" />
        <col style="width:23%" />
        <col style="width:23%" />
        <col style="width:25%" />
        <col style="width:12%" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">${esc(columns.topic)}</th>
          <th scope="col">${esc(columns.cn)}</th>
          <th scope="col">${esc(columns.eu)}</th>
          <th scope="col">${esc(columns.gap)}</th>
          <th scope="col">${esc(columns.source)}</th>
        </tr>
      </thead>
      <tbody>
        ${body}
      </tbody>
    </table>
  </div>`;
}
