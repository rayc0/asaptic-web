#!/usr/bin/env python3
"""blog_dedupe.py — remove inline zh/zht duplicate bodies from EN blog pages.

Problem it solves
-----------------
Most EN pages under blog/ embed their full Simplified- and Traditional-Chinese
bodies inline as

    <div class="essay-lang" data-lang-content="en|zh|zht"> ... </div>

hidden with CSS (`.essay-lang{display:none}`) and toggled by an in-body button
group (`.lang-switcher` / `.essay-lang-switcher`) plus a small inline <script>.

Consequences: every EN URL ships the same text three times (duplicate content
against the canonical, hreflang'd /zh/blog/<slug> and /zht/blog/<slug>
mirrors), and pages whose per-language block carries its own <h1> end up with
three <h1> elements.

What this script does, per EN page with >= 2 data-lang-content blocks
--------------------------------------------------------------------
  1. Unwraps the data-lang-content="en" block (keeps its inner content).
     --keep/--dir generalize this: three zh/blog pages carry the same triple
     block and are cleaned with `--dir zh/blog --keep zh`.
  2. Deletes the data-lang-content="zh" and ="zht" blocks -- but ONLY after
     verifying the locale mirror exists and actually carries that text
     (see "Mirror gate" below).
  3. Deletes the in-body .lang-switcher / .essay-lang-switcher button group.
     The site header already carries EN/simp/trad/PT chips that link to the
     locale mirrors, so nothing navigational is lost.
  4. Deletes the inline lang-toggle <script> -- only if that script's sole job
     is the toggle (it references essay-lang / bl-lang / lang-btn and nothing
     else). Any other inline script, and every application/ld+json block, is
     left untouched.

CSS rules for the now-absent elements are deliberately left in place: they are
inert, and touching the <style> block would widen the diff for no SEO gain.

Mirror gate
-----------
Before a zh (resp. zht) block is deleted we require:
  * zh/blog/<slug>.html (resp. zht/) to exist, AND
  * the mirror's <main> to hold real article text (>= STUB_CHARS chars --
    three zht pages are empty shells whose only text is the header/footer), AND
  * >= MIN_COVERAGE of the block's text to be present in that <main>, OR the
    mirror to be at least as long as the block.  The second branch exists
    because many mirrors are a separate, later translation of the same slug
    rather than a copy of the inline block: two independent Chinese renderings
    of one English source share little verbatim text, yet the mirror is the
    richer of the two and dropping the inline copy loses nothing.
If any check fails the block is KEPT, the whole page is left byte-identical
(see "all-or-nothing" in process()), and the slug is reported so the
missing/diverged mirror can be created first.

Listing pages (blog/index.html) are a documented special case: their language
blocks hold only link cards (no <p>/essay-body prose), the cards all point at
the EN /blog/<slug> URLs anyway, and the locale index mirrors are hand-curated
short lists, so a text-coverage gate can never pass. For such pages the gate is
"the locale mirror index exists" instead. Pass --strict-index to disable this
and apply the ordinary coverage gate to listing pages too.

Idempotent: a page with < 2 data-lang-content blocks is skipped untouched.
Dry-run is the default; pass --apply to write.

--demote-inactive-h1 (second mode)
----------------------------------
Some EN posts have no zh/zht mirror at all, so the mirror gate can never pass
and their inline foreign-language bodies must stay (deleting them would lose
content that exists nowhere else).  Those pages still ship three <h1>s -- one
per language block -- which is an on-page SEO defect independent of the
duplicate-content one.

In this mode nothing is deleted.  The page's own language is read from
<html lang="...">, and inside every data-lang-content block that is NOT that
language the <h1> is demoted to

    <p class="..." role="heading" aria-level="1">

so the text, its styling class and its assistive-tech heading semantics all
survive while the document is left with exactly one real <h1> (the active
locale's).  The site resets `* { margin: 0 }`, and every title rule is a plain
class selector, so h1 -> p is a zero-pixel change.

Pages that already have <= 1 <h1> outside <script>/<style> are skipped.

"""

