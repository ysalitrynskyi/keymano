// Test helper: initialise the wasm core from the compiled `.wasm` bytes.
//
// The browser path fetches the asset via `import.meta.url`, which Node/jsdom
// can't do — so tests read the file and hand the bytes to wasm-bindgen's init.
// Requires `pnpm wasm:build` to have produced src/wasm (the `test` script does).

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { __initWasmForTest } from "@/lib/wasm-core";

let inited: Promise<void> | null = null;

/** Initialise the wasm core once per test module. Safe to call repeatedly.
 *  Tests run from the repo root, so resolve the artifact from cwd (vitest
 *  doesn't give this module a `file:` `import.meta.url`). */
export function ensureWasm(): Promise<void> {
  if (!inited) {
    const wasmPath = join(process.cwd(), "src/wasm/keymano_wasm_bg.wasm");
    inited = __initWasmForTest(async () => readFileSync(wasmPath));
  }
  return inited;
}
