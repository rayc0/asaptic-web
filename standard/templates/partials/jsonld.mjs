import { cleanStandardUrl, label, t } from "./i18n.mjs";

const site = "https://asaptic.com";

export function jsonld({ data, lang, locale, slug, faq = [], rows = [] }) {
  const url = cleanStandardUrl({ site, locale, slug });
  const product = t(data.category?.labels, lang) || "";
  const market = t(data.target_market_label, lang) || "";
  // Strip ALL bracketed disclaimer segments — leading ([INFORMATIONAL]/[仅供参考]),
  // trailing ([Informational only — verify with <regulator>...]), and any inline —
  // so auto-generated FAQ answers read cleanly for rich snippets / LLM citation.
  const stripVerdict = (s) => (s || "").replace(/[\[【][^\]】]*[\]】]/g, " ").replace(/\s+/g, " ").trim();
  let faqEntries = faq
    .map((item) => ({
      question: t(item.question, lang),
      answer: t(item.answer, lang)
    }))
    .filter((item) => item.question && item.answer);
  // GEO/AIO (Gemini spec 2026-06-13): if no curated FAQ, auto-derive Q&A from rows so
  // every page is FAQ-rich-snippet + LLM-citation eligible. Q = requirement topic in context,
  // A = the row's compliance verdict (informational-prefix stripped).
  if (!faqEntries.length && Array.isArray(rows) && rows.length) {
    faqEntries = rows
      .slice(0, 8)
      .map((row) => {
        const topic = t(row.requirement_topic, lang);
        const answer = stripVerdict(t(row.compliance_verdict, lang)) || stripVerdict(t(row.gap, lang));
        if (!topic || !answer) return null;
        const q = `${topic}?`;
        return { question: q, answer };
      })
      .filter(Boolean);
  }
  // GEO/AIO (Gemini spec 2026-06-15): semantic entity-linking. Match strings are
  // word-anchored/specific to avoid false hits (e.g. NOT a bare "CE"). Only standards
  // with a confirmed Wikipedia article are linked, so sameAs never dangles.
  const entityText = `${t(data.page.title, lang)} ${t(data.page.description, lang)} ${rows.map((r) => `${t(r.requirement_topic, lang)} ${(r.target_requirement?.standards_or_laws || []).join(" ")}`).join(" ")}`;
  const aboutEntities = [
    { name: "IEC 62619", match: "IEC 62619", sameAs: "https://en.wikipedia.org/wiki/IEC_62619" },
    { name: "IEC 62196", match: "IEC 62196", sameAs: "https://en.wikipedia.org/wiki/IEC_62196" },
    { name: "IEC 61851", match: "IEC 61851", sameAs: "https://en.wikipedia.org/wiki/IEC_61851" },
    { name: "SAE J1772", match: "J1772", sameAs: "https://en.wikipedia.org/wiki/SAE_J1772" },
    { name: "Combined Charging System", match: "CCS", sameAs: "https://en.wikipedia.org/wiki/Combined_Charging_System" },
    { name: "IEEE 1547", match: "IEEE 1547", sameAs: "https://en.wikipedia.org/wiki/IEEE_1547" },
    { name: "UN 38.3", match: "UN 38.3", sameAs: "https://en.wikipedia.org/wiki/UN_38.3" },
    { name: "CE marking", match: "CE mark", sameAs: "https://en.wikipedia.org/wiki/CE_marking" }
  ]
    .filter((item) => entityText.includes(item.match))
    .map((item) => ({ "@type": "Thing", "name": item.name, "sameAs": item.sameAs }));
  const citations = Array.isArray(rows)
    ? [...new Set(rows.map((row) => row.source?.url).filter(Boolean))]
    : [];
  const graph = [
    {
      "@type": "WebSite",
      "@id": `${site}/#website`,
      "name": "Asaptic",
      "url": site,
      "publisher": { "@type": "Organization", "name": "Asaptic", "url": site }
    },
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      "url": url,
      "name": t(data.page.title, lang),
      "description": t(data.page.description, lang),
      "isPartOf": { "@id": `${site}/#website` },
      "breadcrumb": { "@id": `${url}#breadcrumb` },
      "inLanguage": locale === "zht" ? "zh-Hant" : locale === "zh" ? "zh-Hans" : "en"
    },
    {
      "@type": "Dataset",
      "@id": `${url}#dataset`,
      "name": t(data.page.title, lang),
      "description": t(data.page.description, lang),
      "identifier": data.dataset_id,
      "version": data.version,
      "isAccessibleForFree": true,
      "isPartOf": { "@id": `${url}#webpage` },
      "creator": { "@type": "Organization", "name": "Cross-Standard" },
      "publisher": { "@type": "Organization", "name": "Asaptic", "url": site },
      "license": "https://creativecommons.org/licenses/by/4.0/",
      "dateModified": data.last_verified,
      "keywords": [product, market, "China export compliance", "GB standard comparison"].filter(Boolean),
      "variableMeasured": [
        "Target-market mandatory requirement",
        "Closest China GB equivalent",
        "Compliance gap",
        "Mandatory vs voluntary status",
        "Official source"
      ],
      "inLanguage": locale === "zht" ? "zh-Hant" : locale === "zh" ? "zh-Hans" : "en",
      ...(aboutEntities.length ? { "about": aboutEntities } : {}),
      "distribution": [
        {
          "@type": "DataDownload",
          "encodingFormat": "application/json",
          "contentUrl": `${site}/standard/exports/${slug}.json`
        }
      ]
    },
    {
      "@type": "TechArticle",
      "@id": `${url}#article`,
      "headline": t(data.page.title, lang),
      "description": t(data.page.description, lang),
      "url": url,
      "isPartOf": { "@id": `${url}#webpage` },
      "proficiencyLevel": "Expert",
      "author": { "@type": "Organization", "name": "Cross-Standard" },
      "publisher": { "@type": "Organization", "name": "Asaptic", "url": site },
      "dateModified": data.last_verified,
      "inLanguage": locale === "zht" ? "zh-Hant" : locale === "zh" ? "zh-Hans" : "en",
      ...(aboutEntities.length ? { "about": aboutEntities } : {}),
      ...(citations.length ? { "citation": citations } : {})
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": label("home", lang), "item": site },
        { "@type": "ListItem", "position": 2, "name": label("standard", lang), "item": `${site}${locale === "en" ? "" : `/${locale}`}/standard/` },
        { "@type": "ListItem", "position": 3, "name": t(data.page.title, lang), "item": url }
      ]
    }
  ];

  if (faqEntries.length) {
    graph.splice(2, 0, {
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      "mainEntity": faqEntries.map((item) => ({
        "@type": "Question",
        "name": item.question,
        "acceptedAnswer": { "@type": "Answer", "text": item.answer }
      }))
    });
  }

  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 2);
}
