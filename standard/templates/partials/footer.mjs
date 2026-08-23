import { renderShell } from "./shell.mjs";

// v2 shell footer for the /standard section — rendered by the SAME sentinel
// injector (_shell/apply_shell.py) that baked <footer class="foot"> onto every
// migrated page. `lang` is accepted (and ignored) purely so existing call sites
// that pass `{ lang, locale, slug }` keep working unchanged — the injector derives
// all footer copy from `locale` via its own i18n files. See nav.mjs / shell.mjs
// for the slug -> output-path contract.
export function footer({ lang, locale = "en", slug = "solar-inverter-china-to-eu", outputRelPath } = {}) {
  return renderShell({ locale, slug, outputRelPath }).footer;
}
