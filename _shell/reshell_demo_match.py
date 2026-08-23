#!/usr/bin/env python3
"""reshell_demo_match.py — re-apply the v2 shell to demo/match/index.html.

WHY THIS EXISTS INSTEAD OF A PATCHED GENERATOR
----------------------------------------------
demo/match/index.html is generator-owned and `demo/match/` is on the injector's
exclude list, so `apply_shell.py --write --family proof` deliberately skips it.
The generator itself (`scripts/build-demo-match-page.mjs`) is **gitignored**
(.gitignore:15 `scripts/`) and is NOT in this worktree — `git ls-files` has no
record of it on any branch. Three divergent copies exist on this machine:

    ~/Projects/asaptic-web/scripts/build-demo-match-page.mjs      (v1, stale)
    ~/Projects/asaptic-web-matchv3/scripts/build-demo-match-v3.mjs
    ~/Projects/asaptic-web-matchv3/scripts/build-demo-match-v4.mjs

and NONE of their inline <style> blocks matches the committed page (6022 /
9456 / 11417 chars vs the page's 8096), so the deployed page came from a
generator revision that is no longer on disk. Patching any one of them would
bless a stale template. This script instead makes the shell step generator-
INDEPENDENT: run it after ANY regeneration and the page lands on the v2 shell,
scoped exactly like the other seven bridge pages.

    node scripts/build-demo-match-page.mjs <match-output.json>   # whichever
    python3 _shell/reshell_demo_match.py --write                 # then this

Idempotent: safe to re-run (scope_bridge is marker-guarded, apply_shell is
sentinel-guarded, the <style> relocation is a no-op once the style already
follows the HEAD sentinel).
"""

import argparse
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import apply_shell  # noqa: E402
import scope_bridge  # noqa: E402

PAGE = "demo/match/index.html"
SCOPE = "pg-demomatch"
HEAD_END = "<!-- ASAPTIC:HEAD:END -->"
STYLE_RE = re.compile(r"[ \t]*<style[^>]*>.*?</style>\s*", re.S | re.I)


def move_style_after_shell_link(path):
    """The injector appends its <head> block at the END of <head>, which would
    put /assets/v2/shell.css AFTER the page's inline <style>. Flip them so the
    page stylesheet is the later, winning one."""
    text = open(path, encoding="utf-8").read()
    hs = re.search(r"<head[\s>]", text, re.I).start()
    he = re.search(r"</head\s*>", text, re.I).start()
    head = text[hs:he]
    if HEAD_END not in head:
        return 0
    cut = head.index(HEAD_END) + len(HEAD_END)
    before, after = head[:cut], head[cut:]
    blocks = STYLE_RE.findall(before)
    if not blocks:
        return 0
    new_head = (STYLE_RE.sub("", before).rstrip("\n") + "\n"
                + "".join("\n" + b.strip() + "\n" for b in blocks)
                + after.lstrip("\n"))
    open(path, "w", encoding="utf-8").write(text[:hs] + new_head + text[he:])
    return len(blocks)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=ROOT)
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()

    path = os.path.join(a.root, PAGE)
    if not os.path.isfile(path):
        sys.exit("missing " + PAGE)

    r = scope_bridge.process(a.root, PAGE, SCOPE, write=a.write)
    print("scope_bridge: %s  vars=%d classes=%s" % (
        r["status"], len(r.get("vars_renamed", {})), r.get("classes_renamed")))

    cfg = apply_shell.Config(a.root, os.path.join(HERE, "families.json"), None)
    # process_file() deliberately bypasses cfg.exclusion(): demo/match/ is on
    # the exclude list only so the SWEEP leaves the generated page alone.
    row, out = apply_shell.process_file(cfg, PAGE)
    print("apply_shell: %s  anchor=%s footer=%s disclaimer=%s idempotent=%s%s" % (
        row["status"], row.get("anchor"), row.get("footer_mode"),
        row.get("disclaimer"), row.get("idempotent"),
        "  reason=" + row["reason"] if row.get("reason") else ""))
    if row["status"] != "OK":
        sys.exit(1)
    if a.write:
        open(path, "w", encoding="utf-8").write(out)
        n = move_style_after_shell_link(path)
        print("style relocation: %d block(s) moved after the shell.css link" % n)
    else:
        print("(dry run — pass --write to apply)")


if __name__ == "__main__":
    main()
