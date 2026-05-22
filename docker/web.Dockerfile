# Frontend image: runs the Vite web-mock dev server + vitest.
# The whole UI runs with no Rust backend (ipc web-mock, docs/13).
FROM node:20-bookworm-slim

WORKDIR /app

# pnpm 10 (matches CI + pnpm-lock.yaml lockfileVersion 9.0).
RUN npm install -g pnpm@10

# Install deps first for layer caching.
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 1420
CMD ["pnpm", "dev", "--host", "0.0.0.0"]
