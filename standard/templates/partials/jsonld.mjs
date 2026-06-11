import { cleanStandardUrl, label, t } from "./i18n.mjs";

const site = "https://asaptic.com";

export function jsonld({ data, lang, locale, slug, faq = [] }) {
  const url = cleanStandardUrl({ site, locale, slug });
  const faqEntries = faq
    .map((item) => ({
      question: t(item.question, lang),
      answer: t(item.answer, lang)
    }))
    .filter((item) => item.question && item.answer);
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
      "inLanguage": locale === "zht" ? "zh-Hant" : locale === "zh" ? "zh-Hans" : "en"
    },
    {
      "@type": "TechArticle",
      "@id": `${url}#article`,
      "headline": t(data.page.title, lang),
      "description": t(data.page.description, lang),
      "url": url,
      "isPartOf": { "@id": `${url}#dataset` },
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
