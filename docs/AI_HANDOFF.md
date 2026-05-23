# AI / maintainer handoff (internal)

Read this first when picking up **Keymano** cold. It records project conventions, current release state, and the practical rules to follow before changing anything.

For day-to-day commands see [DEVELOP.md](DEVELOP.md). For end users see [GETTING_STARTED.md](GETTING_STARTED.md).

---

## What Keymano is

- **Product:** Cross-platform editor for macOS `.keylayout` XML and `.bundle` keyboard packages, with a live clickable keyboard (ANSI / ISO / JIS).
- **Public positioning:** Open-source **Ukelele alternative** for Apple's `.keylayout` / `.bundle` formats. Keep this phrasing in user-facing discovery copy and trademark contexts.
- **Stack:** Rust core (`keylayout-core`) + session (`keymano-session`) + Tauri shell + React/Vite UI. The browser build runs the same core compiled to WebAssembly (`keymano-wasm`) — one format implementation everywhere, no JS reimplementation.
- **Live:** https://keymano.ys.contact (Docker + Cloudflare Tunnel). **Repo:** https://github.com/ysalitrynskyi/keymano

---

## Release / git state (as of v0.2.3)

| Item | Value |
|------|--------|
| Version | `0.2.3` (`package.json`, workspace `Cargo.toml`) |
| `main` HEAD | latest `v*` release commit; doc / maintenance commits may follow on top |
| Latest release commit | `fix: align browser bundle docs with real import support (v0.2.3)` |
| Tag → release | Push an annotated `vX.Y.Z` tag on a `main` commit; CI builds desktop bundles + multi-arch web image and creates the GitHub Release |
| Container image | `ghcr.io/ysalitrynskyi/keymano:<version>` (also `:<major>.<minor>`, `:latest` per CI rules; prerelease tags don't move `:latest`) |
| CI on push/tag | `ci.yml` + `codeql.yml`; matrix macOS / Windows / Linux |

Do not rewrite `main` history without maintainer approval.

---

## Repository conventions

### Internal docs

Keep `docs/` lean and end-user / contributor focused. Long-form format notes should cite Apple's public `KeyboardLayout.dtd`, Keymano code, and Keymano tests. Keep temporary session notes outside the repository.

Current canonical documents:

- `docs/GETTING_STARTED.md` — plain-English users (includes **macOS unsigned / quarantine** steps)
- `docs/RELEASE_NOTES_MACOS.md` — copy-paste block for GitHub Release bodies
- `docs/DEVELOP.md` — build, test, i18n
- `docs/AI_HANDOFF.md` — this file
- `docs/i18n/README.*.md` — localized landing summaries
- `docs/screenshots/` — README visuals

### Code comments and naming

- Comments describe **Keymano's** code, the Apple-documented `.keylayout` DTD, and Apple conventions.
- Identifiers, filenames, test fixtures, and snapshot files use neutral, descriptive names that come from the input they represent (e.g. layout / script / OS).
- Where Apple's DTD requires specific structure (dummy sentinel keys, `state="none"` ordering, etc.), comment it as "per Apple DTD" or "Apple convention".

### Public copy (README, landing page, store listings)

"Ukelele alternative" and standard trademark disclaimers belong in `README.md`, `index.html`, `package.json` keywords, `docs/i18n/README.*.md`, and `public/llms.txt`. Keep product-comparison wording in public discovery surfaces; implementation docs should describe Keymano internals and Apple's file format.

### Legal / notices

`NOTICE`, `THIRD_PARTY_NOTICES.md`, and `PRIVACY.md` carry the trademark and Apple DTD disclaimers. Keep third-party product mentions limited to trademark and format-compatibility context.

### Repo hygiene

- `.gitignore` covers `node_modules/`, `.pnpm-store/`, `.vite/`, `target/`, `.env*`, IDE folders (`.idea/`, `.cursor/`, `.claude/`).
- Verify the staged set against `.gitignore` before large commits or release prep.

---

## Architecture (where to change what)

| Area | Path | Notes |
|------|------|--------|
| Format truth | `crates/keylayout-core/` | Parse, serialize, modifiers, dead keys, validate/repair, bundle |
| Document + undo | `crates/keymano-session/` | No Tauri |
| Desktop IPC | `src-tauri/src/commands.rs` | Thin layer over the session |
| Browser core | `crates/keymano-wasm/` | wasm-bindgen wrapper over the session; built to `src/wasm/` by `pnpm wasm:build` |
| UI | `src/` | Pages, keyboard, stores, `lib/ipc.ts` (tauri IPC vs `lib/wasm-core.ts`) |
| Geometry | `src/assets/keyboards/` | JSON presets, not KCAP binaries |
| Locales | `src/locales/` | `en` + 23 langs; `locales.test.ts` enforces key parity |
| E2E / UI dev | `pnpm dev` → `http://localhost:1420` | Real core via WebAssembly |

**Rule:** There is ONE format implementation — `keylayout-core`. The desktop app
calls it over Tauri IPC; the browser runs it compiled to wasm. Format changes
belong in the Rust core + golden/round-trip tests; never reintroduce a separate
JS reimplementation. `src/wasm/` is a generated artifact (gitignored) — never
edit it by hand or commit it.

---

## Verification checklist (run before claiming "done")

```bash
pnpm install
rustup target add wasm32-unknown-unknown && cargo install wasm-pack  # once
pnpm lint && pnpm wasm:build && pnpm exec tsc -b && pnpm test   # wasm:build generates src/wasm types needed by tsc
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
pnpm build
```

Expect ~136 Rust tests (workspace) and ~150 vitest tests (the web suite drives
the real core through wasm — incl. bundle-zip export — plus a deploy-CSP guard
that renders the real nginx entrypoint to a temp dir, plus a sanitize-stem
TS↔Rust parity test, plus ipc-routing tests for the v0.2.2 install paths). CI
also runs coverage gates (core ≥90%, frontend ≥80%).

---

## Deployment notes (prod)

- **Compose:** `docker-compose.prod.yml` — nginx serves on port **80** inside the `keymano` service.
- **Cloudflare Tunnel:** Public hostname must target `http://keymano:80` (not `http://localhost:8080`). Wrong target → **502**.
- **Analytics:** Optional `GA_MEASUREMENT_ID`; desktop app has no analytics path.
- **Privacy:** `PRIVACY.md` — layouts do not upload in web build; CSP documented in compose/README.

---

## Dependencies worth knowing

- **Do not merge** Dependabot `quick-xml` 0.40 without checking `plist`: project pins `quick-xml` 0.39; bump can regress `plist` and duplicate crates in lockfile (documented in `CHANGELOG.md` / `Cargo.toml` comment).
- Frontend: React 19, Vite 8, TS 6, Vitest 4, Tauri 2.

---

## Suggested review tasks for a new AI

1. **Smoke** hosted app + `/healthz`; open a sample `.keylayout`, edit, export XML.
2. **Run** the full gate commands above.
3. **If changing parse/serialize:** `cargo test -p keylayout-core`, update `insta` snapshots only deliberately.
4. **If changing strings:** all 24 locales + `docs/i18n` if README sections change (`scripts/patch-i18n-readmes.py`).
5. **If release prep:** bump `package.json` + `CHANGELOG.md`, tag `v*`, push tag — CI creates Release + GHCR (do not force-push `main` without maintainer OK).

---

## Guardrails

- Keep implementation docs focused on Keymano internals and Apple's public file format.
- Keep product-comparison wording out of code comments, fixture names, and snapshots.
- Do not commit `.env`, tunnel tokens, or `node_modules/`.
- Do not force-push `main` or amend a pushed release commit.
- Do not merge dependency bumps without running tests and reading lockfile impact.

---

## Optional tooling

- If `graphify-out/` exists: read `graphify-out/wiki/index.md` before large architecture greps; run `graphify update .` after substantive code edits pre-commit.
- Chat memory (decisions, user prefs): user-memory MCP, not this file.

---

## Maintainer contact / links

- Issues: GitHub `ysalitrynskyi/keymano`
- Security: `SECURITY.md` (no public issues for vulns)
- Support flow: `SUPPORT.md`