from __future__ import annotations

import argparse
import difflib
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SHINGLE = 40          # probe length in characters, whitespace stripped
SHINGLE_STEP = 40     # non-overlapping probes
MIN_COVERAGE = 0.80   # >= 80% of probes must be found in the mirror
                      # (overridable per run with --min-coverage; the gate is a
                      #  judgement call about how different a mirror may be
                      #  before the inline copy is still worth keeping)
MIN_PROBES = 3        # blocks shorter than this many probes: compare whole text
STUB_CHARS = 200      # mirror <main> text below this = an empty shell, never trust it

ALL_LANGS = ("en", "zh", "zht")
# <html lang> -> data-lang-content token.  Only the prefix matters.
HTML_LANG_TO_BLOCK = {
    "en": "en",
    "zh-hans": "zh", "zh-cn": "zh", "zh-sg": "zh", "zh": "zh",
    "zh-hant": "zht", "zh-hk": "zht", "zh-tw": "zht", "zh-mo": "zht",
    "pt": "pt", "pt-br": "pt", "pt-pt": "pt",
}
HTML_LANG_RE = re.compile(r'<html\b[^>]*\blang="([^"]+)"', re.I)
H1_TAG_RE = re.compile(r"<h1\b([^>]*)>(.*?)</h1\s*>", re.S | re.I)
H1_OPEN_RE = re.compile(r"<h1\b", re.I)
ROLE_RE = re.compile(r"\brole\s*=", re.I)
BLOG_DIR = {"en": "blog", "zh": "zh/blog", "zht": "zht/blog"}

TAG_RE = re.compile(r"<[^>]+>")
SCRIPT_RE = re.compile(r"<script\b([^>]*)>(.*?)</script>", re.S)
STYLE_RE = re.compile(r"<style\b[^>]*>.*?</style>", re.S)
WS_RE = re.compile(r"\s+")
MAIN_RE = re.compile(r"<main\b[^>]*>(.*?)</main>", re.S)

BLOCK_OPEN_RE = re.compile(r'<div\b[^>]*\bdata-lang-content="([\w-]+)"[^>]*>')
SWITCHER_OPEN_RE = re.compile(
    r'<div\b[^>]*\bclass="[^"]*\blang-(?:switcher|toggle)\b[^"]*"[^>]*>')
# one page spells Traditional as zh-hk, and wraps the buttons in .lang-toggle
LANG_ALIAS = {"zh-hk": "zht", "zh-hant": "zht", "zh-hans": "zh"}
DIV_TOKEN_RE = re.compile(r"<div\b|</div\s*>", re.I)
# A short HTML comment sitting alone on the line right before a block, e.g.
# "<!-- ZH -->".  It must NOT match an ASAPTIC:* shell sentinel: those sit
# immediately above the trailing lang-toggle <script> on some pages, and eating
# the FOOTER:END sentinel breaks _shell/apply_shell.py's injection contract
# (qc.py check 4).  Conditional comments are excluded for the same reason.
LEAD_COMMENT_RE = re.compile(
    r"[ \t]*<!--(?!\[if)(?![^>]*ASAPTIC:)[^>]{0,160}?-->[ \t]*\n?\Z")


# --------------------------------------------------------------------------
# html helpers
# --------------------------------------------------------------------------
def match_div(src: str, open_start: int, open_end: int) -> int:
    """Return the index just past the </div> closing the div opened at
    [open_start, open_end). Raises ValueError if unbalanced."""
    depth = 1
    pos = open_end
    while depth:
        m = DIV_TOKEN_RE.search(src, pos)
        if not m:
            raise ValueError("unbalanced <div> from offset %d" % open_start)
        depth += 1 if m.group(0).lower().startswith("<div") else -1
        pos = m.end()
    return pos


