#!/usr/bin/env python3
"""
normalize.py — deterministic PRE-PASS for the asaptic.com theme-unification build.

Makes hand-written pages structurally uniform so the later shell injector
(_shell/apply_shell.py or similar, which replaces <nav>...</nav> and
<footer>...</footer> wholesale) can run without refusing.

Target shape per in-scope page, inside <body>...</body>:

    <body>
      [optional <a class="rb-skip-link">]
      <nav>...</nav>              <- exactly one, top-level (not nested in <main>)
      [optional <header>...</header>]   <- page content (hero), top-level
      <main>...</main>            <- exactly one
      <footer>...</footer>        <- exactly one, top-level, immediately after </main>
      [trailing <script> tags]
    </body>

What this script does, per in-scope file:

  1. MAIN-WRAP: if the file has zero <main> elements but has exactly one
     top-level <nav> and exactly one top-level <footer>, wrap everything
     between the end of the nav (or an immediately-following top-level
     <header>, if present) and the start of the footer in a bare <main>.
     Refuses if this is ambiguous (nav count != 1, footer count != 1, no
     content to wrap).

  2. FOOTER NORMALIZE (requires a <main> to exist, either originally or via
     step 1): classifies footers relative to <main> as
       - "after"  : already a top-level sibling right after </main> -> OK.
       - "nested" : last non-trivial child of <main>, no "after" footer
                    exists -> MOVE it to immediately after </main>.
       - none     : zero footers at all -> INSERT a placeholder footer
                    (`class` chosen by family: blog -> essay-footer,
                    robot/101 + university lesson pages -> rb-site-footer,
                    compliance-index.html -> footer) immediately after
                    </main>. Refuses for any other family (no authorized
                    placeholder class).
       - "after" exists AND "nested" also exists -> the nested one is
         left alone as page content (e.g. a per-article back-link block)
         and just reported.
       - multiple top-level footers, or a footer before <main>, or
         multiple nested-with-zero-after -> refuse (ambiguous).

  3. HERO HEADER ATTRIBUTE: for a top-level <header> (not nested in <main>)
     whose class attribute contains "hero", adds data-page-content="hero"
     so the injector knows it is page content, not chrome, and leaves it
     alone. Idempotent (skipped if the attribute is already present).

  4. REPORT-ONLY (never mutated): a second, nested-in-<main> <nav> (e.g.
     class="rb-langs" / "tw-langs" / any other class) and any
     `.lang-switcher` / `.essay-lang-switcher` <div> — these drive
     client-side language toggling and the shell injector already knows
     to leave them; this script only counts them for the report. Also
     validates rule F (exactly one top-level <nav>) and refuses (never
     mutates) if that is violated.

Never deletes content. Only moves an existing block, inserts an empty
placeholder, or adds one attribute. Idempotent: re-running with --write on
an already-normalized tree produces zero further changes.

Usage:
    python3 _shell/normalize.py                 # dry run (default), prints summary
    python3 _shell/normalize.py --write          # apply changes
    python3 _shell/normalize.py --log out.json   # where to write the per-file JSON log
    python3 _shell/normalize.py --only blog/absence-inference-problem.html  # limit to paths (repeatable)
"""

import argparse
import fnmatch
import json
import os
import re
import sys
from collections import defaultdict

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------------------
# Exclusion rules (mirrors the brief's EXCLUDE list + _shell/qc.py convention)
# ---------------------------------------------------------------------------

EXCLUDE_DIR_NAME_ANYWHERE = {
    "node_modules", "_qc", ".qc-tmp", ".git", ".wrangler", ".github",
}
EXCLUDE_DIR_PREFIX_ANYWHERE = ("_design_previews", "test")  # "test*" glob incl. test, tests

EXCLUDE_DIR_EXACT_PATHS = {
    "standard", "zh/standard", "zht/standard", "pt/standard",
    "tender/archive", "demo/match", "proof",
    "_shell",  # this tooling dir (contains include-fragment templates, no <body>)
}

