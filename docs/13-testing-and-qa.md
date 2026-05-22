# 13 — Testing & QA (Test-as-You-Go)

**Mandate: cover everything with tests as we build, not after.** No feature is "done" without tests + a design review. Every phase in [10](10-implementation-plan.md) ends green or it doesn't end. The original Ukelele shipped a skeleton test (`XCTFail` placeholder) — we do the opposite.

## Test layers

| Layer | Tool | Scope | When |
|---|---|---|---|
| Core unit | `cargo test` | every fn in `keylayout-core` | every core change |
| Core golden / round-trip | `insta` snapshots | parse→serialize→parse on real `.keylayout` fixtures | every parse/serialize/resolve change |
| Core property | `proptest` (optional) | encode/decode output, modifier-mask expansion | for the fiddly bits |
| Shell / command | `cargo test` in `src-tauri` | command layer maps to core correctly | each new command |
| Frontend unit | `vitest` | stores (zustand), pure helpers, ipc client | each store/helper |
| Component | `vitest` + `@testing-library/react` | KeyCap, Keyboard, KeyEditor, dialogs render + interact | each component |
| Visual / e2e (UI) | Playwright vs Vite dev server (ipc mocked) | full pages, flows, screenshots | each page/feature |
| Full e2e (Tauri) | `tauri-driver` + WebDriver (Linux/Win CI) | real Rust↔UI | per release / nightly |
| Manual macOS verify | install output, type test | format correctness | phases 5, 6, 8 |

> macOS WKWebView has no WebDriver — full Tauri e2e runs on **Linux CI** via `tauri-driver`. UI e2e everywhere via Playwright against the **Vite dev server** with the ipc layer mocked (see below).

## Coverage gates (CI fails below)

- Core (`keylayout-core`): **≥ 90%** line coverage via `cargo llvm-cov`. The format logic is the product — test it hard.
- Frontend: **≥ 80%** via `vitest --coverage` (v8). Stores/helpers ~100%; components meaningful interaction coverage.
- Coverage reported in CI; PR shows delta; no PR may *lower* core coverage.

## The ipc web-mock (enables browser review + UI e2e)

`lib/ipc.ts` has two backends, chosen at runtime:
- **tauri**: real `invoke()` (when `window.__TAURI__` present).
- **web-mock**: in-browser implementation backed by fixture snapshots + a tiny TS reimplementation-free stub that serves canned `KeyboardSnapshot`s and accepts edits in memory. Lets the whole React UI run via `pnpm dev` in any browser with **no Rust backend**.

This mock is for **design review + Playwright + Storybook only** — it is NOT a second source of truth (core stays authoritative in the real app). Keep the mock thin: load fixture snapshots produced by core's golden tests, so the UI sees real-shaped data.

## Design review in browser (every UI phase)

After each UI slice, do a **visual review in a real browser** using the available MCP tooling — don't trust "it compiles":

1. Start the frontend: `pnpm dev` (Vite, ipc=web-mock) → serves at `http://localhost:1420`.
2. Open it with a browser/preview MCP (e.g. `Claude_Preview` `preview_start`/`preview_screenshot`, or the Playwright `browser` MCP `browser_navigate` + `browser_take_screenshot`, or `Claude_in_Chrome`).
3. **Screenshot each page + key states**: keyboard ANSI/ISO/JIS, modifiers toggled, dead-state preview, key popover open, dialogs, light/dark themes, narrow/wide window.
4. Review against [08](08-ui-pages.md)/[09](09-interactive-keyboard.md): hierarchy, spacing, alignment, contrast, legibility of key legends at min/max zoom, focus rings, hover/selected states. Fix issues, re-screenshot.
5. Check responsiveness (resize) and `prefers-reduced-motion`.
6. Run the design-skill pass if helpful (`/critique`, `/polish`) on the screenshots.

Save representative screenshots to `docs/screenshots/` so reviews are diffable over time.

### Accessibility checks
Playwright + `@axe-core/playwright` on each page (no critical violations). Keyboard-only navigation flow test. Color-contrast on key themes.

## Core fixtures (build the corpus early)

`crates/keylayout-core/tests/fixtures/` — collect in Phase 1, grow forever:
- Real Apple layouts from `/System/Library/Keyboard Layouts/` (US, ABC, British, German, French, Spanish, …).
- ISO + JIS examples (geometry + JIS keys 102/104).
- Dead-key layouts (US-International, multiple states, terminators).
- Base-map inheritance examples.
- Astral / code-point-encoded output.
- Comment-bearing files.
- **Deliberately broken** files (dangling action ref, base cycle, invalid id, missing special output) → drive `validate.rs`/repair tests.

Each fixture: a round-trip test + (where relevant) a snapshot-resolution test asserting exact key outputs for given (type, mask, state).

## What to test per subsystem

- **parse/serialize**: round-trip equality; byte-stability of our own output; encoding on/off; maxout recompute; comment round-trip (when implemented).
- **modifiers**: token parse; `spec_matches` truth table vs real Apple maps; full 256-mask expansion; default-index fallback.
- **resolve**: base inheritance (incl. multi-level + cycle rejection); dead-state lookup; terminator fallback; snapshot display glyphs.
- **templates/ids**: generated keyboard validates; random id within range; `id_is_valid` boundaries.
- **special keys/repair**: injection only fills undefined absolute-base keys; RepairJIS; each repair flag fixed + idempotent.
- **bundle**: read/write round-trip; Info.plist + .strings + icon preserved; standalone⇄bundle.
- **stores/UI**: modifier toggle → snapshot refetch; selection; interaction-mode transitions (one active at a time); edit → optimistic update → confirmed.

## Definition of done (per task) — testing addendum to [11](11-ai-conventions.md)

Tests added + green (unit + golden where format-affecting + component/e2e where UI), coverage not lowered, **browser design review screenshots taken for UI work**, manual macOS install verify for format-affecting work when feasible.

## CI pipeline

```
on PR:
  - cargo fmt --check, cargo clippy -D warnings
  - cargo test + cargo llvm-cov (gate ≥90% core)
  - eslint, tsc --noEmit
  - vitest run --coverage (gate ≥80%)
  - playwright test (UI e2e vs vite, ipc mock) + axe
  - pnpm build, cargo build
nightly / release:
  - tauri-driver e2e on Linux
  - tauri build matrix (mac/win/linux)
```
