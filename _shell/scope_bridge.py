#!/usr/bin/env python3
"""scope_bridge.py — isolate a hand-written "bridge" page's inline CSS from the v2 shell.

The 8 bridge pages (changelog/, security/, status/, scout/, demos/, demo/,
demo/proof-lab/, developers/) were excluded from the bulk shell migration
because each one carries its OWN complete inline stylesheet with GLOBAL rules
(`*`, html, body, a, section, h1, p, footer, ...) and its own `:root` token
block. Those collide, in BOTH directions, with assets/v2/shell.css:

  page -> shell : `a{color:cyan}` would recolour the injected .brand/.engage;
                  `footer{padding:...}` would repad footer.foot; the page's
                  :root tokens (--ink/--edge/--mono/--sans/--bg) would be
                  inherited by the shell and repaint it.
  shell -> page : shell.css's leading class rules (.wrap .hero .dot .rt .foot
                  .container ...) would restyle same-named page content.

Fix applied here, deterministically:

  1. `<body>` gets a scope class `pg-<name>`.
  2. `:root` / `html` / `body` rules collapse onto `body.pg-<name>` so the page
     keeps its ground colour and its tokens.
  3. Every custom property the page DEFINES that the shell also USES is renamed
     `--x` -> `--pg-x` (in the CSS and in inline style="" attributes), so the
     page's tokens can no longer be inherited by the shell.
  4. Every OTHER rule is rewritten into two structurally-scoped forms:
         body.pg-x > :not(.shell):not(.foot) SEL     (page content, nested)
         body.pg-x > SEL                             (page content, top level)
     `header.shell` and `footer.foot` — the two elements the injector adds —
     are the only body children excluded, so no page rule can reach the shell.
  5. Page classes that shell.css styles with a LEADING selector (.wrap .hero
     .dot .rt .foot .container ...) are renamed `x` -> `pg-x` in the CSS, in
     class="" attributes, and in the inline-JS spots that emit them, so the
     shell stylesheet cannot reach page content either.
  6. @keyframes whose name collides with shell.css (`pulse`) are renamed.
  7. A typography guard re-asserts the v2 defaults on the two shell elements,
     because `body{font-family/line-height/color}` still legitimately inherits.

Idempotent: re-running on an already-scoped file is a no-op (guarded by a
marker comment).

Usage:
    python3 _shell/scope_bridge.py --page security/index.html --scope pg-security [--write]
"""

import argparse
import json
import os
import re
import sys

MARKER = "/* ASAPTIC:SCOPED"

# --------------------------------------------------------------------------
# shell.css surface
# --------------------------------------------------------------------------


def strip_comments(css):
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


STR_RE = re.compile(r'"(?:[^"\\\n]|\\.)*"|\'(?:[^\'\\\n]|\\.)*\'')


def mask_css(css):
    """Replace comments and string literals with placeholders so the brace
    splitter can never be confused by a `{` inside content:"" or a comment."""
    toks = []

    def repl(m):
        toks.append(m.group(0))
        return "\x00%d\x00" % (len(toks) - 1)

    css = re.sub(r"/\*.*?\*/", repl, css, flags=re.S)
    css = STR_RE.sub(repl, css)
    return css, toks


def unmask_css(css, toks):
    return re.sub(r"\x00(\d+)\x00", lambda m: toks[int(m.group(1))], css)


def shell_surface(root):
    css = strip_comments(open(os.path.join(root, "assets/v2/shell.css"), encoding="utf-8").read())
    used_vars = set(re.findall(r"var\(\s*(--[A-Za-z0-9_-]+)", css))
    keyframes = set(re.findall(r"@keyframes\s+([\w-]+)", css))
    leading = set()
    for m in re.finditer(r"([^{}]+)\{", css):
        sel = m.group(1).strip()
        if sel.startswith("@") or not sel:
            continue
        for part in sel.split(","):
            part = part.strip()
            if not part:
                continue
            first = re.split(r"[\s>+~]+", part)[0]
            for c in re.findall(r"\.([A-Za-z0-9_-]+)", first):
                leading.add(c)
    return {"vars": used_vars, "keyframes": keyframes, "leading": leading}


# --------------------------------------------------------------------------
# tiny CSS block splitter (handles nesting of @media/@supports)
# --------------------------------------------------------------------------


