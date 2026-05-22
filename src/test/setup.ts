import "@testing-library/jest-dom/vitest";

import { ensureWasm } from "./wasm";

// The web backend is the real Rust core compiled to wasm; initialise it once so
// store/UI integration tests drive the same engine the browser build runs.
await ensureWasm();

// jsdom lacks matchMedia; stub for theme store.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// jsdom lacks clipboard
if (!navigator.clipboard) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: async () => {} },
    configurable: true,
  });
}