def visible_text(html: str) -> str:
    """Text with tags, scripts, styles and all whitespace removed."""
    html = SCRIPT_RE.sub(" ", html)
    html = STYLE_RE.sub(" ", html)
    html = re.sub(r"<!--.*?-->", " ", html, flags=re.S)
    return WS_RE.sub("", TAG_RE.sub(" ", html))


def mirror_text(mirror_html: str) -> str:
    """The mirror page's article text -- <main> only, so the shared header /
    footer chrome can never be mistaken for article content (three zht pages
    are empty shells whose only text IS the chrome)."""
    m = MAIN_RE.search(mirror_html)
    return visible_text(m.group(1)) if m else ""


def coverage(a: str, b: str) -> float:
    """How much of block text `a` the mirror text `b` carries, in [0, 1].

    Fast path: fraction of fixed-length shingles found verbatim.  That is
    exact-match and therefore brittle here -- several zht mirrors are
    imperfect simplified->traditional conversions, so they carry the same
    sentence with a handful of characters in the other script and every
    40-char probe misses.  So when the fast path is short of the threshold we
    fall back to difflib and measure the share of the block's characters that
    appear, in order, somewhere in the mirror.  That is tolerant of scattered
    character substitutions but still fails a genuinely different or truncated
    mirror.
    """
    if not a:
        return 1.0
    probes = [a[i:i + SHINGLE] for i in range(0, len(a) - SHINGLE + 1, SHINGLE_STEP)]
    if len(probes) < MIN_PROBES:
        return 1.0 if a in b else 0.0
    exact = sum(1 for p in probes if p in b) / len(probes)
    if exact >= MIN_COVERAGE:
        return exact
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    matched = sum(blk.size for blk in sm.get_matching_blocks())
    return max(exact, matched / len(a))


def is_listing_block(block_html: str) -> bool:
    """A language block that is a link-card listing, not prose."""
    return "bl-card" in block_html and "essay-body" not in block_html


def trim_edges(src: str, start: int, end: int) -> str:
    """src[start:end] with a leading and trailing all-whitespace line removed,
    so unwrapping a <div> does not leave the stub of its tag lines behind."""
    nl = src.find("\n", start)
    if nl != -1 and nl < end and not src[start:nl].strip():
        start = nl + 1
    nl = src.rfind("\n", start, end)
    if nl != -1 and not src[nl + 1:end].strip():
        end = nl + 1
    return src[start:end]


def whole_lines(src: str, start: int, end: int, rep: str):
    """Widen an edit to consume the whole line(s) it sits on when nothing else
    shares them -- keeps deletions from leaving blank-line litter."""
    ls = src.rfind("\n", 0, start) + 1
    if src[ls:start].strip():
        return (start, end, rep)
    le = src.find("\n", end)
    if le == -1 or src[end:le].strip():
        return (start, end, rep)
    return (ls, le + 1, (rep + "\n") if rep else "")


def strip_lead_comment(src: str, start: int) -> int:
    """Move `start` back over a short standalone HTML comment + blank line."""
    line_start = src.rfind("\n", 0, start) + 1
    if src[line_start:start].strip():
        return start           # something else on the line; leave it
    head = src[:line_start]
    m = LEAD_COMMENT_RE.search(head)
    return m.start() if m else line_start


# --------------------------------------------------------------------------
# core
# --------------------------------------------------------------------------
class Result:
    def __init__(self, path):
        self.path = path
        self.changed = False
        self.kept = []        # [(lang, reason)]
        self.removed = []     # [lang]
        self.notes = []
        self.before = 0
        self.after = 0


def find_blocks(src: str):
    """[(lang, start, end)] for every data-lang-content div, outermost first."""
    out = []
    pos = 0
    while True:
        m = BLOCK_OPEN_RE.search(src, pos)
        if not m:
            return out
        end = match_div(src, m.start(), m.end())
        out.append((m.group(1), m.start(), end))
        pos = end


