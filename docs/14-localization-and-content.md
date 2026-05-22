# 14 — Localization & Content (MCP-Driven)

Two distinct localization concerns. Both use MCP tooling for generation/translation.

1. **App UI i18n** — the Keymano interface itself (menus, labels, dialogs, errors) in many languages.
2. **Keyboard-layout localization** — localized *display names* for layouts inside a `.bundle` (the `.lproj/InfoPlist.strings`, see [03](03-bundle-format.md)).

## App UI i18n

### Stack
- **i18next + react-i18next**. Namespaced JSON locale files under `src/locales/<lang>/<namespace>.json`.
- Default/source locale: **`en`**. All UI strings authored as keys with English values; never hardcode user-facing text in components.
- Language detection: `i18next-browser-languagedetector`; user override in Preferences (P8).

### Source-of-truth file
`src/locales/en/common.json` (+ namespaces: `menu`, `editor`, `dialogs`, `errors`, `bundle`, `prefs`). Example:
```json
{
  "editor.toolbar.makeDeadKey": "Make Dead Key",
  "editor.modifier.shift": "Shift",
  "dialog.editKey.outputLabel": "Output",
  "errors.invalidUnicode": "Output contains an invalid Unicode code point."
}
```

### Translation workflow (use MCP — do NOT hand-translate)
Whenever `en` strings change, regenerate other locales with the **bulk-text translation MCP**:
- Tool: `mcp__bulk_text__translate_json_file` — translates a JSON file's values to a target language, preserving keys/placeholders.
- For each target language: input `src/locales/en/<ns>.json` → output `src/locales/<lang>/<ns>.json`.
- Preserve interpolation placeholders (`{{count}}`, `{{name}}`) and ICU plurals — verify after translation.
- Commit generated locales; never edit them by hand (they're regenerated). Mark with a header note "// generated — edit en/ then re-translate".

If `mcp__bulk_text__translate_json_file` is unavailable at build time, fall back to `mcp__bulk_text__generate_bulk_text` with an explicit translate prompt, or another available translation MCP — but JSON-file translation is preferred (keeps structure).

### Target languages (v1 set — extend freely)
`en` (source), `de`, `fr`, `es`, `it`, `pt`, `nl`, `pl`, `uk`, `ru`, `ja`, `zh-Hans`, `zh-Hant`, `ko`. (Keyboard-layout authors are global + multilingual — broad coverage matters.)

### Rules
- No string literal in JSX/components — always `t("key")`.
- Keys are stable, descriptive, namespaced. Don't reuse a key for different meanings.
- RTL: keep layout logical-direction-aware (Tailwind `rtl:` / `dir`) so adding Arabic/Hebrew later is trivial.
- Test: a unit test asserts every non-`en` locale has the same key set as `en` (no missing/extra keys) — run in CI; fail on drift.

## Keyboard-layout display-name localization (in bundles)

Bundle Manager (P6) lets the author provide localized display names per layout per locale. Offer **"Auto-translate names"**: take the layout's base name and translate to selected locales via `mcp__bulk_text__translate_json_file` / `generate_bulk_text`, then write into each `.lproj/InfoPlist.strings` ([03](03-bundle-format.md)). User can edit/override. This is layout *metadata*, separate from app i18n.

## Content / sample generation (MCP)

Use **`mcp__bulk_text__generate_bulk_text`** for:
- Starter layout descriptions / READMEs for shipped sample layouts.
- Placeholder/sample data in tests + Storybook.
- Onboarding copy in the Welcome page (P1), then translate via the i18n workflow.
- Character-palette Unicode category descriptions (if not pulled from a Unicode data crate).

Keep generated copy reviewed (don't ship unreviewed model text in product UI); store source copy in `en` locale files so it flows through the same translation pipeline.

## When to run MCP tools

- After any `en/*.json` change → re-translate changed namespaces to all target languages.
- When adding a new target language → translate the full `en` set once.
- These are build/dev-time content tasks performed by the AI agent during implementation, not runtime app calls — the shipped app loads static JSON, makes no network/MCP calls.

## CI

- Locale key-parity test (every locale matches `en` keys).
- Placeholder-integrity check (interpolation tokens preserved across locales).
- t() coverage test — every `t("foo.bar")` call in `src/` resolves against
  an `en/*.json` key or has an explicit `defaultValue:` fallback (prevents
  silent regressions where a key reference outlives the JSON entry).
- Lint: no hardcoded user-facing strings (custom eslint rule / grep gate on JSX text).

## Implementation status

`en` is fully keyed (namespaces `common`, `editor`, `errors`; 172 + 77 + 4
keys at last count) and the app ships translations for **23 additional
languages** generated via `mcp__bulk_text__translate_json_file`:

`de`, `fr`, `es`, `it`, `pt`, `nl`, `pl`, `uk`, `ru`, `ja`, `zh-Hans`,
`zh-Hant`, `ko`, `hi`, `ar` (RTL), `bn`, `id`, `ur` (RTL), `tr`, `vi`,
`fa` (RTL), `ta`, `mr`.

Right-to-left scripts (`ar`, `ur`, `fa`, plus `he` once added) drive
`<html dir="rtl">` via `src/lib/i18n.ts#isRtl`, set from the App-level
language effect.

i18next is configured with `fallbackLng: "en"` so regional codes resolve via
the default language chain (e.g. `de-DE` → `de` → `en`, `pt-BR` → `pt` →
`en`), and any key missing from a locale silently falls back to its `en`
value. Unsupported languages (e.g. `sv-SE`) fall through to `en`.

### Re-translating after `en` changes

Whenever `en/*.json` changes, regenerate every affected namespace:

```
# per namespace → writes <lang>.json files; merge into src/locales/<lang>/<ns>.json
mcp__bulk_text__translate_json_file \
  input_file=src/locales/en/common.json \
  output_dir=.i18n-out/common \
  target_languages=[de,fr,es,it,pt,nl,pl,uk,ru,ja,zh-Hans,zh-Hant,ko,hi,ar,bn,id,ur,tr,vi,fa,ta,mr] \
  context="Keymano UI strings — preserve {{vars}} and path literals"
```

For tricky context-sensitive labels (e.g. `prefs.theme.light` meaning the
*colour* of a theme, not the *weight* of a font), translate that subset
separately with a `context` hint that disambiguates, then merge over the
bulk-translated file.

`src/locales/locales.test.ts` enforces key + placeholder parity over whatever
locales are present, so re-running the MCP and committing the regenerated
files is drift-safe.
