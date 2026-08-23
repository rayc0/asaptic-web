#!/usr/bin/env python3
"""apply_shell.py — deterministic, idempotent, sentinel-based v2 shell injector.

Migrates old-theme asaptic.com static pages onto the v2 shell
(header.shell > .row > .brand/.nav/.lang/.engage, footer.foot > .row > .brandcol/.col + .legal).

Design rules
------------
* Stdlib only.
* REFUSE rather than guess. A refusal is a report row, never a mangled page.
* Sentinel-delimited: <!-- ASAPTIC:HEAD|HEADER|FOOTER:START --> ... :END -->.
  On re-run only the region BETWEEN sentinels is replaced, so the tool is idempotent
  and a second pass over its own output is byte-identical (verified per file).
* Never touches <title>, <meta name=description>, og:*, or JSON-LD.
* --dry-run is the default. --write is opt-in and still honours the exclude list.

Usage
-----
  python3 _shell/apply_shell.py --dry-run
  python3 _shell/apply_shell.py --dry-run --family blog --limit 20
  python3 _shell/apply_shell.py --render blog/attestation-gap.html
  python3 _shell/apply_shell.py --write --family blog
"""

import argparse
import fnmatch
import json
import os
import re
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_ROOT = os.path.dirname(HERE)

LOCALES = ("en", "zh", "zht", "pt")

SENT = {
    "head": ("<!-- ASAPTIC:HEAD:START -->", "<!-- ASAPTIC:HEAD:END -->"),
    "header": ("<!-- ASAPTIC:HEADER:START -->", "<!-- ASAPTIC:HEADER:END -->"),
    "footer": ("<!-- ASAPTIC:FOOTER:START -->", "<!-- ASAPTIC:FOOTER:END -->"),
}

GT = chr(62)  # '>' kept out of literals that shells/hooks like to misread


class Refuse(Exception):
    pass


# --------------------------------------------------------------------------
# masking + balanced tag finding
# --------------------------------------------------------------------------

_MASK_RE = re.compile(
    r"<!--.*?-->|<script\b[^" + GT + r"]*" + GT + r".*?</script\s*" + GT +
    r"|<style\b[^" + GT + r"]*" + GT + r".*?</style\s*" + GT,
    re.DOTALL | re.IGNORECASE,
)


def mask(html):
    """Blank out comments/script/style bodies so tag scans never match inside them."""
    out = list(html)
    for m in _MASK_RE.finditer(html):
        for i in range(m.start(), m.end()):
            if out[i] != "\n":
                out[i] = " "
    return "".join(out)


def find_tag(masked, tag, start=0):
    """Balanced open/close span for the first `tag` at/after `start`. None if absent/unbalanced."""
    open_re = re.compile(r"<" + tag + r"(?=[\s/" + GT + r"])", re.IGNORECASE)
    m = open_re.search(masked, start)
    if not m:
        return None
    gt = masked.find(GT, m.end())
    if gt == -1:
        return None
    combined = re.compile(r"</?" + tag + r"(?=[\s/" + GT + r"])", re.IGNORECASE)
    depth = 1
    for m2 in combined.finditer(masked, gt + 1):
        if m2.group(0).startswith("</"):
            depth -= 1
            if depth == 0:
                ce = masked.find(GT, m2.end())
                if ce == -1:
                    return None
                return {"open_start": m.start(), "open_end": gt + 1,
                        "close_start": m2.start(), "close_end": ce + 1}
        else:
            depth += 1
    return None


def find_all_tags(masked, tag):
    spans, pos = [], 0
    while True:
        s = find_tag(masked, tag, pos)
        if not s:
            return spans
        spans.append(s)
        pos = s["open_end"]


def open_tag_text(html, span):
    return html[span["open_start"]:span["open_end"]]


def tag_class(html, span):
    m = re.search(r'class\s*=\s*"([^"]*)"', open_tag_text(html, span))
    return m.group(1) if m else ""


def inside(outer, pos):
    return outer is not None and outer["open_start"] <= pos < outer["close_end"]


# --------------------------------------------------------------------------
# config
# --------------------------------------------------------------------------