def process(path: str, strict_index: bool, keep: str = "en") -> Result:
    r = Result(path)
    src = open(path, encoding="utf-8").read()
    r.before = len(src.encode("utf-8"))
    r.after = r.before

    blocks = [(LANG_ALIAS.get(l, l), s, e) for l, s, e in find_blocks(src)]

    slug = os.path.basename(path)
    by_lang = {}
    for lang, s, e in blocks:
        by_lang.setdefault(lang, []).append((s, e))

    others = tuple(l for l in ALL_LANGS if l != keep)
    if not blocks:
        return r                                   # already clean / not the pattern
    if not any(l in by_lang for l in others):
        # Only the kept language is wrapped.  Unwrap it anyway IF the wrapper is
        # a language shell: two pages carry their whole body in a bare
        # <div class="essay-lang" data-lang-content="en"> with no `active`
        # class, so `.essay-lang{display:none}` hides the entire article until
        # the inline toggle script runs.  But on twelve zh pages the attribute
        # sits on the <div class="essay-body"> itself, with no hiding rule --
        # unwrapping there would strip the styling hook, so leave those alone.
        s0, e0 = by_lang[keep][0]
        if not re.search(r'class="[^"]*\b(?:essay|bl)-lang\b',
                         BLOCK_OPEN_RE.match(src, s0).group(0)):
            return r
        r.notes.append("lone %s block unwrapped (was CSS-hidden pending JS)" % keep)
    if keep not in by_lang:
        # Some pages leave the kept language unwrapped and wrap only the
        # foreign ones: there is nothing to unwrap, just blocks to drop.
        r.notes.append("no data-lang-content=\"%s\" block; foreign blocks only" % keep)

    # --- mirror gate -------------------------------------------------------
    deletable = set()
    for lang in others:
        if lang not in by_lang:
            continue
        mirror = os.path.join(ROOT, BLOG_DIR[lang], slug)
        if not os.path.exists(mirror):
            r.kept.append((lang, "mirror missing: %s/%s" % (BLOG_DIR[lang], slug)))
            continue
        mirror_html = open(mirror, encoding="utf-8").read()
        block_html = src[by_lang[lang][0][0]:by_lang[lang][0][1]]
        if is_listing_block(block_html) and not strict_index:
            deletable.add(lang)
            r.notes.append("%s: listing block, mirror-exists gate (cards link to EN URLs)" % lang)
            continue

        a, b = visible_text(block_html), mirror_text(mirror_html)
        if len(b) < STUB_CHARS:
            r.kept.append((lang, "mirror is a stub (%d chars of <main> text)" % len(b)))
            continue
        cov = coverage(a, b)
        if cov + 1e-9 >= MIN_COVERAGE:
            deletable.add(lang)
        elif len(b) >= len(a):
            # A separate, later translation of the same slug rather than the
            # same text: character-level overlap is low because two independent
            # renderings of one English source share little verbatim.  The
            # mirror is at least as substantial as the block, so nothing is
            # lost by dropping the inline copy.
            deletable.add(lang)
            r.notes.append("%s: divergent translation, mirror >= block "
                           "(cov %.0f%%, %d vs %d chars)" % (lang, cov * 100, len(b), len(a)))
        else:
            r.kept.append((lang, "mirror diverges AND is shorter (cov %.0f%%, "
                                 "%d vs %d chars)" % (cov * 100, len(b), len(a))))

    # All-or-nothing per page: unwrapping the EN block while leaving a foreign
    # block (and its switcher) in place would give the switcher an EN button
    # with no target.  A page with any failing block is left byte-identical.
    if any(l in by_lang for l in others) and not all(
            l in deletable for l in others if l in by_lang):
        return r

    # --- rewrite, back to front so offsets stay valid ----------------------
    edits = []   # (start, end, replacement)

    for lang, s, e in blocks:
        if lang == keep:
            om = BLOCK_OPEN_RE.match(src, s)
            inner = trim_edges(src, om.end(), e - len("</div>"))
            edits.append(whole_lines(src, strip_lead_comment(src, s), e, inner))
        elif lang in deletable:
            edits.append(whole_lines(src, strip_lead_comment(src, s), e, ""))
            r.removed.append(lang)

    # in-body switcher: drop only once no foreign block is left to switch to
    if not [l for l in others if l in by_lang and l not in deletable]:
        for m in SWITCHER_OPEN_RE.finditer(src):
            end = match_div(src, m.start(), m.end())
            edits.append(whole_lines(src, strip_lead_comment(src, m.start()), end, ""))

        # inline lang-toggle script (never ld+json, never external)
        for m in SCRIPT_RE.finditer(src):
            attrs, body = m.group(1), m.group(2)
            if "ld+json" in attrs or "src=" in attrs:
                continue
            if not re.search(r"essay-lang|bl-lang|lang-btn|langContent", body):
                r.notes.append("kept a non-toggle inline <script>")
                continue
            edits.append(whole_lines(src, strip_lead_comment(src, m.start()), m.end(), ""))

    if not edits:
        return r

    edits.sort(key=lambda t: t[0], reverse=True)
    out = src
    for s, e, rep in edits:
        out = out[:s] + rep + out[e:]

    # self-check: never hand back HTML whose <div> nesting got worse
    def balance(t):
        return len(re.findall(r"<div\b", t)) - len(re.findall(r"</div\s*>", t))
    if balance(out) != balance(src):
        r.kept.append(("-", "REFUSED: <div> balance %d -> %d"
                       % (balance(src), balance(out))))
        return r

    if out != src:
        r.changed = True
        r.after = len(out.encode("utf-8"))
        r.new_src = out
    return r


