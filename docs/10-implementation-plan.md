# 10 — Implementation Plan (Phased)

Build core-first (testable, no UI risk), then shell, then UI feature-by-feature. Each phase ends with something runnable + tests green. Vertical slices after the core foundation.

> **Per-phase exit criteria (apply to EVERY phase, see [13](13-testing-and-qa.md)):** tests written *during* the phase (not after) and green; coverage gates held (core ≥90%, frontend ≥80%); for any UI work, a **browser design review** done (`pnpm dev` → screenshot via preview/browser MCP → review vs [08](08-ui-pages.md)/[09](09-interactive-keyboard.md) → fix → re-shoot, save to `docs/screenshots/`); for format-affecting work, manual macOS install verify when feasible. From Phase 4 on, UI strings go through i18n ([14](14-localization-and-content.md)) — no hardcoded text.

## Phase 0 — Scaffold (½ day)

- `pnpm create tauri-app` → React + TS + Vite template. Add Tailwind v4, shadcn/ui init, lucide, zustand, sonner.
- Create workspace: `crates/keylayout-core` lib crate; `src-tauri` depends on it.
- Wire `lib/ipc.ts` (tauri + web-mock backends) + `lib/ipc.mock.ts` + `lib/types.ts` (start empty). One smoke command `ping() -> "pong"`.
- Init i18next with `en` locale ([14](14-localization-and-content.md)); init Playwright + vitest + `cargo llvm-cov`.
- CI: fmt, clippy `-D warnings`, `cargo test` + llvm-cov gate, eslint, tsc, vitest, playwright, `pnpm build` (see [13](13-testing-and-qa.md) pipeline).
- **Done when**: `pnpm tauri dev` shows "pong" from Rust; `pnpm dev` (web-mock) shows the same in a plain browser; CI green with both test runners wired.

## Phase 1 — Core: parse + serialize `.keylayout` (2–3 days) ⭐ critical

- `model.rs` — all types ([07](07-data-model.md)).
- `encoding.rs` — encode/decode output, `is_valid_unicode`. Unit tests.
- `parse.rs` (quick-xml → model) + `serialize.rs` (model → string; recompute maxout; stable ordering).
- Golden round-trip tests with `insta`: sample `.keylayout` files (US ANSI, an ISO one, a JIS one, one with named actions + terminators, one with base-map inheritance, one with astral/codepoint output). Parse→serialize→parse model-equality.
- **Done when**: real Apple `.keylayout` files round-trip; `cargo test -p keylayout-core` green.

> Collect test fixtures from `/System/Library/Keyboard Layouts/` on a Mac and from the Ukelele repo samples. Include in `crates/keylayout-core/tests/fixtures/`.

## Phase 2 — Core: modifiers + resolution + snapshot + templates (2–3 days)

- `modifiers.rs` — token parse, `ModMask`, `spec_matches`, `resolve_map_index`, `expand_to_masks`. Validate against real Apple modifier maps (tests!). This is the subtle bit — get it right.
- `resolve.rs` — base-map inheritance resolution, dead-state/action lookup, `build_snapshot()` → `KeyboardSnapshot`.
- `validate.rs` — `Vec<Issue>` + repairs (see [12](12-edge-cases-and-parity.md) §4: missing special output, base-index, keymap gaps, RepairJIS, invalid id).
- `ids.rs` + `templates.rs` + `special_keys.rs` — script id ranges + random id ([12](12-edge-cases-and-parity.md) §1), Basic/Standard/Script keyboard generation ([12](12-edge-cases-and-parity.md) §2), special-key output injection ([12](12-edge-cases-and-parity.md) §3). `update_maxout`.
- **Done when**: given a fixture + (type, mask, state), snapshot matches expected key outputs (golden tests); "New Basic keyboard" generates an installable layout.

## Phase 3 — Tauri shell + session + commands (1–2 days)

- `src-tauri`: `Mutex<AppState>` holding open `Document`s by id; undo stack (snapshot-clone).
- Commands ([05](05-architecture.md) surface): open/save/new, get_snapshot, set_key_output, get_xml, validate, undo/redo. Use `tauri-plugin-dialog` + `tauri-plugin-fs`.
- `lib/ipc.ts` typed wrappers + `lib/types.ts` mirroring core (keep in sync; consider `ts-rs` to auto-gen TS from Rust types).
- **Done when**: frontend can open a file and log a snapshot.

## Phase 4 — Geometry + static keyboard render (2 days)

