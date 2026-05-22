# syntax=docker/dockerfile:1
# Production web image: compiles the static frontend (ipc web-mock, no Rust) and
# serves it with nginx. This is the "deploy the app to the web" target and the
# image published to GHCR by CI — the full UI runs in any browser against the
# in-browser mock backend, so it hosts anywhere that serves static files.
#
# The build stage is pinned to the *build host* arch ($BUILDPLATFORM): the
# output is plain static files (arch-independent), so multi-arch images don't
# pay a QEMU/npm penalty — only the small nginx runtime layer is per-target.

ARG BUILDPLATFORM
FROM --platform=$BUILDPLATFORM node:20-bookworm-slim AS build

WORKDIR /app
ENV CI=1

# pnpm 10 (matches CI + pnpm-lock.yaml lockfileVersion 9.0). npm resolves the
# latest 10.x, so no corepack `packageManager` pin is required.
RUN npm install -g pnpm@10

# Install deps first for layer caching.
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# Build the web bundle: `tsc -b && vite build` → /app/dist.
COPY . .
RUN pnpm build

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