class Config(object):
    def __init__(self, root, cfg_path, ver=None):
        self.root = os.path.abspath(root)
        with open(cfg_path, encoding="utf-8") as f:
            self.raw = json.load(f)
        self.site = self.raw["site"].rstrip("/")
        self.year = self.raw["year"]
        self.ver = ver or self.raw["css_ver"]
        self.absolute = self.raw.get("href_style", "absolute") == "absolute"
        self.locale_dirs = self.raw["locale_dirs"]
        self.hreflang = self.raw["hreflang"]
        self.i18n = {}
        idir = self.raw["i18n_dir"]
        for loc, fn in self.raw["i18n_files"].items():
            with open(os.path.join(idir, fn), encoding="utf-8") as f:
                self.i18n[loc] = json.load(f)
        self.tpl = {}
        for name in ("head", "header", "footer"):
            with open(os.path.join(HERE, "templates", name + ".html"), encoding="utf-8") as f:
                self.tpl[name] = f.read()
        # exclusion sets
        ex = self.raw["exclude"]
        self.ex_dirs = tuple(ex["dir_prefixes"])
        self.ex_globs = tuple(ex["path_globs"])
        self.ex_exact = set(ex["exact"])
        for slug in ex["v2_flat_slugs"]:
            for d in self.locale_dirs.values():
                self.ex_exact.add((d + "/" if d else "") + slug + ".html")
        self.sample_only = tuple(ex["sample_only_prefixes"])
        self._exists = {}

    # -- disk existence, cached -------------------------------------------
    def exists(self, relpath):
        if relpath not in self._exists:
            p = os.path.join(self.root, relpath)
            self._exists[relpath] = os.path.isfile(p)
        return self._exists[relpath]

    # -- url helpers -------------------------------------------------------
    def path_to_url(self, relpath, force_absolute=False):
        if relpath == "index.html":
            p = "/"
        elif relpath.endswith("/index.html"):
            p = "/" + relpath[: -len("index.html")]
        else:
            p = "/" + relpath
        if self.absolute or force_absolute:
            return self.site + p
        return p

    def locale_prefix(self, loc):
        d = self.locale_dirs[loc]
        return (d + "/") if d else ""

    def mirror(self, base, loc):
        """Repo-relative path of `base` (an en/root-relative path) in locale `loc`."""
        return self.locale_prefix(loc) + base

    def resolve_href(self, href, loc):
        """Resolve the families.json href DSL for one locale."""
        if href.startswith("http://") or href.startswith("https://"):
            if href.startswith(self.site + "/"):
                href = href[len(self.site):]
            else:
                return href
        if href.startswith("@"):
            slug = href[1:]
            pre = self.locale_prefix(loc)
            if slug == "home":
                return self.path_to_url(pre + "index.html")
            return self.path_to_url(pre + slug + ".html")
        forced_en = href.startswith("=")
        if forced_en:
            href = href[1:]
        path = href.lstrip("/")
        frag = ""
        if "#" in path:
            path, frag = path.split("#", 1)
            frag = "#" + frag
        target = path
        if not forced_en and loc != "en":
            cand = self.locale_prefix(loc) + path
            probe = cand + "index.html" if cand.endswith("/") else cand
            if self.exists(probe):
                target = cand
        if target.endswith("/"):
            target = target + "index.html"
        return self.path_to_url(target) + frag

    # -- family ------------------------------------------------------------
    def family_for(self, base):
        for fam in self.raw["families"]:
            for m in fam["match"]:
                if m == "":
                    return fam
                if m.endswith("/") and base.startswith(m):
                    return fam
                if base == m:
                    return fam
        return self.raw["families"][-1]

    def nav_on_for(self, base, fam):
        for k, v in self.raw["nav_on_by_page"].items():
            if k.startswith("_"):
                continue
            if base == k or (k.endswith("/") and base.startswith(k)):
                return v
        return fam.get("nav_on")

    def disclaimer_for(self, base, fam):
        for k, v in self.raw["disclaimer_by_page"].items():
            if k.startswith("_"):
                continue
            if base == k or (k.endswith("/") and base.startswith(k)):
                return v, "page:" + k
        d = fam.get("disclaimer") or []
        return d, ("family:" + fam["id"] if d else "none")

    # -- exclusion ---------------------------------------------------------
    def exclusion(self, relpath):
        """Return (kind, reason) where kind in {None,'excluded','sample'}."""
        base = strip_locale(relpath)[1]
        for d in self.ex_dirs:
            if relpath.startswith(d) or base.startswith(d):
                return "excluded", "dir-prefix " + d
        for g in self.ex_globs:
            if fnmatch.fnmatch(relpath, g):
                return "excluded", "glob " + g
        if relpath in self.ex_exact:
            return "excluded", "already-v2 / flat page"
        for p in self.sample_only:
            if base.startswith(p):
                return "sample", "generator-owned " + p
        return None, ""


def strip_locale(relpath):
    for loc in ("zh", "zht", "pt"):
        if relpath.startswith(loc + "/"):
            return loc, relpath[len(loc) + 1:]
    return "en", relpath


def label(obj, loc):
    if isinstance(obj, str):
        return obj
    return obj.get(loc) or obj["en"]


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;")


# --------------------------------------------------------------------------
# rendering
# --------------------------------------------------------------------------

def lang_set(cfg, base):
    """Locales whose mirrored file actually exists on disk, in en/zh/zht/pt order."""
    return [loc for loc in LOCALES if cfg.exists(cfg.mirror(base, loc))]


def render_lang_links(cfg, base, loc, present):
    if len(present) < 2:
        return ""            # brief: "if only one chip, emit nothing"
    out = []
    for L in present:
        chip = esc(cfg.i18n[L]["lang_label"])
        url = cfg.path_to_url(cfg.mirror(base, L))
        span = '<span class="on">%s</span>' % chip if L == loc else "<span>%s</span>" % chip
        out.append('<a href="%s">%s</a>' % (url, span))
    return "".join(out)