FLAT_LOCALE_BASENAMES = {
    "trade-ai.html", "tenders.html", "suppliers.html",
    "standards.html", "platform.html", "contact.html",
}
FLAT_ROOT_LOCALE_RE = re.compile(
    r"^(index|trade-ai|tenders|suppliers|standards|platform|contact)\.(en|zh-CN|zh-HK|pt)\.html$"
)

EXCLUDE_EXACT_FILES = {
    "index.html", "tender/index.html", "zh/tender/index.html", "zht/tender/index.html",
}


def is_excluded(relpath):
    """relpath uses forward slashes, relative to repo root, no leading ./"""
    parts = relpath.split("/")

    # dir-name-anywhere excludes (any path component)
    for p in parts[:-1]:
        if p in EXCLUDE_DIR_NAME_ANYWHERE:
            return True
        if any(p.startswith(pref) for pref in EXCLUDE_DIR_PREFIX_ANYWHERE):
            return True

    # exact directory-prefix excludes
    for i in range(1, len(parts)):
        prefix = "/".join(parts[:i])
        if prefix in EXCLUDE_DIR_EXACT_PATHS:
            return True

    if relpath in EXCLUDE_EXACT_FILES:
        return True

    if relpath.startswith("assets/") and relpath.endswith(".html") and "/" not in relpath[len("assets/"):]:
        return True

    dirname = "/".join(parts[:-1])
    basename = parts[-1]

    # root flat locale files: index.en.html, tenders.zh-HK.html, etc.
    if dirname == "" and FLAT_ROOT_LOCALE_RE.match(basename):
        return True

    # zh|zht|pt / (trade-ai|tenders|suppliers|standards|platform|contact).html
    if dirname in ("zh", "zht", "pt") and basename in FLAT_LOCALE_BASENAMES:
        return True

    return False


def discover_files(include_only=None):
    out = []
    for root, dirs, files in os.walk(REPO_ROOT):
        rel_root = os.path.relpath(root, REPO_ROOT)
        rel_root = "" if rel_root == "." else rel_root.replace(os.sep, "/")
        # prune excluded dirs early
        pruned = []
        for d in dirs:
            rp = f"{rel_root}/{d}" if rel_root else d
            if d in EXCLUDE_DIR_NAME_ANYWHERE:
                continue
            if any(d.startswith(pref) for pref in EXCLUDE_DIR_PREFIX_ANYWHERE):
                continue
            if rp in EXCLUDE_DIR_EXACT_PATHS:
                continue
            pruned.append(d)
        dirs[:] = pruned

        for fn in files:
            if not fn.endswith(".html"):
                continue
            relpath = f"{rel_root}/{fn}" if rel_root else fn
            if is_excluded(relpath):
                continue
            if include_only and relpath not in include_only:
                continue
            out.append(relpath)
    return sorted(out)


# ---------------------------------------------------------------------------
# Structural parsing helpers (regex-based, stack-counted per tag name — good
# enough for this hand-written, shallow-nesting corpus; never used to parse
# arbitrary/adversarial HTML).
# ---------------------------------------------------------------------------

VOID_ELEMENTS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
}

# Tokenizes: HTML comments and whole <script>/<style> blocks (consumed and
# ignored so their contents can never be mistaken for markup tags), any
# opening tag, and any closing tag.
_TOKEN_RE = re.compile(
    r"<!--.*?-->"
    r"|<script\b[^>]*>[\s\S]*?</script\s*>"
    r"|<style\b[^>]*>[\s\S]*?</style\s*>"
    r"|<[a-zA-Z][a-zA-Z0-9:_-]*(?:\s[^<>]*)?/?>"
    r"|</[a-zA-Z][a-zA-Z0-9:_-]*\s*>",
    re.DOTALL,
)
_OPEN_NAME_RE = re.compile(r"^<([a-zA-Z][a-zA-Z0-9:_-]*)")
_CLOSE_NAME_RE = re.compile(r"^</([a-zA-Z][a-zA-Z0-9:_-]*)")