# --------------------------------------------------------------------------
# mode 2: demote the non-active languages' <h1>
# --------------------------------------------------------------------------
def page_lang(src: str) -> str:
    """The data-lang-content token matching the page's own <html lang>."""
    m = HTML_LANG_RE.search(src)
    if not m:
        return ""
    tag = m.group(1).strip().lower()
    return HTML_LANG_TO_BLOCK.get(tag) or HTML_LANG_TO_BLOCK.get(tag.split("-")[0], "")


def visible_h1_count(src: str) -> int:
    """<h1> openers outside <script>/<style>/comments."""
    masked = SCRIPT_RE.sub(lambda m: " " * len(m.group(0)), src)
    masked = STYLE_RE.sub(lambda m: " " * len(m.group(0)), masked)
    masked = re.sub(r"<!--.*?-->", lambda m: " " * len(m.group(0)), masked, flags=re.S)
    return len(H1_OPEN_RE.findall(masked))


def demote_h1(block: str) -> tuple:
    """Rewrite every <h1> in `block` as an aria-labelled <p>. -> (html, n)."""
    n = 0

    def sub(m):
        nonlocal n
        attrs, inner = m.group(1), m.group(2)
        if ROLE_RE.search(attrs):        # already carries a role; leave it alone
            return m.group(0)
        n += 1
        return '<p%s role="heading" aria-level="1">%s</p>' % (attrs.rstrip(), inner)

    return H1_TAG_RE.sub(sub, block), n


