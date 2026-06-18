# 🔒 CROSS-STANDARD LOCK

**Status: LOCKED — installed 2026-06-19 at Raymond's explicit instruction.**

The public-interest **Cross-Standard** pages are FROZEN. They must **not** be changed
by any other project, workstream, or automated build wave.

## Locked paths (the four standard trees)
- `standard/**` (EN — incl. `standard.css`, `standard/templates/**`, market/product/guides, all comparison pages)
- `zh/standard/**`
- `zht/standard/**`
- `pt/standard/**`

## Rule
If you (any AI session, any project, any automated wave) want to change ANYTHING
under these paths, you **MUST first send Raymond a warning** describing exactly what
you want to change and why, and get his **explicit approval**. Do not proceed without it.

- Warning channel: email **raymond.thu@gmail.com**, or a **Bitable 🎫 ticket**.
- Only after Raymond approves, commit with the override:
  ```
  ALLOW_CROSS_STANDARD_EDIT=1 git commit ...
  ```

## Why
These are public-interest / 公益 charity pages. Unattended waves have twice injected
unauthorized content (fake ACFIC / U-Trade endorsement claims) and a broken stylesheet
link into them. They are commercially neutral by design (no sourcing CTAs, no endorsement
claims) and changes carry reputational/legal risk.

## Enforcement
A git **pre-commit hook** (`.githooks/pre-commit`, wired via `core.hooksPath=.githooks`)
blocks any commit that touches the locked paths unless `ALLOW_CROSS_STANDARD_EDIT=1` is set.

> NOTE: the hook stops the git path. Deploys via `wrangler pages deploy` do NOT require a
> commit, so a wave could in theory edit + deploy without committing — the binding control
> is therefore also the POLICY above: warn Raymond before ANY cross-standard change.
