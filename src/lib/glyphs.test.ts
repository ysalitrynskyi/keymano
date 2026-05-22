import { describe, expect, it } from "vitest";

import { SPECIAL_GLYPHS, codePointChip, isControl } from "./glyphs";

describe("glyphs", () => {
  it("maps known special keys to glyphs", () => {
    expect(SPECIAL_GLYPHS[36]).toBe("↩");
    expect(SPECIAL_GLYPHS[51]).toBe("⌫");
    expect(SPECIAL_GLYPHS[57]).toBe("⇪");
  });

  it("formats code point chips", () => {
    expect(codePointChip(0x1b)).toBe("U+001B");
    expect(codePointChip(0x1f600)).toBe("U+1F600");
  });

  it("detects control characters", () => {
    expect(isControl(String.fromCodePoint(0x09))).toBe(true); // tab
    expect(isControl(String.fromCodePoint(0x1b))).toBe(true); // esc
    expect(isControl(String.fromCodePoint(0x7f))).toBe(true); // del
    expect(isControl("a")).toBe(false);
    expect(isControl("")).toBe(false);
  });
});
