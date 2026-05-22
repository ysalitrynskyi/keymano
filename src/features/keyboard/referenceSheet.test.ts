import { describe, expect, it } from "vitest";

import type { Geometry, KeyView } from "@/lib/types";
import { buildReferenceSheetSvg } from "./referenceSheet";

const geo: Geometry = {
  id: "t",
  name: "T",
  type: "ANSI",
  unit: 50,
  rows: [
    {
      y: 0,
      keys: [
        { code: 0, x: 0 },
        { code: 1, x: 1 },
        { code: 49, x: 2, w: 2, kind: "special", label: "space" },
      ],
    },
  ],
};

function view(code: number, display: string): KeyView {
  return { code, output: display, is_dead: false, action_id: null, display, code_points: [], inherited: false };
}

describe("buildReferenceSheetSvg", () => {
  it("renders one labeled section per modifier map with legends", () => {
    const svg = buildReferenceSheetSvg(geo, [
      { label: "No modifiers", keys: [view(0, "a"), view(1, "s")] },
      { label: "Shift", keys: [view(0, "A"), view(1, "S")] },
    ]);
    expect(svg).toContain("<svg");
    expect(svg).toContain("No modifiers");
    expect(svg).toContain("Shift");
    expect(svg).toContain(">a<");
    expect(svg).toContain(">A<");
    // special-key label still drawn from geometry
    expect(svg).toContain("space");
  });

  it("escapes XML-significant legend characters", () => {
    const svg = buildReferenceSheetSvg(geo, [{ label: "x", keys: [view(0, "<"), view(1, "&")] }]);
    expect(svg).toContain("&lt;");
    expect(svg).toContain("&amp;");
    expect(svg).not.toMatch(/>[<&]</);
  });

  it("height grows with section count", () => {
    const one = buildReferenceSheetSvg(geo, [{ label: "a", keys: [] }]);
    const three = buildReferenceSheetSvg(geo, [
      { label: "a", keys: [] },
      { label: "b", keys: [] },
      { label: "c", keys: [] },
    ]);
    const h = (s: string) => Number(/height="(\d+)"/.exec(s)![1]);
    expect(h(three)).toBeGreaterThan(h(one));
  });
});
