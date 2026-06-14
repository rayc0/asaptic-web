#!/usr/bin/env python3
"""Complete missing Article/BlogPosting fields in blog JSON-LD blocks."""

from __future__ import annotations

import argparse
import html
import json
import re
import subprocess
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
BLOG_DIR = ROOT / "blog"
BASE_URL = "https://asaptic.com"
ASAPTIC_ORG_NAME = "Asaptic"
ASAPTIC_ORG_URL = f"{BASE_URL}/"

SCRIPT_RE = re.compile(
    r"(?P<indent>[ \t]*)<script\b(?=[^>]*\btype=[\"']application/ld\+json[\"'][^>]*>)(?:(?!<script).)*?>"
    r"(?P<body>.*?)"
    r"</script>",
    re.IGNORECASE | re.DOTALL,
)



def blog_files() -> list[Path]:
    return sorted(
        path
        for path in BLOG_DIR.glob("*.html")
        if path.name != "index.html"
    )


def escape_inner_string_quotes(body: str) -> str:
    """Repair likely unescaped quotes in JSON string values when stored inline."""
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

        repaired.append(
            line[: value_start + 1]
            + "".join(escaped_chars)
            + line[value_end:]
        )

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
            try:
                parsed = json.loads(escape_inner_string_quotes(body))
            except json.JSONDecodeError:
                raise SystemExit(f"{path}: invalid JSON-LD: {exc}") from exc

        graph.extend(graph_entities(parsed))

    return graph


def graph_entities(value: Any) -> list[Any]:
    if isinstance(value, dict) and isinstance(value.get("@graph"), list):
        return value["@graph"]
    if isinstance(value, list):
        return value
    return [value]


def is_article_node(node: Any) -> bool:
    if not isinstance(node, dict):
        return False

    node_type = node.get("@type")
    if isinstance(node_type, str):
        return node_type in {"Article", "BlogPosting"}

    if isinstance(node_type, list):
        return "Article" in node_type or "BlogPosting" in node_type

    return False


def find_article_node(graph: list[Any]) -> dict[str, Any] | None:
    for node in graph:
        if is_article_node(node):
            return node
    return None


def existing_org_id(graph: list[Any]) -> str | None:
    for node in graph:
        if not isinstance(node, dict):
            continue
        node_type = node.get("@type")
        if node_type == "Organization" or (
            isinstance(node_type, list) and "Organization" in node_type
        ):
            org_id = node.get("@id")
            if isinstance(org_id, str) and org_id:
                return org_id
    return None


def page_url(path: Path) -> str:
    return f"{BASE_URL}/blog/{path.name}"


def title_or_h1(html_text: str) -> str | None:
    title_match = re.search(
        r"<title[^>]*>(.*?)</title>",
        html_text,
        re.IGNORECASE | re.DOTALL,
    )
    if title_match:
        value = html.unescape(title_match.group(1) or "")
        value = " ".join(value.split())
        if value:
            return value

    h1_match = re.search(
        r"<h1[^>]*>(.*?)</h1>",
        html_text,
        re.IGNORECASE | re.DOTALL,
    )
    if h1_match:
        value = html.unescape(h1_match.group(1) or "")
        value = " ".join(value.split())
        if value:
            return value

    return None


def git_date(path: Path, args: list[str]) -> str | None:
    rel_path = path.relative_to(ROOT).as_posix()
    command = ["git", "-C", str(ROOT), "log"] + args + ["--", rel_path]
    completed = subprocess.run(
        command,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        encoding="utf-8",
        text=True,
    )

    if completed.returncode != 0:
        return None

    output = completed.stdout.strip()
    if not output:
        return None

    return output.splitlines()[0].strip()


def first_commit_date(path: Path) -> str | None:
    return git_date(
        path,
        ["--diff-filter=A", "--format=%ad", "--date=short", "--max-count=1"],
    )


def modified_date(path: Path) -> str | None:
    return git_date(
        path,
        ["-1", "--format=%ad", "--date=short"],
    )


def organization_node(graph: list[Any]) -> dict[str, str]:
    node = {
        "@type": "Organization",
        "name": ASAPTIC_ORG_NAME,
        "url": ASAPTIC_ORG_URL,
    }
    org_id = existing_org_id(graph)
    if org_id:
        node["@id"] = org_id
    return node


