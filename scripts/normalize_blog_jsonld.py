#!/usr/bin/env python3
"""Normalize blog JSON-LD scripts into one schema.org @graph block."""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
LOCALES = {
    "blog": "en",
    "zh/blog": "zh-Hans",
    "zht/blog": "zh-Hant",
    "pt/blog": "pt",
}

SCRIPT_RE = re.compile(
    r"(?P<indent>[ \t]*)<script\b(?=[^>]*\btype=[\"']application/ld\+json[\"'])[^>]*>"
    r"(?P<body>.*?)"
    r"</script>",
    re.IGNORECASE | re.DOTALL,
)


def blog_files() -> list[Path]:
    files: list[Path] = []
    for rel_dir in LOCALES:
        directory = ROOT / rel_dir
        if directory.exists():
            files.extend(sorted(directory.glob("*.html")))
    return files


def locale_for(path: Path) -> tuple[str, str]:
    rel = path.relative_to(ROOT)
    if len(rel.parts) >= 2 and rel.parts[1] == "blog":
        key = f"{rel.parts[0]}/blog"
        return rel.parts[0], LOCALES[key]
    return "en", LOCALES["blog"]


def strip_context(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: strip_context(item) for key, item in value.items() if key != "@context"}
    if isinstance(value, list):
        return [strip_context(item) for item in value]
    return value


def set_in_language(value: Any, language: str) -> Any:
    if isinstance(value, dict):
        return {
            key: (language if key == "inLanguage" else set_in_language(item, language))
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [set_in_language(item, language) for item in value]
    return value


def graph_entities(value: Any) -> list[Any]:
    if isinstance(value, dict) and isinstance(value.get("@graph"), list):
        return value["@graph"]
    if isinstance(value, list):
        return value
    return [value]


def escape_inner_string_quotes(body: str) -> str:
    """Repair unescaped quote characters inside single-line JSON string values."""
    repaired: list[str] = []
    for line in body.splitlines():
        colon = line.find(":")
        if colon == -1:
            repaired.append(line)
            continue

        value_start = colon + 1
        while value_start < len(line) and line[value_start] in " \t":
            value_start += 1
        if value_start >= len(line) or line[value_start] != '"':
            repaired.append(line)
            continue

        value_end = line.rfind('"')
        if value_end <= value_start:
            repaired.append(line)
            continue

        value = line[value_start + 1 : value_end]
        escaped_chars: list[str] = []
        for index, char in enumerate(value):
            if char == '"' and (index == 0 or value[index - 1] != "\\"):
                escaped_chars.append('\\"')
            else:
                escaped_chars.append(char)
        repaired.append(line[: value_start + 1] + "".join(escaped_chars) + line[value_end:])
    return "\n".join(repaired)


def parse_jsonld(path: Path, matches: list[re.Match[str]]) -> list[Any]:
    graph: list[Any] = []
    for match in matches:
        body = match.group("body").strip()
        if not body:
            continue
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError as exc:
            repaired = escape_inner_string_quotes(body)
            try:
                parsed = json.loads(repaired)
            except json.JSONDecodeError:
                raise SystemExit(f"{path}: invalid JSON-LD: {exc}") from exc
        graph.extend(graph_entities(parsed))
    return graph


def render_script(graph: list[Any], language: str, indent: str) -> str:
    normalized = {
        "@context": "https://schema.org",
        "@graph": [set_in_language(strip_context(entity), language) for entity in graph],
    }
    body = json.dumps(normalized, ensure_ascii=False, indent=2)
    indented_body = "\n".join(f"{indent}  {line}" for line in body.splitlines())
    return f'{indent}<script type="application/ld+json">\n{indented_body}\n{indent}</script>'


def normalize_file(path: Path, write: bool) -> tuple[bool, str]:
    html = path.read_text(encoding="utf-8")
    matches = list(SCRIPT_RE.finditer(html))
    if not matches:
        return False, locale_for(path)[0]

    lang_key, language = locale_for(path)
    graph = parse_jsonld(path, matches)
    first = matches[0]
    script = render_script(graph, language, first.group("indent"))
    output = html[: first.start()] + script

    cursor = first.end()
    for match in matches[1:]:
        output += html[cursor : match.start()]
        cursor = match.end()
    output += html[cursor:]

    changed = output != html
    if changed and write:
        path.write_text(output, encoding="utf-8")
    return changed, lang_key


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Report changes without writing files.")
    args = parser.parse_args()

    counts: Counter[str] = Counter()
    for path in blog_files():
        changed, lang_key = normalize_file(path, write=not args.check)
        if changed:
            counts[lang_key] += 1

    for lang_key in ("en", "zh", "zht", "pt"):
        print(f"{lang_key}: {counts[lang_key]} files changed")


if __name__ == "__main__":
    main()
