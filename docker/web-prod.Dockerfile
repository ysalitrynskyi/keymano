# syntax=docker/dockerfile:1
# Production web image: compiles the static frontend and serves it with nginx.
# The browser build runs the REAL keylayout-core compiled to WebAssembly (no JS
# stand-in), so a dedicated Rust stage builds the wasm artifact first and the
# Node stage consumes it. This is the image published to GHCR by CI.
#
# Both build stages are pinned to the *build host* arch ($BUILDPLATFORM): the
# wasm and the static bundle are arch-independent, so multi-arch images don't
# pay a QEMU penalty — only the small nginx runtime layer is per-target.

ARG BUILDPLATFORM

# ── Build the wasm core ──────────────────────────────────────────────────────
FROM --platform=$BUILDPLATFORM rust:1-bookworm AS wasm
RUN rustup target add wasm32-unknown-unknown \
 && cargo install wasm-pack --version 0.15.0 --locked
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
# Drop the Tauri shell member so no system WebView is needed to resolve the
# workspace (the wasm crate only depends on the pure core + session). Same strip
# as docker/core.Dockerfile; `cargo metadata` below fails loudly if it misfires.
RUN set -eux; \
    sed -i -E \
        -e 's/[[:space:]]*,[[:space:]]*"src-tauri"//g' \
        -e '/^[[:space:]]*"src-tauri"[[:space:]]*,?[[:space:]]*$/d' \
        -e 's/"src-tauri"[[:space:]]*,[[:space:]]*//g' \
        Cargo.toml; \
    cargo metadata --format-version 1 --no-deps >/dev/null
RUN wasm-pack build crates/keymano-wasm --target web --out-dir /pkg --out-name keymano_wasm

# ── Build the static frontend ────────────────────────────────────────────────
FROM --platform=$BUILDPLATFORM node:20-bookworm-slim AS build
WORKDIR /app
ENV CI=1
RUN npm install -g pnpm@10
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile
COPY . .
# Drop in the prebuilt wasm artifact (the `wasm:build` script needs Rust, which
# this Node stage doesn't have) and compile the bundle directly.
COPY --from=wasm /pkg ./src/wasm
RUN pnpm exec tsc -b && pnpm exec vite build

# ── Serve: static files behind nginx ─────────────────────────────────────────
FROM nginx:1.27-alpine AS serve

# Pristine templates rendered at startup by the entrypoint (so optional
# analytics can be toggled with just an env var + container restart). They live
# outside the served web root and are never edited in place.
RUN mkdir -p /etc/keymano
COPY docker/nginx.conf /etc/keymano/nginx.conf.tmpl
COPY docker/docker-entrypoint.sh /keymano-entrypoint.sh
RUN chmod +x /keymano-entrypoint.sh

COPY --from=build /app/dist /usr/share/nginx/html
RUN cp /usr/share/nginx/html/index.html /etc/keymano/index.html.tmpl

EXPOSE 80

# busybox wget ships in nginx:alpine; /healthz is served by nginx.conf.
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:80/healthz >/dev/null 2>&1 || exit 1

# The entrypoint renders the conf + index.html (toggling analytics off/on from
# GA_MEASUREMENT_ID) then exec's the CMD.
ENTRYPOINT ["/keymano-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