def render_alternates(cfg, base, present):
    if len(present) < 2:
        return ""
    lines = []
    for L in present:
        lines.append('<link rel="alternate" hreflang="%s" href="%s">'
                     % (cfg.hreflang[L], cfg.path_to_url(cfg.mirror(base, L), True)))
    if "en" in present:
        lines.append('<link rel="alternate" hreflang="x-default" href="%s">'
                     % cfg.path_to_url(cfg.mirror(base, "en"), True))
    return "\n".join(lines) + "\n"


def strip_suffix(cfg, lab):
    for suf in cfg.raw.get("nav_label_strip_suffix", []):
        if lab.endswith(suf):
            lab = lab[: -len(suf)]
    return lab


def nav_label(cfg, item, loc):
    for n in cfg.i18n[loc]["nav"]:
        if n["slug"] == item["slug"]:
            return strip_suffix(cfg, n["label"])
    return item["slug"]


def render_nav(cfg, loc, nav_on):
    out = []
    for item in cfg.raw["nav"]:
        href = cfg.resolve_href(item["href"], loc)
        cls = ' class="on"' if item["slug"] == nav_on else ""
        out.append('<a href="%s"%s%s%s</a>' % (href, cls, GT, esc(nav_label(cfg, item, loc))))
    return "".join(out)


def render_subrow(cfg, fam, loc):
    crumbs, sublinks = fam.get("crumbs") or [], fam.get("sublinks") or []
    if not crumbs and not sublinks:
        return ""
    parts = []
    if crumbs:
        bits = []
        for i, c in enumerate(crumbs):
            if i:
                bits.append('<span class="sep">/</span>')
            bits.append('<a href="%s">%s</a>' % (cfg.resolve_href(c["href"], loc),
                                                 esc(label(c["label"], loc))))
        parts.append('<nav class="crumbs" aria-label="Breadcrumb">%s</nav>' % "".join(bits))
    if sublinks:
        bits = ['<a href="%s">%s</a>' % (cfg.resolve_href(s["href"], loc),
                                         esc(label(s["label"], loc))) for s in sublinks]
        parts.append('<nav class="sublinks">%s</nav>' % "".join(bits))
    return '  <div class="row subrow">%s</div>\n' % "".join(parts)


def render_header(cfg, base, loc, fam, nav_on):
    present = lang_set(cfg, base)
    html = cfg.tpl["header"]
    html = html.replace("{{BRAND}}", esc(cfg.i18n[loc].get("brand", "ASAPTIC")))
    html = html.replace("{{HOME}}", cfg.resolve_href("@home", loc))
    html = html.replace("{{NAV}}", render_nav(cfg, loc, nav_on))
    html = html.replace("{{LANG_LINKS}}", render_lang_links(cfg, base, loc, present))
    html = html.replace("{{CONTACT}}", cfg.resolve_href("@contact", loc))
    html = html.replace("{{ENGAGE}}", esc(cfg.i18n[loc]["engage"]))
    html = html.replace("{{SUBROW}}", render_subrow(cfg, fam, loc))
    return html, present


def render_footer(cfg, loc, disclaimer):
    f = cfg.i18n[loc]["footer"]
    overrides = cfg.raw.get("i18n_href_overrides", {})
    cols = []
    for col in f["cols"]:
        links = []
        for lab, href in col["links"]:
            href = overrides.get(href, href)
            if not (href.startswith("/") or href.startswith("@") or href.startswith("http")):
                href = "@" + href
            links.append('<a href="%s">%s</a>' % (cfg.resolve_href(href, loc),
                                                  esc(strip_suffix(cfg, lab))))
        cols.append('    <div class="col"><h4>%s</h4>%s</div>\n' % (esc(col["h"]), "".join(links)))
        if col["h"] == cfg.raw["footer_extra_col"].get("after"):
            cols.append(render_extra_col(cfg, loc))
    extra = render_extra_col(cfg, loc)
    if extra not in cols:
        cols.insert(min(2, len(cols)), extra)

    tpl = cfg.tpl["footer"]
    tpl = tpl.replace("{{BRAND}}", esc(cfg.i18n[loc].get("brand", "ASAPTIC")))
    tpl = tpl.replace("{{TAGLINE}}", esc(f["tagline"]))
    tpl = tpl.replace("{{COLS}}", "".join(cols))
    if disclaimer:
        tpl = tpl.replace("{{DISCLAIMER}}",
                          '  <div class="legal note">%s</div>\n' %
                          "<br>".join(esc(x) for x in disclaimer))
    else:
        tpl = tpl.replace("{{DISCLAIMER}}", "")
    tpl = tpl.replace("{{LEGAL}}", render_legal(cfg, loc))
    return tpl


def render_extra_col(cfg, loc):
    c = cfg.raw["footer_extra_col"]
    links = ['<a href="%s">%s</a>' % (cfg.resolve_href(l["href"], loc), esc(label(l["label"], loc)))
             for l in c["links"]]
    return '    <div class="col"><h4>%s</h4>%s</div>\n' % (esc(label(c["h"], loc)), "".join(links))