def split_rules(css):
    """Yield (prelude, block_body, is_at_rule) for every top-level construct."""
    out = []
    i = 0
    n = len(css)
    start = 0
    while i < n:
        c = css[i]
        if c == "{":
            prelude = css[start:i]
            depth = 1
            j = i + 1
            while j < n and depth:
                if css[j] == "{":
                    depth += 1
                elif css[j] == "}":
                    depth -= 1
                j += 1
            body = css[i + 1:j - 1]
            out.append((prelude, body))
            i = j
            start = j
        elif c == ";" and css[start:i].strip().startswith("@"):
            out.append((css[start:i + 1], None))  # @import / @charset
            i += 1
            start = i
        else:
            i += 1
    tail = css[start:]
    if tail.strip():
        out.append((tail, None))
    return out


# --------------------------------------------------------------------------
# selector rewriting
# --------------------------------------------------------------------------

NOT_GUARD = ":not(.shell):not(.foot)"


def split_selector_list(sel):
    parts, depth, cur = [], 0, ""
    for ch in sel:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    if cur.strip():
        parts.append(cur)
    return [p.strip() for p in parts if p.strip()]


def first_compound(sel):
    depth, i = 0, 0
    while i < len(sel):
        ch = sel[i]
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        elif depth == 0 and (ch.isspace() or ch in ">+~"):
            return sel[:i], sel[i:]
        i += 1
    return sel, ""


def rewrite_selector(sel, scope):
    """Return the list of replacement selectors for one comma-part."""
    s = sel.strip()
    if s in (":root", "html", "body"):
        return [scope]
    if re.match(r"^html\s*,?\s*$", s):
        return [scope]
    # body.foo / body:has(...) / html.foo -> scope + rest
    m = re.match(r"^(body|html)(?=[:.\[#])", s)
    if m:
        return [scope + s[len(m.group(1)):]]
    m = re.match(r"^(body|html)\s+", s)
    if m:
        return [scope + " " + s[m.end():]]

    a_form = "%s > %s %s" % (scope, NOT_GUARD, s)

    fc, rest = first_compound(s)
    if fc.startswith("*"):
        b_form = "%s > *%s%s%s" % (scope, NOT_GUARD, fc[1:], rest)
    else:
        tm = re.match(r"^([a-zA-Z][\w-]*)", fc)
        tag = tm.group(1).lower() if tm else None
        if tag == "header":
            b_form = "%s > %s:not(.shell)%s%s" % (scope, fc[:tm.end()], fc[tm.end():], rest)
        elif tag == "footer":
            b_form = "%s > %s:not(.foot)%s%s" % (scope, fc[:tm.end()], fc[tm.end():], rest)
        else:
            b_form = "%s > %s" % (scope, s)
    return [a_form, b_form]


def rewrite_selector_list(sel, scope):
    out = []
    for part in split_selector_list(sel):
        out.extend(rewrite_selector(part, scope))
    return ",\n".join(out)


NON_SCOPING_AT = re.compile(r"^@(keyframes|-webkit-keyframes|font-face|page|counter-style|property)\b", re.I)
NESTED_AT = re.compile(r"^@(media|supports|layer|container)\b", re.I)


def scope_css(css, scope, kf_rename):
    out = []
    for prelude, body in split_rules(css):
        pre = prelude.strip()
        if body is None:
            out.append(prelude)
            continue
        if pre.startswith("@"):
            if NESTED_AT.match(pre):
                out.append("%s{\n%s\n}\n" % (pre, scope_css(body, scope, kf_rename)))
            elif NON_SCOPING_AT.match(pre):
                new_pre = pre
                m = re.match(r"^(@-?\w*-?keyframes)\s+([\w-]+)", pre, re.I)
                if m and m.group(2) in kf_rename:
                    new_pre = "%s %s" % (m.group(1), kf_rename[m.group(2)])
                out.append("%s{%s}\n" % (new_pre, body))
            else:
                out.append("%s{%s}\n" % (pre, body))
            continue
        if not pre:
            continue
        out.append("%s{%s}\n" % (rewrite_selector_list(pre, scope), body))
    return "".join(out)


# --------------------------------------------------------------------------
# renaming helpers
# --------------------------------------------------------------------------


def rename_vars_in_text(text, mapping):
    for old, new in mapping.items():
        text = re.sub(re.escape(old) + r"(?![\w-])", new, text)
    return text