- Author `assets/keyboards/ansi.json` (full), then `iso.json`, `jis.json` ([04](04-physical-keyboards.md)).
- `features/keyboard`: SVG render of geometry (boxes + codes), zoom, type switch. No data yet.
- **Done when**: all three presets render correctly, ISO L-Enter polygon looks right.

## Phase 5 — Editor vertical slice: render real outputs + edit one key (3 days) ⭐ first "wow"

- Merge snapshot into keyboard → real legends (state none, no modifiers).
- Modifier bar → re-fetch snapshot → legends change.
- Selection + inspector.
- KeyPopover → `set_key_output` → live refresh.
- Save → produces valid `.keylayout` (verify by installing on a Mac).
- **Done when**: open US layout, change a key, save, install on macOS, it types the new char.

## Phase 6 — Dead keys & actions + repair (2–3 days)

- Make-dead-key flow; dead-state dropdown + dead/fallback styling in keyboard.
- P5 Dead Keys & Actions editor (table form; graph optional/later).
- Terminators editing. Housekeeping (remove unused states/actions). Add-special-key-output + repair commands ([12](12-edge-cases-and-parity.md) §3–4).
- Unlink/relink key; find key stroke; select by code ([12](12-edge-cases-and-parity.md) §7).
- **Done when**: build a working dead-acute (é/á/etc.), save, install, verify on macOS; repair fixes a deliberately-broken fixture.

## Phase 7 — Modifiers editor (1–2 days)

- P4: token builder, add/remove selects, presets, simplify, coverage warnings.
- **Done when**: can author a custom modifier set and it resolves correctly in the keyboard view + saved XML.

## Phase 8 — Bundles (2–3 days)

- `bundle.rs`: read/write `.bundle` dir, Info.plist (`plist` crate), `.strings`, icons.
- P6 Bundle Manager: layouts list, metadata, localizations, convert standalone⇄bundle.
- **Done when**: create a 2-layout bundle, install, both appear in macOS Input Sources.

## Phase 9 — Polish pages (2–3 days)

- P1 Welcome, P7 XML preview + validation panel, P8 Preferences (persisted), P9 Export/Install.
- Character palette aux component.
- Themes, fonts, color presets; PNG/SVG export of keyboard; **Print/Export reference sheet** (all modifiers × states, monochrome theme — [12](12-edge-cases-and-parity.md) §9).
- Quick Entry Mode + Sticky Modifiers ([12](12-edge-cases-and-parity.md) §7).
- cmdk command palette, shortcuts, context menu, toasts.

## Phase 9b — Organiser / installed layouts (macOS only, 1 day)

- List installed layouts (`~/Library/Keyboard Layouts/` + `/Library/...`), install/uninstall, fs-watch ([12](12-edge-cases-and-parity.md) §7). Behind macOS `#[cfg]`; other OS shows export + instructions.

## Phase 9c — Localization (1 day, MCP-driven)

- Finalize `en` locale: every UI string keyed ([14](14-localization-and-content.md)); add locale key-parity + placeholder-integrity CI tests; eslint gate on hardcoded JSX text.
- Translate to target languages via `mcp__bulk_text__translate_json_file` (per namespace, per language). Commit generated locales.
- Bundle Manager "Auto-translate layout names" via the translation MCP ([14](14-localization-and-content.md)).
- Language switch in Preferences; RTL-readiness check.
- **Done when**: app runs in all target languages, key-parity test green, design review of 2–3 locales (incl. a CJK one) in browser.

## Phase 10 — Comments round-trip + extras (1–2 days)

- Implement `Comments` round-trip in parser/serializer (if stubbed earlier).
- Right-click swap/unlink/cut/copy/paste key.
- Optional: macOS "import current system layout"; FSM graph view; PNG→icns.

## Phase 11 — Release (1 day)

- `tauri build` matrix (mac/win/linux) in CI; artifacts.
- README quickstart, screenshots, sample layouts (LICENSE = Apache-2.0, already in repo).
- Optional Tauri updater.

## Sequencing notes

- **Core before UI.** Phases 1–2 de-risk the hard format/resolution logic with pure tests.
- **Vertical slice at Phase 5** gives a usable, demoable app early.
- Verify on a real Mac at phases 5, 6, 8 (install + type test) — the only true correctness check.
- Keep `keylayout-core` Tauri-free the whole way (could later target wasm for a web demo).

## Definition of done (v1)

Parity checklist in [00-overview](00-overview.md) all ✅; round-trip + snapshot golden tests green; produces installable `.keylayout` and `.bundle` verified on macOS; builds on mac/win/linux with no signing.