def render_legal(cfg, loc):
    l = cfg.raw["legal_line"]
    return "%s · %s · %s · %s" % (
        l["prefix"].replace("{{YEAR}}", cfg.year),
        '<a href="%s">%s</a>' % (cfg.resolve_href(l["privacy"]["href"], loc),
                                 esc(label(l["privacy"]["label"], loc))),
        '<a href="%s">%s</a>' % (cfg.resolve_href(l["terms"]["href"], loc),
                                 esc(label(l["terms"]["label"], loc))),
        l["suffix"])


def render_head_for(cfg, relpath, base, loc, present):
    h = cfg.tpl["head"]
    h = h.replace("{{CANONICAL}}", cfg.path_to_url(relpath, True))
    h = h.replace("{{ALTERNATES}}", render_alternates(cfg, base, present))
    h = h.replace("{{VER}}", cfg.ver)
    return h


# --------------------------------------------------------------------------
# document surgery
# --------------------------------------------------------------------------

def replace_between_sentinels(html, key, block):
    a, b = SENT[key]
    i = html.find(a)
    if i == -1:
        return None
    j = html.find(b, i)
    if j == -1:
        raise Refuse("%s START sentinel without matching END" % key.upper())
    if html.find(a, i + 1) != -1:
        raise Refuse("duplicate %s START sentinel" % key.upper())
    return html[:i] + block.strip("\n") + html[j + len(b):]


LINK_RE = re.compile(r"<link\b[^" + GT + r"]*" + GT, re.IGNORECASE)


def drop_links(head, pred):
    out, last, n = [], 0, 0
    for m in LINK_RE.finditer(head):
        if pred(m.group(0)):
            out.append(head[last:m.start()])
            # swallow a trailing newline + the indent that preceded the tag
            k = m.start()
            while k - 1 >= 0 and head[k - 1] in " \t":
                out[-1] = out[-1][:-1]
                k -= 1
            last = m.end()
            if last < len(head) and head[last] == "\n":
                last += 1
            n += 1
    out.append(head[last:])
    return "".join(out), n


def is_canonical(tag):
    return re.search(r'rel\s*=\s*"?canonical"?', tag, re.I) is not None


def is_hreflang(tag):
    return "hreflang=" in tag.lower()


def is_font(tag):
    return "fonts.googleapis.com" in tag or "fonts.gstatic.com" in tag


STYLE_CSS_RE = re.compile(
    r'<link\b[^' + GT + r']*href\s*=\s*"([^"]*\bstyle\.css(?:\?[^"]*)?)"[^' + GT + r']*' + GT,
    re.IGNORECASE)


def process_head(cfg, html, relpath, base, loc, present, notes):
    m = mask(html)
    span = find_tag(m, "head", 0)
    if not span:
        raise Refuse("no balanced <head> element")
    block = render_head_for(cfg, relpath, base, loc, present)

    swapped = replace_between_sentinels(html[span["open_end"]:span["close_start"]], "head", block)
    if swapped is not None:
        notes.append("head:sentinel-refresh")
        return html[:span["open_end"]] + swapped + html[span["close_start"]:]

    head = html[span["open_end"]:span["close_start"]]
    head, n = drop_links(head, is_canonical)
    if n:
        notes.append("head:canonical-replaced(%d)" % n)
    head, n = drop_links(head, is_hreflang)
    if n:
        notes.append("head:hreflang-replaced(%d)" % n)
    head, n = drop_links(head, is_font)
    if n:
        notes.append("head:fonts-normalized(%d)" % n)

    hits = list(STYLE_CSS_RE.finditer(head))
    if hits:
        first = hits[0]
        head = head[:first.start()] + "\n" + block.strip("\n") + "\n" + head[first.end():]
        if len(hits) > 1:
            head, extra = drop_links(head, lambda t: STYLE_CSS_RE.match(t) is not None)
            if extra:
                notes.append("head:extra-style.css-dropped(%d)" % extra)
        notes.append("head:style.css-swapped(%s)" % first.group(1))
    else:
        head = head.rstrip() + "\n" + block.strip("\n") + "\n"
        notes.append("head:no-style.css-link,block-appended")
    return html[:span["open_end"]] + head + html[span["close_start"]:]


LANG_SCRIPT_MARKERS = ("asaptic-lang", "lang-btn", "applyLang", "data-lang", "langBtns",
                       "essay-lang", "setLang(")
INLINE_SCRIPT_RE = re.compile(r"<script" + GT + r"(.*?)</script\s*" + GT, re.DOTALL | re.IGNORECASE)
NAVMOBILE_RE = re.compile(
    r"[ \t]*<script\b[^" + GT + r"]*nav-mobile\.js[^" + GT + r"]*" + GT +
    r"\s*(?:</script\s*" + GT + r")?\n?", re.IGNORECASE)
TWBACK_RE = re.compile(
    r'[ \t]*<a\b[^' + GT + r']*class="[^"]*\btw-back\b[^"]*"[^' + GT + r']*' + GT +
    r'.*?</a\s*' + GT + r'\n?', re.DOTALL | re.IGNORECASE)


