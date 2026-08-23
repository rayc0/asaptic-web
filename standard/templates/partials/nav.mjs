import { renderShell } from "./shell.mjs";

// v2 shell header for the /standard section — rendered by the SAME sentinel
// injector (_shell/apply_shell.py) that baked <header class="shell"> onto every
// migrated page, so this can never drift from the committed markup. `slug` must
// be the full standard/-relative slug (e.g. "market/japan", "guides/x", "browse",
// or a bare comparison slug) — see shell.mjs's outputRelPath() for how it maps
// to a repo-relative path. Pass an explicit `outputRelPath` to override that
// mapping (not needed by any current call site).
export function nav({ locale = "en", slug = "solar-inverter-china-to-eu", outputRelPath } = {}) {
  return renderShell({ locale, slug, outputRelPath }).header;
}
