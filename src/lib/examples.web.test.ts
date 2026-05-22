// The bundled examples must import through the *web* path too, since
// "File → Open…" in the browser build round-trips a .keylayout this way. The
// web path now runs the real Rust core (keylayout-core via wasm), so this also
// confirms the actual parser handles the shipped files. Reads them from examples/.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { WasmBackend } from "./wasm-core";
import { ensureWasm } from "@/test/wasm";

const examplesDir = join(dirname(fileURLToPath(import.meta.url)), "../../examples");
const files = readdirSync(examplesDir).filter((f) => f.endsWith(".keylayout"));

beforeAll(() => ensureWasm());

describe("web import of bundled examples", () => {
  it("ships several example layouts", () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  for (const file of files) {
    it(`imports ${file} through the wasm core`, async () => {
      const xml = readFileSync(join(examplesDir, file), "utf8");
      const m = new WasmBackend();
      const doc = await m.openKeylayout(xml);

      expect(doc.name.length).toBeGreaterThan(0);
      expect(doc.keyboard_names.length).toBeGreaterThan(0);

      const snap = await m.getSnapshot(doc.id, 0, 0, 0, "none");
      const outputs = snap.keys.filter((k) => (k.output ?? "").length > 0);
      expect(outputs.length).toBeGreaterThan(20);
    });
  }

  // Apple-format `.keylayout` files declare XML 1.1 and encode
  // Backspace/Escape/F-key outputs as `&#x000N;` char refs (forbidden in
  // XML 1.0). The real core parses both directly — no DOMParser workaround.
  it("imports XML-1.1 with C0 control char refs (Apple format)", async () => {
    const xml =
      `<?xml version="1.1" encoding="UTF-8"?>\n` +
      `<!DOCTYPE keyboard PUBLIC "-//Apple//DTD Keyboard Layout//EN" "file://localhost/System/Library/DTDs/KeyboardLayout.dtd">\n` +
      `<keyboard group="0" id="-100" name="T" maxout="1">\n` +
      `  <layouts><layout first="0" last="17" modifiers="M" mapSet="ANSI"/></layouts>\n` +
      `  <modifierMap id="M" defaultIndex="0"><keyMapSelect mapIndex="0"><modifier keys=""/></keyMapSelect></modifierMap>\n` +
      `  <keyMapSet id="ANSI"><keyMap index="0">` +
      `<key code="51" output="&#x0008;"/>` + // Backspace = U+0008
      `<key code="53" output="&#x001B;"/>` + // Escape = U+001B
      `<key code="48" output="&#x0009;"/>` + // Tab
      `<key code="0" output="a"/></keyMap></keyMapSet>\n` +
      `</keyboard>`;
    const m = new WasmBackend();
    const doc = await m.openKeylayout(xml);
    const snap = await m.getSnapshot(doc.id, 0, 0, 0, "none");
    const out = (code: number) => snap.keys.find((k) => k.code === code)?.output;
    expect(out(0)).toBe("a");
    expect(out(48)).toBe("\u0009");
    expect(out(51)).toBe("\u0008");
    expect(out(53)).toBe("\u001b");
  });
});