def pre_clean(html, notes, keep_nav_mobile=False):
    """Remove old in-body chrome that the v2 shell replaces. Runs before span detection."""
    # in-body language toggles: <nav class="tw-langs|rb-langs"> ... </nav>
    removed = 0
    while True:
        m = mask(html)
        hit = None
        for span in find_all_tags(m, "nav"):
            cls = tag_class(html, span)
            if "tw-langs" in cls or "rb-langs" in cls:
                hit = span
                break
        if not hit:
            break
        html = html[:hit["open_start"]] + html[hit["close_end"]:]
        removed += 1
    if removed:
        notes.append("body:inbody-lang-nav-removed(%d)" % removed)

    html, n = TWBACK_RE.subn("", html)
    if n:
        notes.append("body:tw-back-removed(%d)" % n)

    if not keep_nav_mobile:
        html, n = NAVMOBILE_RE.subn("", html)
        if n:
            notes.append("body:nav-mobile.js-removed(%d)" % n)

    return html


def lang_script_cleanup(html, notes):
    """Drop dead inline lang-toggle scripts.

    MUST run AFTER the header/footer swap: on many pages every [data-key] element
    lived in the old nav/footer, so deciding before the swap gives a different answer
    than deciding after it — which is exactly the non-idempotency this ordering fixes.
    """
    has_data_key = "data-key=" in html
    has_lang_blocks = "data-lang-content" in html
    if has_data_key or has_lang_blocks:
        why = []
        if has_data_key:
            why.append("data-key")
        if has_lang_blocks:
            why.append("data-lang-content")
        if any(mk in html for mk in LANG_SCRIPT_MARKERS):
            notes.append("body:lang-script-KEPT(" + "+".join(why) + ")")
    else:
        dropped = 0
        while True:
            hit = None
            for m in INLINE_SCRIPT_RE.finditer(html):
                if any(mk in m.group(1) for mk in LANG_SCRIPT_MARKERS):
                    hit = m
                    break
            if not hit:
                break
            s = hit.start()
            while s - 1 >= 0 and html[s - 1] in " \t":
                s -= 1
            e = hit.end()
            if e < len(html) and html[e] == "\n":
                e += 1
            html = html[:s] + html[e:]
            dropped += 1
        if dropped:
            notes.append("body:lang-script-dropped(%d)" % dropped)
            if re.search(r'src="[^"]*content\.js', html):
                notes.append("body:content.js-include-now-unused")
    return html


def process_body(cfg, html, header_block, footer_block, notes):
    m = mask(html)
    bm = re.search(r"<body(?=[\s" + GT + r"])", m, re.IGNORECASE)
    if not bm:
        raise Refuse("no <body> tag")
    body_open_end = m.find(GT, bm.end()) + 1
    if body_open_end == 0:
        raise Refuse("malformed <body> tag")
    if not re.search(r"</body\s*" + GT, m, re.IGNORECASE):
        raise Refuse("no </body> tag")

    # ---------------- header ----------------
    swapped = replace_between_sentinels(html, "header", header_block)
    if swapped is not None:
        html = swapped
        anchor = "sentinel"
    else:
        main = find_tag(m, "main", body_open_end)
        shells = [s for s in find_all_tags(m, "header")
                  if not inside(main, s["open_start"]) and "shell" in tag_class(html, s)]
        if len(shells) > 1:
            raise Refuse("%d <header class=shell> elements outside <main>" % len(shells))
        shell = shells[0] if shells else None

        chrome_nav = None
        for s in find_all_tags(m, "nav"):
            if s["open_start"] < body_open_end:
                continue
            if inside(main, s["open_start"]):
                continue
            if shell and inside(shell, s["open_start"]):
                continue
            chrome_nav = s
            break

        if shell and chrome_nav:
            raise Refuse("both a <header class=shell> and a separate top-level <nav> outside <main>")
        if shell:
            target, anchor = shell, "header.shell"
        elif chrome_nav:
            target, anchor = chrome_nav, "nav" + (
                "." + tag_class(html, chrome_nav).split()[0] if tag_class(html, chrome_nav) else "")
        else:
            target, anchor = None, "insert-after-body"

        if target:
            html = html[:target["open_start"]] + header_block.strip("\n") + html[target["close_end"]:]
        else:
            html = html[:body_open_end] + "\n" + header_block.strip("\n") + html[body_open_end:]
            notes.append("body:no-nav,header-inserted-after-<body>")

    # ---------------- footer ----------------
    swapped = replace_between_sentinels(html, "footer", footer_block)
    if swapped is not None:
        return swapped, anchor, "sentinel"

    m = mask(html)
    main = find_tag(m, "main", 0)
    footers = find_all_tags(m, "footer")
    last = footers[-1] if footers else None

    if last is None:
        mode = "inserted"
        if main:
            html = html[:main["close_end"]] + "\n" + footer_block.strip("\n") + html[main["close_end"]:]
        else:
            cm = re.search(r"</body\s*" + GT, m, re.IGNORECASE)
            html = html[:cm.start()] + footer_block.strip("\n") + "\n" + html[cm.start():]
            mode = "inserted-before-</body>"
        notes.append("body:no-footer,injected")
    elif main and inside(main, last["open_start"]):
        if last["close_end"] > main["close_start"]:
            raise Refuse("<footer> straddles </main>")
        mode = "moved-out-of-main"
        cut = html[:last["open_start"]] + html[last["close_end"]:]
        m2 = mask(cut)
        main2 = find_tag(m2, "main", 0)
        if not main2:
            raise Refuse("lost <main> while lifting the nested footer")
        html = cut[:main2["close_end"]] + "\n" + footer_block.strip("\n") + cut[main2["close_end"]:]
    else:
        mode = "replaced"
        html = html[:last["open_start"]] + footer_block.strip("\n") + html[last["close_end"]:]
    return html, anchor, mode


