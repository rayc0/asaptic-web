#!/usr/bin/env python3
"""page_dedupe.py — the blog dedupe, generalized to any locale-mirrored page.

Same defect, outside blog/
--------------------------
Fourteen non-blog pages (privacy, legal/privacy, legal/terms, crossings,
press, thesis, engage and their zh/zht/pt mirrors) ship ALL THREE language
bodies inline as

    <div class="privacy-lang" data-lang-content="en|zh|zht"> ... </div>

CSS-hidden (`.privacy-lang{display:none}`) until an inline toggle <script>
adds `.active`.  So the identical Simplified-Chinese text is served from
/privacy AND /zh/privacy AND /zht/privacy AND /pt/privacy — four URLs, one
body, all of them hreflang-linked to each other.  Worse, the toggle script
rewrites `document.documentElement.lang` from the visitor's browser locale,
so the EN URL can end up declaring itself `zh-CN`.

This module is a thin CLI over blog_dedupe.process(): every gate, the
all-or-nothing rule, the <div>-balance self-check and the switcher/script
cleanup are the blog implementation, unchanged.  The only thing it replaces is
where a mirror lives — blog/<slug> -> <locale>/blog/<slug> becomes the generic
<base> -> <locale>/<base>.

    _shell/page_dedupe.py --file privacy.html --keep en
    _shell/page_dedupe.py --file zh/legal/terms.html          # --keep auto
    _shell/page_dedupe.py --file privacy.html --keep en --apply

Safety gates (inherited verbatim from blog_dedupe)
-------------------------------------------------
  * a non-kept block is deleted only if its locale mirror EXISTS, its <main>
    holds real text (>= STUB_CHARS), and the mirror covers the block
    (>= MIN_COVERAGE shingle/difflib coverage) OR is at least as long as it;
  * all-or-nothing per page — if any block fails, the file is left
    byte-identical and the failure is reported;
  * the in-body switcher and the inline toggle <script> are removed only once
    NO foreign block remains; any inline script that is not purely a toggle is
    kept and reported;
  * idempotent — a page with only its own block is a no-op.

Dry-run is the default; pass --apply to write.
"""

from __future__ import annotations

import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import blog_dedupe as B                                    # noqa: E402

ROOT = B.ROOT

# Locale directories that prefix a mirror path.  "en" is the bare root.
LOCALE_DIRS = ("zh", "zht", "pt")
PAGE_LANGS = ("en", "zh", "zht", "pt")

# Wider than the blog corpus's: these pages name their blocks .privacy-lang /
# .pr-lang / .cx-lang / .th-lang / .eg-lang, and two of them carry no
# `.lang-btn` reference at all.  Still body-only, and blog_dedupe skips ld+json
# and src= scripts before ever consulting this, so a real application script
# can only match if it actually manipulates language blocks.
TOGGLE_BODY_RE = re.compile(
    r"data-lang-content|lang-btn|langContent|asaptic-lang|[\w-]*-lang\b")


def split_locale(rel: str):
    """'zh/legal/terms.html' -> ('zh', 'legal/terms.html');
       'privacy.html'        -> ('en', 'privacy.html')."""
    rel = rel.replace(os.sep, "/").lstrip("./")
    head, _, rest = rel.partition("/")
    if head in LOCALE_DIRS and rest:
        return head, rest
    return "en", rel


def mirror_for(path: str, lang: str) -> str:
    """Absolute path of `path`'s `lang` mirror, under the generic layout."""
    _, base = split_locale(os.path.relpath(os.path.abspath(path), ROOT))
    return os.path.join(ROOT, base if lang == "en" else os.path.join(lang, base))


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--file", action="append", default=[], required=True,
                    metavar="PATH", help="page to process (repo-relative); repeatable")
    ap.add_argument("--keep", default="auto", choices=("auto",) + PAGE_LANGS,
                    help="language block to keep. 'auto' (default) reads the "
                         "page's own <html lang>.")
    ap.add_argument("--apply", action="store_true", help="write (default: dry run)")
    ap.add_argument("--min-coverage", type=float, default=None, metavar="F",
                    help="override the mirror-coverage threshold (default %.2f)"
                         % B.MIN_COVERAGE)
    args = ap.parse_args()

    if args.min_coverage is not None:
        B.MIN_COVERAGE = args.min_coverage

    changed = before_total = after_total = 0
    exceptions = []

    for rel in args.file:
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            print("MISSING  %s" % rel)
            exceptions.append((rel, [("-", "file does not exist")]))
            continue

        src = open(path, encoding="utf-8").read()
        keep = args.keep
        if keep == "auto":
            keep = B.page_lang(src)
            if not keep:
                print("SKIP     %-46s no <html lang>; pass --keep" % rel)
                exceptions.append((rel, [("-", "no <html lang>")]))
                continue

        r = B.process(path, strict_index=False, keep=keep,
                      mirror_path=mirror_for, langs=PAGE_LANGS,
                      toggle_re=TOGGLE_BODY_RE)

        # mirror-coverage numbers, reported whether or not the page changed
        cov_notes = []
        for lang, s0, e0 in [(B.LANG_ALIAS.get(l, l), s, e)
                             for l, s, e in B.find_blocks(src)]:
            if lang == keep:
                continue
            m = mirror_for(path, lang)
            if not os.path.exists(m):
                cov_notes.append("%s:mirror-missing" % lang)
                continue
            a = B.visible_text(src[s0:e0])
            b = B.mirror_text(open(m, encoding="utf-8").read())
            cov_notes.append("%s:%.0f%% (%d blk/%d mir)"
                             % (lang, B.coverage(a, b) * 100, len(a), len(b)))

        if r.kept:
            exceptions.append((rel, r.kept))
        if r.changed:
            changed += 1
            before_total += r.before
            after_total += r.after
            if args.apply:
                open(path, "w", encoding="utf-8").write(r.new_src)
        print("%-8s %-42s keep=%-3s %7d -> %7d  removed=%-10s %s%s" % (
            "WRITE" if (r.changed and args.apply) else ("DRY" if r.changed else "NOOP"),
            rel, keep, r.before, r.after, ",".join(r.removed) or "-",
            " | ".join(cov_notes),
            ("  " + "; ".join(r.notes)) if r.notes else ""))

    print("\n%d page(s) %s; %d -> %d bytes (-%d)" % (
        changed, "written" if args.apply else "would change",
        before_total, after_total, before_total - after_total))

    if exceptions:
        print("\nblocks KEPT / pages refused:")
        for rel, ks in exceptions:
            for lang, why in ks:
                print("  %-42s %-4s %s" % (rel, lang, why))
    return 0


if __name__ == "__main__":
    sys.exit(main())
