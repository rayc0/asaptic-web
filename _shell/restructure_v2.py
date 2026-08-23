#!/usr/bin/env python3
"""
restructure_v2.py — move the 28 flat v2 launch pages (slug.lang.html at repo root)
into the live directory-prefix scheme, rewrite internal hrefs, add canonical/hreflang,
patch the tender header links, add 301 redirects for the old flat URLs, remove the
originals, and verify.

Per DEPLOY_SAFETY_v2_site_2026-08-17.md + explicit task mapping. Run from repo root.
Idempotency: NOT idempotent by design (moves + deletes files) — do not re-run after
a successful pass without resetting the branch.
"""
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
assert (ROOT / ".git").exists() or (ROOT / "_redirects").exists(), f"unexpected ROOT: {ROOT}"

SLUGS = ["index", "trade-ai", "tenders", "suppliers", "standards", "platform", "contact"]
LANGS = ["en", "zh-CN", "zh-HK", "pt"]

LANG_DIR = {"en": "", "zh-CN": "zh", "zh-HK": "zht", "pt": "pt"}
HTML_LANG = {"en": "en", "zh-CN": "zh-Hans", "zh-HK": "zh-Hant", "pt": "pt"}
HREFLANG = {"en": "en", "zh-CN": "zh-Hans", "zh-HK": "zh-Hant", "pt": "pt-PT"}

REPORT_LINES = []


def log(line=""):
    print(line)
    REPORT_LINES.append(line)


def href_for(slug, lang):
    """Clean root-relative URL used in hrefs / canonical / hreflang."""
    d = LANG_DIR[lang]
    if slug == "index":
        return "/" if not d else f"/{d}/"
    prefix = f"/{d}/" if d else "/"
    return f"{prefix}{slug}.html"


def filepath_for(slug, lang):
    """Actual on-disk target file path."""
    d = LANG_DIR[lang]
    fname = "index.html" if slug == "index" else f"{slug}.html"
    return (ROOT / d / fname) if d else (ROOT / fname)


COMBOS = [(s, l) for s in SLUGS for l in LANGS]
HREF_MAP = {(s, l): href_for(s, l) for s, l in COMBOS}
SRC_MAP = {(s, l): ROOT / f"{s}.{l}.html" for s, l in COMBOS}
TGT_MAP = {(s, l): filepath_for(s, l) for s, l in COMBOS}

# combos whose target is allowed to pre-exist (old-theme locale homes to be
# replaced, and the en index which is already a byte copy of index.en.html)
ALLOWED_PREEXISTING = {
    ("index", "en"), ("index", "zh-CN"), ("index", "zh-HK"), ("index", "pt"),
}

OLD_LOCALE_HOME_BACKUP = {
    ("index", "zh-CN"): ROOT / "_qc" / "old_locale_homes" / "zh" / "index.html",
    ("index", "zh-HK"): ROOT / "_qc" / "old_locale_homes" / "zht" / "index.html",
    ("index", "pt"): ROOT / "_qc" / "old_locale_homes" / "pt" / "index.html",
}


def step_mapping_table():
    log("## 28->28 mapping table\n")
    log("| source | target path | href/canonical |")
    log("|---|---|---|")
    for s, l in COMBOS:
        src = SRC_MAP[(s, l)].name
        tgt = TGT_MAP[(s, l)].relative_to(ROOT)
        log(f"| {src} | /{tgt} | {HREF_MAP[(s, l)]} |")
    log("")


def step_verify_index_identical():
    a = (ROOT / "index.html").read_bytes()
    b = (ROOT / "index.en.html").read_bytes()
    identical = a == b
    log(f"## index.html == index.en.html (pre-restructure): {'IDENTICAL' if identical else 'DIFFERS'}")
    if not identical:
        log("ABORT: root index.html is not a byte copy of index.en.html — needs manual review.")
        sys.exit(1)
    log("")


