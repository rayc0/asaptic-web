#!/usr/bin/env python3
"""
qc.py — asaptic-web-theme static QC checker (stdlib only).

Walks every .html file under the worktree (excluding node_modules, _qc,
.qc-tmp, _design_previews*, test, tests) and checks a fixed set of HARD
(fail-the-build) rules and SOFT (report-only) rules described in the
theme-unification build brief.

Usage:
    python3 _shell/qc.py                     # full repo, markdown report to stdout
    python3 _shell/qc.py --family blog/       # only files under blog/
    python3 _shell/qc.py --json out.json      # also dump raw JSON results
    python3 _shell/qc.py --root /path/to/repo # override worktree root (default: repo root above _shell/)

Exit code: 1 if any HARD failure class is non-empty, else 0.

Baseline file: _shell/qc_baseline.json (created on first run if missing).
Stores per-file tender "tw-*" span counts and the noindex file set, so
later runs can detect *regressions* in check 7 (baker spans) and check 9
(noindex set) rather than just re-reporting the same pre-existing state
every time. All other checks are evaluated fresh each run (they are
either objectively pass/fail per file, or SOFT/INFO census data).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from html.parser import HTMLParser
from pathlib import Path

VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
}

EXCLUDE_DIR_NAMES = {
    "node_modules", "_qc", ".qc-tmp", "test", "tests", ".git", ".wrangler", "_shell", "assets",
}
EXCLUDE_DIR_PREFIXES = ("_design_previews",)

LOCALE_DIRS = {"zh": "zh-Hans", "zht": "zh-Hant", "pt": "pt-PT"}
# directory-prefix -> expected hreflang code (en has no prefix)
DIR_TO_HREFLANG = {"": "en", "zh": "zh-Hans", "zht": "zh-Hant", "pt": "pt-PT"}
HREFLANG_TO_DIR = {v: k for k, v in DIR_TO_HREFLANG.items()}
REQUIRED_HREFLANGS = {"en", "zh-Hans", "zh-Hant", "pt-PT", "x-default"}

VALID_HTML_LANGS = {"en", "zh-Hans", "zh-Hant", "pt", "zh-CN", "zh-HK"}

TENDER_MARKERS = [
    "TENDER_ROWS_START", "TENDER_ROWS_END",
    "ROWS_JSONLD_START", "ROWS_JSONLD_END",
]
TENDER_MARKER_FILES = ["tender/index.html", "zh/tender/index.html", "zht/tender/index.html"]
TENDER_SPAN_FILES = ["tender/mo/index.html", "tender/sg/index.html", "tender/gb/index.html", "tender/au/index.html"]

STATIC_NOINDEX_DIR_PREFIXES = ("demo/", "demos/", "scout/", "assets/")

HREF_SRC_RE = re.compile(r'''(?:href|src|action)\s*=\s*(["'])(.*?)\1''', re.IGNORECASE | re.DOTALL)
SENTINEL_RE = re.compile(r"<!--\s*ASAPTIC:(HEADER|FOOTER):(START|END)\s*-->")


def is_external_or_skippable(href: str) -> bool:
    href = href.strip()
    if not href:
        return True
    low = href.lower()
    if low.startswith(("http://", "https://", "//", "mailto:", "tel:", "#", "data:", "javascript:", "sms:", "whatsapp:", "intent:")):
        return True
    return False


class PageParser(HTMLParser):
    """Single-pass stack-aware HTML parser collecting everything qc.py needs."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []  # list of (tag, attrs_dict)
        self.navs = []  # {attrs, ancestors, nested_in_nav}
        self.footers = []  # {attrs, ancestors, in_main}
        self.html_attrs = None
        self.title_text = None
        self._in_title = False
        self._title_buf = []
        self.canonical_hrefs = []
        self.alternate_links = []  # (hreflang, href)
        self.robots_content = []
        self.scripts = []  # {attrs, ancestors, content}
        self._in_script = False

    def handle_starttag(self, tag, attrs):
        self._open(tag, attrs)
        if tag not in VOID_TAGS:
            self.stack.append((tag, dict(attrs)))

    def handle_startendtag(self, tag, attrs):
        self._open(tag, attrs)
        # self-closed: never pushed, nothing to pop

    def _open(self, tag, attrs):
        attrs_d = dict(attrs)
        ancestors = [t for t, _ in self.stack]
        if tag == "nav":
            self.navs.append({
                "attrs": attrs_d,
                "ancestors": ancestors[:],
                "nested_in_nav": "nav" in ancestors,
            })
        elif tag == "footer":
            self.footers.append({
                "attrs": attrs_d,
                "ancestors": ancestors[:],
                "in_main": "main" in ancestors,
            })
        elif tag == "html":
            self.html_attrs = attrs_d
        elif tag == "title":
            self._in_title = True
            self._title_buf = []
        elif tag == "link":
            rel = (attrs_d.get("rel") or "").strip().lower()
            if rel == "canonical":
                self.canonical_hrefs.append(attrs_d.get("href", ""))
            elif rel == "alternate" and attrs_d.get("hreflang"):
                self.alternate_links.append((attrs_d.get("hreflang"), attrs_d.get("href", "")))
        elif tag == "meta":
            if (attrs_d.get("name") or "").strip().lower() == "robots":
                self.robots_content.append(attrs_d.get("content", ""))
        elif tag == "script":
            self.scripts.append({"attrs": attrs_d, "ancestors": ancestors[:], "content": ""})
            self._in_script = True

    def handle_endtag(self, tag):
        if tag == "title" and self._in_title:
            self.title_text = "".join(self._title_buf).strip()
            self._in_title = False
        if tag == "script":
            self._in_script = False
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        if self._in_title:
            self._title_buf.append(data)
        if self._in_script and self.scripts:
            self.scripts[-1]["content"] += data