def direct_children_of_body(body_text):
    """Full-tag stack parser (comments/script/style contents ignored, void
    elements never pushed). Returns, IN DOCUMENT ORDER, every element that is
    a genuine direct child of <body> — i.e. NOT nested inside any other
    element — as dicts: {tag, open_start, open_end, close_start, close_end}.

    This is the load-bearing correctness guard: an element must appear in
    this list to ever be trusted as a structural anchor (nav/header/main/
    footer). A <nav> sitting inside a <header class="shell"> wrapper, for
    example, will NOT appear here — it is one level too deep."""
    stack = []  # each item: {"name": str, "open_start": int, "open_end": int, "is_candidate": bool}
    results = []
    for m in _TOKEN_RE.finditer(body_text):
        tok = m.group(0)
        low = tok.lower()
        if low.startswith("<!--") or low.startswith("<script") or low.startswith("<style"):
            # comment, or a whole <script>...</script> / <style>...</style>
            # block consumed verbatim by the regex — never affects depth.
            continue
        if tok.startswith("</"):
            name_m = _CLOSE_NAME_RE.match(tok)
            name = name_m.group(1).lower() if name_m else None
            if not stack:
                continue  # stray/unbalanced close tag, ignore
            popped = stack.pop()
            if not stack and popped.get("is_candidate"):
                results.append({
                    "tag": popped["name"],
                    "open_start": popped["open_start"],
                    "open_end": popped["open_end"],
                    "close_start": m.start(),
                    "close_end": m.end(),
                })
            continue
        # opening tag
        name_m = _OPEN_NAME_RE.match(tok)
        name = name_m.group(1).lower() if name_m else None
        if name is None:
            continue
        self_closing = tok.rstrip().endswith("/>")
        if self_closing or name in VOID_ELEMENTS:
            continue  # never affects depth
        stack.append({
            "name": name,
            "open_start": m.start(),
            "open_end": m.end(),
            "is_candidate": (len(stack) == 0),
        })
    return results


def find_top_level_tag_spans(text, tag):
    """Body-direct-child spans (see direct_children_of_body) for one tag
    name, as (open_start, open_end, close_start, close_end) tuples in
    document order."""
    return [
        (c["open_start"], c["open_end"], c["close_start"], c["close_end"])
        for c in direct_children_of_body(text)
        if c["tag"] == tag
    ]


def get_body_span(text):
    m = re.search(r"<body\b[^>]*>", text)
    if not m:
        return None
    body_start = m.end()
    m2 = re.search(r"</body\s*>", text)
    body_end = m2.start() if m2 else len(text)
    return body_start, body_end


def apply_edits(text, edits):
    """edits: list of (start, end, replacement) in ORIGINAL text offsets,
    non-overlapping. Returns the new text."""
    edits = sorted(edits, key=lambda e: e[0])
    out = []
    cursor = 0
    for start, end, repl in edits:
        assert start >= cursor, f"overlapping edit at {start} (cursor={cursor})"
        out.append(text[cursor:start])
        out.append(repl)
        cursor = end
    out.append(text[cursor:])
    return "".join(out)


# ---------------------------------------------------------------------------
# Family classification (for report grouping + placeholder footer class)
# ---------------------------------------------------------------------------

def classify_family(relpath):
    parts = relpath.split("/")
    if parts[0] in ("blog",) or (len(parts) > 1 and parts[0] in ("zh", "zht", "pt") and parts[1] == "blog"):
        return "blog"
    locale_prefixes = ("", "zh/", "zht/", "pt/")
    if any(relpath.startswith(p + "robot/101/") for p in locale_prefixes):
        return "robot101"
    if any(
        relpath.startswith(p + "university/") and relpath != p + "university/index.html"
        for p in locale_prefixes
    ):
        return "university_lesson"
    if re.match(r"^tender/(mo|sg|gb|au)/index\.html$", relpath):
        return "tender_locale"
    if relpath in {
        "changelog/index.html", "security/index.html", "status/index.html",
        "scout/index.html", "demos/index.html", "demo/index.html",
        "demo/proof-lab/index.html",
    }:
        return "bridge_page"
    root_oneoffs = {"crossings", "press", "engage", "thesis", "privacy",
                     "compliance-index", "process", "resources"}
    if len(parts) == 1 and parts[0].rsplit(".html", 1)[0] in root_oneoffs:
        return "root_oneoff"
    if len(parts) == 2 and parts[0] in ("zh", "zht", "pt") and parts[1].rsplit(".html", 1)[0] in root_oneoffs:
        return "root_oneoff"
    return "other"