def step_collision_check():
    log("## Collision check (targets that pre-exist)")
    collisions = []
    preexisting_allowed = []
    for combo in COMBOS:
        tgt = TGT_MAP[combo]
        if tgt.exists():
            if combo in ALLOWED_PREEXISTING:
                preexisting_allowed.append(combo)
            else:
                collisions.append(combo)
    if preexisting_allowed:
        log("Pre-existing targets (expected — the 3 old-theme locale homes + en index already a copy):")
        for s, l in preexisting_allowed:
            log(f"  - {s}.{l}.html -> /{TGT_MAP[(s,l)].relative_to(ROOT)}")
    if collisions:
        log("\n🔴 REAL COLLISIONS (existing DIFFERENT page would be clobbered):")
        for s, l in collisions:
            log(f"  - {s}.{l}.html -> /{TGT_MAP[(s,l)].relative_to(ROOT)}")
        log("\nABORTING before any write — resolve collisions first.")
        _flush_report(aborted=True)
        sys.exit(1)
    else:
        log("No real collisions found (other than the 3 expected locale homes).")
    # also check for near-miss dir/file same-stem collisions worth reporting (informational only)
    log("\nInformational — near-miss paths that are NOT filesystem collisions (different path):")
    log("  - /standards.html (new v2 file) vs existing /standards/ (dir, distinct live 'Medical Device Compliance' page) vs /standard/ (dir, charity tool) — no clobber, but names are close; flagged per DEPLOY_SAFETY note.")
    log("  - /tenders.html (new v2 file) vs existing /tender/ (dir, live tender ledger) — different slug, no clobber.")
    log("")


def step_backup_old_locale_homes():
    log("## Backing up old-theme locale homes to _qc/old_locale_homes/")
    for combo, backup_path in OLD_LOCALE_HOME_BACKUP.items():
        src = TGT_MAP[combo]
        backup_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, backup_path)
        log(f"  - backed up /{src.relative_to(ROOT)} -> /{backup_path.relative_to(ROOT)}")
    log("")


TITLE_RE = re.compile(r"<title>(.*?)</title>", re.DOTALL)
HTML_TAG_RE = re.compile(r'(<html\s+lang=")[^"]*(")')


def build_meta_block(slug, lang, title_text):
    own_href = HREF_MAP[(slug, lang)]
    canonical_url = f"https://asaptic.com{own_href}"
    en_url = f"https://asaptic.com{HREF_MAP[(slug, 'en')]}"
    zhcn_url = f"https://asaptic.com{HREF_MAP[(slug, 'zh-CN')]}"
    zhhk_url = f"https://asaptic.com{HREF_MAP[(slug, 'zh-HK')]}"
    pt_url = f"https://asaptic.com{HREF_MAP[(slug, 'pt')]}"
    return (
        f'\n<meta name="description" content="{title_text}">'
        f'\n<link rel="canonical" href="{canonical_url}">'
        f'\n<link rel="alternate" hreflang="en" href="{en_url}">'
        f'\n<link rel="alternate" hreflang="zh-Hans" href="{zhcn_url}">'
        f'\n<link rel="alternate" hreflang="zh-Hant" href="{zhhk_url}">'
        f'\n<link rel="alternate" hreflang="pt-PT" href="{pt_url}">'
        f'\n<link rel="alternate" hreflang="x-default" href="{en_url}">'
        f'\n<meta property="og:type" content="website">'
        f'\n<meta property="og:title" content="{title_text}">'
        f'\n<meta property="og:description" content="{title_text}">'
        f'\n<meta property="og:url" content="{canonical_url}">'
        f'\n<meta property="og:site_name" content="Asaptic">\n'
    )


def transform_and_write():
    log("## Transform + write (28 files)")
    written = []
    for slug, lang in COMBOS:
        src_path = SRC_MAP[(slug, lang)]
        tgt_path = TGT_MAP[(slug, lang)]
        content = src_path.read_text(encoding="utf-8")

        # 1. rewrite internal relative hrefs to every one of the 28 pages
        for s2, l2 in COMBOS:
            old_href = f'href="{s2}.{l2}.html"'
            if old_href in content:
                new_href = f'href="{HREF_MAP[(s2, l2)]}"'
                content = content.replace(old_href, new_href)

        # 2. fix <html lang="...">
        content, n = HTML_TAG_RE.subn(lambda m: m.group(1) + HTML_LANG[lang] + m.group(2), content, count=1)
        if n != 1:
            log(f"  ⚠️ {src_path.name}: <html lang> tag not found/rewritten (n={n})")

        # 3. title + meta/canonical/hreflang block
        m = TITLE_RE.search(content)
        if not m:
            log(f"  ⚠️ {src_path.name}: no <title> found — skipping meta injection")
        else:
            title_text = m.group(1)
            meta_block = build_meta_block(slug, lang, title_text)
            insert_at = m.end()
            content = content[:insert_at] + meta_block + content[insert_at:]

        tgt_path.parent.mkdir(parents=True, exist_ok=True)
        tgt_path.write_text(content, encoding="utf-8")
        written.append((slug, lang, src_path, tgt_path))
        log(f"  - wrote /{tgt_path.relative_to(ROOT)} (from {src_path.name})")
    log("")
    return written