def parse_file(path: Path, text: str) -> PageParser:
    p = PageParser()
    try:
        p.feed(text)
        p.close()
    except Exception:
        pass
    return p


def rel(root: Path, path: Path) -> str:
    return str(path.relative_to(root))


def collect_html_files(root: Path, family: str | None) -> list[Path]:
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [
            d for d in dirnames
            if d not in EXCLUDE_DIR_NAMES and not any(d.startswith(p) for p in EXCLUDE_DIR_PREFIXES)
        ]
        for fn in filenames:
            if fn.endswith(".html") and not fn.startswith("_TEMPLATE"):
                p = Path(dirpath) / fn
                out.append(p)
    out.sort()
    if family:
        fam = family.strip("/")
        out = [p for p in out if rel(root, p).startswith(fam + "/") or rel(root, p) == fam]
    return out


def locale_of(relpath: str) -> str:
    parts = relpath.split("/")
    if parts[0] in LOCALE_DIRS:
        return parts[0]
    return ""  # en (default/root)


def parse_redirects(root: Path) -> list[tuple[str, str, str]]:
    """Return list of (source_pattern_regex_str, source_raw, dest) from _redirects."""
    rules = []
    rf = root / "_redirects"
    if not rf.exists():
        return rules
    for line in rf.read_text(errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        src, dst = parts[0], parts[1]
        pattern = re.escape(src).replace(re.escape("*"), ".*")
        rules.append((pattern, src, dst))
    return rules


def href_is_redirected(href: str, redirects: list[tuple[str, str, str]]) -> bool:
    # Build both a path-only and a full https://asaptic.com/<path> form to test
    # against redirect sources (which in this repo are full absolute URLs).
    candidates = {href}
    if href.startswith("/"):
        candidates.add("https://asaptic.com" + href)
        candidates.add("https://www.asaptic.com" + href)
    for pattern, _src, _dst in redirects:
        rx = re.compile("^" + pattern + "$")
        for c in candidates:
            if rx.match(c):
                return True
    return False


def resolve_link_target(root: Path, file_dir: Path, href_path: str) -> bool:
    """Return True if href_path (no query/fragment) resolves to a real file."""
    if href_path.startswith("/"):
        rel_path = href_path.lstrip("/")
        base = root
    else:
        rel_path = href_path
        base = file_dir

    if rel_path == "":
        target = base / "index.html"
        return target.is_file()

    raw_target = (base / rel_path)
    try:
        norm = os.path.normpath(str(raw_target))
    except Exception:
        return False
    norm_path = Path(norm)

    # must stay within root
    try:
        norm_path.relative_to(root)
    except ValueError:
        return False

    if str(norm_path) == str(root):
        return (root / "index.html").is_file()

    candidates = []
    if href_path.endswith("/"):
        candidates.append(norm_path / "index.html")
    else:
        candidates.append(norm_path)
        if norm_path.is_dir():
            candidates.append(norm_path / "index.html")
        if not norm_path.name.endswith(".html"):
            candidates.append(Path(str(norm_path) + ".html"))
            candidates.append(norm_path / "index.html")

    for c in candidates:
        if c.is_file():
            return True
    return False


def qualifying_navs(navs: list[dict]) -> tuple[list[dict], list[dict]]:
    """Split navs into (counted, info_only). Counted = top-level (not nested
    in another nav), excluding crumbs/tw-langs/rb-langs decorative navs."""
    counted, info = [], []
    for n in navs:
        cls = (n["attrs"].get("class") or "")
        is_decorative = any(tok in cls for tok in ("crumbs", "sublinks", "tw-langs", "rb-langs", "related-lanes", "cf-stepper"))
        if n["nested_in_nav"]:
            continue  # nested navs never counted, not reported separately (rare/malformed)
        if is_decorative:
            info.append(n)
        else:
            counted.append(n)
    return counted, info


def top_level_footers(footers: list[dict]) -> list[dict]:
    return [f for f in footers if not f["in_main"]]


def check_sentinels(text: str) -> dict:
    issues = []
    for kind in ("HEADER", "FOOTER"):
        starts = [m for m in SENTINEL_RE.finditer(text) if m.group(1) == kind and m.group(2) == "START"]
        ends = [m for m in SENTINEL_RE.finditer(text) if m.group(1) == kind and m.group(2) == "END"]
        if len(starts) == 0 and len(ends) == 0:
            continue  # sentinel not used on this page at all — not an error
        if len(starts) != 1 or len(ends) != 1:
            issues.append(f"{kind}: {len(starts)} START / {len(ends)} END (expected 0-or-1 each, matched)")
            continue
        s_pos, e_pos = starts[0].start(), ends[0].start()
        if e_pos < s_pos:
            issues.append(f"{kind}: END before START")
        # nested sentinel of same kind between start/end already excluded by count==1 check
    return {"ok": len(issues) == 0, "issues": issues}


def canonical_path_for(relpath: str) -> str:
    """Expected canonical URL path (no domain) for a given relpath, per the
    directory-prefix locale scheme with index.html <-> trailing slash."""
    if relpath == "index.html":
        return "/"
    if relpath.endswith("/index.html"):
        d = relpath[: -len("index.html")]
        return "/" + d
    if relpath.endswith(".html"):
        return "/" + relpath[: -len(".html")]
    return "/" + relpath


def expected_hreflang_dir(relpath: str) -> str:
    parts = relpath.split("/")
    if parts[0] in LOCALE_DIRS:
        return parts[0] + "/" + "/".join(parts[1:])
    return "/".join(parts)


def locale_prefix_and_key(relpath: str) -> tuple[str, str]:
    """Split relpath into (locale_dir_prefix, page_key) where page_key is the
    path with any leading zh/zht/pt/ stripped, e.g. 'zh/blog/x.html' -> ('zh','blog/x.html')."""
    parts = relpath.split("/", 1)
    if parts[0] in LOCALE_DIRS and len(parts) > 1:
        return parts[0], parts[1]
    return "", relpath


# <html lang> as written on the page -> the hreflang vocabulary above.
HTML_LANG_TO_HREFLANG = {
    "en": "en", "en-us": "en", "en-gb": "en", "en-hk": "en",
    "zh": "zh-Hans", "zh-cn": "zh-Hans", "zh-hans": "zh-Hans", "zh-sg": "zh-Hans",
    "zh-hant": "zh-Hant", "zh-hk": "zh-Hant", "zh-tw": "zh-Hant", "zh-mo": "zh-Hant",
    "pt": "pt-PT", "pt-pt": "pt-PT", "pt-br": "pt-PT",
}


def self_hreflang(parser) -> str:
    """The hreflang a page is entitled to declare about ITSELF.

    A page's language is what <html lang> says, not which folder it sits in.
    changelog/, demos/ and proof/ live at the site root -- so the folder says
    "en" -- but their bodies are Chinese, and declaring hreflang="en" over
    Chinese text is a false signal.  Used only to exempt a self-reference on a
    page that has no locale mirrors; it never makes a page fail.
    """
    attrs = getattr(parser, "html_attrs", None) or {}
    tag = (attrs.get("lang") or "").strip().lower()
    if not tag:
        return ""
    return HTML_LANG_TO_HREFLANG.get(tag, HTML_LANG_TO_HREFLANG.get(tag.split("-")[0], ""))


def existing_locale_mirrors(root: Path, relpath: str) -> dict:
    """Return {hreflang_code: mirror_relpath} for every locale mirror of this
    page that actually exists on disk (including the page itself)."""
    _prefix, key = locale_prefix_and_key(relpath)
    out = {}
    for p, code in DIR_TO_HREFLANG.items():
        mirror_rel = (p + "/" + key) if p else key
        if (root / mirror_rel).is_file():
            out[code] = mirror_rel
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--family", default=None, help="only check files under this subpath, e.g. blog/")
    ap.add_argument("--json", default=None, help="also write raw JSON results to this path")
    ap.add_argument("--root", default=None, help="worktree root (default: parent of _shell/)")
    ap.add_argument("--baseline", default=None, help="path to qc_baseline.json (default: _shell/qc_baseline.json)")
    ap.add_argument("--write-baseline", action="store_true", help="force (re)write the baseline file from this run")
    ap.add_argument("--quiet-progress", action="store_true")
    args = ap.parse_args()

    shell_dir = Path(__file__).resolve().parent
    root = Path(args.root).resolve() if args.root else shell_dir.parent
    baseline_path = Path(args.baseline) if args.baseline else (shell_dir / "qc_baseline.json")

    t0 = time.time()
    files = collect_html_files(root, args.family)
    redirects = parse_redirects(root)

    baseline_exists = baseline_path.is_file()
    baseline = {}
    if baseline_exists and not args.write_baseline:
        try:
            baseline = json.loads(baseline_path.read_text())
        except Exception:
            baseline = {}

    results = {
        "broken_links": [],           # (file, href, resolved_hint)
        "nav_count_bad": [],          # (file, count)
        "footer_count_bad": [],       # (file, count)
        "sentinel_issues": [],        # (file, [issues])
        "canonical_issues": [],       # (file, reason)
        "hreflang_issues": [],        # (file, reason)
        "baker_marker_issues": [],    # (file, reason)
        "baker_span_regressions": [], # (file, reason)
        "proof_lab_inline_script": [],# (file, reason)
        "noindex_regressions": [],    # (file, reason)  -- lost noindex vs baseline
        # SOFT / INFO
        "stylesheet_census": {},
        "no_stylesheet": [],
        "footer_class_census": {},
        "nav_class_census": {},
        "decorative_nav_info": [],    # (file, class)
        "lang_mismatch": [],          # (file, lang, expected)
        "dup_titles": {},             # locale -> {title: [files]}
        "files_checked": 0,
        "unreadable_files": [],       # (file, error) -- e.g. transient OneDrive sync races; not a HARD class
    }

    tender_span_counts = {}  # relpath -> count (this run)
    noindex_files_now = set()
    scanned_relpaths = set()
    lang_files = {}  # locale -> {title: [files]}

    for path in files:
        relpath = rel(root, path)
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except Exception as e:
            # Usually a transient sync race (e.g. OneDrive) between the directory
            # walk and the read, not a real broken-link finding -- keep separate.
            results["unreadable_files"].append((relpath, str(e)))
            continue

        results["files_checked"] += 1
        scanned_relpaths.add(relpath)
        parser = parse_file(path, text)
        file_dir = path.parent

        # --- HARD 1: internal link check ---
        for m in HREF_SRC_RE.finditer(text):
            href = m.group(2).strip()
            if is_external_or_skippable(href):
                continue
            href_path = href.split("#", 1)[0].split("?", 1)[0]
            if href_path == "":
                continue
            if resolve_link_target(root, file_dir, href_path):
                continue
            if href_is_redirected(href_path, redirects):
                continue
            results["broken_links"].append((relpath, href, ""))

        # --- HARD 2: nav count ---
        counted_navs, decorative_navs = qualifying_navs(parser.navs)
        if len(counted_navs) != 1:
            results["nav_count_bad"].append((relpath, len(counted_navs)))
        for n in decorative_navs:
            results["decorative_nav_info"].append((relpath, n["attrs"].get("class", "")))

        # census of ALL nav classes (soft #11)
        for n in parser.navs:
            cls = n["attrs"].get("class", "") or "(no class)"
            results["nav_class_census"][cls] = results["nav_class_census"].get(cls, 0) + 1

        # --- HARD 3: footer count ---
        tl_footers = top_level_footers(parser.footers)
        if len(tl_footers) != 1:
            results["footer_count_bad"].append((relpath, len(tl_footers)))
        for f in parser.footers:
            cls = f["attrs"].get("class", "") or "(no class)"
            results["footer_class_census"][cls] = results["footer_class_census"].get(cls, 0) + 1

        # --- HARD 4: sentinel integrity ---
        sres = check_sentinels(text)
        if not sres["ok"]:
            results["sentinel_issues"].append((relpath, sres["issues"]))

        # --- robots / noindex detection (used by canonical skip + check 9) ---
        robots_all = " ".join(parser.robots_content).lower()
        is_noindex = "noindex" in robots_all
        if is_noindex:
            noindex_files_now.add(relpath)

        # --- HARD 5: canonical ---
        if not is_noindex:
            n_can = len(parser.canonical_hrefs)
            if n_can == 0:
                results["canonical_issues"].append((relpath, "missing canonical"))
            elif n_can > 1:
                results["canonical_issues"].append((relpath, f"{n_can} canonical tags"))
            else:
                href = parser.canonical_hrefs[0]
                if not href.startswith("https://asaptic.com/") and href != "https://asaptic.com":
                    results["canonical_issues"].append((relpath, f"not absolute https://asaptic.com/...: {href!r}"))
                else:
                    expected_path = canonical_path_for(relpath)
                    got_path = href[len("https://asaptic.com"):] or "/"
                    if got_path != expected_path:
                        results["canonical_issues"].append(
                            (relpath, f"canonical {href!r} (path {got_path!r}) != expected {expected_path!r}")
                        )

        # --- HARD 6: hreflang ---
        # "every EXISTING locale mirror of this page is declared" -- so first
        # find which locale mirrors actually exist on disk for this page.
        mirrors = existing_locale_mirrors(root, relpath)
        declared = {}
        for code, href in parser.alternate_links:
            declared.setdefault(code, []).append(href)
        declared_codes = set(declared.keys())

        missing_target = []
        for code, hrefs in declared.items():
            for href in hrefs:
                if href.startswith("https://asaptic.com/"):
                    p = href[len("https://asaptic.com/"):]
                    ok = resolve_link_target(root, root, p if (p.endswith("/") or p == "") else p)
                    if not ok:
                        missing_target.append(f"{code} -> {href}")
                else:
                    missing_target.append(f"{code} -> {href} (not absolute asaptic.com URL)")

        reasons = []
        if missing_target:
            reasons.append("broken target: " + "; ".join(missing_target[:3]))

        if len(mirrors) >= 2:
            # a real locale cluster exists for this page -> hreflang is required
            required_codes = set(mirrors.keys()) | {"x-default"}
            missing_codes = required_codes - declared_codes
            extra_codes = declared_codes - required_codes
            if missing_codes:
                reasons.append("missing hreflang(s): " + ",".join(sorted(missing_codes)))
            if extra_codes:
                reasons.append("unexpected hreflang(s): " + ",".join(sorted(extra_codes)))
        elif declared_codes:
            # no sibling locale mirrors exist, but page declares hreflang anyway --
            # only flag codes that don't correspond to any real mirror (extras),
            # broken-target already covers the rest.
            extra_codes = declared_codes - set(mirrors.keys()) - {"x-default"}
            # ...except the page's own language.  A single-locale page's
            # self-referencing alternate must carry the language the page is
            # actually written in (see self_hreflang), which for changelog/,
            # demos/ and proof/ is Chinese even though they sit at the root.
            own = self_hreflang(parser)
            if own and own in extra_codes:
                self_url = "https://asaptic.com" + canonical_path_for(relpath)
                if any(h.rstrip("/") == self_url.rstrip("/") for h in declared.get(own, [])):
                    extra_codes = extra_codes - {own}
            if extra_codes:
                reasons.append("hreflang declared with no matching locale mirror: " + ",".join(sorted(extra_codes)))

        if reasons:
            results["hreflang_issues"].append((relpath, "; ".join(reasons)))

        # --- HARD 7: baker markers + tw- spans ---
        if relpath in TENDER_MARKER_FILES:
            reasons = []
            for marker in TENDER_MARKERS:
                c = text.count(marker)
                if c != 1:
                    reasons.append(f"{marker}: {c}")
            if reasons:
                results["baker_marker_issues"].append((relpath, "; ".join(reasons)))
        if relpath in TENDER_SPAN_FILES:
            spans = set(re.findall(r'id="(tw-[a-zA-Z0-9_-]*)"', text))
            tender_span_counts[relpath] = len(spans)

        # --- HARD 8: proof-lab inline script (CSP) ---
        if relpath == "demo/proof-lab/index.html":
            inline = [s for s in parser.scripts if not s["attrs"].get("src") and s["content"].strip()]
            if inline:
                results["proof_lab_inline_script"].append((relpath, f"{len(inline)} inline <script> block(s)"))

        # --- SOFT 10: stylesheet census ---
        css_hits = re.findall(r'(?:style\.css\?v=[A-Za-z0-9]+|/assets/v2/shell\.css\?v=[A-Za-z0-9]+)', text)
        if css_hits:
            for h in css_hits:
                results["stylesheet_census"][h] = results["stylesheet_census"].get(h, 0) + 1
        else:
            results["no_stylesheet"].append(relpath)

        # --- SOFT 12: html lang ---
        if parser.html_attrs is not None:
            lang = parser.html_attrs.get("lang", "")
            loc = locale_of(relpath)
            expected = DIR_TO_HREFLANG.get(loc, "en")
            expected_short = {"en": "en", "zh-Hans": {"zh-Hans", "zh-CN"}, "zh-Hant": {"zh-Hant", "zh-HK"}, "pt-PT": {"pt"}}
            ok_set = expected_short.get(expected, {expected})
            if isinstance(ok_set, str):
                ok_set = {ok_set}
            if lang not in VALID_HTML_LANGS:
                results["lang_mismatch"].append((relpath, lang, f"invalid lang value (loc={loc or 'en'})"))
            elif lang not in ok_set:
                results["lang_mismatch"].append((relpath, lang, f"expected one of {sorted(ok_set)} for loc={loc or 'en'}"))

        # --- SOFT 13: duplicate titles within locale ---
        loc = locale_of(relpath)
        if parser.title_text:
            lang_files.setdefault(loc, {}).setdefault(parser.title_text, []).append(relpath)

        if not args.quiet_progress and results["files_checked"] % 1000 == 0:
            print(f"... {results['files_checked']} files", file=sys.stderr)

    # --- HARD 7b: baker span regression vs baseline ---
    baseline_spans = baseline.get("tender_spans", {})
    if baseline_spans:
        for relpath, count in tender_span_counts.items():
            base_count = baseline_spans.get(relpath)
            if base_count is not None and count < base_count:
                results["baker_span_regressions"].append(
                    (relpath, f"tw-* span count dropped {base_count} -> {count}")
                )

    # --- HARD 9: noindex regression vs baseline ---
    # Only compare baseline entries that were actually in scope for this run
    # (matters for --family filtering: don't report files outside scope as
    # "regressions" just because they weren't scanned this time).
    baseline_noindex = set(baseline.get("noindex_files", [])) & scanned_relpaths
    if baseline_noindex:
        lost = sorted(baseline_noindex - noindex_files_now)
        for relpath in lost:
            results["noindex_regressions"].append((relpath, "lost noindex (present in baseline, missing now)"))

    # dup titles: only report duplicates (same title, >=2 files) within same locale
    dup_titles_out = {}
    for loc, titles in lang_files.items():
        dups = {t: fs for t, fs in titles.items() if len(fs) >= 2}
        if dups:
            # top 10 by count
            top = sorted(dups.items(), key=lambda kv: -len(kv[1]))[:10]
            dup_titles_out[loc or "en"] = [{"title": t, "count": len(fs), "files": fs[:5]} for t, fs in top]
    results["dup_titles"] = dup_titles_out

    elapsed = time.time() - t0

    # --- write/refresh baseline if missing or forced ---
    if not baseline_exists or args.write_baseline:
        new_baseline = {
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "tender_spans": tender_span_counts,
            "noindex_files": sorted(noindex_files_now),
        }
        baseline_path.write_text(json.dumps(new_baseline, indent=2, ensure_ascii=False) + "\n")

    hard_classes = [
        "broken_links", "nav_count_bad", "footer_count_bad", "sentinel_issues",
        "canonical_issues", "hreflang_issues", "baker_marker_issues",
        "baker_span_regressions", "proof_lab_inline_script", "noindex_regressions",
    ]
    hard_fail = any(results[k] for k in hard_classes)

    # ---- render markdown report ----
    lines = []
    lines.append(f"# QC report — {time.strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("")
    lines.append(f"- Root: `{root}`")
    if args.family:
        lines.append(f"- Family filter: `{args.family}`")
    lines.append(f"- Files checked: {results['files_checked']}")
    lines.append(f"- Elapsed: {elapsed:.2f}s")
    lines.append(f"- Baseline file: `{baseline_path}` ({'existed' if baseline_exists and not args.write_baseline else 'written this run'})")
    lines.append(f"- Overall: {'**FAIL**' if hard_fail else '**PASS**'}")
    if results["unreadable_files"]:
        lines.append(
            f"- ⚠️ {len(results['unreadable_files'])} file(s) listed by the directory walk but unreadable "
            f"at scan time (likely a transient sync race, e.g. OneDrive) — not counted as a HARD failure: "
            + ", ".join(f"`{f}`" for f, _ in results["unreadable_files"][:5])
        )
    lines.append("")
    lines.append("## HARD failure summary")
    lines.append("")
    lines.append("| # | Check | Count |")
    lines.append("|---|---|---|")
    labels = [
        ("1", "broken_links", "Broken internal links"),
        ("2", "nav_count_bad", "Bad top-level <nav> count (!=1)"),
        ("3", "footer_count_bad", "Bad top-level <footer> count (!=1)"),
        ("4", "sentinel_issues", "Sentinel integrity issues"),
        ("5", "canonical_issues", "Canonical tag issues"),
        ("6", "hreflang_issues", "hreflang issues"),
        ("7a", "baker_marker_issues", "Tender baker marker issues"),
        ("7b", "baker_span_regressions", "Tender tw-* span regressions"),
        ("8", "proof_lab_inline_script", "proof-lab inline <script> (CSP)"),
        ("9", "noindex_regressions", "noindex regressions vs baseline"),
    ]
    for n, key, label in labels:
        lines.append(f"| {n} | {label} | {len(results[key])} |")
    lines.append("")

    def examples(key, n=5, fmt=None):
        items = results[key][:n]
        out = []
        for it in items:
            out.append(fmt(it) if fmt else str(it))
        return out

    for n, key, label in labels:
        items = results[key]
        if not items:
            continue
        lines.append(f"### {n}. {label} ({len(items)})")
        for it in items[:5]:
            if key in ("nav_count_bad", "footer_count_bad"):
                lines.append(f"- `{it[0]}` — count={it[1]}")
            elif key == "sentinel_issues":
                lines.append(f"- `{it[0]}` — {'; '.join(it[1])}")
            elif key == "broken_links":
                lines.append(f"- `{it[0]}` — href=`{it[1]}`")
            else:
                lines.append(f"- `{it[0]}` — {it[1]}")
        lines.append("")

    lines.append("## SOFT / census (report only)")
    lines.append("")
    lines.append("### 10. Stylesheet census (top 15)")
    for k, v in sorted(results["stylesheet_census"].items(), key=lambda kv: -kv[1])[:15]:
        lines.append(f"- `{k}`: {v}")
    lines.append(f"- Pages loading neither pattern: {len(results['no_stylesheet'])} (examples: {results['no_stylesheet'][:5]})")
    lines.append("")
    lines.append("### 11. Footer class census (top 15)")
    for k, v in sorted(results["footer_class_census"].items(), key=lambda kv: -kv[1])[:15]:
        lines.append(f"- `{k}`: {v}")
    lines.append("")
    lines.append("### 11. Nav class census (top 15)")
    for k, v in sorted(results["nav_class_census"].items(), key=lambda kv: -kv[1])[:15]:
        lines.append(f"- `{k}`: {v}")
    lines.append(f"- Decorative navs (crumbs/tw-langs/rb-langs) seen on {len(results['decorative_nav_info'])} occurrences (INFO only, not counted toward check 2)")
    lines.append("")
    lines.append(f"### 12. html lang mismatches ({len(results['lang_mismatch'])})")
    for it in results["lang_mismatch"][:10]:
        lines.append(f"- `{it[0]}` — lang=`{it[1]}` — {it[2]}")
    lines.append("")
    lines.append("### 13. Duplicate titles within locale (top 10 per locale)")
    for loc, dups in results["dup_titles"].items():
        lines.append(f"- locale `{loc}`:")
        for d in dups:
            lines.append(f"  - \"{d['title']}\" x{d['count']}: {d['files']}")
    lines.append("")

    report_md = "\n".join(lines)
    print(report_md)

    if args.json:
        with open(args.json, "w") as f:
            json.dump({"results": results, "elapsed": elapsed, "root": str(root), "hard_fail": hard_fail}, f, indent=2, ensure_ascii=False, default=list)

    sys.exit(1 if hard_fail else 0)


if __name__ == "__main__":
    main()