def ensure_field(
    entity: dict[str, Any],
    key: str,
    value: Any,
    counts: Counter[str],
) -> None:
    if key not in entity:
        entity[key] = value
        counts[key] += 1


def normalize_script_body(graph: list[Any]) -> str:
    normalized = {"@context": "https://schema.org", "@graph": graph}
    return json.dumps(normalized, ensure_ascii=False, separators=(",", ":"))


def update_file(path: Path, args: argparse.Namespace, counts: Counter[str], updated: list[str]) -> bool:
    html_text = path.read_text(encoding="utf-8")
    matches = list(SCRIPT_RE.finditer(html_text))
    if not matches:
        return False

    graph = parse_jsonld(path, matches)
    article = find_article_node(graph)
    if not isinstance(article, dict):
        return False

    changed = False
    field_counts = Counter()
    article_url = article.get("url")
    if "url" not in article and not article_url:
        article_url = page_url(path)

    if not article_url:
        article_url = page_url(path)

    headline_source = title_or_h1(html_text)
    if "headline" not in article and headline_source:
        article["headline"] = headline_source
        changed = True
        field_counts["headline"] += 1

    if "url" not in article:
        article["url"] = page_url(path)
        changed = True
        field_counts["url"] += 1

    if "mainEntityOfPage" not in article:
        article["mainEntityOfPage"] = article["url"]
        changed = True
        field_counts["mainEntityOfPage"] += 1

    if "inLanguage" not in article:
        article["inLanguage"] = "en"
        changed = True
        field_counts["inLanguage"] += 1

    if "datePublished" not in article:
        published = first_commit_date(path)
        if published:
            article["datePublished"] = published
            changed = True
            field_counts["datePublished"] += 1

    if "dateModified" not in article:
        modified = modified_date(path)
        if modified:
            article["dateModified"] = modified
            changed = True
            field_counts["dateModified"] += 1

    org_node = organization_node(graph)
    if "author" not in article:
        article["author"] = org_node
        changed = True
        field_counts["author"] += 1

    if "publisher" not in article:
        article["publisher"] = org_node
        changed = True
        field_counts["publisher"] += 1

    if not changed:
        return False

    serialized = normalize_script_body(graph)
    first = matches[0]
    replacement = f"{first.group('indent')}<script type=\"application/ld+json\">{serialized}</script>"

    output = html_text[:first.start()] + replacement
    cursor = first.end()
    for match in matches[1:]:
        output += html_text[cursor : match.start()]
        cursor = match.end()
    output += html_text[cursor:]

    if output != html_text and not args.dry_run:
        path.write_text(output, encoding="utf-8")

    updated.append(path.name)
    counts.update(field_counts)
    return True


def validate_file(path: Path) -> bool:
    html_text = path.read_text(encoding="utf-8")
    matches = list(SCRIPT_RE.finditer(html_text))
    if not matches:
        return False

    for match in matches:
        body = match.group("body").strip()
        if not body:
            continue
        try:
            json.loads(body)
        except json.JSONDecodeError:
            try:
                json.loads(escape_inner_string_quotes(body))
            except json.JSONDecodeError:
                return False

    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Report changes without writing files")
    args = parser.parse_args()

    counts: Counter[str] = Counter()
    updated: list[str] = []
    changed_count = 0

    for path in blog_files():
        if update_file(path, args, counts, updated):
            changed_count += 1

    print(f"Updated files: {changed_count}")
    for key in (
        "headline",
        "url",
        "mainEntityOfPage",
        "inLanguage",
        "datePublished",
        "dateModified",
        "author",
        "publisher",
    ):
        print(f"{key}: {counts[key]}")

    check_files = updated[:3] if len(updated) >= 3 else [p.name for p in blog_files()[:3]]
    if args.dry_run:
        parse_checks = []
    else:
        parse_checks = [
            f"{BASE_URL}/blog/{name}"
            for name in check_files
        ]

    if args.dry_run:
        print("Dry run requested: skipped write and validation")
        return

    valid_count = 0
    for rel_name in check_files:
        path = BLOG_DIR / rel_name
        if validate_file(path):
            valid_count += 1
    print(f"Validated 3 files parse: {valid_count}/3")


if __name__ == "__main__":
    main()
