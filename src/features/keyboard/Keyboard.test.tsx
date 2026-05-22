import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useEditor } from "@/store/editor";
import { Keyboard } from "./Keyboard";
import { geometryFor, geometryExtent } from "./geometry";

afterEach(cleanup);

describe("Keyboard component", () => {
  beforeEach(async () => {
    useEditor.setState({ docs: [], activeDocId: null, kbType: "ansi", modMask: 0, deadState: "none", zoom: 1, selectedCode: null });
    await useEditor.getState().newDocument("standard", "T");
  });

  it("renders an svg with key legends from the snapshot", () => {
    render(<Keyboard onEditKey={() => {}} />);
    const svg = screen.getByTestId("keyboard-svg");
    expect(svg).toBeInTheDocument();
    // ordinary key 'a' legend present
    expect(screen.getByText("a")).toBeInTheDocument();
    // special-key glyph present (return)
    expect(screen.getByText("↩")).toBeInTheDocument();
  });

  it("aria-labels each key as a button", () => {
    render(<Keyboard onEditKey={() => {}} />);
    expect(screen.getByLabelText(/key 0: a/)).toBeInTheDocument();
  });

  it("quick entry types into the selected key and advances", async () => {
    render(<Keyboard onEditKey={() => {}} />);
    useEditor.setState({ quickEntry: true });
    fireEvent.click(screen.getByLabelText(/key 0: a/)); // select 'a'
    const kb = screen.getByRole("application");
    fireEvent.keyDown(kb, { key: "ñ" });
    // output set on key 0, selection advanced off 0
    await new Promise((r) => setTimeout(r, 0));
    expect(useEditor.getState().snapshot!.keys[0].output).toBe("ñ");
    expect(useEditor.getState().selectedCode).not.toBe(0);
    useEditor.setState({ quickEntry: false });
  });

  it("arrow keys move the selection; Enter edits", () => {
    let edited: number | null = null;
    render(<Keyboard onEditKey={(c) => (edited = c)} />);
    fireEvent.click(screen.getByLabelText(/key 0: a/)); // select 'a' (act-wrapped)
    const kb = screen.getByRole("application");
    fireEvent.keyDown(kb, { key: "ArrowRight" });
    expect(useEditor.getState().selectedCode).toBe(1); // 's' to the right
    fireEvent.keyDown(kb, { key: "Enter" });
    expect(edited).toBe(1);
  });
});

describe("geometry presets", () => {
  it("all three load with positive extents", () => {
    for (const t of ["ansi", "iso", "jis"] as const) {
      const geo = geometryFor(t);
      const ext = geometryExtent(geo);
      expect(ext.w).toBeGreaterThan(10);
      expect(ext.h).toBeGreaterThan(4);
    }
  });

  it("iso has the L-enter shape", () => {
    const iso = geometryFor("iso");
    const enter = iso.rows.flatMap((r) => r.keys).find((k) => k.code === 36);
    expect(enter?.shape).toBe("l-enter");
    expect(enter?.rects).toHaveLength(2);
  });

  it("jis has the 英数 / かな keys", () => {
    const jis = geometryFor("jis");
    const codes = jis.rows.flatMap((r) => r.keys).map((k) => k.code);
    expect(codes).toContain(102);
    expect(codes).toContain(104);
  });
});