def remove_originals(written):
    log("## Removing the 28 original flat files")
    for slug, lang, src_path, tgt_path in written:
        if src_path.resolve() == tgt_path.resolve():
            log(f"  - SKIP delete (source == target): {src_path.name}")
            continue
        src_path.unlink()
        log(f"  - removed {src_path.name}")
    log("")


def append_redirects():
    log("## _redirects — appended lines")
    redirects_path = ROOT / "_redirects"
    existing = redirects_path.read_text(encoding="utf-8")
    lines = []
    for slug, lang in COMBOS:
        old_url = f"/{slug}.{lang}.html"
        new_url = HREF_MAP[(slug, lang)]
        lines.append(f"{old_url} {new_url} 301")
    new_block = "\n".join(lines) + "\n"
    if not existing.endswith("\n"):
        existing += "\n"
    redirects_path.write_text(existing + new_block, encoding="utf-8")
    for l in lines:
        log(f"  {l}")
    log("")


TENDER_FILES = ["tender/index.html", "zh/tender/index.html", "zht/tender/index.html"]


def patch_tender_headers():
    log("## Patching tender header hrefs (tender/index.html, zh/, zht/)")
    for rel in TENDER_FILES:
        path = ROOT / rel
        content = path.read_text(encoding="utf-8")
        changes = 0
        for s2, l2 in COMBOS:
            old = f'href="https://asaptic.com/{s2}.{l2}.html"'
            if old in content:
                new = f'href="https://asaptic.com{HREF_MAP[(s2, l2)]}"'
                count = content.count(old)
                content = content.replace(old, new)
                changes += count
        path.write_text(content, encoding="utf-8")
        log(f"  - {rel}: {changes} href(s) rewritten")
    log("")


RESIDUAL_EXTS = ("*.html", "*.xml", "*.txt", "*.json", "*.js")
RESIDUAL_PATTERN = re.compile(r"\.(en|zh-CN|zh-HK|pt)\.html")


def grep_residuals():
    log("## Residual references to the flat lang scheme (post-restructure)")
    hits = []
    skip_dirs = {".git", "node_modules", "_qc"}
    for ext in RESIDUAL_EXTS:
        for path in ROOT.rglob(ext):
            if any(part in skip_dirs for part in path.parts):
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            for i, line in enumerate(text.splitlines(), 1):
                if RESIDUAL_PATTERN.search(line):
                    hits.append((path.relative_to(ROOT), i, line.strip()[:160]))
    if not hits:
        log("None found.")
    else:
        for rel, ln, line in hits:
            log(f"  - {rel}:{ln}: {line}")
    log("")
    return hits


def verify_balanced_tags(written):
    log("## Balanced <html>/<head>/<body> check on the 28 moved files")
    problems = []
    for slug, lang, src_path, tgt_path in written:
        text = tgt_path.read_text(encoding="utf-8")
        lower = text.lower()
        for tag in ("html", "head", "body"):
            opens = len(re.findall(rf"<{tag}(\s|>)", lower))
            closes = lower.count(f"</{tag}>")
            if opens != closes or opens == 0:
                problems.append((tgt_path.relative_to(ROOT), tag, opens, closes))
    if not problems:
        log("All 28 balanced (1 open / 1 close each for html/head/body).")
    else:
        for rel, tag, o, c in problems:
            log(f"  ⚠️ {rel}: <{tag}> open={o} close={c}")
    log("")
    return problems


def git_status():
    import subprocess
    log("## git status --short")
    out = subprocess.run(["git", "status", "--short"], cwd=ROOT, capture_output=True, text=True).stdout
    log(out.rstrip() or "(clean)")
    log("")
    return out


REPORT_PATH = Path(
    "/private/tmp/claude-501/-Users-tun-Library-CloudStorage-OneDrive-Personal-0ai-agents-raymond-agent/"
    "2f4cff37-b0d0-4530-b290-019520eb94df/scratchpad/restructure/report.md"
)


def _flush_report(aborted=False):
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    header = "# restructure_v2.py report" + (" — ABORTED\n" if aborted else "\n")
    REPORT_PATH.write_text(header + "\n" + "\n".join(REPORT_LINES) + "\n", encoding="utf-8")


def main():
    log("# restructure_v2.py — run report\n")
    step_mapping_table()
    step_verify_index_identical()
    step_collision_check()
    step_backup_old_locale_homes()
    written = transform_and_write()
    remove_originals(written)
    append_redirects()
    patch_tender_headers()
    grep_residuals()
    verify_balanced_tags(written)
    git_status()
    _flush_report()
    log(f"\nReport written to {REPORT_PATH}")


if __name__ == "__main__":
    main()