PLACEHOLDER_FOOTER_CLASS = {
    "blog": "essay-footer",
    "robot101": "rb-site-footer",
    "university_lesson": "rb-site-footer",
}


def placeholder_footer_html(family, relpath):
    if family in PLACEHOLDER_FOOTER_CLASS:
        cls = PLACEHOLDER_FOOTER_CLASS[family]
        return f'<footer class="{cls}"></footer>'
    if relpath == "compliance-index.html":
        return '<footer class="footer"></footer>'
    return None


# ---------------------------------------------------------------------------
# Per-file processing
# ---------------------------------------------------------------------------

class Refused(Exception):
    def __init__(self, reason):
        self.reason = reason


def step_wrap_main(text):
    """If body has 0 <main>, attempt to wrap. Returns (new_text, changed:bool)."""
    body_span = get_body_span(text)
    if not body_span:
        raise Refused("no <body> tag found")
    body_start, body_end = body_span
    body = text[body_start:body_end]

    main_spans = find_top_level_tag_spans(body, "main")
    if len(main_spans) >= 1:
        if len(main_spans) > 1:
            raise Refused(f"multiple top-level <main> elements ({len(main_spans)})")
        return text, False  # nothing to wrap, main already present

    nav_spans = find_top_level_tag_spans(body, "nav")
    if len(nav_spans) != 1:
        raise Refused(f"no <main> and expected exactly 1 top-level <nav> to anchor a wrap, found {len(nav_spans)}")
    _, nav_open_end, _, nav_close_end = nav_spans[0]

    footer_spans = find_top_level_tag_spans(body, "footer")
    if len(footer_spans) != 1:
        raise Refused(f"no <main> and expected exactly 1 top-level <footer> to anchor a wrap, found {len(footer_spans)}")
    footer_open_start, _, _, _ = footer_spans[0]

    if footer_open_start <= nav_close_end:
        raise Refused("footer appears at/before the nav close — cannot determine a wrap region")

    # If a top-level <header> sits immediately after the nav (only whitespace
    # in between) and closes before the footer, wrap starts after it instead.
    header_spans = find_top_level_tag_spans(body, "header")
    wrap_start = nav_close_end
    for h_open_start, h_open_end, h_close_start, h_close_end in header_spans:
        if h_open_start >= nav_close_end and body[nav_close_end:h_open_start].strip() == "" and h_close_end <= footer_open_start:
            wrap_start = h_close_end
            break

    wrap_end = footer_open_start
    inner = body[wrap_start:wrap_end]
    if not inner.strip():
        raise Refused("no content between nav/header and footer to wrap in <main>")

    new_inner = "\n<main>" + inner + "</main>\n"
    new_body = body[:wrap_start] + new_inner + body[wrap_end:]
    new_text = text[:body_start] + new_body + text[body_end:]
    return new_text, True


