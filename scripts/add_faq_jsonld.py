#!/usr/bin/env python3
"""Add FAQPage JSON-LD to lane/hub pages with existing procurement Q&A tables."""

from __future__ import annotations

import html
import json
import re
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXCLUDED_PARTS = {"blog", "standard", "standards", "assets"}
LOCALES = {
    "zh": "zh-Hans",
    "zht": "zh-Hant",
    "pt": "pt",
}


class ProcurementTableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.section_depth = 0
        self.in_target_section = False
        self.in_target_table = False
        self.table_depth = 0
        self.in_row = False
        self.in_cell = False
        self.current_cells: list[list[str]] = []
        self.current_cell: list[str] = []
        self.pairs: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = dict(attrs)
        if tag == "section":
            if self.in_target_section:
                self.section_depth += 1
            elif "procurement-qa" in (attrs_dict.get("id") or ""):
                self.in_target_section = True
                self.section_depth = 1

        if self.in_target_section and tag == "table":
            classes = (attrs_dict.get("class") or "").split()
            if "directory-table" in classes and not self.in_target_table:
                self.in_target_table = True
                self.table_depth = 1
            elif self.in_target_table:
                self.table_depth += 1

        if not self.in_target_table:
            return

        if tag == "tr":
            self.in_row = True
            self.current_cells = []
        elif self.in_row and tag == "td":
            self.in_cell = True
            self.current_cell = []
        elif self.in_cell and tag in {"br", "p", "div", "li"}:
            self.current_cell.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if self.in_target_table and tag == "td" and self.in_cell:
            self.current_cells.append(self.current_cell)
            self.current_cell = []
            self.in_cell = False
        elif self.in_target_table and tag == "tr" and self.in_row:
            if len(self.current_cells) >= 2:
                question = clean_text("".join(self.current_cells[0]))
                answer = clean_text("".join(self.current_cells[1]))
                if question and answer:
                    self.pairs.append((question, answer))
            self.in_row = False
            self.current_cells = []
        elif self.in_target_table and tag == "table":
            self.table_depth -= 1
            if self.table_depth == 0:
                self.in_target_table = False

        if self.in_target_section and tag == "section":
            self.section_depth -= 1
            if self.section_depth == 0:
                self.in_target_section = False

    def handle_data(self, data: str) -> None:
        if self.in_cell:
            self.current_cell.append(data)


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def locale_for(path: Path) -> str:
    first = path.relative_to(ROOT).parts[0]
    return LOCALES.get(first, "en")


def eligible_html_files() -> list[Path]:
    files: list[Path] = []
    for path in ROOT.rglob("*.html"):
        rel_parts = path.relative_to(ROOT).parts
        if any(part in EXCLUDED_PARTS for part in rel_parts):
            continue
        files.append(path)
    return sorted(files)


def extract_pairs(source: str) -> list[tuple[str, str]]:
    parser = ProcurementTableParser()
    parser.feed(source)
    return parser.pairs


LD_JSON_SCRIPT_RE = re.compile(
    r"(?P<indent>[ \t]*)<script\b(?=[^>]*\btype=[\"']application/ld\+json[\"'])"
    r"(?P<attrs>[^>]*)>(?P<body>.*?)</script>\s*",
    re.IGNORECASE | re.DOTALL,
)


def is_faq_node(node: object) -> bool:
    return isinstance(node, dict) and node.get("@type") == "FAQPage"


def object_spans(source: str) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    stack: list[int] = []
    in_string = False
    escape = False
    for index, char in enumerate(source):
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == "{":
            stack.append(index)
        elif char == "}" and stack:
            start = stack.pop()
            spans.append((start, index + 1))
    return spans


def remove_faq_objects_raw(source: str) -> str:
    removals: list[tuple[int, int]] = []
    for start, end in object_spans(source):
        try:
            node = json.loads(source[start:end])
        except json.JSONDecodeError:
            continue
        if not is_faq_node(node):
            continue

        remove_start = start
        remove_end = end
        after = re.match(r"\s*,", source[end:])
        if after:
            remove_end = end + after.end()
        else:
            before = re.search(r",\s*$", source[:start])
            if before:
                remove_start = before.start()
        removals.append((remove_start, remove_end))

    updated = source
    for start, end in sorted(removals, reverse=True):
        updated = updated[:start] + updated[end:]
    return updated


def without_existing_faq(source: str) -> str:
    def replace_script(match: re.Match[str]) -> str:
        body = match.group("body")
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            return match.group(0)

        if is_faq_node(data):
            return ""

        if isinstance(data, dict) and isinstance(data.get("@graph"), list):
            graph = data["@graph"]
            filtered = [node for node in graph if not is_faq_node(node)]
            if len(filtered) != len(graph):
                raw_body = remove_faq_objects_raw(body)
                try:
                    json.loads(raw_body)
                except json.JSONDecodeError:
                    data = {**data, "@graph": filtered}
                    raw_body = json.dumps(data, ensure_ascii=False, indent=2)
                if filtered:
                    return (
                        f'{match.group("indent")}<script{match.group("attrs")}>'
                        f"{raw_body}"
                        "</script>\n"
                    )
                return ""

        return match.group(0)

    return LD_JSON_SCRIPT_RE.sub(replace_script, source)


def faq_jsonld(path: Path, pairs: list[tuple[str, str]]) -> str:
    payload = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "inLanguage": locale_for(path),
        "mainEntity": [
            {
                "@type": "Question",
                "name": question,
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": answer,
                },
            }
            for question, answer in pairs
        ],
    }
    return (
        '  <script type="application/ld+json">\n'
        f"{json.dumps(payload, ensure_ascii=False, indent=2)}\n"
        "  </script>\n"
    )


def apply_to_file(path: Path) -> tuple[bool, int, str]:
    source = path.read_text(encoding="utf-8")
    pairs = extract_pairs(source)
    if not pairs:
        return False, 0, locale_for(path)

    updated = without_existing_faq(source)
    block = faq_jsonld(path, pairs)
    if "</head>" not in updated:
        raise RuntimeError(f"Missing </head>: {path.relative_to(ROOT)}")
    updated = updated.replace("</head>", f"{block}</head>", 1)

    changed = updated != source
    if changed:
        path.write_text(updated, encoding="utf-8")
    return True, len(pairs), locale_for(path)


def main() -> None:
    counts: dict[str, int] = {}
    for path in eligible_html_files():
        marked, questions, locale = apply_to_file(path)
        if not marked:
            continue
        counts[locale] = counts.get(locale, 0) + 1
        print(f"{path.relative_to(ROOT)}\t{locale}\t{questions}")

    print("SUMMARY")
    for locale in ("en", "zh-Hans", "zh-Hant", "pt"):
        print(f"{locale}\t{counts.get(locale, 0)}")


if __name__ == "__main__":
    main()