def rename_classes_in_css(css, mapping):
    def sub_sel(m):
        name = m.group(1)
        return "." + mapping.get(name, name)
    # only inside selector preludes; do it on the whole sheet but skip
    # declaration blocks by processing prelude/body separately
    out = []
    for prelude, body in split_rules(css):
        if body is None:
            out.append(prelude)
            continue
        pre = prelude.strip()
        if pre.startswith("@") and NESTED_AT.match(pre):
            out.append("%s{\n%s\n}\n" % (pre, rename_classes_in_css(body, mapping)))
            continue
        if pre.startswith("@"):
            out.append("%s{%s}\n" % (pre, body))
            continue
        new_pre = re.sub(r"\.([A-Za-z0-9_-]+)", sub_sel, prelude)
        out.append("%s{%s}\n" % (new_pre.strip(), body))
    return "".join(out)


CLASS_ATTR_RE = re.compile(r'(\bclass\s*=\s*)(["\'])(.*?)\2', re.S)


def rename_classes_in_class_attrs(text, mapping):
    def sub(m):
        toks = m.group(3).split()
        toks = [mapping.get(t, t) for t in toks]
        return "%s%s%s%s" % (m.group(1), m.group(2), " ".join(toks), m.group(2))
    return CLASS_ATTR_RE.sub(sub, text)


def rename_classes_in_js(js, mapping):
    """Targeted: classList.*('x'), className = '<tokens>', querySelector('.x')."""
    def sub_list(m):
        name = m.group(3)
        return "%s%s%s%s" % (m.group(1), m.group(2), mapping.get(name, name), m.group(2))
    js = re.sub(r"(classList\.(?:add|remove|toggle|contains)\(\s*)(['\"])([\w-]+)\2",
                sub_list, js)

    def sub_classname(m):
        toks = m.group(3).split()
        toks = [mapping.get(t, t) for t in toks]
        return "%s%s%s%s" % (m.group(1), m.group(2), " ".join(toks), m.group(2))
    js = re.sub(r"(\.className\s*=\s*)(['\"])([^'\"]*)\2", sub_classname, js)

    def sub_query(m):
        sel = re.sub(r"\.([A-Za-z0-9_-]+)", lambda k: "." + mapping.get(k.group(1), k.group(1)),
                     m.group(3))
        return "%s%s%s%s" % (m.group(1), m.group(2), sel, m.group(2))
    js = re.sub(r"(querySelector(?:All)?\(\s*)(['\"])([^'\"]*)\2", sub_query, js)
    return js


ANIM_PROPS = re.compile(r"(animation(?:-name)?\s*:)([^;}]+)", re.I)


def rename_keyframe_uses(css, mapping):
    def sub(m):
        val = m.group(2)
        for old, new in mapping.items():
            val = re.sub(r"(?<![\w-])" + re.escape(old) + r"(?![\w-])", new, val)
        return m.group(1) + val
    return ANIM_PROPS.sub(sub, css)


# --------------------------------------------------------------------------
# driver
# --------------------------------------------------------------------------

STYLE_RE = re.compile(r"(<style[^>]*>)(.*?)(</style>)", re.S | re.I)
SCRIPT_RE = re.compile(r"(<script(?![^>]*\bsrc=)[^>]*>)(.*?)(</script>)", re.S | re.I)


def head_span(text):
    i = re.search(r"<head[\s>]", text, re.I)
    j = re.search(r"</head\s*>", text, re.I)
    return i.start(), j.start()


GUARD_TMPL = """
/* --- v2 shell guard: the injected header.shell / footer.foot must keep the
       v2 typography, which `body` above would otherwise hand them ---------- */
%(scope)s > header.shell, %(scope)s > footer.foot{
  font-family:var(--sans);font-size:16px;font-weight:400;font-style:normal;
  line-height:1.5;letter-spacing:normal;text-transform:none;text-align:left;
  color:var(--ink);-webkit-font-smoothing:antialiased;
}
"""


