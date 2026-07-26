#!/usr/bin/env python3
"""Validate GEO and structured-data invariants across mirrored Asaptic pages."""

import json
import os
import re
import glob
from xml.etree import ElementTree as ET


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
BASE_URL = "https://asaptic.com"

LOCALES = [
    ("", "en"),
    ("zh", "zh-Hans"),
    ("zht", "zh-Hant"),
    ("pt", "pt-PT"),
]

LOCALE_TO_LANG = {
    "": "en",
    "zh": "zh-hans",
    "zht": "zh-hant",
    "pt": "pt",
}

LANES = [
    "deep-tech-sourcing",
    "medical-device-sourcing",
    "ev-charger-power-module-sourcing",
    "heavy-lift-uav",
    "physical-ai-robotics",
    "sourcing/clinical-devices",
]

CHECK_KEYS = [
    "lane_canonical_present",
    "lane_og_locale_present",
    "lane_html_lang_correct",
    "lane_jsonld_parse",
    "lane_faq_parity",
    "lane_hreflang_reciprocity",
    "blog_jsonld_parse",
    "blog_schema_types",
    "sitemap_loc_resolves",
]


LINK_TAG_RE = re.compile(r"<link\b[^>]*>", re.IGNORECASE | re.DOTALL)
META_TAG_RE = re.compile(r"<meta\b[^>]*>", re.IGNORECASE | re.DOTALL)
HTML_TAG_RE = re.compile(r"<html\b[^>]*>", re.IGNORECASE | re.DOTALL)
SCRIPT_LD_RE = re.compile(
    r'<script\b[^>]*type\s*=\s*["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.IGNORECASE | re.DOTALL,
)
ATTR_RE = re.compile(r"([a-zA-Z][a-zA-Z0-9_:.-]*)\s*=\s*([\"'])(.*?)\2", re.DOTALL)


def extract_attrs(tag):
    attrs = {}
    for key, _, value in ATTR_RE.findall(tag):
        attrs[key.lower()] = value.strip()
    return attrs


def normalize_route(url):
    if not url:
        return "/"

    value = url.strip()
    if value.startswith("//"):
        value = "https:" + value

    if value.startswith("http://") or value.startswith("https://"):
        if not value.startswith(BASE_URL):
            return ""
        value = value[len(BASE_URL):]

    value = value.split("#", 1)[0].split("?", 1)[0]
    if not value:
        return "/"
    if not value.startswith("/"):
        value = "/" + value

    return value


def normalize_route_for_compare(route):
    route = normalize_route(route)
    if route == "" or route is None:
        return ""
    if route.endswith("/"):
        route = route[:-1] if route != "/" else route
    if route.endswith(".html"):
        route = route[:-5]
    if not route.startswith("/"):
        route = "/" + route
    if not route:
        route = "/"
    if route.endswith("/") and route != "/":
        route = route[:-1]
    return route


def file_candidates_for_route(route):
    route = normalize_route(route)
    if route == "/" or route == "":
        return ["index.html"]

    clean = route.lstrip("/")
    candidates = [clean + ".html", clean + "/index.html"]
    if clean.endswith(".html"):
        candidates.append(clean)
    return list(dict.fromkeys(candidates))


def resolve_route_to_file(route):
    for rel in file_candidates_for_route(route):
        candidate = os.path.join(ROOT_DIR, rel)
        if os.path.isfile(candidate):
            return candidate
    return ""


def rel_route_from_file(file_path):
    rel = os.path.relpath(file_path, ROOT_DIR).replace("\\", "/")
    if rel == "index.html" or rel.endswith("/index.html"):
        base = rel[:-len("index.html")]
        base = base.rstrip("/")
        if base == "":
            return "/"
        return "/" + base
    if rel.endswith(".html"):
        return "/" + rel[:-len(".html")]
    return "/" + rel


