# Public conformance check — `asaptic.tender.v1`

The tender feed at [`/tender/rows.json`](https://asaptic.com/tender/rows.json) is published
under a versioned data contract:
[`asaptic.tender.v1.schema.json`](/developers/contract/asaptic.tender.v1.schema.json)
(JSON Schema 2020-12). This page describes how anyone — not just Asaptic — can check that
the live feed actually conforms to the contract it advertises.

## What the check does

1. Fetches the live feed.
2. Validates the envelope (`generated`, `issue_id`, `market`, `total`, `withheld`, `rows`).
3. Validates a random sample of rows against the 11-field row shape — field set, enums,
   id and sort-key patterns, trilingual category object.
4. Exits `0` on pass, `1` on any violation. Failure output names the JSON path and the
   failed rule only — never the offending value.

The validator is [`validate.mjs`](/developers/contract/validate.mjs): a single
zero-dependency Node script (Node 18+). It also self-tests against the
[synthetic fixtures](/developers/contract/fixtures/positive-minimal.json), including a
[negative fixture](/developers/contract/fixtures/negative-403-spec-denied.json) that the
schema must reject.

## Run it yourself (one line)

```sh
curl -sLO https://asaptic.com/developers/contract/asaptic.tender.v1.schema.json \
  && curl -sLO https://asaptic.com/developers/contract/validate.mjs \
  && curl -sL https://asaptic.com/tender/rows.json | node validate.mjs --stdin --sample 20
```

Expected output:

```
PASS  stdin (sampled 20 rows)
```

From a checkout of the public repository the same thing is:

```sh
node developers/contract/validate.mjs            # fixture self-test
curl -sL https://asaptic.com/tender/rows.json \
  | node developers/contract/validate.mjs --stdin --sample 20
```

## Scheduled run

A weekly GitHub Actions workflow (`.github/workflows/contract-check.yml`) runs exactly the
commands above against production and stamps the result into the
[status board](/developers/status.json) shown on [/developers](/developers/). Real runs
only — there are no static badges anywhere on this surface. If the run has not been
enabled yet, the board's "Weekly public conformance run" row says "In build"; the chip
flips only when the first real run has executed.

## Versioning promise

Breaking changes to the row or envelope shape get a new contract name
(`asaptic.tender.v2`), a new schema file, and a migration note here. `v1` documents will
keep validating against the `v1` schema for as long as the feed publishes `v1`.
