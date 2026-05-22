# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and the project follows
[Semantic Versioning](https://semver.org/).

## [0.2.0] — 2026-05-22

### Changed
- **The browser build now runs the real Rust core, compiled to WebAssembly.**
  The hand-written JavaScript stand-in is gone; a new crate `keymano-wasm` wraps
  `keymano-session` (the same command surface the desktop app drives) and is
  built to `src/wasm` with `wasm-pack`. Parsing, serialization, validation, and
  modifier/dead-key/base-map resolution are now identical in the browser and on
  the desktop — one engine, no second implementation to drift.
  - This corrects two long-standing browser-only inaccuracies the stand-in had:
    inherited (base-map) layers now resolve exactly as macOS does (an empty
    absolute layer no longer fabricates a base-map fallback), and opening an
    unparseable file now reports an error instead of silently inventing a doc.
  - The desktop app is unchanged (it still calls the core over Tauri IPC) and
    does not ship the wasm payload (it's loaded via a dynamic import).
- `ids::random_keyboard_id` no longer reads the system clock (which traps on
  `wasm32`); it mixes a wall-clock seed, where available, with a process counter
  so ids minted in one session stay unique on every platform.

### Fixed
- **Bundle page** showed a fabricated `com.apple.keyboardlayout.<name>`
  identifier that used Apple's reserved namespace and didn't match the id
  actually written to the `.bundle` (`app.keymano.layouts.<slug>`); it now
  displays the real identifier with the same slug rules as the core writer.
- **XML & Validation** kept showing the pre-repair XML after an in-place
  *Repair* (the fetch effect's dependencies were unchanged); the preview now
  refetches after repairing.
- **Dead Keys** terminator field saved on every blur, creating empty undo steps
  and marking the document dirty even when nothing changed; it now saves only on
  a real change.
- **Browser shortcuts** (undo/redo/zoom) hijacked `⌘/Ctrl`-combos while the user
  was typing in a field; accelerators are now ignored for editable targets.
- **`validate::repair`** flagged `MissingSpecialKeyOutput` as auto-fixable but
  injected the special-key output only into an index-0 absolute map, so a set
  whose absolute map sat at a non-zero index stayed broken; repair (and
  `add_special_keys`) now target the lowest-index absolute map of each set.
- **Housekeeping** (remove unused states/actions, add special keys) and repair
  recorded an undo step and dirtied the document even when they changed nothing;
  they now commit only when something actually changed.

### Deployment
- `docker-compose.prod.yml`: the Cloudflare Tunnel now waits for the web
  container's healthcheck (`depends_on: condition: service_healthy`) before
  starting, eliminating the brief boot-time 502 while nginx is still coming up.
- The web image (`docker/web-prod.Dockerfile`) builds the wasm core in a
  dedicated Rust stage; CI's frontend, Tauri, and desktop-release jobs install
  the `wasm32` target + `wasm-pack`.

## [0.1.0] — 2026-05-22

First public release: a free, open-source, cross-platform editor for macOS
`.keylayout` files and `.bundle` keyboard packages — a Ukelele alternative that
runs on macOS, Windows, Linux, and in the browser.

### Core (Rust)
- Pure, Tauri-free Rust core (`keylayout-core`): parse / serialize `.keylayout`
  (comment-preserving), modifier resolution with base-map inheritance, dead-key
  state machine, validation + auto-repair, templates, script id ranges,
  special-key injection, and `.bundle` read/write.
- Parser/bundle hardening: rejects non-UTF-8 element names; decodes `.strings`
  UTF-16 BE and surfaces an odd trailing byte instead of dropping it; the
  install filename sanitizer strips bidi/format controls (Finder
  extension-spoofing) with a clean fallback.
- `validate::UnknownNextState` fires correctly (an undefined dead-key transition
  now warns).
- DTD-correct serialization: an empty `<keyMap>` emits the dummy sentinel key
  (`code="512"`, skipped on parse) so output satisfies `keyMap (key+)` and macOS
  accepts it; every `<action>` always emits its `state="none"` `<when>` first
  (synthesized if absent), per `KeyboardLayout.dtd` convention. The web build's serializer
  (`mock-core.ts`) applies the same two rules so browser-saved files are valid
  too. Round-trip tests cover both + key codes > 127 (e.g. right-Command 257).

### Editor
- Clickable ANSI / ISO / JIS keyboard; per-key editing for any modifier
  combination and dead-key state; modifier-map view; dead keys & terminators;
  unlink / relink; copy / paste / swap; Quick Entry; find-by-output;
  select-by-code; undo / redo with named actions.
- Live XML preview + validation with one-click auto-repair; PNG and monochrome
  reference-sheet export. Find-by-output is substring + case-insensitive. The
  tab dirty-dot and validation badge refresh after every edit (incl. unlink /
  relink / swap / clear / make-dead), so saved/clean state is never stale.

### App
- Templates and open / install / uninstall (move-to-Trash) of installed layouts
  with a live folder watch (macOS); recent files; light / dark / system theme;
  selectable keycap font; per-page guided Help tour.
- **Save vs Save As**: `Save` (⌘S) overwrites the document's current file in
  place; `Save As…` (⌘⇧S, File menu + document dropdown) forks a copy. A
  brand-new layout still prompts on first save. A tooltip clarifies that editing
  only touches the *file*, never a live installed keyboard.
- **Error boundary**: a render crash shows a recoverable fallback, not a blank
  page.
- Bundled `examples/` folder: Keymano-generated phonetic Cyrillic `.keylayout`
  files (Ukrainian, Bulgarian, Serbian, Macedonian) to open immediately —
  produced by `crates/keylayout-core/examples/gen_examples.rs` through the
  project's own serializer, with a CI test that parses, validates, and checks
  full-alphabet coverage.

### Internationalization (24 languages)
- UI in 24 languages — English, Deutsch, Français, Español, Italiano, Português,
  Nederlands, Polski, Українська, Русский, 日本語, 简体中文, 繁體中文, 한국어,
  हिन्दी, العربية, বাংলা, Indonesia, اردو, Türkçe, Tiếng Việt, فارسی, தமிழ், मराठी
  — with RTL-aware `dir` switching for Arabic / Urdu / Farsi.
- Every user-visible string routed through `t()` — toasts, guard labels, Splash
  controls, Preferences, Help-tour a11y, native file-picker filter,
  reference-sheet labels, dead-keys housekeeping, the interactive-keyboard
  aria-label, and the `Untitled` fallback.
- CI guards: key-parity + placeholder-integrity across all locales, a `t()`
  drift guard (every key must resolve in `en/*.json`), and no-empty-value +
  protected-token (brand, `.keylayout`, `.bundle`, install path, ANSI/ISO/JIS)
  checks.

### Web build & self-hosting
- Functional **browser build**: Open imports a real `.keylayout` (DOMParser),
  Save/Export download real files, Install downloads the file to place manually.
- **Self-hosting**: multi-arch (`amd64` + `arm64`) GHCR image +
  `docker-compose.prod.yml` behind a Cloudflare Tunnel (the hosted instance at
  keymano.ys.contact), plus a dev `docker-compose.yml` for builds/checks/tests.
- **Hosted hardening**: strict same-origin nginx CSP + Permissions-Policy;
  assets re-emit `X-Content-Type-Options: nosniff`; request bodies capped at
  1 MB; container logs capped and `/tmp` on a size-limited tmpfs so nothing fills
  the host disk (the SPA has no upload endpoint — files never reach the server).
- **Optional web analytics, off by default**: set `GA_MEASUREMENT_ID` to inject
  Google Analytics; the entrypoint renders the page + CSP from pristine
  templates each start (toggle by env + restart, no rebuild), validates the id
  to block injection, and widens the CSP to exactly Google's origins. The
  desktop app has no analytics path.

### SEO / social / discovery
- Open Graph + Twitter cards + OG image, schema.org JSON-LD
  (`SoftwareApplication` + `WebSite` + `Person` + `FAQPage`, build-stamped
  `softwareVersion` / `dateModified` / `sitemap.xml`), favicon set + PWA
  manifest, `robots.txt`, `llms.txt`, and `.well-known/security.txt`.
- Crawlable landing content in `<noscript>` for non-JS crawlers; `#root` stays
  empty so users only see the app's loading splash.
- Localized landing READMEs for 23 languages in `docs/i18n/` with a header +
  footer language switcher, so search engines index the project per-language.

### Privacy & governance
- `PRIVACY.md`, `SUPPORT.md`, `THIRD_PARTY_NOTICES.md` (generated from
  `cargo metadata` + `pnpm list --prod`; no GPL/AGPL in shipped artifacts), a
  plain-English `docs/GETTING_STARTED.md` for non-developers, plus
  `CODE_OF_CONDUCT.md`, `SECURITY.md`, and `CONTRIBUTING.md`.

### Icons
- Light (cream) app-icon theme across favicon, PWA, and the desktop/dock icon,
  with dark + light masters in `src-tauri/icon-source*.svg` and a
  `scripts/generate-icons.sh` `VARIANT` switch to regenerate the whole set.

### Dependencies & toolchain
- Frontend on the latest majors: React 19, Vite 8, Vitest 4, TypeScript 6,
  ESLint 10, i18next 26. Rust on quick-xml 0.39, thiserror 2, notify 8. CI
  actions: `actions/checkout` v6, `actions/github-script` v9,
  `pnpm/action-setup` v6, `docker/login-action` v4, `docker/build-push-action`
  v7. Dependabot PR #8 (`quick-xml` 0.40) is intentionally not merged:
  `plist` 1.9.x (used by core and Tauri) pins `quick-xml ^0.39`; bumping to
  0.40 forces `plist` down to 1.8 and duplicates `quick-xml` in the lockfile.

### Tooling, CI & releases
- Rust + frontend test suites; ESLint / clippy clean; hostile-XML regression
  tests (billion-laughs, XXE, deep nesting).
- CI matrix (macOS / Windows / Linux) compile-checks the desktop app; Docker
  images for the web app and tests; CodeQL scanning; Dependabot.
- `:latest` on `main` and the versioned web image publish only after core +
  frontend + the 3-OS Tauri compile all pass; prerelease tags don't move
  `:latest`.
- **Automated multi-arch releases**: pushing a `v*` tag builds and publishes a
  GitHub Release with macOS (universal `.dmg`), Windows (`.msi`/`.exe`), and
  Linux (`.deb`/`.AppImage`) bundles for **both x86_64 and arm64**, plus the
  multi-arch (`amd64` + `arm64`) web image to GHCR — so the app and the hosted
  build run on any common architecture. The compile-check matrix also runs on
  arm64 runners so an arch-specific break is caught before a release.
- Repo hygiene: `.editorconfig`, `.gitattributes`, `.nvmrc`, `engines`, a
  `NOTICE` file, and ESM-correct `vite.config.ts`.

[0.2.0]: https://github.com/ysalitrynskyi/keymano/releases/tag/v0.2.0
[0.1.0]: https://github.com/ysalitrynskyi/keymano/releases/tag/v0.1.0
