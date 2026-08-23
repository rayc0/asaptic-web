#!/usr/bin/env python3
"""
qc_diff.py — print only NEW failures introduced between two qc.py --json runs.

Usage:
    python3 _shell/qc.py --json baseline.json
    ... make changes ...
    python3 _shell/qc.py --json new.json
    python3 _shell/qc_diff.py baseline.json new.json

Compares each of the 9 HARD failure classes (and, for visibility, the SOFT
"unreadable_files" list) item-by-item and reports only entries present in
`new.json` but absent from `baseline.json` -- i.e. regressions the current
change introduced, ignoring the (expected, large) set of pre-existing
failures already known about.

Exit code: 1 if any NEW failure exists in any HARD class, else 0.
"""
from __future__ import annotations

import json
import sys

HARD_CLASSES = [
    ("broken_links", "Broken internal links"),
    ("nav_count_bad", "Bad top-level <nav> count (!=1)"),
    ("footer_count_bad", "Bad top-level <footer> count (!=1)"),
    ("sentinel_issues", "Sentinel integrity issues"),
    ("canonical_issues", "Canonical tag issues"),
    ("hreflang_issues", "hreflang issues"),
    ("baker_marker_issues", "Tender baker marker issues"),
    ("baker_span_regressions", "Tender tw-* span regressions"),
    ("proof_lab_inline_script", "proof-lab inline <script> (CSP)"),
    ("noindex_regressions", "noindex regressions vs baseline"),
]

# these classes are lists of tuples; use the whole tuple (stringified) as the
# identity key so a same-file-different-reason entry still shows as new.
def keyset(results: dict, cls: str) -> dict[str, list]:
    out = {}
    for item in results.get(cls, []):
        key = json.dumps(item, sort_keys=True, ensure_ascii=False)
        out[key] = item
    return out


def load(path: str) -> dict:
    with open(path) as f:
        data = json.load(f)
    return data.get("results", data)


def main():
    if len(sys.argv) != 3:
        print("usage: qc_diff.py <baseline.json> <new.json>", file=sys.stderr)
        sys.exit(2)

    base = load(sys.argv[1])
    new = load(sys.argv[2])

    any_new_hard = False
    lines = ["# QC diff — new failures only", ""]

    for cls, label in HARD_CLASSES:
        base_set = keyset(base, cls)
        new_set = keyset(new, cls)
        added_keys = set(new_set) - set(base_set)
        removed_keys = set(base_set) - set(new_set)
        if not added_keys and not removed_keys:
            continue
        lines.append(f"## {label}")
        if added_keys:
            any_new_hard = True
            lines.append(f"- 🔴 {len(added_keys)} NEW:")
            for k in sorted(added_keys)[:20]:
                lines.append(f"  - {new_set[k]}")
        if removed_keys:
            lines.append(f"- ✅ {len(removed_keys)} FIXED (no longer failing):")
            for k in sorted(removed_keys)[:20]:
                lines.append(f"  - {base_set[k]}")
        lines.append("")

    # unreadable_files is informational only (not a HARD class) but worth a note
    base_unread = keyset(base, "unreadable_files")
    new_unread = keyset(new, "unreadable_files")
    added_unread = set(new_unread) - set(base_unread)
    if added_unread:
        lines.append("## Unreadable files (informational, not gating)")
        lines.append(f"- {len(added_unread)} newly unreadable:")
        for k in sorted(added_unread)[:10]:
            lines.append(f"  - {new_unread[k]}")
        lines.append("")

    if not any_new_hard:
        lines.insert(2, "No new HARD failures. ✅")
        lines.insert(3, "")

    print("\n".join(lines))
    sys.exit(1 if any_new_hard else 0)


if __name__ == "__main__":
    main()