def process_demote(path: str) -> Result:
    """Keep every language block, but leave only the active locale with an <h1>."""
    r = Result(path)
    src = open(path, encoding="utf-8").read()
    r.before = r.after = len(src.encode("utf-8"))

    if visible_h1_count(src) < 2:
        return r                                    # already single-h1

    active = page_lang(src)
    if not active:
        r.kept.append(("-", "no <html lang>; cannot tell which h1 to keep"))
        return r

    blocks = [(LANG_ALIAS.get(l, l), s0, e0) for l, s0, e0 in find_blocks(src)]
    if not blocks:
        r.kept.append(("-", "%d h1 but no data-lang-content blocks" % visible_h1_count(src)))
        return r
    if not any(l == active for l, _, _ in blocks):
        r.kept.append(("-", "no data-lang-content=\"%s\" block to keep" % active))
        return r

    out, total = src, 0
    for lang, s0, e0 in sorted(blocks, key=lambda t: t[1], reverse=True):
        if lang == active:
            continue
        new_block, n = demote_h1(out[s0:e0])
        if n:
            out = out[:s0] + new_block + out[e0:]
            total += n
            r.removed.append(lang)

    if not total:
        return r

    left = visible_h1_count(out)
    if left != 1:
        r.kept.append(("-", "REFUSED: %d h1 would remain (expected 1)" % left))
        return r

    r.changed = True
    r.after = len(out.encode("utf-8"))
    r.notes.append("kept %s h1; demoted %d (%s)" % (active, total, ",".join(r.removed)))
    r.new_src = out
    return r


def main() -> int:
    global MIN_COVERAGE
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    ap.add_argument("--strict-index", action="store_true",
                    help="apply the text-coverage gate to listing pages too")
    ap.add_argument("--only", action="append", default=[], metavar="PATH",
                    help="process just this path (relative to repo root); repeatable")
    ap.add_argument("--min-coverage", type=float, default=None, metavar="F",
                    help="override MIN_COVERAGE (default %.2f): how much of an "
                         "inline block's text the locale mirror must carry "
                         "before the block may be dropped" % MIN_COVERAGE)
    ap.add_argument("--demote-inactive-h1", action="store_true",
                    help="second mode: delete nothing, but demote every "
                         "non-active-language <h1> to <p role=heading "
                         "aria-level=1> so the page has exactly one <h1>")
    ap.add_argument("--keep", default="en", choices=ALL_LANGS,
                    help="language block to keep (default: en). Use with --dir "
                         "to clean a locale mirror that carries the same defect.")
    ap.add_argument("--dir", default="blog",
                    help="directory of pages to process (default: blog)")
    args = ap.parse_args()

    if args.min_coverage is not None:
        MIN_COVERAGE = args.min_coverage

    if args.only:
        paths = [os.path.join(ROOT, o) for o in args.only]
    else:
        paths = sorted(
            os.path.join(ROOT, args.dir, f)
            for f in os.listdir(os.path.join(ROOT, args.dir))
            if f.endswith(".html")
        )

    changed = kept = 0
    before_total = after_total = 0
    exceptions = []

    for p in paths:
        r = (process_demote(p) if args.demote_inactive_h1
             else process(p, args.strict_index, args.keep))
        rel = os.path.relpath(p, ROOT)
        if r.kept:
            exceptions.append((rel, r.kept))
            kept += 1
        if r.changed:
            changed += 1
            before_total += r.before
            after_total += r.after
            if args.apply:
                open(p, "w", encoding="utf-8").write(r.new_src)
            print("%-8s %-58s %7d -> %7d  removed=%s%s%s" % (
                "WRITE" if args.apply else "DRY", rel, r.before, r.after,
                ",".join(r.removed) or "-",
                ("  [" + "; ".join("%s: %s" % k for k in r.kept) + "]") if r.kept else "",
                ("  " + "; ".join(r.notes)) if r.notes else ""))

    print("\n%d page(s) %s; %d byte(s) -> %d (-%d, -%.1f%%)" % (
        changed, "written" if args.apply else "would change",
        before_total, after_total, before_total - after_total,
        100.0 * (before_total - after_total) / before_total if before_total else 0))

    if exceptions:
        print("\n%d page(s) with a block KEPT (mirror missing or too different):" % len(exceptions))
        for rel, ks in exceptions:
            for lang, why in ks:
                print("  %-58s %-4s %s" % (rel, lang, why))
    return 0


if __name__ == "__main__":
    sys.exit(main())
