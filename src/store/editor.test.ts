import { beforeEach, describe, expect, it } from "vitest";

import { ipc } from "@/lib/ipc";
import { useEditor, Mod } from "./editor";

describe("editor store", () => {
  beforeEach(() => {
    useEditor.setState({
      docs: [],
      activeDocId: null,
      modMask: 0,
      deadState: "none",
      selectedCode: null,
      snapshot: null,
      interactionMode: "idle",
    });
  });

  it("new document loads a snapshot", async () => {
    await useEditor.getState().newDocument("standard", "T");
    const snap = useEditor.getState().snapshot;
    expect(snap).not.toBeNull();
    expect(snap!.keys[0].output).toBe("a");
  });

  it("toggling shift refetches a shifted snapshot", async () => {
    await useEditor.getState().newDocument("standard", "T");
    await useEditor.getState().toggleMod(Mod.ShiftL);
    expect(useEditor.getState().modMask & Mod.ShiftL).toBeTruthy();
    expect(useEditor.getState().snapshot!.keys[0].output).toBe("A");
  });

  it("edit then undo updates snapshot", async () => {
    await useEditor.getState().newDocument("standard", "T");
    await useEditor.getState().setKeyOutput(0, "ñ");
    expect(useEditor.getState().snapshot!.keys[0].output).toBe("ñ");
    await useEditor.getState().undo();
    expect(useEditor.getState().snapshot!.keys[0].output).toBe("a");
  });

  it("selecting a key updates selectedCode", () => {
    useEditor.getState().selectKey(5);
    expect(useEditor.getState().selectedCode).toBe(5);
  });

  it("redo reapplies an undone edit", async () => {
    await useEditor.getState().newDocument("standard", "R");
    await useEditor.getState().setKeyOutput(0, "ñ");
    await useEditor.getState().undo();
    expect(useEditor.getState().snapshot!.keys[0].output).toBe("a");
    await useEditor.getState().redo();
    expect(useEditor.getState().snapshot!.keys[0].output).toBe("ñ");
  });

  it("edits are safe no-ops when there is no active document", async () => {
    useEditor.setState({ activeDocId: null });
    await expect(useEditor.getState().setKeyOutput(0, "x")).resolves.toBeUndefined();
    await expect(useEditor.getState().clearKey(0)).resolves.toBeUndefined();
    expect(await useEditor.getState().saveActive()).toBe(false);
  });

  it("addRecent dedups, caps at 8, and ignores null paths", () => {
    const s = useEditor.getState();
    s.clearRecents();
    s.addRecent(null, "skip"); // unsaved docs aren't recallable
    expect(useEditor.getState().recents.length).toBe(0);
    for (let i = 0; i < 10; i++) s.addRecent(`/p/${i}.keylayout`, `n${i}`);
    expect(useEditor.getState().recents.length).toBe(8); // RECENTS_MAX
    s.addRecent("/p/3.keylayout", "n3-again"); // existing path moves to front
    const r = useEditor.getState().recents;
    expect(r[0].path).toBe("/p/3.keylayout");
    expect(r.filter((x) => x.path === "/p/3.keylayout").length).toBe(1);
  });

  it("installActive on web returns 'downloaded' kind (discriminated union, B6)", async () => {
    // The web mock can't write to ~/Library so installLayout falls back to a
    // browser download. The store branches on res.kind, not on a magic
    // "downloaded" string. Stub the download path (jsdom has no real file
    // dialog) and verify the contract holds.
    let toastTitle: string | null = null;
    const { toast } = await import("sonner");
    const origSuccess = toast.success;
    (toast as unknown as { success: (m: string) => void }).success = (m: string) => {
      toastTitle = m;
    };
    const origInstall = ipc.installLayout;
    ipc.installLayout = async () => ({ kind: "downloaded" }) as const;
    try {
      await useEditor.getState().newDocument("standard", "I");
      await useEditor.getState().installActive();
      expect(toastTitle).toBe("Downloaded");

      ipc.installLayout = async () => ({ kind: "installed", path: "/x.keylayout" }) as const;
      toastTitle = null;
      await useEditor.getState().installActive();
      expect(toastTitle).toBe("Installed");
    } finally {
      ipc.installLayout = origInstall;
      (toast as unknown as { success: typeof origSuccess }).success = origSuccess;
    }
  });

  it("saveActive overwrites the existing file in place — no dialog (desktop)", async () => {
    // A doc that already has an on-disk path is saved straight to that path via
    // ipc.saveFile; the save-as dialog must NOT open. This is the behavior that
    // makes ⌘S a real "Save" instead of always prompting.
    const orig = {
      isTauri: ipc.isTauri,
      saveFile: ipc.saveFile,
      saveFileDialog: ipc.saveFileDialog,
      listDocuments: ipc.listDocuments,
    };
    const { toast } = await import("sonner");
    const origSuccess = toast.success;
    (toast as unknown as { success: () => void }).success = () => {};
    let saveFileArgs: { id: number; path: string; format: string } | null = null;
    let dialogOpened = false;
    (ipc as unknown as { isTauri: boolean }).isTauri = true;
    ipc.saveFile = async (id, _kbIndex, path, format) => {
      saveFileArgs = { id, path, format };
    };
    ipc.saveFileDialog = async () => {
      dialogOpened = true;
      return true;
    };
    ipc.listDocuments = async () => [
      { id: 1, name: "Doc", path: "/tmp/x.keylayout", is_bundle: false, keyboard_names: ["Doc"], dirty: false },
    ];
    try {
      await useEditor.getState().refreshDocs();
      useEditor.setState({ activeDocId: 1, kbIndex: 0 });
      const ok = await useEditor.getState().saveActive();
      expect(ok).toBe(true);
      expect(dialogOpened).toBe(false);
      expect(saveFileArgs).toEqual({ id: 1, path: "/tmp/x.keylayout", format: "keylayout" });
    } finally {
      (ipc as unknown as { isTauri: boolean }).isTauri = orig.isTauri;
      ipc.saveFile = orig.saveFile;
      ipc.saveFileDialog = orig.saveFileDialog;
      ipc.listDocuments = orig.listDocuments;
      (toast as unknown as { success: typeof origSuccess }).success = origSuccess;
    }
  });

  it("saveActive falls back to the dialog when the doc has no path yet", async () => {
    // First save of a brand-new layout (path === null) must prompt for a
    // destination rather than silently writing nowhere.
    const orig = {
      isTauri: ipc.isTauri,
      saveFile: ipc.saveFile,
      saveFileDialog: ipc.saveFileDialog,
      listDocuments: ipc.listDocuments,
    };
    const { toast } = await import("sonner");
    const origSuccess = toast.success;
    (toast as unknown as { success: () => void }).success = () => {};
    let saveFileCalled = false;
    let dialogOpened = false;
    (ipc as unknown as { isTauri: boolean }).isTauri = true;
    ipc.saveFile = async () => {
      saveFileCalled = true;
    };
    ipc.saveFileDialog = async () => {
      dialogOpened = true;
      return true;
    };
    ipc.listDocuments = async () => [
      { id: 2, name: "New", path: null, is_bundle: false, keyboard_names: ["New"], dirty: true },
    ];
    try {
      await useEditor.getState().refreshDocs();
      useEditor.setState({ activeDocId: 2, kbIndex: 0 });
      const ok = await useEditor.getState().saveActive();
      expect(ok).toBe(true);
      expect(dialogOpened).toBe(true);
      expect(saveFileCalled).toBe(false);
    } finally {
      (ipc as unknown as { isTauri: boolean }).isTauri = orig.isTauri;
      ipc.saveFile = orig.saveFile;
      ipc.saveFileDialog = orig.saveFileDialog;
      ipc.listDocuments = orig.listDocuments;
      (toast as unknown as { success: typeof origSuccess }).success = origSuccess;
    }
  });

  it("saveActiveAs always opens the dialog even when a path exists", async () => {
    const orig = {
      isTauri: ipc.isTauri,
      saveFileDialog: ipc.saveFileDialog,
      listDocuments: ipc.listDocuments,
    };
    const { toast } = await import("sonner");
    const origSuccess = toast.success;
    (toast as unknown as { success: () => void }).success = () => {};
    let dialogOpened = false;
    (ipc as unknown as { isTauri: boolean }).isTauri = true;
    ipc.saveFileDialog = async () => {
      dialogOpened = true;
      return true;
    };
    ipc.listDocuments = async () => [
      { id: 3, name: "Doc", path: "/tmp/y.keylayout", is_bundle: false, keyboard_names: ["Doc"], dirty: false },
    ];
    try {
      await useEditor.getState().refreshDocs();
      useEditor.setState({ activeDocId: 3, kbIndex: 0 });
      const ok = await useEditor.getState().saveActiveAs();
      expect(ok).toBe(true);
      expect(dialogOpened).toBe(true);
    } finally {
      (ipc as unknown as { isTauri: boolean }).isTauri = orig.isTauri;
      ipc.saveFileDialog = orig.saveFileDialog;
      ipc.listDocuments = orig.listDocuments;
      (toast as unknown as { success: typeof origSuccess }).success = origSuccess;
    }
  });

  it("unlinkKey refreshes docs + issues so the dirty/validation badge isn't stale", async () => {
    await useEditor.getState().newDocument("standard", "U");
    let docsCalled = 0;
    let issuesCalled = 0;
    const orig = {
      refreshDocs: useEditor.getState().refreshDocs,
      refreshIssues: useEditor.getState().refreshIssues,
      unlinkKey: ipc.unlinkKey,
    };
    useEditor.setState({
      refreshDocs: async () => {
        docsCalled++;
      },
      refreshIssues: async () => {
        issuesCalled++;
      },
    });
    ipc.unlinkKey = async () => useEditor.getState().snapshot!;
    try {
      await useEditor.getState().unlinkKey(0);
      expect(docsCalled).toBeGreaterThan(0);
      expect(issuesCalled).toBeGreaterThan(0);
    } finally {
      useEditor.setState({ refreshDocs: orig.refreshDocs, refreshIssues: orig.refreshIssues });
      ipc.unlinkKey = orig.unlinkKey;
    }
  });

  it("saveActiveAs forks a bundle doc as a .bundle, not a single .keylayout", async () => {
    const orig = {
      isTauri: ipc.isTauri,
      exportBundleDialog: ipc.exportBundleDialog,
      saveFileDialog: ipc.saveFileDialog,
      listDocuments: ipc.listDocuments,
    };
    const { toast } = await import("sonner");
    const origSuccess = toast.success;
    (toast as unknown as { success: () => void }).success = () => {};
    let bundleDialog = false;
    let keylayoutDialog = false;
    (ipc as unknown as { isTauri: boolean }).isTauri = true;
    ipc.exportBundleDialog = async () => {
      bundleDialog = true;
      return true;
    };
    ipc.saveFileDialog = async () => {
      keylayoutDialog = true;
      return true;
    };
    ipc.listDocuments = async () => [
      { id: 4, name: "Pack", path: "/tmp/p.bundle", is_bundle: true, keyboard_names: ["A", "B"], dirty: false },
    ];
    try {
      await useEditor.getState().refreshDocs();
      useEditor.setState({ activeDocId: 4, kbIndex: 0 });
      const ok = await useEditor.getState().saveActiveAs();
      expect(ok).toBe(true);
      expect(bundleDialog).toBe(true);
      expect(keylayoutDialog).toBe(false);
    } finally {
      (ipc as unknown as { isTauri: boolean }).isTauri = orig.isTauri;
      ipc.exportBundleDialog = orig.exportBundleDialog;
      ipc.saveFileDialog = orig.saveFileDialog;
      ipc.listDocuments = orig.listDocuments;
      (toast as unknown as { success: typeof origSuccess }).success = origSuccess;
    }
  });

  it("closeDoc clears active state when the last document closes", async () => {
    // The web backend is a singleton across tests — close any leftovers first.
    for (const d of await ipc.listDocuments()) await ipc.closeDocument(d.id);
    useEditor.setState({ docs: [], activeDocId: null, snapshot: null });
    await useEditor.getState().newDocument("standard", "Solo");
    const id = useEditor.getState().activeDocId!;
    expect(id).not.toBeNull();
    await useEditor.getState().closeDoc(id);
    expect(useEditor.getState().activeDocId).toBeNull();
    expect(useEditor.getState().snapshot).toBeNull();
  });
});