def process(root, relpath, scope, write=False):
    path = os.path.join(root, relpath)
    text = open(path, encoding="utf-8").read()
    if MARKER in text:
        return {"path": relpath, "status": "already-scoped"}

    surf = shell_surface(root)
    hs, he = head_span(text)
    head = text[hs:he]

    head_styles = STYLE_RE.findall(head)
    if not head_styles:
        # nothing to scope (e.g. developers/ — additive-only styles, no globals)
        css = ""
    else:
        css = "\n".join(s[1] for s in head_styles)
    cssn = strip_comments(css)

    # --- collision sets ---------------------------------------------------
    page_vars = set(re.findall(r"(--[A-Za-z0-9_-]+)\s*:", cssn))
    var_map = {v: "--pg-" + v[2:] for v in sorted(page_vars & surf["vars"])}

    page_kf = set(re.findall(r"@keyframes\s+([\w-]+)", cssn))
    kf_map = {k: "pg-" + k for k in sorted(page_kf & surf["keyframes"])}

    css_classes = set()
    for m in re.finditer(r"([^{}]+)\{", cssn):
        sel = m.group(1).strip()
        if sel.startswith("@") or not sel:
            continue
        for c in re.findall(r"\.([A-Za-z0-9_-]+)", sel):
            css_classes.add(c)
    cls_map = {c: "pg-" + c for c in sorted(css_classes & surf["leading"])}

    report = {
        "path": relpath, "scope": scope,
        "vars_renamed": var_map, "classes_renamed": cls_map,
        "keyframes_renamed": kf_map,
        "had_style_blocks": len(head_styles),
    }

    # --- rewrite the head <style> blocks ----------------------------------
    if head_styles:
        def transform_css(raw):
            body, toks = mask_css(raw)
            body = rename_vars_in_text(body, var_map)
            body = rename_classes_in_css(body, cls_map)
            body = rename_keyframe_uses(body, kf_map)
            body = scope_css(body, "body." + scope, kf_map)
            return unmask_css(body, toks)

        def style_sub(m):
            body = transform_css(m.group(2))
            body = "\n%s %s */\n%s%s" % (MARKER, scope, body, GUARD_TMPL % {"scope": "body." + scope})
            return m.group(1) + body + m.group(3)
        new_head = STYLE_RE.sub(style_sub, head, count=1)

        # any further head <style> blocks: scope them too, without a 2nd guard
        def style_sub_rest(m):
            return m.group(1) + transform_css(m.group(2)) + m.group(3)
        first = True
        pieces, last = [], 0
        for m in STYLE_RE.finditer(new_head):
            if first:
                first = False
                continue
            pieces.append(new_head[last:m.start()])
            pieces.append(style_sub_rest(m))
            last = m.end()
        if pieces:
            pieces.append(new_head[last:])
            new_head = "".join(pieces)
        text = text[:hs] + new_head + text[he:]
    else:
        # no inline CSS to scope, but still emit the marker so the run is idempotent
        text = text[:hs] + head + text[he:]

    # --- markup + inline-JS renames (whole document) ----------------------
    if cls_map:
        text = rename_classes_in_class_attrs(text, cls_map)

        def js_sub(m):
            return m.group(1) + rename_classes_in_js(m.group(2), cls_map) + m.group(3)
        text = SCRIPT_RE.sub(js_sub, text)

    if var_map:
        # inline style="" attributes
        def style_attr(m):
            return m.group(1) + rename_vars_in_text(m.group(3), var_map) + m.group(2)
        text = re.sub(r'(\bstyle\s*=\s*)(["\'])(.*?)\2',
                      lambda m: "%s%s%s%s" % (m.group(1), m.group(2),
                                              rename_vars_in_text(m.group(3), var_map), m.group(2)),
                      text, flags=re.S)
        # inline <script> that writes custom properties
        def js_var_sub(m):
            return m.group(1) + rename_vars_in_text(m.group(2), var_map) + m.group(3)
        text = SCRIPT_RE.sub(js_var_sub, text)

    # --- body scope class -------------------------------------------------
    bm = re.search(r"<body\b([^>]*)>", text, re.I)
    if not bm:
        raise SystemExit("no <body> in " + relpath)
    attrs = bm.group(1)
    cm = re.search(r'class\s*=\s*(["\'])(.*?)\1', attrs, re.S)
    if cm:
        toks = cm.group(2).split()
        if scope not in toks:
            toks.insert(0, scope)
        new_attrs = attrs[:cm.start()] + 'class="%s"' % " ".join(toks) + attrs[cm.end():]
    else:
        new_attrs = attrs + ' class="%s"' % scope
    text = text[:bm.start()] + "<body%s>" % new_attrs + text[bm.end():]

    if write:
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
        report["status"] = "written"
    else:
        report["status"] = "dry-run"
        report["preview_bytes"] = len(text)
        report["_text"] = text
    return report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ap.add_argument("--page", required=True)
    ap.add_argument("--scope", required=True)
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    r = process(a.root, a.page, a.scope, a.write)
    print(json.dumps(r, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
