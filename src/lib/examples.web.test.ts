// The bundled examples must also import through the *web* path (DOMParser →
// MockBackend), since "File → Open…" in the browser build round-trips a
// .keylayout exactly this way. Reads the real files from examples/.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { MockBackend } from "./mock-core";

const examplesDir = join(dirname(fileURLToPath(import.meta.url)), "../../examples");
const files = readdirSync(examplesDir).filter((f) => f.endsWith(".keylayout"));

describe("web import of bundled examples", () => {
  it("ships several example layouts", () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  for (const file of files) {
    it(`imports ${file} via the browser DOMParser path`, () => {
      const xml = readFileSync(join(examplesDir, file), "utf8");
      const m = new MockBackend();
      const doc = m.openKeylayout(xml, "Fallback");

      // Parsed into a real document with a name and at least one keyboard.
      expect(doc.name.length).toBeGreaterThan(0);
      expect(doc.keyboard_names.length).toBeGreaterThan(0);

      // The base snapshot has populated keys (the layout actually has content).
      const snap = m.getSnapshot(doc.id, 0, 0, 0, "none");
      const outputs = snap.keys.filter((k) => (k.output ?? "").length > 0);
      expect(outputs.length).toBeGreaterThan(20);
    });
  }

  // Regression: Apple-format `.keylayout` files declare XML 1.1 and encode
  // Backspace/Escape/F-key outputs as `&#x000N;` char refs (forbidden in
  // XML 1.0). Earlier the mock parser handed the raw file to DOMParser, which
  // bailed in Chromium/WebKit/Edge, breaking File→Open in the hosted build.
  // The importer must now normalise both — verify with a synthetic minimal
  // file and one of the real bundled examples that uses the same chars.
  it("imports XML-1.1 with C0 control char refs (Apple format)", () => {
    const xml =
      `<?xml version="1.1" encoding="UTF-8"?>\n` +
      `<!DOCTYPE keyboard PUBLIC "-//Apple//DTD Keyboard Layout//EN" "file://localhost/System/Library/DTDs/KeyboardLayout.dtd">\n` +
      `<keyboard group="0" id="-100" name="T" maxout="1">\n` +
      `  <layouts><layout first="0" last="17" modifiers="M" mapSet="ANSI"/></layouts>\n` +
      `  <modifierMap id="M" defaultIndex="0"><keyMapSelect mapIndex="0"><modifier keys=""/></keyMapSelect></modifierMap>\n` +
      `  <keyMapSet id="ANSI"><keyMap index="0">` +
      `<key code="51" output="&#x0008;"/>` + // Backspace = U+0008
      `<key code="53" output="&#x001B;"/>` + // Escape = U+001B
      `<key code="48" output="&#x0009;"/>` + // Tab (allowed in 1.0)
      `<key code="0" output="a"/></keyMap></keyMapSet>\n` +
      `</keyboard>`;
    const m = new MockBackend();
    const doc = m.openKeylayout(xml, "Fallback");
    const snap = m.getSnapshot(doc.id, 0, 0, 0, "none");
    const out = (code: number) => snap.keys.find((k) => k.code === code)?.output;
    expect(out(0)).toBe("a");
    expect(out(48)).toBe("\u0009");
    expect(out(51)).toBe("\u0008");
    expect(out(53)).toBe("\u001b");
  });
});
