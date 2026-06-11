const site = "https://asaptic.com";

export function jsonld({ data, lang, locale, slug }) {
  const pathPrefix = locale === "en" ? "" : `/${locale}`;
  const url = `${site}${pathPrefix}/standard/${slug}.html`;
  const graph = [
    {
      "@type": "Dataset",
      "@id": `${url}#dataset`,
      "name": data.page.title[lang],
      "description": data.page.description[lang],
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
      "headline": data.page.title[lang],
      "description": data.page.description[lang],
      "url": url,
      "isPartOf": { "@id": `${url}#dataset` },
      "author": { "@type": "Organization", "name": "Cross-Standard" },
      "publisher": { "@type": "Organization", "name": "Asaptic", "url": site },
      "dateModified": data.last_verified,
      "inLanguage": locale === "zht" ? "zh-Hant" : locale === "zh" ? "zh-Hans" : "en"
    },
    {
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      "mainEntity": (data.faq || []).map((item) => ({
        "@type": "Question",
        "name": item.question?.[lang],
        "acceptedAnswer": { "@type": "Answer", "text": item.answer?.[lang] }
      }))
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": site },
        { "@type": "ListItem", "position": 2, "name": "Standard", "item": `${site}/standard/` },
        { "@type": "ListItem", "position": 3, "name": data.page.title[lang], "item": url }
      ]
    }
  ];

  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 2);
}