def parse_html(headless_text):
    data = {
        "html_lang": "",
        "canonical": "",
        "alternates": [],
        "has_og_locale": False,
        "jsonld": [],
        "json_errors": [],
    }

    match = HTML_TAG_RE.search(headless_text)
    if match:
        attrs = extract_attrs(match.group(0))
        data["html_lang"] = attrs.get("lang", "").lower()

    for tag in LINK_TAG_RE.findall(headless_text):
        attrs = extract_attrs(tag)
        rel_val = attrs.get("rel", "").lower()
        rels = set(rel_val.split())
        if "canonical" in rels:
            href = attrs.get("href", "")
            if href:
                data["canonical"] = href
        if "alternate" in rels and "hreflang" in attrs and "href" in attrs:
            data["alternates"].append(
                {"hreflang": attrs.get("hreflang", ""), "href": attrs.get("href", "")}
            )

    for tag in META_TAG_RE.findall(headless_text):
        attrs = extract_attrs(tag)
        if attrs.get("property", "").lower() == "og:locale" and attrs.get("content"):
            data["has_og_locale"] = True

    for idx, match in enumerate(SCRIPT_LD_RE.findall(headless_text), 1):
        payload = match.strip()
        if not payload:
            continue
        try:
            data["jsonld"].append(json.loads(payload))
        except Exception as err:
            data["json_errors"].append(f"script[{idx}]: {str(err)}")

    data["faq_count"] = count_faq_questions(data["jsonld"])
    data["has_article"], data["has_breadcrumb"] = has_required_types(
        data["jsonld"],
        {"article", "breadcrumblist"},
    )

    return data


