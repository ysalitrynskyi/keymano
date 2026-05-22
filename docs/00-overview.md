# 00 — Overview

## What we build

Keymano = cross-platform desktop app to **create, edit, and export macOS keyboard layouts**. Visual clickable keyboard. Full dead-key + modifier-map support. Reads/writes `.keylayout` XML and `.bundle` packages, compatible with macOS.

Reimplements Ukelele's capability with original code on a modern portable stack.

## Goals

1. **Format compatibility** — Output `.keylayout` / `.bundle` that macOS installs and uses correctly. Round-trip (open → save) preserves data, including comments.
2. **No Apple lock-in** — Compile/run on macOS, Linux, Windows. No Xcode, no signing, no developer account, no Carbon. Editing works on any OS; only *installing into the live system* is OS-specific.
3. **Live visual editing** — Clickable keyboard. Toggle modifiers → legends update. Edit key output inline. Build dead-key state machines visually.
4. **Physical keyboard variety** — Support ANSI / ISO / JIS plus common physical layouts. Geometry data-driven (JSON), not hardcoded.
5. **Maintainable + extensible** — Component UI, abstract Rust core, documented for AI + human contributors.

## Non-goals (v1)

- Not a runtime input method / IME. We *author* layouts; the OS consumes them.
- Not Windows `.klc` or Linux XKB export in v1 (architecture leaves room — see roadmap).
- No cloud sync / accounts.
- No live-system installer with privileged helper in v1 (we export files + give install instructions; privileged install is a later optional module).

## Core feature checklist (parity with Ukelele)

- [x] Open/save `.keylayout` (XML) — core parse/serialize + round-trip tests
- [x] Open/save `.bundle` (package with 1+ layouts, icon, localized names) — core `bundle.rs`
- [x] Convert standalone ⇄ bundle — `KeyboardBundle::from_keyboard` / `into_single`
- [x] Import from system layout (macOS) / import existing `.keylayout` — `list_installed_layouts` + `list_input_sources` (HIToolbox) + picker; built-ins fork a template
- [x] Visual keyboard with ANSI/ISO/JIS geometry — SVG render from JSON presets
- [x] Per-key output editing for any modifier combination + dead-key state
- [x] Modifier map editor — `modifier_map_view` shows the active layout's real keyMapSelect rows + tokens
- [x] Dead key creation, state machine, terminators — `make_key_dead` + editable terminators in P5
- [x] Action management (named actions, inline actions, unlink/relink) — unlink + relink + copy/paste + core
- [x] Key swap / copy / paste — swap + context-menu copy/paste output (cut = clear+copy)
- [x] Housekeeping: remove unused states/actions — `remove_unused_*` + Dead Keys buttons
- [x] Comments preserved in XML — leading provenance comments round-trip (header)
- [x] Color themes, zoom, font selection — light/dark/system + zoom + keycap font (Sans/Serif/Mono/Round) in Preferences
- [x] XML output options (encode non-ASCII as code points, include char data)
- [x] Live XML preview + validation
- [x] Multi-window / multi-layout editing — document tabs

### Parity additions (from 2nd-pass review — see [12](12-edge-cases-and-parity.md))

- [x] New-keyboard templates (Basic/Standard/Script) with valid script-specific `id`/`group` ranges — `templates.rs` + `ids.rs`
- [x] Special-key output injection ("Add Special Key Output", ~40 control-char keys) — `special_keys.rs`
- [x] Validation + auto-repair (missing special output, base-index, keymap gaps, RepairJIS, invalid id) — `validate.rs`
- [x] Unlink / relink key (break / re-attach base-map inheritance) — both done
- [x] Find key stroke (search by output) · Select key by code — editor Find bar
- [x] Quick Entry Mode (type → fill → advance) — toolbar toggle; (Sticky Modifiers: mask is already sticky in the UI)
- [x] JIS keys 102 (英数) / 104 (かな) in `jis.json`; caps-lock-switching flag on `BundledLayout` (right-mod 257 = display-only)
- [x] Recompute `maxout` on save — `update_maxout` in serializer
- [x] Named undo actions — per-edit action label (grouping pending)
- [x] Export keyboard image (PNG) — SVG → PNG from the editor; plus monochrome reference sheet (all modifier maps, deduped) via "Sheet"
- [x] Installed-layouts Organiser (macOS): list + import + install + uninstall (reversible move-to-Trash, user-scope only) + live fs-watch refresh
- [x] App UI internationalized (i18next) — `en` + 23 translated locales (de/fr/es/it/pt/nl/pl/uk/ru/ja/zh-Hans/zh-Hant/ko/hi/ar/bn/id/ur/tr/vi/fa/ta/mr; RTL-aware `dir`); key-parity + placeholder-integrity tests green
- [x] Recent files on Welcome (file-backed docs, persisted) + per-page guided **Help** tour with first-run nudge
- [x] App-level Preferences (theme light/dark/system, keycap font, language); flat low-band background
- [x] Test-as-you-go: 120+ Rust tests (parse / serialize / modifier / resolve / validate / bundle / templates / golden round-trips / robustness + fuzz) + 90+ frontend tests, ESLint + clippy + cargo-fmt clean, ≥90% line coverage gate on the core in CI, browser + desktop click-through review ([13](13-testing-and-qa.md))

## Reading order for implementer

1. This doc → [02-keylayout-format](02-keylayout-format.md) → [03-bundle-format](03-bundle-format.md) → [04-physical-keyboards](04-physical-keyboards.md) (understand the domain).
2. [05-architecture](05-architecture.md) → [06-tech-stack](06-tech-stack.md) → [07-data-model](07-data-model.md) (understand our build).
3. [08-ui-pages](08-ui-pages.md) → [09-interactive-keyboard](09-interactive-keyboard.md) (build the UI).
4. [12-edge-cases-and-parity](12-edge-cases-and-parity.md) (reference tables: id ranges, special keys, repair, full op list).
5. [13-testing-and-qa](13-testing-and-qa.md) + [14-localization-and-content](14-localization-and-content.md) (test-as-you-go, browser review, MCP translations).
6. [10-implementation-plan](10-implementation-plan.md) (do it in order).
7. [11-ai-conventions](11-ai-conventions.md) (how to write code + docs here).
