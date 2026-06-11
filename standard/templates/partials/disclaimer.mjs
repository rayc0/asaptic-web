export function disclaimer({ data, lang }) {
  return `<aside class="standard-disclaimer">
    <p class="section-label">INFORMATIONAL ONLY</p>
    <h2>信息性 · 非认证结论</h2>
    <p>${data.disclaimer[lang]}</p>
  </aside>`;
}
