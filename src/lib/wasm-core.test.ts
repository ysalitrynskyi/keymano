// Integration tests for the wasm web backend: drive the REAL Rust core
// (keylayout-core via keymano-session) through WasmBackend, exactly as the
// browser build does. These exercise the wiring + JSON round-trip; the format
// logic itself is unit-tested in the Rust crates.

import { beforeAll, describe, expect, it } from "vitest";

import { Mod } from "./types";
import { WasmBackend } from "./wasm-core";
import { ensureWasm } from "@/test/wasm";

beforeAll(() => ensureWasm());

function backend() {
  return new WasmBackend();
}

describe("WasmBackend (real core)", () => {
  it("standard template: US base + shift layers resolve", async () => {
    const m = backend();
    const doc = await m.newDocument("standard", "T");
    const base = await m.getSnapshot(doc.id, 0, 0, 0, "none");
    expect(base.keys[0].output).toBe("a");
    const shift = await m.getSnapshot(doc.id, 0, 0, Mod.ShiftL, "none");
    expect(shift.modifier_index).toBe(1);
    expect(shift.keys[0].output).toBe("A");
    expect(shift.keys[18].output).toBe("!");
  });

  it("edit + undo + redo round-trips through the core", async () => {
    const m = backend();
    const doc = await m.newDocument("standard", "T");
    await m.setKeyOutput(doc.id, 0, 0, 0, "none", 0, "ä");
    expect((await m.getSnapshot(doc.id, 0, 0, 0, "none")).keys[0].output).toBe("ä");
    expect(await m.undoLabel(doc.id)).toBe("Change output");
    await m.undo(doc.id);
    expect((await m.getSnapshot(doc.id, 0, 0, 0, "none")).keys[0].output).toBe("a");
    await m.redo(doc.id);
    expect((await m.getSnapshot(doc.id, 0, 0, 0, "none")).keys[0].output).toBe("ä");
  });

  it("dirty tracks divergence from the saved/opened content", async () => {
    const m = backend();
    const doc = await m.newDocument("standard", "T");
    const dirty = async () => (await m.listDocuments()).find((d) => d.id === doc.id)!.dirty;
    expect(await dirty()).toBe(false);
    await m.setKeyOutput(doc.id, 0, 0, 0, "none", 0, "ä");
    expect(await dirty()).toBe(true);
    await m.undo(doc.id);
    expect(await dirty()).toBe(false);
  });

  it("base-map inheritance: JIS inherits from ANSI, ANSI option layer is independent", async () => {
    const m = backend();
    const doc = await m.newDocument("standard", "T");
    // Real core: JIS keymap set declares baseMapSet=ANSI, so type 18 inherits 'a'.
    const jis = await m.getSnapshot(doc.id, 0, 18, 0, "none");
    expect(jis.keys[0].inherited).toBe(true);
    expect(jis.keys[0].output).toBe("a");
    // ANSI's Option map (index 3) is absolute + empty — it does NOT inherit from
    // the base map (the old JS mock wrongly faked this). So it resolves to null.
    const opt = await m.getSnapshot(doc.id, 0, 0, Mod.OptionL, "none");
    expect(opt.keys[0].output).toBeNull();
    expect(opt.keys[0].inherited).toBe(false);
  });

  it("make dead key + actions view + housekeeping", async () => {
    const m = backend();
    const doc = await m.newDocument("standard", "T");
    const snap = await m.makeKeyDead(doc.id, 0, 0, 0, 2, "acute", "´");
    expect(snap.keys[2].is_dead).toBe(true);
    expect(snap.dead_states).toContain("acute");
    const v = await m.actionsView(doc.id, 0);
    expect(v.actions.find((a) => a.id === "dead-acute")).toBeTruthy();
    expect(v.terminators.find((w) => w.state === "acute")?.output).toBe("´");
    // referenced action stays
    expect(await m.removeUnusedActions(doc.id, 0)).toBe(0);
  });

  it("swap, unlink, relink", async () => {
    const m = backend();
    const doc = await m.newDocument("standard", "T");
    await m.swapKeys(doc.id, 0, 0, 0, "none", 0, 1);
    const s = await m.getSnapshot(doc.id, 0, 0, 0, "none");
    expect(s.keys[0].output).toBe("s");
    expect(s.keys[1].output).toBe("a");
    // JIS type 18 inherits from ANSI; unlink makes absolute, relink restores
    await m.unlinkKey(doc.id, 0, 18, 0, "none", 0);
    expect((await m.getSnapshot(doc.id, 0, 18, 0, "none")).keys[0].inherited).toBe(false);
    await m.relinkKey(doc.id, 0, 18, 0, "none", 0);
    expect((await m.getSnapshot(doc.id, 0, 18, 0, "none")).keys[0].inherited).toBe(true);
  });

  it("fresh templates validate clean (real core)", async () => {
    const m = backend();
    const std = await m.newDocument("standard", "S");
    expect((await m.validate(std.id, 0)).filter((i) => i.severity === "Error")).toEqual([]);
    const basic = await m.newDocument("basic", "B");
    // Basic ships special-key output + a relative JIS set, so it's clean too.
    expect(await m.validate(basic.id, 0)).toEqual([]);
  });

  it("repair fixes an invalid keyboard id on an opened file", async () => {
    const m = backend();
    const xml =
      `<keyboard group="0" id="0" name="Bad" maxout="1">` +
      `<layouts><layout first="0" last="17" modifiers="M" mapSet="ANSI"/></layouts>` +
      `<modifierMap id="M" defaultIndex="0"><keyMapSelect mapIndex="0"><modifier keys=""/></keyMapSelect></modifierMap>` +
      `<keyMapSet id="ANSI"><keyMap index="0"><key code="0" output="a"/></keyMap></keyMapSet>` +
      `</keyboard>`;
    const doc = await m.openKeylayout(xml);
    expect((await m.validate(doc.id, 0)).some((i) => i.code === "InvalidKeyboardID")).toBe(true);
    expect(await m.repair(doc.id, 0)).toContain("InvalidKeyboardID");
    expect((await m.validate(doc.id, 0)).some((i) => i.code === "InvalidKeyboardID")).toBe(false);
  });

  it("no-op housekeeping does not dirty the doc or record undo", async () => {
    const m = backend();
    const doc = await m.newDocument("standard", "T");
    const dirty = async () => (await m.listDocuments()).find((d) => d.id === doc.id)!.dirty;
    expect(await m.removeUnusedStates(doc.id, 0)).toBe(0);
    expect(await m.removeUnusedActions(doc.id, 0)).toBe(0);
    expect(await m.addSpecialKeys(doc.id, 0)).toBe(0);
    expect((await m.repair(doc.id, 0)).length).toBe(0);
    expect(await dirty()).toBe(false);
    expect(await m.undoLabel(doc.id)).toBeNull();
  });

  it("getXml emits a valid-looking keylayout and escapes reserved chars", async () => {
    const m = backend();
    const doc = await m.newDocument("standard", "T");
    await m.setKeyOutput(doc.id, 0, 0, 0, "none", 0, "a<b&\t");
    const xml = await m.getXml(doc.id, 0, false);
    expect(xml).toContain("<keyboard");
    expect(xml).toContain('<keyMapSet id="ANSI">');
    expect(xml).toContain("&#x003C;"); // <
    expect(xml).toContain("&#x0026;"); // &
    expect(xml).toContain("&#x0009;"); // tab
    expect(xml).not.toMatch(/output="a<b/);
  });

  it("getXml escapes action ids / state names", async () => {
    const m = backend();
    const doc = await m.newDocument("standard", "T");
    await m.makeKeyDead(doc.id, 0, 0, 0, 2, "a&b", "´");
    const xml = await m.getXml(doc.id, 0, false);
    expect(xml).toContain("dead-a&amp;b");
    expect(xml).not.toMatch(/id="dead-a&b"/);
  });

  it("rename + duplicate produce independent docs", async () => {
    const m = backend();
    const doc = await m.newDocument("standard", "Orig");
    expect((await m.rename(doc.id, 0, "Renamed")).name).toBe("Renamed");
    const dup = await m.duplicate(doc.id);
    expect(dup.id).not.toBe(doc.id);
    expect(dup.name).toBe("Renamed copy");
    await m.setKeyOutput(dup.id, 0, 0, 0, "none", 0, "ç");
    expect((await m.getSnapshot(dup.id, 0, 0, 0, "none")).keys[0].output).toBe("ç");
    expect((await m.getSnapshot(doc.id, 0, 0, 0, "none")).keys[0].output).toBe("a");
  });

  it("throws on unknown document instead of corrupting", async () => {
    const m = backend();
    await expect(m.getSnapshot(999999, 0, 0, 0, "none")).rejects.toBeTruthy();
  });

  it("editing a key while previewing a dead state is rejected", async () => {
    const m = backend();
    const doc = await m.newDocument("standard", "T");
    await m.makeKeyDead(doc.id, 0, 0, 0, 2, "acute", "´");
    await expect(m.setKeyOutput(doc.id, 0, 0, 0, "acute", 5, "x")).rejects.toBeTruthy();
  });

  it("exportBundleZip + bundleZipFilename produce a real zip (v0.2.2 browser path)", async () => {
    // The v0.2.1 web build silently downloaded a `.keylayout` when the user
    // asked to export a `.bundle`. v0.2.2 ships these two methods to do it
    // right — guard the wiring end-to-end through the real wasm so a TS-side
    // refactor can't quietly break the download.
    const m = backend();
    const doc = await m.newDocument("standard", "MyLayout");
    const bytes = await m.exportBundleZip(doc.id);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
    // Every zip starts with PK\x03\x04 (local file header signature).
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);

    const filename = await m.bundleZipFilename(doc.id);
    expect(filename).toMatch(/\.bundle\.zip$/);
    expect(filename).toContain("MyLayout");
  });
});
