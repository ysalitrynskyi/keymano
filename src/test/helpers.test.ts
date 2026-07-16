import { describe, expect, it } from "vitest";

import { ipc } from "@/lib/ipc";
import { stubBrowserDownload } from "./download";
import { resetWasmSession } from "./wasm";

describe("test helpers", () => {
  it("resets the wasm session between tests", async () => {
    await resetWasmSession();
    await ipc.newDocument("standard", "Leaky");
    expect(await ipc.listDocuments()).toHaveLength(1);

    await resetWasmSession();

    expect(await ipc.listDocuments()).toEqual([]);
  });

  it("stubs browser download APIs with a restorable fixture", () => {
    const download = stubBrowserDownload();
    const a = document.createElement("a");

    a.click();

    expect(download.click).toHaveBeenCalledOnce();
    download.restore();
  });
});
