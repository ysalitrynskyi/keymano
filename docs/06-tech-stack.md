# 06 — Tech Stack & Rationale

## Decision

**Tauri 2** (Rust backend + system WebView) with a **React + TypeScript + Vite** frontend, **Tailwind CSS v4** + **shadcn/ui** components, **Zustand** for UI state. Core layout logic lives in a standalone **Rust crate** (`keylayout-core`) that the Tauri app links and exposes via commands.

## Why this, not the alternatives

| Requirement | Tauri+Rust+React | Electron+React | Native Swift/Cocoa | Pure Rust GUI (egui/iced) |
|---|---|---|---|---|
| No Apple dev account / builds anywhere | ✅ | ✅ | ❌ Xcode+signing | ✅ |
| Small + fast | ✅ ~10MB, native core | ❌ ~150MB, Node | ✅ | ✅ |
| Huge component ecosystem (user wants "lots of components") | ✅ web | ✅ web | ⚠️ | ❌ few |
| Easy/fast to design (Tailwind) | ✅ | ✅ | ❌ | ⚠️ |
| Safe, fast data core (XML model) | ✅ Rust | ⚠️ JS | ✅ | ✅ |
| Cross-platform | ✅ | ✅ | ❌ macOS only | ✅ |

Tauri wins: native Rust core (mirrors Ukelele's C++ model with memory safety + speed), tiny binaries, full web UI ecosystem, no signing to run locally. Electron loses on size/speed/no-safe-core. Native loses the whole point (Apple lock-in). Pure-Rust GUI loses on component richness + design speed.

React Native is mobile-first — wrong tool for desktop. Dropped.

## Frontend libraries

| Concern | Choice | Why |
|---|---|---|
| Framework | React 19 + TypeScript 6 | Largest ecosystem, shadcn-compatible |
| Bundler/dev | Vite 8 | Fast HMR, Tauri-recommended |
| Styling | Tailwind CSS v4 | Fast, consistent, themeable |
| Components | shadcn/ui (Radix primitives) | Copy-in components, full control, accessible (dialogs, popovers, tabs, command palette, tooltip, dropdown) |
| Icons | lucide-react | Matches shadcn |
| UI state | Zustand | Tiny, no boilerplate; holds selection/modifier/dead-state/interaction-mode |
| Data fetching to core | Tauri `invoke` commands + thin TS client | Type-safe wrapper generated/handwritten |
| Keyboard rendering | SVG (hand-rolled) or react-konva (optional) | SVG crisp + exportable |
| Forms | react-hook-form + zod | Validated dialogs |
| Virtualized lists | @tanstack/react-virtual | Action/state lists can be large |
| Command palette | cmdk (bundled in shadcn) | Quick actions |
| Notifications | sonner | Toasts |
| i18n | i18next + react-i18next + browser-languagedetector | App UI translations; locales translated via MCP ([14](14-localization-and-content.md)) |

### Testing libraries

| Layer | Tool |
|---|---|
| Core unit/golden | `cargo test`, `insta` (snapshots), `proptest` (optional), `cargo llvm-cov` (coverage) |
| Frontend unit/component | `vitest`, `@testing-library/react`, `@testing-library/user-event`, v8 coverage |
| UI e2e + visual | Playwright (vs Vite dev server, ipc mocked), `@axe-core/playwright` (a11y) |
| Full Tauri e2e | `tauri-driver` + WebDriver (Linux/Win CI) |

See [13](13-testing-and-qa.md) for the full strategy + coverage gates.

## Rust crates

| Concern | Crate | Why |
|---|---|---|
| XML parse/emit | `quick-xml` 0.39 | Fast, streaming, control over output formatting + comments (`Event::GeneralRef` ignored — non-validating parser) |
| Plist (bundle Info.plist) | `plist` | Read/write XML plists |
| Serde | `serde` + `serde_json` | Geometry JSON, command (de)serialization |
| Error | `thiserror` + `anyhow` | Ergonomic errors |
| Unicode | `unicode-segmentation` (if needed) | Grapheme handling in output strings |
| Icons (later) | `icns` | `.icns` read/write |
| Testing | `insta` (snapshot) | Golden-file round-trip tests for serializer |
| Tauri | `tauri` 2, `tauri-plugin-dialog`, `tauri-plugin-fs` | File open/save dialogs, fs access |

`keylayout-core` is a **plain library crate with zero Tauri dependency** — fully unit-testable, reusable (could power a CLI or web-wasm build later). The Tauri app (`src-tauri`) is a thin shell exposing commands.

## Project layout

```
keymano/
├── package.json            (pnpm workspace root: frontend)
├── index.html
├── vite.config.ts
├── tailwind.config / app.css
├── tsconfig.json
├── src/                    (React frontend)
│   ├── main.tsx
│   ├── app/                (routing, layout shell)
│   ├── pages/              (one folder per page — see 08)
│   ├── features/
│   │   ├── keyboard/       (interactive keyboard component — see 09)
│   │   ├── key-editor/
│   │   ├── modifiers/
│   │   ├── deadkeys/
│   │   └── bundle/
│   ├── components/ui/      (shadcn components)
│   ├── store/              (zustand stores)
│   ├── lib/
│   │   ├── ipc.ts          (typed command client: tauri backend + web-mock backend — see 13)
│   │   ├── ipc.mock.ts     (in-browser fixture-backed mock for design review + e2e)
│   │   └── types.ts        (shared TS types mirroring core)
│   ├── locales/            (i18next JSON: en/ source + generated languages — see 14)
│   └── assets/keyboards/   (geometry JSON presets)
└── src-tauri/
    ├── Cargo.toml          (depends on keylayout-core)
    ├── tauri.conf.json
    ├── src/main.rs
    └── src/commands.rs     (thin command layer)
└── crates/
    └── keylayout-core/     (the real logic, no Tauri)
        ├── Cargo.toml
        └── src/{lib,model,parse,serialize,bundle,modifiers,validate}.rs
```

## Build & run

```bash
pnpm install
pnpm tauri dev      # dev with HMR
pnpm tauri build    # produce native binary for current OS
cargo test -p keylayout-core   # core unit/round-trip tests
```

Prereqs: Rust stable, Node 20+, pnpm, OS WebView (preinstalled on macOS/Windows; `webkit2gtk` on Linux). No signing required for local builds.

## Tooling

- ESLint + Prettier (frontend), `rustfmt` + `clippy` (core).
- `vitest` for frontend unit tests, Playwright optional for e2e.
- GitHub Actions: `cargo test`, `clippy`, `pnpm build`, cross-platform `tauri build` matrix.
