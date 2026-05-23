// The TS port of sanitize_stem must agree with the Rust source of truth
// (crates/keylayout-core/src/bundle.rs), or the Bundle page's "what's inside"
// preview disagrees with the real archive contents.
//
// Control / bidi characters are written as `\uXXXX` escapes, never as raw
// bytes — a literal NUL flips git into binary-blob mode, hides the diff in
// review tools, and breaks anything that reads the file as UTF-8 text.

import { describe, expect, it } from "vitest";

import { sanitizeStem } from "./sanitize-stem";

describe("sanitizeStem", () => {
  it("keeps plain ASCII unchanged", () => {
    expect(sanitizeStem("MyLayout")).toBe("MyLayout");
    expect(sanitizeStem("Layout 1")).toBe("Layout 1");
  });

  it("keeps Unicode letters (the original bug — strict regex collapsed Cyrillic to dashes)", () => {
    expect(sanitizeStem("Українська")).toBe("Українська");
    expect(sanitizeStem("日本語")).toBe("日本語");
    expect(sanitizeStem("Ελληνικά")).toBe("Ελληνικά");
  });

  it("replaces path separators and ':' with '-'", () => {
    expect(sanitizeStem("a/b")).toBe("a-b");
    expect(sanitizeStem("a\\b")).toBe("a-b");
    expect(sanitizeStem("a:b")).toBe("a-b");
  });

  it("strips bidi/format controls (Finder extension-spoofing defence)", () => {
    // U+202E RIGHT-TO-LEFT OVERRIDE is the classic spoof.
    expect(sanitizeStem("safe\u202Eexe.txt")).toBe("safe-exe.txt");
    // U+200E / U+200F / U+061C — single-char bidi marks.
    expect(sanitizeStem("a\u200Eb")).toBe("a-b");
    expect(sanitizeStem("a\u200Fb")).toBe("a-b");
    expect(sanitizeStem("a\u061Cb")).toBe("a-b");
    // U+2066–U+2069 isolate controls.
    expect(sanitizeStem("a\u2068b")).toBe("a-b");
  });

  it("strips C0 and C1 control chars", () => {
    expect(sanitizeStem("a\u0000b")).toBe("a-b"); // NUL
    expect(sanitizeStem("a\u0009b")).toBe("a-b"); // TAB
    expect(sanitizeStem("a\u007Fb")).toBe("a-b"); // DEL
    expect(sanitizeStem("a\u0085b")).toBe("a-b"); // NEL (C1)
    expect(sanitizeStem("a\u000Ab")).toBe("a-b"); // LF
  });

  it("trims surrounding whitespace, dots, and dashes", () => {
    expect(sanitizeStem("  Layout  ")).toBe("Layout");
    expect(sanitizeStem("...Layout...")).toBe("Layout");
    expect(sanitizeStem("---Layout---")).toBe("Layout");
    expect(sanitizeStem(".-.Layout.-.")).toBe("Layout");
  });

  it("falls back to 'Keyboard Layout' when nothing usable remains", () => {
    expect(sanitizeStem("")).toBe("Keyboard Layout");
    expect(sanitizeStem("   ")).toBe("Keyboard Layout");
    expect(sanitizeStem("///")).toBe("Keyboard Layout");
    expect(sanitizeStem("\u202E\u202E")).toBe("Keyboard Layout");
  });
});
