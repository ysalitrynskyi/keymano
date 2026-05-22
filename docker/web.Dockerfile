# Frontend image: Vite dev server + vitest. The browser build runs the real
# keylayout-core compiled to wasm, so this image carries the Rust + wasm-pack
# toolchain too — `pnpm dev`/`test`/`check` all run `pnpm wasm:build` first.
# (The published web image uses docker/web-prod.Dockerfile, which builds the
# wasm in a separate Rust stage; this dev/test image keeps one stage for the
# compose commands documented in the README.)
FROM rust:1-bookworm

WORKDIR /app

# Node 20 + pnpm 10 (matches CI + pnpm-lock.yaml lockfileVersion 9.0).
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@10

# wasm toolchain for `pnpm wasm:build`.
RUN rustup target add wasm32-unknown-unknown \
 && cargo install wasm-pack --version 0.15.0 --locked

# Install deps first for layer caching.
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 1420
CMD ["pnpm", "dev", "--host", "0.0.0.0"]
