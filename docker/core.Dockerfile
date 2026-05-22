# Core image: builds + tests the Tauri-free Rust crates (keylayout-core,
# keymano-session). The Tauri shell needs system WebView and is built natively
# / in CI, not here — these crates are pure and need no GUI deps.
FROM rust:1-bookworm

WORKDIR /app
COPY Cargo.toml ./
COPY crates ./crates

# Strip the Tauri shell member so no WebKit is needed inside the container.
# Handles both `members = [..., "src-tauri"]` (single-line, any position) and
# the `cargo fmt`-style multi-line list with each entry on its own line.
# Verified with `tomlq .` on every common shape (src-tauri first/middle/last,
# trailing-comma or not, inline or split). Anything else will trip `cargo
# metadata` below, which fails the build loudly rather than silently.
RUN set -eux; \
    sed -i -E \
        -e 's/[[:space:]]*,[[:space:]]*"src-tauri"//g' \
        -e '/^[[:space:]]*"src-tauri"[[:space:]]*,?[[:space:]]*$/d' \
        -e 's/"src-tauri"[[:space:]]*,[[:space:]]*//g' \
        Cargo.toml; \
    cargo metadata --format-version 1 --no-deps >/dev/null

CMD ["cargo", "test", "-p", "keylayout-core", "-p", "keymano-session"]