def step_footer_normalize(text, family, relpath):
    """Requires a <main> to exist. Returns (new_text, actions:list[str])."""
    body_span = get_body_span(text)
    body_start, body_end = body_span
    body = text[body_start:body_end]

    main_spans = find_top_level_tag_spans(body, "main")
    if len(main_spans) != 1:
        raise Refused(f"expected exactly 1 top-level <main> for footer normalization, found {len(main_spans)}")
    main_open_s, main_open_e, main_close_s, main_close_e = main_spans[0]

    footer_spans = find_top_level_tag_spans(body, "footer")
    nested, after, before = [], [], []
    for fs in footer_spans:
        fo_s = fs[0]
        if fo_s < main_open_s:
            before.append(fs)
        elif main_open_e <= fo_s < main_close_s:
            nested.append(fs)
        elif fo_s >= main_close_e:
            after.append(fs)
        else:
            # falls inside the <main ...> opening tag itself — shouldn't happen
            raise Refused("footer position could not be classified relative to <main>")

    if before:
        raise Refused(f"{len(before)} <footer> element(s) appear before <main> — unexpected structure")
    if len(after) > 1:
        raise Refused(f"{len(after)} top-level <footer> elements already after </main> — ambiguous")

    actions = []

    if len(after) == 1:
        if nested:
            actions.append(f"left {len(nested)} nested <footer> inside <main> as content (top-level footer already present)")
        return text, actions  # already correct, no mutation

    # len(after) == 0 from here
    if len(nested) > 1:
        raise Refused(f"{len(nested)} nested <footer> elements and 0 top-level ones — ambiguous which to promote")

    if len(nested) == 1:
        fo_s, fo_e, fc_s, fc_e = nested[0]
        footer_block = body[fo_s:fc_e]
        edits = [
            (fo_s, fc_e, ""),  # remove nested footer from inside main
        ]
        new_body = apply_edits(body, edits)
        # recompute main close position in the edited body (offset shifts
        # by len(removed) since removal happened before main_close_s)
        removed_len = fc_e - fo_s
        new_main_close_e = main_close_e - removed_len
        new_body = new_body[:new_main_close_e] + "\n" + footer_block + new_body[new_main_close_e:]
        # cosmetic: collapse 3+ blank lines left behind by the removal
        new_body = re.sub(r"\n[ \t]*\n[ \t]*\n+", "\n\n", new_body)
        new_text = text[:body_start] + new_body + text[body_end:]
        actions.append("moved nested <footer> from inside <main> to immediately after </main>")
        return new_text, actions

    # len(nested) == 0 and len(after) == 0: no footer at all
    placeholder = placeholder_footer_html(family, relpath)
    if placeholder is None:
        raise Refused(f"zero <footer> elements and family '{family}' has no authorized placeholder class")
    new_body = body[:main_close_e] + "\n" + placeholder + body[main_close_e:]
    new_text = text[:body_start] + new_body + text[body_end:]
    actions.append(f"inserted placeholder footer after </main>: {placeholder}")
    return new_text, actions


def step_hero_header_attr(text):
    body_span = get_body_span(text)
    body_start, body_end = body_span
    body = text[body_start:body_end]

    main_spans = find_top_level_tag_spans(body, "main")
    main_open_s = main_spans[0][0] if main_spans else None

    header_spans = find_top_level_tag_spans(body, "header")
    edits = []
    actions = []
    for h_open_s, h_open_e, h_close_s, h_close_e in header_spans:
        if main_open_s is not None and h_open_s >= main_open_s:
            continue  # nested in/after main -> content already, not chrome-adjacent
        open_tag = body[h_open_s:h_open_e]
        if "data-page-content" in open_tag:
            continue  # idempotent skip
        cls_m = re.search(r'class\s*=\s*"([^"]*)"', open_tag)
        if not cls_m or not re.search(r"\bhero\b", cls_m.group(1)):
            continue
        new_open_tag = open_tag[:-1].rstrip() + ' data-page-content="hero">'
        edits.append((h_open_s, h_open_e, new_open_tag))
        actions.append('added data-page-content="hero" to top-level content <header>')

    if not edits:
        return text, actions
    new_body = apply_edits(body, edits)
    new_text = text[:body_start] + new_body + text[body_end:]
    return new_text, actions