# --------------------------------------------------------------------------
# post-transform self-check
# --------------------------------------------------------------------------

TITLE_RE = re.compile(r"<title" + GT + r".*?</title\s*" + GT, re.DOTALL | re.IGNORECASE)
OG_RE = re.compile(r'<meta\b[^' + GT + r']*(?:property|name)\s*=\s*"(?:og:|twitter:|description)[^"]*"[^'
                   + GT + r']*' + GT, re.IGNORECASE)
LD_RE = re.compile(r'<script\b[^' + GT + r']*application/ld\+json[^' + GT + r']*' + GT +
                   r".*?</script\s*" + GT, re.DOTALL | re.IGNORECASE)


def postcheck(before, after):
    """Structural + do-no-harm assertions. Any failure turns an OK row into a REFUSAL."""
    bad = []
    for key, (a, b) in SENT.items():
        if after.count(a) != 1 or after.count(b) != 1:
            bad.append("%s sentinels not exactly 1/1" % key)
    m = mask(after)
    shells = [s for s in find_all_tags(m, "header") if "shell" in tag_class(after, s)]
    if len(shells) != 1:
        bad.append("%d header.shell in output" % len(shells))
    foots = [s for s in find_all_tags(m, "footer") if "foot" in tag_class(after, s).split()]
    if len(foots) != 1:
        bad.append("%d footer.foot in output" % len(foots))
    mb = mask(before)
    if find_tag(mb, "main", 0) and not find_tag(m, "main", 0):
        bad.append("<main> lost or unbalanced")
    if find_tag(m, "body", 0) is None:
        bad.append("<body> unbalanced in output")
    if TITLE_RE.findall(before) != TITLE_RE.findall(after):
        bad.append("<title> changed")
    if OG_RE.findall(before) != OG_RE.findall(after):
        bad.append("og/description meta changed")
    if LD_RE.findall(before) != LD_RE.findall(after):
        bad.append("JSON-LD changed")
    if "nav-mobile.js" in after:
        bad.append("nav-mobile.js still referenced")
    # the injected footer must be the last footer and must sit outside <main>
    main = find_tag(m, "main", 0)
    if foots and main and inside(main, foots[0]["open_start"]):
        bad.append("injected footer.foot is nested inside <main>")
    return bad


# --------------------------------------------------------------------------
# per-file driver
# --------------------------------------------------------------------------

def transform(cfg, relpath, html, keep_nav_mobile=False):
    notes = []
    loc, base = strip_locale(relpath)
    fam = cfg.family_for(base)
    nav_on = cfg.nav_on_for(base, fam)
    disclaimer, disc_id = cfg.disclaimer_for(base, fam)
    header_block, present = render_header(cfg, base, loc, fam, nav_on)
    footer_block = render_footer(cfg, loc, disclaimer)

    out = pre_clean(html, notes, keep_nav_mobile)
    out = process_head(cfg, out, relpath, base, loc, present, notes)
    out, anchor, footer_mode = process_body(cfg, out, header_block, footer_block, notes)
    out = lang_script_cleanup(out, notes)

    meta = {
        "locale": loc, "base": base, "family": fam["id"], "nav_on": nav_on,
        "anchor": anchor, "footer_mode": footer_mode,
        "chips": "".join(present) if len(present) > 1 else "(none)",
        "chips_list": present, "disclaimer": disc_id, "notes": notes,
        "subrow": bool(render_subrow(cfg, fam, loc)),
        "header_block": header_block, "footer_block": footer_block,
    }
    return out, meta


