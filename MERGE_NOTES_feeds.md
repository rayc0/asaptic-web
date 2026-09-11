# MERGE_NOTES — data-feeds (syndication surfaces)

Branch `feat/data-feeds`. **New files only**, all under `feeds/` and `data/`. No shared
file (`_worker.js`, `_headers`, `_redirects`, `tender/**`, `demos/**`, `dev/**`) was
edited — the wiring below must be applied by whoever merges.

## What this adds

| Path | What |
|---|---|
| `feeds/build_feeds.mjs` | Zero-dep Node generator: reads the public tender feed, emits `all.atom.xml`, `all.rss.xml`, and one `<market>.atom.xml` per active market. Reads ONLY the 11 public fields; excludes `deadline_passed`; closing state expressed as `closing_bucket` only (no real date); entry links → `asaptic.com/tender` only; all entity content XML-escaped. |
| `feeds/sentinel.mjs` | Leak scanner over committed `feeds/` + `data/` — banned procurement acronym + non-`AT-TEST-*` ids. `node feeds/sentinel.mjs` exits 1 on any hit. |
| `feeds/build_feeds.test.mjs` | `node --test` suite (14 tests) — see below. |
| `feeds/fixtures/rows.sample.json` | Clean fixture, `AT-TEST-*` ids only. |
| `feeds/samples/*.xml` | Committed sample outputs built from the fixture (regression oracle; the test asserts they stay current). |
| `feeds/out/` | **Gitignored** live build output. Never committed. |
| `data/index.html` | Public, **indexable** "Open dataset" page in the /demos/ design language, with schema.org/Dataset JSON-LD (`asaptic.tender.v1`). Aids Google Dataset Search. Deploys as `asaptic.com/data`. |

## Wiring the refresh cron (REQUIRED — feeds must regenerate every tender refresh)

The feeds are a **pure function of `tender/rows.json`**, so they must be rebuilt on every
tender publish (the [[tender-hk-asaptic]] / [[tender-data-push]] Monday+2x/day flow that
writes `tender/rows.json`). Add one step to that bake, AFTER `tender/rows.json` is written
and BEFORE the Pages deploy/upload of the site root:

```sh
# from repo root, against the freshly-baked local rows.json (no network round-trip;
# guarantees the feeds match exactly the issue being published):
node feeds/build_feeds.mjs tender/rows.json --out <DEPLOY_ROOT>/feeds
```

`<DEPLOY_ROOT>` = whatever directory is uploaded to Cloudflare Pages as the site root, so
the files land at `asaptic.com/feeds/all.atom.xml` etc. (If the deploy uploads the repo
tree directly, use `--out feeds/out` and add `feeds/out` to the upload — but a dedicated
`<root>/feeds` dir is cleaner and keeps the gitignored dir out of it.)

Omit the path argument to fetch the live URL instead (`node feeds/build_feeds.mjs`), but the
local-rows.json form above is preferred inside the bake for issue-consistency.

## `_headers` additions (REQUIRED — correct Content-Type per feed)

Add alongside the existing `/tender/rows.json` block:

```
/feeds/*.atom.xml
  Content-Type: application/atom+xml; charset=utf-8
  Cache-Control: public, max-age=300, must-revalidate
  Access-Control-Allow-Origin: *

/feeds/*.rss.xml
  Content-Type: application/rss+xml; charset=utf-8
  Cache-Control: public, max-age=300, must-revalidate
  Access-Control-Allow-Origin: *
```

(300s mirrors the `rows.json` policy — far fresher than the ~2x/day publish cadence.)
`data/index.html` needs no header rule (it is indexable HTML; the default `/*.html`
`no-cache` rule is fine).

## CI gate (RECOMMENDED)

Run before any deploy of this branch's surfaces:

```sh
node --test feeds/build_feeds.test.mjs   # 14 tests
node feeds/sentinel.mjs                  # exit 1 on any leak
```

## Test coverage (14, all green)

Well-formed XML (own zero-dep parser) · active-count excludes `deadline_passed` · entry/item
counts = active rows · per-market file set · closed opportunity fully excluded · only allowed
public fields (no `ref`/`issuer`/`closing_date`/`sort_key` value leaks) · no real-date leak
(only the feed `generated` stamp) · `& < >` escaped · links only to `asaptic.com` · committed
samples current · **generator field-stripping self-test** (a forbidden field on an input row
never reaches output) · sentinel clean on committed surfaces · **sentinel self-test** (a dirty
fixture trips both the acronym and non-`AT-TEST` id rules) · Dataset JSON-LD valid + indexable.
