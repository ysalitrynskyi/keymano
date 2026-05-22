# Third-Party Notices

Keymano (Apache-2.0) is built on top of permissively licensed open-source
software. This file lists every direct runtime dependency of the shipped
desktop binary and the hosted web build, with the upstream license and project
URL. It is provided to honour those projects and to satisfy the attribution
requirements of their licenses, as well as Apache-2.0 §4.4.

**Scope of this document**

- **Direct runtime dependencies** of the application — the ones whose code
  ends up in the published binaries / browser bundle.
- **Not** dev-only or build-only tooling (TypeScript, ESLint, Vitest, Cargo,
  Tauri CLI, Vite, etc.). Those are listed in `package.json`
  `devDependencies` / dev-dependencies in each `Cargo.toml`, and they are not
  shipped in any binary or asset.
- **Not** the Rust standard library or system frameworks (Apple `AppKit`,
  Windows `WebView2`, GTK / WebKit2GTK on Linux). These are governed by their
  platform's own licenses.

For a complete, machine-generated transitive list, run `cargo metadata` (Rust)
and `pnpm licenses list --prod` (npm) from a freshly installed workspace; the
counts and SPDX expressions are reproduced verbatim from those tools, last
audited on 2026-05-22.

---

## License compatibility summary

| Family | Count of transitive Rust crates | Notes |
| --- | --- | --- |
| MIT / Apache-2.0 (dual) | ≈ 340 | Permissive, fully compatible with Apache-2.0. |
| Apache-2.0 only | ~4 | Compatible. |
| MIT only | ~100 | Compatible. |
| Unicode-3.0 | ~18 (mostly `icu_*`) | Permissive. |
| BSD-3-Clause / BSD-2-Clause | ~10 | Compatible. |
| ISC | ~3 | Compatible. |
| Zlib | a few | Compatible. |
| MPL-2.0 (file-level weak copyleft) | 5 (`cssparser*`, `dtoa-short`, `option-ext`, `selectors`) | Used unmodified; we ship the upstream source links below for compliance. |
| Unlicense / CC0 / MIT-0 | a few | Public-domain-equivalent. |

No GPL, AGPL, or other strong-copyleft dependencies are pulled into the
shipped artifacts. The Rust ecosystem's dominant license is dual MIT/Apache-2.0;
the JavaScript ecosystem's is MIT.

---

## Frontend runtime dependencies (npm, production)

| Package | Version (lockfile) | License | Upstream |
| --- | --- | --- | --- |
| `react` | 18.3.1 | MIT | https://github.com/facebook/react |
| `react-dom` | 18.3.1 | MIT | https://github.com/facebook/react |
| `i18next` | 23.16.8 | MIT | https://github.com/i18next/i18next |
| `react-i18next` | 15.7.4 | MIT | https://github.com/i18next/react-i18next |
| `i18next-browser-languagedetector` | 8.2.1 | MIT | https://github.com/i18next/i18next-browser-languageDetector |
| `lucide-react` | 0.468.0 | ISC | https://github.com/lucide-icons/lucide |
| `sonner` | 1.7.4 | MIT | https://github.com/emilkowalski/sonner |
| `zustand` | 5.0.13 | MIT | https://github.com/pmndrs/zustand |
| `@tauri-apps/plugin-dialog` | 2.7.1 | MIT OR Apache-2.0 | https://github.com/tauri-apps/plugins-workspace |
| `@tauri-apps/plugin-fs` | 2.5.1 | MIT OR Apache-2.0 | https://github.com/tauri-apps/plugins-workspace |

The web build is bundled by Vite and Tailwind CSS; their compiler output is in
the shipped JS but no Vite/Tailwind runtime code is. CSS classes are emitted
by `@tailwindcss/vite` at build time (MIT).

## Desktop shell

| Crate | License | Upstream |
| --- | --- | --- |
| `tauri` 2 | MIT OR Apache-2.0 | https://github.com/tauri-apps/tauri |
| `tauri-plugin-dialog` 2 | MIT OR Apache-2.0 | https://github.com/tauri-apps/plugins-workspace |
| `notify` 6 | CC0-1.0 | https://github.com/notify-rs/notify |
| `serde` 1, `serde_json` 1 | MIT OR Apache-2.0 | https://github.com/serde-rs/serde |

Tauri pulls in a large transitive tree on each OS (WebKit2GTK bindings on
Linux, WebView2 on Windows, WKWebView on macOS, plus the Tao + Wry stack);
all of those are MIT, Apache-2.0, BSD, ISC, Zlib, MPL-2.0, or Unicode-3.0 as
classified in the table above. The full per-crate breakdown is reproducible
with:

```sh
cargo metadata --format-version=1 --manifest-path Cargo.toml \
  | jq -r '.packages[] | "\(.name)|\(.license // "UNKNOWN")|\(.repository // "")"' \
  | sort -u
```

## Pure Rust core

The `keylayout-core` and `keymano-session` crates are pure Rust, no Tauri,
and pull only the minimal parser/serialization stack:

| Crate | License | Upstream |
| --- | --- | --- |
| `quick-xml` 0.36 | MIT | https://github.com/tafia/quick-xml |
| `plist` 1.7 | MIT | https://github.com/ebarnard/rust-plist |
| `serde` 1 / `serde_json` 1 | MIT OR Apache-2.0 | https://github.com/serde-rs/serde |
| `thiserror` 1 | MIT OR Apache-2.0 | https://github.com/dtolnay/thiserror |
| `anyhow` 1 | MIT OR Apache-2.0 | https://github.com/dtolnay/anyhow |

These power XML / Plist parsing, modifier and dead-key resolution, validation,
templates, and bundles. No native code outside of Rust's own libstd is linked.

## MPL-2.0 dependencies (file-level weak copyleft)

The following five crates are licensed under the Mozilla Public License 2.0.
We use them unmodified, transitively via the Tauri webview stack. Source for
the unmodified upstream files is available at the URLs below:

- `cssparser` and `cssparser-macros` — https://github.com/servo/rust-cssparser
- `dtoa-short` — https://github.com/upsuper/dtoa-short
- `option-ext` — https://github.com/soc/option-ext
- `selectors` — https://github.com/servo/stylo

If you redistribute a Keymano binary and modify any of these MPL files, you
must publish your modified source for those specific files (file-level
copyleft) — see the MPL-2.0 text at https://www.mozilla.org/MPL/2.0/.

## Format compatibility

The `.keylayout` XML format is documented in Apple's public
`KeyboardLayout.dtd`. Keymano reads and writes files that follow that format.
Files produced by compatible layout editors (including
[Ukelele](https://software.sil.org/ukelele/)) generally open in Keymano.

"Apple", "macOS", and "Ukelele" are trademarks of their respective owners.
Keymano is an independent project and is not affiliated with or endorsed by
Apple or SIL International.

---

## How to regenerate this list

The dependency surface is small enough to maintain by hand. To audit before
each release, run:

```sh
# Frontend
pnpm install --frozen-lockfile
pnpm list --prod --depth 0

# Rust
cargo metadata --format-version=1 \
  | jq -r '.packages[] | "\(.name)|\(.license // "UNKNOWN")"' \
  | sort -u
```

and reconcile any differences against the tables above. CI's Dependabot job
keeps the lockfiles current; this file should be reviewed when a direct
dependency is added, removed, or relicensed.