def process_file(cfg, relpath, keep_nav_mobile=False, check_idempotent=True):
    p = os.path.join(cfg.root, relpath)
    row = {"path": relpath, "before_bytes": os.path.getsize(p)}
    try:
        with open(p, encoding="utf-8", errors="strict") as f:
            html = f.read()
    except UnicodeDecodeError as e:
        row.update(status="REFUSED", reason="not valid utf-8: %s" % e)
        return row, None
    try:
        out, meta = transform(cfg, relpath, html, keep_nav_mobile)
    except Refuse as e:
        loc, base = strip_locale(relpath)
        row.update(status="REFUSED", reason=str(e), family=cfg.family_for(base)["id"], locale=loc)
        return row, None
    except Exception as e:  # never let one odd page kill the sweep
        loc, base = strip_locale(relpath)
        row.update(status="REFUSED", reason="internal: %s: %s" % (type(e).__name__, e),
                   family=cfg.family_for(base)["id"], locale=loc)
        return row, None

    bad = postcheck(html, out)
    if bad:
        row.update(status="REFUSED", reason="postcheck: " + "; ".join(bad),
                   family=meta["family"], locale=meta["locale"])
        return row, None

    idem = None
    if check_idempotent:
        try:
            again, _ = transform(cfg, relpath, out, keep_nav_mobile)
            idem = (again == out)
        except Exception as e:
            idem = "error: %s" % e
    row.update(status="OK", family=meta["family"], locale=meta["locale"],
               nav_on=meta["nav_on"], anchor=meta["anchor"], footer_mode=meta["footer_mode"],
               chips=meta["chips"], disclaimer=meta["disclaimer"], subrow=meta["subrow"],
               notes=meta["notes"], after_bytes=len(out.encode("utf-8")), idempotent=idem)
    return row, out


# --------------------------------------------------------------------------
# discovery + report
# --------------------------------------------------------------------------

def discover(root):
    files = []
    for dp, dn, fn in os.walk(root):
        dn[:] = [d for d in dn if d not in (".git", "node_modules", ".wrangler")]
        for f in fn:
            if f.endswith(".html"):
                files.append(os.path.relpath(os.path.join(dp, f), root).replace(os.sep, "/"))
    return sorted(files)


