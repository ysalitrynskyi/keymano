import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import type { PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import pkg from "./package.json" with { type: "json" };
import { stampHtml, buildSitemap } from "./src/lib/seoStamp";

// Stamp the build version + date into the static head/sitemap so the public
// SEO surface (JSON-LD softwareVersion, sitemap <lastmod>) never goes stale
// against a release. The sitemap is generated here rather than shipped from
// public/ so the date is always the build date (B4). The string-building logic
// lives in src/lib/seoStamp.ts so it's unit-testable without Rollup.
function seoStamp(): PluginOption {
  const version = pkg.version;
  const buildDate = new Date().toISOString().slice(0, 10);
  return {
    name: "keymano-seo-stamp",
    transformIndexHtml(html) {
      return stampHtml(html, version, buildDate);
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: buildSitemap(buildDate) });
    },
  };
}

// Tauri expects a fixed port and to not clear the screen.
export default defineConfig({
  // single source of truth for the app version → injected at build time
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), tailwindcss(), seoStamp()],
  resolve: {
    // ESM-correct project root (no CJS __dirname, B9).
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "0.0.0.0",
    watch: { ignored: ["**/src-tauri/**", "**/target/**"] },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/main.tsx"],
    },
  },
});
