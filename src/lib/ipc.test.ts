import { describe, expect, it, vi } from "vitest";

import { ipc } from "./ipc";

describe("ipc web-mock backend", () => {
  it("reports non-tauri runtime", async () => {
    expect(ipc.isTauri).toBe(false);
    expect(await ipc.ping()).toBe("pong");
  });

  it("returns no installed layouts in the browser (no system access)", async () => {
    // The web build can't read the OS; it must return nothing rather than fake
    // entries that look like real installed keyboards.
    expect(await ipc.listInstalledLayouts()).toEqual([]);
  });

  it("returns no input sources in the browser (no system access)", async () => {
    expect(await ipc.listInputSources()).toEqual([]);
  });

  it("opens a doc by path, renames + duplicates it", async () => {
    const opened = await ipc.openPath("/System/Russian-PC.keylayout");
    expect(opened.name).toBe("Russian-PC");

    const renamed = await ipc.renameDocument(opened.id, 0, "My Russian");
    expect(renamed.name).toBe("My Russian");

    const dup = await ipc.duplicateDocument(opened.id);
    expect(dup.id).not.toBe(opened.id);
    expect(dup.name).toBe("My Russian copy");

    const docs = await ipc.listDocuments();
    expect(docs.find((d) => d.id === dup.id)).toBeTruthy();
  });

  it("openContent extracts the name attr and falls back to 'Imported'", async () => {
    const named = await ipc.openContent(
      '<keyboard group="0" id="-5" name="My KB"><keyMapSet id="ANSI"><keyMap index="0"><key code="0" output="a"/></keyMap></keyMapSet></keyboard>',
    );
    expect(named.name).toBe("My KB");
    // unparseable input → fallback name, still yields a usable Standard doc
    const fallback = await ipc.openContent("not a keylayout at all");
    expect(fallback.name).toBe("Imported");
  });

  it("saveFileDialog downloads a real .keylayout in the browser", async () => {
    const doc = await ipc.newDocument("standard", "DL");
    const createObjectURL = vi.fn(() => "blob:fake");
    const revokeObjectURL = vi.fn();
    // jsdom lacks the blob URL API — stub it for the download path.
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL;
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const ok = await ipc.saveFileDialog(doc.id, 0, "DL");
    expect(ok).toBe(true);
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    click.mockRestore();
  });
});
