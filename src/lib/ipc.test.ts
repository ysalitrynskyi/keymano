import { beforeEach, describe, expect, it, vi } from "vitest";

import { stubBrowserDownload } from "@/test/download";
import { resetWasmSession } from "@/test/wasm";
import { ipc } from "./ipc";

describe("ipc web backend", () => {
  beforeEach(async () => {
    await resetWasmSession();
  });

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

  it("rejects openPath in the browser instead of inventing a fake document", async () => {
    await expect(ipc.openPath("/System/Russian-PC.keylayout")).rejects.toThrow(
      /cannot reopen filesystem paths/i,
    );
  });

  it("openContent parses the real layout name; rejects unparseable input", async () => {
    const named = await ipc.openContent(
      '<keyboard group="0" id="-5" name="My KB"><layouts><layout first="0" last="17" modifiers="M" mapSet="ANSI"/></layouts><modifierMap id="M" defaultIndex="0"><keyMapSelect mapIndex="0"><modifier keys=""/></keyMapSelect></modifierMap><keyMapSet id="ANSI"><keyMap index="0"><key code="0" output="a"/></keyMap></keyMapSet></keyboard>',
    );
    expect(named.name).toBe("My KB");
    // The real core rejects junk rather than silently inventing a doc — the
    // store wraps this in guard() and surfaces an error toast.
    await expect(ipc.openContent("not a keylayout at all")).rejects.toBeTruthy();
  });

  it("saveFileDialog downloads a real .keylayout in the browser", async () => {
    const doc = await ipc.newDocument("standard", "DL");
    const download = stubBrowserDownload();
    const ok = await ipc.saveFileDialog(doc.id, 0, "DL");
    expect(ok).toBe(true);
    expect(download.createObjectURL).toHaveBeenCalledOnce();
    expect(download.click).toHaveBeenCalledOnce();
    expect(download.revokeObjectURL).toHaveBeenCalledOnce();
    download.restore();
  });

  it("exportBundleDialog downloads a .bundle.zip in the browser (v0.2.2)", async () => {
    // v0.2.1 silently downloaded a .keylayout here (wrong artifact). Guard the
    // fix: a real Blob download with the .bundle.zip filename ends up on the
    // anchor element + the URL is revoked after click.
    const doc = await ipc.newDocument("standard", "MyLayout");
    const download = stubBrowserDownload();
    let downloadAttr = "";
    download.click.mockImplementation(function (this: HTMLAnchorElement) {
      downloadAttr = this.download;
    });
    const ok = await ipc.exportBundleDialog(doc.id, 0, "MyLayout");
    expect(ok).toBe(true);
    expect(download.createObjectURL).toHaveBeenCalledOnce();
    expect(download.click).toHaveBeenCalledOnce();
    expect(download.revokeObjectURL).toHaveBeenCalledOnce();
    expect(downloadAttr).toMatch(/\.bundle\.zip$/);
    expect(downloadAttr).toContain("MyLayout");
    download.restore();
  });

  it("installLayout (web) routes a standalone doc to the .keylayout path", async () => {
    const doc = await ipc.newDocument("standard", "Standalone");
    const saveSpy = vi.spyOn(ipc, "saveFileDialog").mockResolvedValue(true);
    const exportSpy = vi.spyOn(ipc, "exportBundleDialog").mockResolvedValue(true);
    const result = await ipc.installLayout(doc.id, 0);
    expect(result).toEqual({ kind: "downloaded" });
    expect(saveSpy).toHaveBeenCalledOnce();
    expect(exportSpy).not.toHaveBeenCalled();
    saveSpy.mockRestore();
    exportSpy.mockRestore();
  });

  it("installLayout (web) routes a bundle doc to the .bundle.zip path (v0.2.2)", async () => {
    // The web wasm doesn't yet expose a "load bundle" entry point, so stub
    // listDocuments to flip is_bundle for this doc — isolates the routing
    // decision in installLayout from how the doc was created.
    const doc = await ipc.newDocument("standard", "Bundled");
    const saveSpy = vi.spyOn(ipc, "saveFileDialog").mockResolvedValue(true);
    const exportSpy = vi.spyOn(ipc, "exportBundleDialog").mockResolvedValue(true);
    vi.spyOn(ipc, "listDocuments").mockResolvedValue([
      {
        id: doc.id,
        name: "Bundled",
        path: null,
        is_bundle: true,
        keyboard_names: ["Bundled"],
        dirty: false,
      },
    ]);
    const result = await ipc.installLayout(doc.id, 0);
    expect(result).toEqual({ kind: "downloaded" });
    expect(exportSpy).toHaveBeenCalledOnce();
    expect(saveSpy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
