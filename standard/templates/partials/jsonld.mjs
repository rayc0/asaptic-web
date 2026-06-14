import { cleanStandardUrl, label, t } from "./i18n.mjs";

const site = "https://asaptic.com";

export function jsonld({ data, lang, locale, slug, faq = [], rows = [] }) {
  const url = cleanStandardUrl({ site, locale, slug });
  const product = t(data.category?.labels, lang) || "";
  const market = t(data.target_market_label, lang) || "";
  const stripVerdict = (s) => (s || "").replace(/^\s*[\[【][^\]】]*[\]】]\s*/, "").trim();
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
  const graph = [
    {
      "@type": "Dataset",
      "@id": `${url}#dataset`,
      "name": t(data.page.title, lang),
      "description": t(data.page.description, lang),
      "identifier": data.dataset_id,
      "version": data.version,
      "isAccessibleForFree": true,
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
      "isPartOf": { "@id": `${url}#dataset` },
      "proficiencyLevel": "Expert",
      "author": { "@type": "Organization", "name": "Cross-Standard" },
      "publisher": { "@type": "Organization", "name": "Asaptic", "url": site },
      "dateModified": data.last_verified,
      "inLanguage": locale === "zht" ? "zh-Hant" : locale === "zh" ? "zh-Hans" : "en"
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