def read_text(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return handle.read()
    except Exception as err:
        return None


def normalize_type(value):
    if value is None:
        return set()
    if isinstance(value, str):
        return {value.strip().lower()}
    if isinstance(value, (list, tuple)):
        out = set()
        for item in value:
            out |= normalize_type(item)
        return out
    return set()


def collect_faq_nodes(node, out):
    if isinstance(node, list):
        for item in node:
            collect_faq_nodes(item, out)
        return
    if not isinstance(node, dict):
        return

    types = normalize_type(node.get("@type"))
    if "faqpage" in types:
        out.append(node)
        return

    if "@graph" in node:
        collect_faq_nodes(node.get("@graph"), out)
    for value in node.values():
        collect_faq_nodes(value, out)


def count_questions(node):
    if isinstance(node, list):
        total = 0
        for item in node:
            total += count_questions(item)
        return total
    if not isinstance(node, dict):
        return 0

    types = normalize_type(node.get("@type"))
    if "question" in types:
        return 1

    total = 0
    for value in node.values():
        total += count_questions(value)
    return total


def count_faq_questions(blocks):
    faq_nodes = []
    for block in blocks:
        collect_faq_nodes(block, faq_nodes)

    total = 0
    for node in faq_nodes:
        total += count_questions(node.get("mainEntity"))
    return total


def has_required_types(blocks, target_types):
    target_types = {item.lower() for item in target_types}
    found = {"article": False, "breadcrumblist": False}

    def walk(node):
        if isinstance(node, list):
            for item in node:
                walk(item)
            return
        if not isinstance(node, dict):
            return

        for item_type in normalize_type(node.get("@type")):
            if item_type in target_types:
                found[item_type] = True

        for value in node.values():
            walk(value)

    walk(blocks)
    return found["article"], found["breadcrumblist"]


def get_page_cache():
    return {"data": {}, "error": {}, "path_route": {}}


def load_page_meta(cache, path):
    if path in cache["data"]:
        return cache["data"][path], cache["error"].get(path, "")

    if not os.path.isfile(path):
        err = f"missing file: {path}"
        cache["error"][path] = err
        return None, err

    text = read_text(path)
    if text is None:
        err = f"unreadable file: {path}"
        cache["error"][path] = err
        return None, err

    data = parse_html(text)
    cache["path_route"][path] = rel_route_from_file(path)
    cache["data"][path] = data
    return data, ""


def bump(stats, failures, key, ok, ref, detail=""):
    if key not in stats:
        stats[key] = {"pass": 0, "fail": 0}
    if ok:
        stats[key]["pass"] += 1
        return
    stats[key]["fail"] += 1
    if detail:
        failures.append(f"{ref}: {detail}")


def route_for_locale(locale_prefix, lane):
    if locale_prefix:
        return os.path.join(locale_prefix, f"{lane}.html").replace("\\", "/")
    return f"{lane}.html"


def check_lane_pages(stats, failures):
    cache = get_page_cache()
    lane_reference_faq = {}

    for lane in LANES:
        en_page = os.path.join(ROOT_DIR, f"{lane}.html")
        en_path = en_page
        en_meta, en_err = load_page_meta(cache, en_path)

        if en_meta is None:
            bump(stats, failures, "lane_canonical_present", False, en_path, "missing or unreadable file")
            bump(stats, failures, "lane_og_locale_present", False, en_path, en_err)
            bump(stats, failures, "lane_html_lang_correct", False, en_path, en_err)
            bump(stats, failures, "lane_jsonld_parse", False, en_path, en_err)
            bump(stats, failures, "lane_faq_parity", False, en_path, en_err)
            bump(stats, failures, "lane_hreflang_reciprocity", False, en_path, en_err)
            lane_reference_faq[lane] = None
        else:
            lane_reference_faq[lane] = en_meta["faq_count"]
            _check_single_page("en", en_path, en_meta, cache, lane_reference_faq[lane], stats, failures, locale_prefix="")
            for locale_prefix, locale_hreflang in LOCALES[1:]:
                rel = route_for_locale(locale_prefix, lane)
                page_path = os.path.join(ROOT_DIR, rel)
                meta, err = load_page_meta(cache, page_path)
                _check_single_page(
                    locale_hreflang,
                    page_path,
                    meta,
                    cache,
                    lane_reference_faq[lane],
                    stats,
                    failures,
                    locale_prefix=locale_prefix,
                )


def _check_single_page(
    locale_key,
    page_path,
    page_meta,
    cache,
    en_faq_count,
    stats,
    failures,
    locale_prefix,
):
    rel = os.path.relpath(page_path, ROOT_DIR).replace("\\", "/")
    expected_lang = LOCALE_TO_LANG.get(locale_prefix, locale_key).lower()
    if page_meta is None:
        bump(stats, failures, "lane_canonical_present", False, rel, "missing or unreadable file")
        bump(stats, failures, "lane_og_locale_present", False, rel, "missing or unreadable file")
        bump(stats, failures, "lane_html_lang_correct", False, rel, "missing or unreadable file")
        bump(stats, failures, "lane_jsonld_parse", False, rel, "missing or unreadable file")
        bump(stats, failures, "lane_faq_parity", False, rel, "missing or unreadable file")
        bump(stats, failures, "lane_hreflang_reciprocity", False, rel, "missing or unreadable file")
        return

    source_route = normalize_route_for_compare(page_meta.get("canonical", rel_route_from_file(page_path)))
    canonical_present = bool(page_meta.get("canonical"))
    bump(stats, failures, "lane_canonical_present", canonical_present, rel, "missing canonical link")

    og_ok = bool(page_meta.get("has_og_locale"))
    bump(stats, failures, "lane_og_locale_present", og_ok, rel, "missing og:locale meta")

    html_lang = (page_meta.get("html_lang") or "").lower()
    lang_ok = html_lang == expected_lang
    bump(stats, failures, "lane_html_lang_correct", lang_ok, rel, f'html lang "{html_lang}" != "{expected_lang}"')

    json_ok = len(page_meta.get("json_errors", [])) == 0
    if json_ok:
        bump(stats, failures, "lane_jsonld_parse", True, rel)
    else:
        errors = "; ".join(page_meta["json_errors"][:2])
        bump(stats, failures, "lane_jsonld_parse", False, rel, f"invalid JSON-LD: {errors}")

    parity_ok = en_faq_count is not None and page_meta.get("faq_count", 0) == en_faq_count
    if parity_ok:
        bump(stats, failures, "lane_faq_parity", True, rel)
    elif en_faq_count is None:
        bump(stats, failures, "lane_faq_parity", False, rel, "cannot compute EN FAQ count")
    else:
        bump(
            stats,
            failures,
            "lane_faq_parity",
            False,
            rel,
            f"FAQ count {page_meta.get('faq_count', 0)} != EN {en_faq_count}",
        )

    _check_hreflang_reciprocity(stats, failures, rel, locale_key, source_route, page_meta, cache)


def _check_hreflang_reciprocity(stats, failures, rel, locale_code, source_route, page_meta, cache):
    alternates = page_meta.get("alternates", [])
    if not alternates:
        bump(stats, failures, "lane_hreflang_reciprocity", False, rel, "no alternate links")
        return

    all_ok = True
    for alt in alternates:
        alt_lang = (alt.get("hreflang") or "").strip()
        alt_url = alt.get("href", "").strip()
        if not alt_url:
            all_ok = False
            continue
        target_path = resolve_route_to_file(alt_url)
        if not target_path:
            all_ok = False
            failures.append(f"{rel}: alternate {alt_lang} does not resolve on disk: {alt_url}")
            continue

        target_meta, _ = load_page_meta(cache, target_path)
        if target_meta is None:
            all_ok = False
            failures.append(f"{rel}: alternate {alt_lang} target unreadable: {alt_url}")
            continue

        back_ok = False
        expected_back = source_route
        for target_alt in target_meta.get("alternates", []):
            if (target_alt.get("hreflang") or "").strip().lower() != locale_code.lower():
                continue
            target_back = normalize_route_for_compare(target_alt.get("href"))
            if target_back == expected_back:
                back_ok = True
                break

        if not back_ok:
            all_ok = False
            failures.append(
                f"{rel}: alternate {alt_lang} on-page not returned from {target_path} to {expected_back}"
            )

    bump(stats, failures, "lane_hreflang_reciprocity", all_ok, rel, "" if all_ok else "one or more alternates not reciprocal")


def check_blog_pages(stats, failures):
    blog_files = sorted(glob.glob(os.path.join(ROOT_DIR, "blog", "*.html")))
    for path in blog_files:
        rel = os.path.relpath(path, ROOT_DIR).replace("\\", "/")
        meta, err = load_page_meta(get_blog_cache, path)
        if meta is None:
            bump(stats, failures, "blog_jsonld_parse", False, rel, err)
            bump(stats, failures, "blog_schema_types", False, rel, err)
            continue

        json_ok = len(meta.get("json_errors", [])) == 0
        if json_ok:
            bump(stats, failures, "blog_jsonld_parse", True, rel)
        else:
            errs = "; ".join(meta["json_errors"][:2])
            bump(stats, failures, "blog_jsonld_parse", False, rel, f"invalid JSON-LD: {errs}")

        schema_ok = bool(meta.get("has_article")) and bool(meta.get("has_breadcrumb"))
        bump(stats, failures, "blog_schema_types", schema_ok, rel, "missing Article or BreadcrumbList in JSON-LD")


def check_sitemap(stats, failures):
    sitemap_path = os.path.join(ROOT_DIR, "sitemap.xml")
    if not os.path.isfile(sitemap_path):
        bump(stats, failures, "sitemap_loc_resolves", False, "sitemap.xml", "missing sitemap.xml")
        return {"routes": set(), "missing_files": []}

    try:
        xml_text = read_text(sitemap_path) or ""
        import re
        locs = [m.strip() for m in re.findall(r"<loc[^>]*>(.*?)</loc>", xml_text, re.IGNORECASE) if m.strip()]
    except Exception as err:
        bump(stats, failures, "sitemap_loc_resolves", False, "sitemap.xml", f"XML parse error: {err}")
        return {"routes": set(), "missing_files": []}

    sitemap_routes = set()
    processed_locs = 0

    for loc in locs:
        route = normalize_route_for_compare(loc)
        if route in ("",):
            continue
        sitemap_routes.add(route)
        if resolve_route_to_file(route):
            bump(stats, failures, "sitemap_loc_resolves", True, f"sitemap <loc> {loc}")
        else:
            fail_ref = f"sitemap <loc> {loc}"
            bump(stats, failures, "sitemap_loc_resolves", False, fail_ref, f"does not resolve: {loc}")

    missing_files = find_html_not_in_sitemap(sitemap_routes)
    return {"routes": sitemap_routes, "missing_files": sorted(missing_files), "count": len(missing_files)}


def find_html_not_in_sitemap(sitemap_routes):
    on_disk = []
    for path in glob.glob(os.path.join(ROOT_DIR, "**", "*.html"), recursive=True):
        if "/.git/" in path or "/_design_notes/" in path:
            continue
        rel = os.path.relpath(path, ROOT_DIR).replace("\\", "/")
        route = rel_route_from_file(path)
        if route:
            route_cmp = normalize_route_for_compare(route)
            if route_cmp not in sitemap_routes:
                on_disk.append(rel)
    return on_disk


def print_summary(stats, failures, blog_count, missing_pages):
    print("GEO/structured-data validation summary")
    print("-" * 44)
    print(f"Root: {ROOT_DIR}")
    print("")
    print(f"Lane pages checked: {len(LANES) * len(LOCALES)} (6 lanes × en + zh + zht + pt)")
    print(f"Blog pages checked: {blog_count}")
    print("")

    for key in CHECK_KEYS:
        data = stats.get(key, {"pass": 0, "fail": 0})
        print(f"{key}: PASS {data['pass']} | FAIL {data['fail']}")

    print(f"Pages on disk not in sitemap: {len(missing_pages)}")
    if missing_pages:
        for page in missing_pages:
            print(f"  - {page}")

    if failures:
        print("")
        print("Failures:")
        for item in sorted(failures):
            print(f"  - {item}")


get_blog_cache = get_page_cache()


if __name__ == "__main__":
    stats = {key: {"pass": 0, "fail": 0} for key in CHECK_KEYS}
    failures = []

    check_lane_pages(stats, failures)

    check_blog_pages(stats, failures)
    blog_count = len(glob.glob(os.path.join(ROOT_DIR, "blog", "*.html")))

    sitemap_result = check_sitemap(stats, failures)

    missing_pages = sitemap_result.get("missing_files", [])

    print_summary(stats, failures, blog_count, missing_pages)