def write_reports(rows, outdir, cfg, argv):
    os.makedirs(outdir, exist_ok=True)
    jpath = os.path.join(outdir, "dryrun_report.json")
    with open(jpath, "w", encoding="utf-8") as f:
        json.dump({"generated": datetime.now(timezone.utc).isoformat(),
                   "argv": argv, "css_ver": cfg.ver,
                   "href_style": "absolute" if cfg.absolute else "root",
                   "rows": rows}, f, indent=1, ensure_ascii=False)

    fam_status = {}
    for r in rows:
        fam = r.get("family", "?")
        fam_status.setdefault(fam, {}).setdefault(r["status"], 0)
        fam_status[fam][r["status"]] += 1
    reasons = {}
    for r in rows:
        if r["status"] in ("REFUSED", "SKIP"):
            reasons.setdefault(r.get("reason", "?"), []).append(r["path"])

    L = []
    L.append("# apply_shell.py — dry-run report")
    L.append("")
    L.append("generated: %s  ·  css ver `%s`  ·  hrefs: %s"
             % (datetime.now(timezone.utc).isoformat(timespec="seconds"), cfg.ver,
                "absolute" if cfg.absolute else "root-relative"))
    L.append("")
    L.append("## Counts per status per family")
    L.append("")
    statuses = sorted({s for v in fam_status.values() for s in v})
    L.append("| family | " + " | ".join(statuses) + " | total |")
    L.append("|---|" + "---|" * (len(statuses) + 1))
    for fam in sorted(fam_status, key=lambda k: -sum(fam_status[k].values())):
        v = fam_status[fam]
        L.append("| %s | %s | %d |" % (fam, " | ".join(str(v.get(s, 0)) for s in statuses),
                                       sum(v.values())))
    tot = {}
    for v in fam_status.values():
        for s, n in v.items():
            tot[s] = tot.get(s, 0) + n
    L.append("| **all** | %s | %d |" % (" | ".join("**%d**" % tot.get(s, 0) for s in statuses),
                                        sum(tot.values())))
    L.append("")
    L.append("## Refusal / skip reasons")
    L.append("")
    for reason, paths in sorted(reasons.items(), key=lambda kv: -len(kv[1])):
        L.append("* **%d** — %s" % (len(paths), reason))
        for p in paths[:3]:
            L.append("    * `%s`" % p)
    if not reasons:
        L.append("* none")
    L.append("")
    ok = [r for r in rows if r["status"] == "OK"]
    bad_idem = [r for r in ok if r.get("idempotent") is not True]
    L.append("## Idempotency")
    L.append("")
    L.append("* re-applying the transform to its own output is byte-identical for **%d / %d** OK pages."
             % (len(ok) - len(bad_idem), len(ok)))
    for r in bad_idem[:10]:
        L.append("    * `%s` — %s" % (r["path"], r.get("idempotent")))
    L.append("")
    L.append("## 10 largest pages touched")
    L.append("")
    for r in sorted(ok, key=lambda r: -r["before_bytes"])[:10]:
        L.append("* `%s` — %s → %s bytes · anchor=%s · footer=%s · chips=%s"
                 % (r["path"], f'{r["before_bytes"]:,}', f'{r["after_bytes"]:,}',
                    r["anchor"], r["footer_mode"], r["chips"]))
    L.append("")
    L.append("## Handling matrix (anchor x footer mode)")
    L.append("")
    combos = {}
    for r in ok:
        combos.setdefault((r["anchor"], r["footer_mode"]), []).append(r["path"])
    L.append("| header anchor | footer mode | pages | examples |")
    L.append("|---|---|---|---|")
    for (a, fm), paths in sorted(combos.items(), key=lambda kv: -len(kv[1])):
        L.append("| %s | %s | %d | %s |"
                 % (a, fm, len(paths), " · ".join("`%s`" % p for p in paths[:3])))
    L.append("")
    L.append("## Note kinds")
    L.append("")
    kinds = {}
    for r in ok:
        for n in r.get("notes", []):
            k = re.sub(r"\(.*\)$", "", n)
            kinds.setdefault(k, []).append(r["path"])
    for k, paths in sorted(kinds.items(), key=lambda kv: -len(kv[1])):
        L.append("* **%d** — `%s` — e.g. %s"
                 % (len(paths), k, " · ".join("`%s`" % p for p in paths[:2])))
    L.append("")
    L.append("## Oddest pages")
    L.append("")
    seen = set()
    odd = []
    for r in ok:
        sig = (r["anchor"], r["footer_mode"],
               tuple(sorted(re.sub(r"\(.*\)$", "", n) for n in r.get("notes", []))))
        if sig in seen:
            continue
        seen.add(sig)
        odd.append(r)
    for r in odd[:30]:
        L.append("* `%s` — family=%s · anchor=%s · footer=%s · chips=%s · %s"
                 % (r["path"], r["family"], r["anchor"], r["footer_mode"], r["chips"],
                    "; ".join(r.get("notes", []))))
    mpath = os.path.join(outdir, "dryrun_report.md")
    with open(mpath, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    return jpath, mpath


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default=DEFAULT_ROOT)
    ap.add_argument("--config", default=os.path.join(HERE, "families.json"))
    ap.add_argument("--dry-run", action="store_true", default=True)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--family")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--samples", type=int, default=3,
                    help="files reported per generator-owned prefix (never written)")
    ap.add_argument("--ver")
    ap.add_argument("--out", default=os.path.join(HERE, "_reports"))
    ap.add_argument("--render", help="print the rendered header+footer for one path and exit")
    ap.add_argument("--keep-nav-mobile", action="store_true")
    ap.add_argument("--no-idempotency-check", action="store_true")
    args = ap.parse_args()

    cfg = Config(args.root, args.config, args.ver)

    if args.render:
        rel = args.render
        loc, base = strip_locale(rel)
        fam = cfg.family_for(base)
        nav_on = cfg.nav_on_for(base, fam)
        disc, disc_id = cfg.disclaimer_for(base, fam)
        hdr, present = render_header(cfg, base, loc, fam, nav_on)
        print("# %s  ·  locale=%s  family=%s  nav_on=%s  chips=%s  disclaimer=%s"
              % (rel, loc, fam["id"], nav_on, "/".join(present), disc_id))
        print(hdr)
        print(render_footer(cfg, loc, disc))
        return 0

    files = discover(cfg.root)
    sample_budget = {}
    rows, planned = [], []
    for rel in files:
        kind, why = cfg.exclusion(rel)
        loc, base = strip_locale(rel)
        fam = cfg.family_for(base)
        if args.family and fam["id"] != args.family:
            continue
        if kind == "excluded":
            rows.append({"path": rel, "status": "SKIP", "reason": why, "family": fam["id"],
                         "locale": loc, "before_bytes": os.path.getsize(os.path.join(cfg.root, rel))})
            continue
        if kind == "sample":
            key = why
            sample_budget[key] = sample_budget.get(key, 0) + 1
            if sample_budget[key] > args.samples:
                rows.append({"path": rel, "status": "SKIP", "reason": why, "family": fam["id"],
                             "locale": loc,
                             "before_bytes": os.path.getsize(os.path.join(cfg.root, rel))})
                continue
            planned.append((rel, True))
            continue
        planned.append((rel, False))
        if args.limit and len([p for p in planned if not p[1]]) >= args.limit:
            break

    for rel, sample_only in planned:
        row, out = process_file(cfg, rel, args.keep_nav_mobile, not args.no_idempotency_check)
        if sample_only:
            row["sample_only"] = True
            row["notes"] = row.get("notes", []) + ["generator-owned: QA sample, never written"]
        rows.append(row)
        if args.write and out is not None and not sample_only:
            with open(os.path.join(cfg.root, rel), "w", encoding="utf-8") as f:
                f.write(out)

    jpath, mpath = write_reports(rows, args.out, cfg, sys.argv[1:])
    ok = sum(1 for r in rows if r["status"] == "OK")
    ref = sum(1 for r in rows if r["status"] == "REFUSED")
    skip = sum(1 for r in rows if r["status"] == "SKIP")
    print("OK=%d REFUSED=%d SKIP=%d   mode=%s" % (ok, ref, skip, "WRITE" if args.write else "dry-run"))
    print("reports: %s\n         %s" % (jpath, mpath))
    return 0


if __name__ == "__main__":
    sys.exit(main())