def step_report_only(text):
    """Never mutates. Returns dict of counts for the report."""
    body_span = get_body_span(text)
    body_start, body_end = body_span
    body = text[body_start:body_end]

    main_spans = find_top_level_tag_spans(body, "main")
    main_span = main_spans[0] if len(main_spans) == 1 else None

    nav_spans = find_top_level_tag_spans(body, "nav")
    top_level_navs = 0
    nested_navs = []
    for ns in nav_spans:
        no_s = ns[0]
        if main_span and main_span[0] <= no_s < main_span[2]:
            open_tag = body[ns[0]:ns[1]]
            cls_m = re.search(r'class\s*=\s*"([^"]*)"', open_tag)
            nested_navs.append(cls_m.group(1) if cls_m else "(no class)")
        else:
            top_level_navs += 1

    lang_switcher_count = len(re.findall(r'class\s*=\s*"[^"]*\b(?:essay-lang-switcher|lang-switcher)\b', body))

    nav_rule_violation = None
    if top_level_navs != 1:
        nav_rule_violation = f"expected exactly 1 top-level <nav>, found {top_level_navs}"

    return {
        "top_level_navs": top_level_navs,
        "nested_navs": nested_navs,
        "lang_switcher_divs": lang_switcher_count,
        "nav_rule_violation": nav_rule_violation,
    }


def process_file(relpath, write):
    abspath = os.path.join(REPO_ROOT, relpath)
    with open(abspath, "r", encoding="utf-8") as f:
        original = f.read()

    family = classify_family(relpath)
    record = {"path": relpath, "family": family, "actions": [], "refused": False, "refused_reason": None,
              "report": {}}

    text = original
    try:
        text, wrapped = step_wrap_main(text)
        if wrapped:
            record["actions"].append("wrapped bare <main> around content between nav/header and footer")

        text, footer_actions = step_footer_normalize(text, family, relpath)
        record["actions"].extend(footer_actions)

        text, header_actions = step_hero_header_attr(text)
        record["actions"].extend(header_actions)

        record["report"] = step_report_only(text)
        if record["report"]["nav_rule_violation"]:
            raise Refused(record["report"]["nav_rule_violation"])

    except Refused as r:
        record["refused"] = True
        record["refused_reason"] = r.reason
        return record, False

    changed = text != original
    if changed and write:
        with open(abspath, "w", encoding="utf-8") as f:
            f.write(text)

    return record, changed


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--write", action="store_true", help="apply changes (default is dry-run)")
    ap.add_argument("--log", default=None, help="path to write the combined per-file JSON log")
    ap.add_argument("--only", action="append", default=None, help="limit to this repo-relative path (repeatable)")
    args = ap.parse_args()

    include_only = set(args.only) if args.only else None
    files = discover_files(include_only)

    records = []
    changed_count = 0
    for relpath in files:
        record, changed = process_file(relpath, write=args.write)
        records.append(record)
        if changed:
            changed_count += 1

    # ---- summary ----
    by_family_action = defaultdict(lambda: defaultdict(int))
    refusals = []
    for r in records:
        if r["refused"]:
            refusals.append(r)
            by_family_action[r["family"]]["REFUSED"] += 1
            continue
        if not r["actions"]:
            by_family_action[r["family"]]["no-op (already correct)"] += 1
        for a in r["actions"]:
            # bucket by short action type
            if a.startswith("wrapped"):
                key = "wrapped <main>"
            elif a.startswith("moved"):
                key = "moved nested footer"
            elif a.startswith("inserted"):
                key = "inserted placeholder footer"
            elif a.startswith("left"):
                key = "left nested footer (reported)"
            elif a.startswith("added"):
                key = "added data-page-content=hero"
            else:
                key = a
            by_family_action[r["family"]][key] += 1

    mode = "WRITE" if args.write else "DRY-RUN"
    print(f"=== normalize.py [{mode}] ===")
    print(f"scanned: {len(files)} in-scope files | changed: {changed_count} | refused: {len(refusals)}")
    print()
    print("--- actions by family ---")
    for fam in sorted(by_family_action):
        print(f"  {fam}:")
        for action, count in sorted(by_family_action[fam].items()):
            print(f"    {count:4d}  {action}")
    print()
    if refusals:
        print(f"--- refusals ({len(refusals)}) ---")
        for r in refusals:
            print(f"  {r['path']}: {r['refused_reason']}")
        print()

    if args.log:
        log_path = args.log
    else:
        log_path = None

    if log_path:
        with open(log_path, "w", encoding="utf-8") as f:
            json.dump(records, f, indent=2, ensure_ascii=False)
        print(f"log written: {log_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
