import { describe, expect, it } from "vitest";

import { MockBackend } from "./mock-core";
import { Mod } from "./types";

function setup() {
  const m = new MockBackend();
  const doc = m.newDocument("standard", "T");
  return { m, id: doc.id };
}

const RU_XML = `<?xml version="1.0" encoding="UTF-8"?>
<keyboard group="126" id="-1251" name="Russian — PC" maxout="1">
  <modifierMap id="m" defaultIndex="1">
    <keyMapSelect mapIndex="0"><modifier keys="anyShift caps?"/></keyMapSelect>
    <keyMapSelect mapIndex="1"><modifier keys=""/></keyMapSelect>
  </modifierMap>
  <keyMapSet id="s">
    <keyMap index="0"><key code="0" output="Ф"/></keyMap>
    <keyMap index="1"><key code="0" output="ф"/></keyMap>
  </keyMapSet>
</keyboard>`;

describe("MockBackend web import", () => {
  it("opens a real .keylayout and honors defaultIndex/modifierMap", () => {
    const m = new MockBackend();
    const doc = m.openKeylayout(RU_XML, "fallback");
    expect(doc.name).toBe("Russian — PC");
    // base (no modifiers) → empty-spec select = mapIndex 1 = Cyrillic ф
    expect(m.getSnapshot(doc.id, 0, 0, 0, "none").keys.find((k) => k.code === 0)!.output).toBe("ф");
    // shift → mapIndex 0 = Ф
    expect(m.getSnapshot(doc.id, 0, 0, Mod.ShiftL, "none").keys.find((k) => k.code === 0)!.output).toBe("Ф");
  });

  it("falls back to a template when the XML can't be parsed", () => {
    const m = new MockBackend();
    const doc = m.openKeylayout("not xml", "Fallback Name");
    expect(doc.name).toBe("Fallback Name");
  });

  it("round-trips imported keyMapSet/modifierMap ids + defaultIndex on Save (N1)", () => {
    const m = new MockBackend();
    const doc = m.openKeylayout(RU_XML, "fallback");
    const xml = m.getXml(doc.id, 0, false);
    // must preserve the imported container ids, not rewrite to the ANSI default
    expect(xml).toContain('<keyMapSet id="s">');
    expect(xml).toContain('<modifierMap id="m" defaultIndex="1">');
    expect(xml).toContain('mapSet="s"');
    expect(xml).toContain('modifiers="m"');
    expect(xml).not.toContain('id="ANSI"');
    expect(xml).not.toContain('id="Modifiers"');
    // the imported modifier specs survive (empty-spec select for mapIndex 1)
    expect(xml).toContain('<keyMapSelect mapIndex="1">');
  });

  it("counts maxout in UTF-16 code units, not scalars (N3)", () => {
    const m = new MockBackend();
    const doc = m.newDocument("standard", "Emoji");
    m.setKeyOutput(doc.id, 0, 0, 0, "none", 0, "😀"); // 1 scalar, 2 UTF-16 units
    expect(m.getXml(doc.id, 0, false)).toContain('maxout="2"');
  });

  it("skips malformed keyMap/key with missing index/code (N2)", () => {
    const m = new MockBackend();
    // a keyMap with no index and a key with no code must be dropped, not folded
    // into code/index 0 (Number(null) === 0 would corrupt the layout)
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<keyboard group="0" id="-9" name="Bad" maxout="1">
  <keyMapSet id="s">
    <keyMap index="0"><key code="0" output="a"/><key output="x"/></keyMap>
    <keyMap><key code="1" output="y"/></keyMap>
  </keyMapSet>
</keyboard>`;
    const doc = m.openKeylayout(xml, "fallback");
    const snap = m.getSnapshot(doc.id, 0, 0, 0, "none");
    expect(snap.keys.find((k) => k.code === 0)!.output).toBe("a");
    // the code-less <key output="x"/> must NOT have landed on code 0
    expect(snap.keys.find((k) => k.code === 0)!.output).not.toBe("x");
  });
});

describe("MockBackend", () => {
  it("standard snapshot has US base + shift", () => {
    const { m, id } = setup();
    expect(m.getSnapshot(id, 0, 0, 0, "none").keys[0].output).toBe("a");
    const shift = m.getSnapshot(id, 0, 0, Mod.ShiftL, "none");
    expect(shift.modifier_index).toBe(1);
    expect(shift.keys[0].output).toBe("A");
    expect(shift.keys[18].output).toBe("!");
  });

  it("option layer falls back to base (inherited)", () => {
    const { m, id } = setup();
    const opt = m.getSnapshot(id, 0, 0, Mod.OptionL, "none");
    expect(opt.modifier_index).toBe(3);
    expect(opt.keys[0].inherited).toBe(true);
    expect(opt.keys[0].output).toBe("a");
  });

  it("control combo is uncovered", () => {
    const { m, id } = setup();
    expect(m.getSnapshot(id, 0, 0, Mod.ControlL, "none").mask_covered).toBe(false);
  });

  it("set + undo + redo round-trips", () => {
    const { m, id } = setup();
    m.setKeyOutput(id, 0, 0, 0, "none", 0, "ä");
    expect(m.getSnapshot(id, 0, 0, 0, "none").keys[0].output).toBe("ä");
    expect(m.undoLabel(id)).toBe("Change output");
    m.undo(id);
    expect(m.getSnapshot(id, 0, 0, 0, "none").keys[0].output).toBe("a");
    m.redo(id);
    expect(m.getSnapshot(id, 0, 0, 0, "none").keys[0].output).toBe("ä");
  });

  it("dirty tracks divergence from the saved/opened content", () => {
    const { m, id } = setup();
    const dirty = () => m.listDocuments().find((d) => d.id === id)!.dirty;
    expect(dirty()).toBe(false);
    m.setKeyOutput(id, 0, 0, 0, "none", 0, "ä");
    expect(dirty()).toBe(true);
    m.undo(id); // back to opened state → clean (not just "no history")
    expect(dirty()).toBe(false);
    m.redo(id);
    expect(dirty()).toBe(true);
  });

  it("make dead key adds state + marks dead", () => {
    const { m, id } = setup();
    const snap = m.makeKeyDead(id, 0, 0, 0, 2, "acute", "´");
    expect(snap.keys[2].is_dead).toBe(true);
    expect(snap.dead_states).toContain("acute");
    // in acute state the dead key outputs ´ (no further when) → nothing/empty
    const inAcute = m.getSnapshot(id, 0, 0, 0, "acute");
    expect(inAcute.dead_state).toBe("acute");
  });

  it("swap exchanges outputs", () => {
    const { m, id } = setup();
    m.swapKeys(id, 0, 0, 0, "none", 0, 1);
    const snap = m.getSnapshot(id, 0, 0, 0, "none");
    expect(snap.keys[0].output).toBe("s");
    expect(snap.keys[1].output).toBe("a");
  });

  it("unlink then relink restores base inheritance", () => {
    const { m, id } = setup();
    // option layer inherits 'a' from base; unlink makes it an absolute override
    m.unlinkKey(id, 0, 0, Mod.OptionL, "none", 0);
    expect(m.getSnapshot(id, 0, 0, Mod.OptionL, "none").keys[0].inherited).toBe(false);
    // relink drops the override so it inherits again
    m.relinkKey(id, 0, 0, Mod.OptionL, "none", 0);
    const snap = m.getSnapshot(id, 0, 0, Mod.OptionL, "none");
    expect(snap.keys[0].inherited).toBe(true);
    expect(snap.keys[0].output).toBe("a");
  });

  it("repair injects missing special keys", () => {
    const m = new MockBackend();
    const doc = m.newDocument("basic", "B");
    const fixed = m.repair(doc.id, 0);
    expect(fixed).toContain("MissingSpecialKeyOutput");
  });

  it("rename + duplicate produce independent docs", () => {
    const { m, id } = setup();
    expect(m.rename(id, 0, "Renamed").name).toBe("Renamed");
    const dup = m.duplicate(id);
    expect(dup.id).not.toBe(id);
    expect(dup.name).toBe("Renamed copy");
    m.setKeyOutput(dup.id, 0, 0, 0, "none", 0, "ç");
    expect(m.getSnapshot(dup.id, 0, 0, 0, "none").keys[0].output).toBe("ç");
    // original untouched
    expect(m.getSnapshot(id, 0, 0, 0, "none").keys[0].output).toBe("a");
  });

  it("survives hostile + extreme edits", () => {
    const { m, id } = setup();
    // empty output
    expect(() => m.setKeyOutput(id, 0, 0, 0, "none", 0, "")).not.toThrow();
    // huge astral string
    const huge = "ä🚀漢".repeat(3000);
    m.setKeyOutput(id, 0, 0, 0, "none", 1, huge);
    expect(m.getSnapshot(id, 0, 0, 0, "none").keys[1].output).toBe(huge);
    // clear a non-existent key, swap a key with itself
    expect(() => m.clearKey(id, 0, 0, 0, "none", 99)).not.toThrow();
    expect(() => m.swapKeys(id, 0, 0, 0, "none", 0, 0)).not.toThrow();
    // out-of-range mask + bogus dead state
    expect(m.getSnapshot(id, 0, 0, 0xffff, "ghost").keys.length).toBe(128);
    // xml still valid-ish with encoded huge content
    expect(m.getXml(id, 0, true)).toContain("<keyboard");
  });

  it("throws on unknown document, not silently corrupt", () => {
    const m = new MockBackend();
    expect(() => m.getSnapshot(999, 0, 0, 0, "none")).toThrow();
    expect(() => m.rename(999, 0, "x")).toThrow();
    expect(() => m.duplicate(999)).toThrow();
  });

  it("undo/redo past the ends is a no-op", () => {
    const { m, id } = setup();
    expect(() => {
      m.undo(id);
      m.undo(id);
      m.redo(id);
      m.redo(id);
    }).not.toThrow();
    expect(m.getSnapshot(id, 0, 0, 0, "none").keys[0].output).toBe("a");
  });

  it("actions view + terminator edit + housekeeping", () => {
    const { m, id } = setup();
    m.makeKeyDead(id, 0, 0, 0, 2, "acute", "´");
    const v = m.actionsView(id, 0);
    expect(v.actions.find((a) => a.id === "dead-acute")).toBeTruthy();
    expect(v.states).toContain("acute");
    expect(v.terminators.find((w) => w.state === "acute")?.output).toBe("´");

    m.setTerminator(id, 0, "acute", "´´");
    expect(m.actionsView(id, 0).terminators.find((w) => w.state === "acute")?.output).toBe("´´");

    // dead-acute action is referenced by key 2 → not removed
    expect(m.removeUnusedActions(id, 0)).toBe(0);
    // add special keys: basic doc would add; standard already has them
    const basic = new MockBackend();
    const b = basic.newDocument("basic", "B");
    expect(basic.addSpecialKeys(b.id, 0)).toBeGreaterThan(0);
  });

  it("getXml emits valid-looking keylayout", () => {
    const { m, id } = setup();
    const xml = m.getXml(id, 0, true);
    expect(xml).toContain("<keyboard");
    expect(xml).toContain('<keyMapSet id="ANSI">');
    expect(xml).toContain("&#x");
  });

  it("getXml encodes XML-reserved and control characters", () => {
    const { m, id } = setup();
    m.setKeyOutput(id, 0, 0, 0, "none", 0, "a<b&\t");
    const xml = m.getXml(id, 0, false);
    expect(xml).toContain("&#x003C;"); // <
    expect(xml).toContain("&#x0026;"); // &
    expect(xml).toContain("&#x0009;"); // tab
    // never a raw reserved char inside the output attribute
    expect(xml).not.toMatch(/output="a<b/);
  });

  it("make dead key registers the state and marks the key dead", () => {
    const { m, id } = setup();
    const snap = m.makeKeyDead(id, 0, 0, 0, 2, "acute", "´");
    const k2 = snap.keys.find((k) => k.code === 2)!;
    expect(k2.is_dead).toBe(true);
    expect(snap.dead_states).toContain("acute");
    // the dead-key action serializes into the XML
    expect(m.getXml(id, 0, false)).toContain("<actions>");
  });

  it("clearKey on an option-layer override falls back to base inheritance", () => {
    const { m, id } = setup();
    m.setKeyOutput(id, 0, 0, Mod.OptionL, "none", 0, "œ");
    expect(m.getSnapshot(id, 0, 0, Mod.OptionL, "none").keys[0].output).toBe("œ");
    m.clearKey(id, 0, 0, Mod.OptionL, "none", 0);
    const after = m.getSnapshot(id, 0, 0, Mod.OptionL, "none").keys[0];
    expect(after.output).toBe("a"); // inherited from base map
    expect(after.inherited).toBe(true);
  });
});
