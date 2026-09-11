# Phase 4 notes — lead capture activation (submit_rfq + request_tender_access)

Code shipped in this branch fixes the silent-lead-drop bug (see
`AGENT_ACCESS_PLAN_2026-08-10.md` §E and §F Phase 4): `submit_rfq` and
`request_tender_access` now route through `lib/lead-capture.mjs`, which is
**env-guarded and degrades honestly**. Merging this branch alone changes
nothing dangerous — with no binding configured, both tools keep returning
`{stored: false, contact_fallback: "mailto:engage@asaptic.com"}` and never
fabricate a reference number. Capture only activates once one of the two
bindings below is configured in the Cloudflare Pages dashboard for the
`asaptic-web` project (Settings → Functions → Bindings), on top of the
already-existing `TENDER_DATA` R2 binding.

## Option A (preferred): KV namespace binding

- **Binding name (exact, case-sensitive): `LEADS`**
- Type: KV Namespace
- Create the namespace (e.g. `asaptic-leads`) in Workers & Pages → KV, then
  bind it to the `asaptic-web` Pages project under variable name `LEADS`.
- Keys are written as `leads:<ISO-week>:<uuid>` (e.g.
  `leads:2026-W33:53279d85-...`), one JSON object per key (JSONL-style,
  newline-terminated), no TTL (kept indefinitely). Export/rotate leads by
  listing keys with the `leads:` prefix via `wrangler kv key list` or the
  dashboard.

## Option B: webhook URL

- **Variable name (exact, case-sensitive): `LEAD_WEBHOOK_URL`**
- Type: plain text environment variable (or Secret if the URL itself should
  stay private) pointing at an endpoint that accepts `POST` with a JSON
  body (the same record shape KV would store).
- 5-second timeout per attempt, one retry maximum (so a dead webhook cannot
  turn into a retry storm against the worker's request budget). If both
  attempts fail, the tool call still returns 200 with an honest
  `{stored: false, ...}` — the caller is never told a webhook succeeded
  when it did not.

If **both** are configured, `LEADS` (KV) is tried first; a KV failure falls
through to the webhook before falling through to the honest no-op. Neither
binding existing is required for this code to ship safely — that is the
whole point of building it env-guarded.

## What still needs a decision before this activates for real

- Which channel Raymond actually wants (KV is simpler / owned entirely by
  Cloudflare; a webhook can forward straight into email/Slack/CRM but is
  another moving part to keep alive).
- Who/what reads the KV entries or webhook payloads once leads start
  landing there (a scheduled digest? a Worker Cron reading `leads:` keys
  weekly? forwarding to `engage@asaptic.com`?). Building that consumer is
  explicitly out of scope for this branch — this phase only stops the
  silent drop and gets the data somewhere durable; wiring a human-facing
  digest is a follow-up.

Until a binding is configured, this is a no-regression change: previously
`submit_rfq` fabricated a reference and lied about receipt; now it honestly
says it wasn't stored and gives the same `engage@asaptic.com` fallback the
site already uses everywhere else.
