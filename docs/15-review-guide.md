# 15 — Independent Review Guide

A checklist and orientation for an external reviewer auditing Keymano against
its plan and against the behavior of the original Ukelele / Apple tooling.

## What Keymano is

A cross-platform editor for macOS `.keylayout` files and `.bundle` keyboard
packages — an open-source successor to [Ukelele](https://software.sil.org/ukelele/).
It reads and writes Apple's native formats; the goal is fidelity (a layout
edited in Keymano installs and types identically to one made in Ukelele).

## Repository map

```
crates/keylayout-core    pure Rust, no Tauri: model, parse, serialize, modifier
                         resolution, dead-key resolution, validate + repair,
                         templates, script ids, special keys, bundles
crates/keymano-session   Tauri-free document session: open docs, undo/redo, edits
src-tauri                thin Tauri command shell over the session (desktop)
src                      React + TS frontend (keyboard, pages, ipc, i18n)
src/assets/keyboards     ANSI/ISO/JIS geometry presets (JSON)
src/locales              i18n (en source + 23 translations)
docs/                    domain specs, architecture, parity checklist, this guide
```

## Build / run / test (every path)

```bash
# Prereqs: Rust (stable), Node 20+, pnpm (corepack enable)
pnpm install

# Run
pnpm dev                         # full UI in a browser via the web-mock (no Rust)
pnpm tauri dev                   # desktop app (needs a system WebView)

# Verify
pnpm lint                        # eslint
pnpm exec tsc -b                 # typecheck
pnpm test                        # frontend (vitest) — includes locale parity
cargo test --workspace           # Rust core + session + roundtrip integration
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all --check

# Docker (no toolchain except the native desktop build)
docker compose run --rm check        # lint + tsc
docker compose run --rm web-test     # vitest
docker compose run --rm core-test    # cargo tests
docker compose up web-prod           # production static build on :8080
```

Desktop builds: macOS `pnpm tauri build --bundles app`; Windows needs MSVC +
WebView2; Linux needs WebKitGTK + libsoup. CI (`.github/workflows/ci.yml`) runs
all of the above on a mac/win/linux matrix.

## Reference material to compare against

- [01-reference-ukelele](01-reference-ukelele.md) — how the original works.
- [02-keylayout-format](02-keylayout-format.md) — the `.keylayout` XML spec.
- [03-bundle-format](03-bundle-format.md) — the `.bundle` package spec.
- [04-physical-keyboards](04-physical-keyboards.md) — ANSI/ISO/JIS geometry.
- [12-edge-cases-and-parity](12-edge-cases-and-parity.md) — id ranges, special
  keys, repair rules, the full operation list.
- [00-overview](00-overview.md) — the live parity checklist.

## What to scrutinize (highest risk first)

1. **Format fidelity** — parse → edit → serialize → re-parse round-trips for
   real Apple/Ukelele layouts. Comments, modifier maps, dead-key actions/
   terminators, base-map inheritance, astral/codepoint output. Fixtures in
   `crates/keylayout-core/tests/fixtures/`; integration roundtrips in
   `crates/keymano-session/tests/roundtrip.rs`. **Best check: install a
   Keymano-saved layout on a real Mac and type with it.**
2. **Modifier resolution** — `keyMapSelect` matching, `defaultIndex`, `any*`/
   optional tokens. A wrong index shows the wrong characters (e.g. a Cyrillic
   base map rendering as Latin).
3. **Dead-key FSM** — states, terminators, `next`/`through`/`multiplier`.
4. **Validation + repair** — does repair ever corrupt a valid layout? Are real
   layouts flagged with false positives?
5. **Filesystem commands (desktop)** — install/uninstall/reveal/open-external:
   path constraints (user Keyboard Layouts dir only; http(s)/mailto only),
   no clobbering, reversible uninstall.
6. **i18n** — `src/locales/locales.test.ts` enforces key parity + placeholder
   integrity; RTL (`dir`) for Arabic/Urdu/Persian; code/identifiers stay LTR.
7. **Accessibility & responsive** — keyboard nav, aria labels, ≥900px window,
   nothing clipped, modals viewport-clamped.
8. **Cross-platform** — the desktop build on Windows/Linux; the web build.

## Known limitations / non-goals

- Apple's built-in layouts are sealed (binary bundle) — no app, including
  Ukelele, can read them. Keymano lists them only to start a blank layout.
- The app is unsigned (no Apple Developer account); Gatekeeper needs a
  right-click ▸ Open on first launch.
- Not yet built: cmdk command palette, character palette, Tauri auto-updater.
- The `.dmg` bundling step is skipped on macOS (GUI/Finder dependency); the
  `.app` is the macOS artifact.

## Reporting

Security issues: follow [SECURITY.md](../SECURITY.md) (private). Everything else:
GitHub issues using the templates.
