# 11 — Conventions for AI & Human Contributors

Read before writing code. Keeps the codebase abstract, documented, and consistent.

## Golden rules

1. **Core owns truth.** All layout logic (parse/serialize/resolve/modifiers/validate) lives in `keylayout-core`, pure + tested. The frontend never re-implements format logic. src-tauri is a thin shell.
2. **Abstract over keyboards.** No hardcoded geometry in code — geometry is JSON data ([04](04-physical-keyboards.md)). No hardcoded modifier behavior in UI — ask core. Adding a new physical keyboard = add a JSON file, zero code.
3. **Types mirror the format.** Rust model = the `.keylayout` structure ([07](07-data-model.md)). TS types mirror Rust (prefer `ts-rs` to auto-generate; else keep `lib/types.ts` in lockstep).
4. **Every command is typed.** New Tauri command ⇒ add to `commands.rs` + `lib/ipc.ts` + types, same PR.
5. **Test as you go — cover everything.** Write tests *during* the change, never "later". Core ≥90%, frontend ≥80% coverage (CI-gated). Any parse/serialize/resolve change ⇒ `insta` golden test; round-trip stays model-stable. UI work ⇒ component test + Playwright e2e. Full strategy: [13](13-testing-and-qa.md).
6. **Design review in browser.** Every UI slice: `pnpm dev` (ipc web-mock) → screenshot via preview/browser MCP → review vs [08](08-ui-pages.md)/[09](09-interactive-keyboard.md) → fix → re-shoot → save to `docs/screenshots/`. "Compiles" ≠ "looks right".
7. **No hardcoded user-facing text.** All UI strings via i18next `t("key")` in `en` locale; translate to other languages with the bulk-text translation MCP ([14](14-localization-and-content.md)). Use MCP text-gen for sample/onboarding copy. Never hand-translate locale JSON.
8. **Document as you go.** New module/feature ⇒ a short doc header + update the relevant `docs/*.md`. Update the parity checklist in [00-overview](00-overview.md) when a feature lands.

## Code style

- **Rust**: `rustfmt` + `clippy` clean. `thiserror` for lib errors, `anyhow` only in shell. No `unwrap()` in core (return `Result`). Small modules per [07](07-data-model.md) map.
- **TS/React**: function components + hooks. Zustand for shared state; local `useState` for ephemeral. shadcn/ui components in `components/ui` (don't fork without reason). Tailwind for styling; theme tokens via CSS vars. No business logic in components — call `ipc`.
- **Naming**: match `.keylayout` vocabulary (keyMapSet, modifierMap, action, when, terminator) everywhere — don't invent synonyms. Consistency with the format = fewer bugs.

## Commit / PR

- Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`). Subject ≤ 50 chars.
- One vertical slice per PR where possible (see phases in [10](10-implementation-plan.md)).
- PR description: what + why + how-tested. Link the phase.

## Caveman doc style (for terse, token-cheap docs)

When writing internal notes / inline design docs / PR notes, prefer **caveman style**: drop articles/filler, fragments OK, keep ALL technical substance + exact identifiers + code blocks verbatim. Pattern: `[thing] [action] [reason]. [next].`
- Yes: "Parser drop comments v1. Round-trip add phase 10. Snapshot built core-side, UI render only."
- No: "In the initial version, the parser will simply drop the comments, but we will add support for round-tripping them later in phase 10."
- **Never** caveman-ify: code, identifiers, format spec tables, security/correctness warnings, irreversible-action steps. There clarity > brevity.

## Abstraction checklist (keep it extensible)

- New keyboard shape → JSON only.
- New OS install target → impl `Installer` trait, no core change.
- New export format (e.g. Windows `.klc`) later → new `serialize_klc.rs`, model unchanged.
- New UI page → `pages/<name>` + route entry; reuse `features/*`.
- Platform-specific code → behind `#[cfg(target_os=...)]` in shell, never in core.

## Don't

- Don't put file I/O or platform calls in `keylayout-core` (pass bytes/paths in, return data out).
- Don't hold the authoritative model in the frontend.
- Don't hand-roll XML strings in the UI — always `get_xml` from core.
- Don't add deps casually; prefer the ones in [06](06-tech-stack.md).
- Don't break the round-trip golden tests to make a feature easier — fix the model instead.

## Definition of "done" for a task

Compiles, `clippy`/`rustfmt`/`eslint` clean, **tests added + green + coverage not lowered**, docs touched, parity checklist updated if a feature landed, sanity-checked in `pnpm tauri dev`. For UI work: **browser design review screenshots taken**. For new user-facing text: **keyed in `en` + retranslated via MCP**. For format-affecting work: verified by installing output on a real Mac when feasible.
