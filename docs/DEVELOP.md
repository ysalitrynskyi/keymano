# Developer guide

Short reference for contributors. User-facing install help is in
[GETTING_STARTED.md](GETTING_STARTED.md). **New AI / auditor session:** read
[AI_HANDOFF.md](AI_HANDOFF.md) first for release state and contribution guardrails.
macOS install help for users: [GETTING_STARTED.md#first-launch-on-macos-important](GETTING_STARTED.md#first-launch-on-macos-important);
release copy template: [RELEASE_NOTES_MACOS.md](RELEASE_NOTES_MACOS.md).

**Product positioning (public / SEO):** open-source, cross-platform **Ukelele
alternative** for Apple's `.keylayout` / `.bundle` formats — see [README](../README.md)
for user-facing copy. Implementation notes should cite Apple's public
`KeyboardLayout.dtd`, Keymano code, and Keymano tests.

## Layout

```
crates/keylayout-core   model, parse, serialize, modifiers, resolve, validate, bundle
crates/keymano-session  document session + undo/redo (no Tauri)
crates/keymano-wasm     wasm-bindgen wrapper over the session → the browser build
src-tauri               thin Tauri command shell
src                     React UI, ipc, i18n
src/assets/keyboards    ANSI / ISO / JIS geometry presets (JSON)
```

The Rust core has no UI dependencies. Desktop and web builds run the **same**
format logic: the desktop app calls it over Tauri IPC, the browser build runs it
compiled to WebAssembly (`crates/keymano-wasm` → `src/wasm`, via `pnpm wasm:build`).

## Prerequisites

[Rust](https://rustup.rs/) (stable) with the wasm target + [wasm-pack](https://rustwasm.github.io/wasm-pack/),
plus Node 20+ and pnpm:

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
corepack enable
```

## Run locally

```bash
pnpm install
pnpm dev          # browser UI — builds the wasm core, then Vite (fastest loop)
pnpm tauri dev    # full desktop app
```

`pnpm dev`, `pnpm build`, and `pnpm test` each run `pnpm wasm:build` first, so the
browser build always exercises the real core.

## Tests & lint (before a PR)

```bash
pnpm lint
pnpm wasm:build && pnpm exec tsc -b                # tsc needs the generated src/wasm types
pnpm test                                          # vitest (frontend + locale parity)
cargo test -p keylayout-core -p keymano-session
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all --check
```

CI also runs Playwright e2e, coverage gates (core ≥90%, frontend ≥80%), and release builds.

## Format work

- `.keylayout` follows Apple's public `KeyboardLayout.dtd`.
- Test fixtures live in `crates/keylayout-core/tests/fixtures/` (real-world layouts, round-trip + golden tests).
- After parse/serialize changes, run `cargo test -p keylayout-core` and update snapshots only when the change is intentional.

## i18n

- Source locale: `src/locales/en/`.
- Other locales: `src/locales/<lang>/` — keep keys in sync; `src/locales/locales.test.ts` enforces parity.
- Landing README translations: `docs/i18n/README.<lang>.md`.

## UI review

For visual changes: `pnpm dev` → exercise pages in the browser → save representative screenshots under `docs/screenshots/` when the look changes materially.

## Docker

Same checks as CI can run in the dev container — see [README](../README.md#run-with-docker).
