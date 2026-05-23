// Typed command client (. Two backends chosen at runtime:
//  - tauri: real invoke() when window.__TAURI_INTERNALS__ present.
//  - web: real Rust core compiled to WebAssembly for the browser build.

import i18n from "./i18n";
import { WasmBackend } from "./wasm-core";
import type {
  ActionsView,
  DocSummary,
  InputSource,
  InstalledLayout,
  Issue,
  KeyboardSnapshot,
  ModifierSelectView,
  SaveFormat,
  TemplateName,
} from "./types";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Discriminated union returned by installLayout. */
export type InstallResult = { kind: "installed"; path: string } | { kind: "downloaded" };

let web: WasmBackend | null = null;
function getWeb(): WasmBackend {
  if (!web) web = new WasmBackend();
  return web;
}

async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const api = await import("@tauri-apps/api/core");
  return api.invoke<T>(cmd, args);
}

export const ipc = {
  isTauri,

  async ping(): Promise<string> {
    if (isTauri) return invoke("ping", {});
    return "pong";
  },

  async newDocument(template: TemplateName, name: string): Promise<DocSummary> {
    if (isTauri) return invoke("new_document", { template, name });
    return getWeb().newDocument(template, name);
  },

  async openContent(xml: string): Promise<DocSummary> {
    if (isTauri) return invoke("open_content", { xml });
    // web: parse with the real Rust core compiled to wasm.
    return getWeb().openKeylayout(xml);
  },

  /** Listen for native menu events (Tauri). Web returns a no-op unlisten. */
  async onMenu(handler: (id: string) => void): Promise<() => void> {
    if (!isTauri) return () => {};
    try {
      const { listen } = await import("@tauri-apps/api/event");
      return await listen<string>("menu", (e) => handler(e.payload));
    } catch {
      return () => {};
    }
  },

  /**
   * Intercept the window close request (Tauri). `shouldClose` returns true to
   * allow, false to block (e.g. to show an unsaved-changes prompt).
   */
  async onCloseRequested(shouldClose: () => boolean): Promise<() => void> {
    if (!isTauri) return () => {};
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      return await getCurrentWindow().onCloseRequested((e) => {
        if (!shouldClose()) e.preventDefault();
      });
    } catch {
      return () => {};
    }
  },

  /** Force-close the window (after a confirmed quit). */
  async closeWindow(): Promise<void> {
    if (!isTauri) return;
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().destroy();
    } catch {
      /* ignore */
    }
  },

  /** Quit the whole app (after a confirmed quit). */
  async quit(): Promise<void> {
    if (!isTauri) return;
    try {
      await invoke("quit_app", {});
    } catch {
      /* ignore */
    }
  },

  /** Set the native window title. */
  async setTitle(title: string): Promise<void> {
    if (!isTauri) return;
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().setTitle(title);
    } catch {
      /* ignore */
    }
  },

  /** Register an OS file-drop handler (Tauri). Web returns a no-op unlisten. */
  async onFileDrop(handler: (paths: string[]) => void): Promise<() => void> {
    if (!isTauri) return () => {};
    try {
      const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const win = getCurrentWebviewWindow();
      const unlisten = await win.onDragDropEvent((e) => {
        if (e.payload.type === "drop" && e.payload.paths?.length) {
          handler(e.payload.paths);
        }
      });
      return unlisten;
    } catch {
      return () => {};
    }
  },

  /** Layouts installed on this machine (macOS dirs). The browser has no access
   *  to the system, so the web build returns nothing rather than fake samples. */
  async listInstalledLayouts(): Promise<InstalledLayout[]> {
    if (isTauri) return invoke("list_installed_layouts", {});
    return [];
  },

  /** Move a user-installed layout to the Trash (reversible). macOS only. */
  async uninstallLayout(path: string): Promise<string> {
    if (isTauri) return invoke("uninstall_layout", { path });
    return path; // web: no filesystem
  },

  /** Fire when the installed-layouts folders change (Tauri fs-watch). */
  async onInstalledChanged(handler: () => void): Promise<() => void> {
    if (!isTauri) return () => {};
    try {
      const { listen } = await import("@tauri-apps/api/event");
      return await listen("installed-changed", () => handler());
    } catch {
      return () => {};
    }
  },

  /** Enabled macOS keyboard input sources (incl. built-ins). Empty on web —
   *  the browser can't read the OS input-source list. */
  async listInputSources(): Promise<InputSource[]> {
    if (isTauri) return invoke("list_input_sources", {});
    return [];
  },

  /** Open an external URL in the default browser (http/https only). */
  async openExternal(url: string): Promise<void> {
    if (isTauri) {
      await invoke("open_external", { url });
      return;
    }
    window.open(url, "_blank", "noreferrer");
  },

  /** Reveal a file in Finder/Explorer (desktop only; no-op on web). */
  async revealPath(path: string): Promise<void> {
    if (isTauri) await invoke("reveal_path", { path });
  },

  /** Open a layout by an explicit filesystem path. */
  async openPath(path: string): Promise<DocSummary> {
    if (isTauri) return invoke("open_file", { path });
    // web: a browser can't read an arbitrary filesystem path; fall back to a
    // fresh layout named after the file (this branch is desktop-only in
    // practice — web docs have no on-disk path to recall).
    const m = /([^/]+)\.(keylayout|bundle)$/.exec(path);
    return getWeb().newDocument("standard", m ? m[1] : "Imported");
  },

  /** Native open dialog (Tauri) or browser file picker (web). */
  async openFileDialog(): Promise<DocSummary | null> {
    if (isTauri) {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        multiple: false,
        directory: false,
        filters: [{ name: i18n.t("dialog.keyboardLayout"), extensions: ["keylayout", "bundle"] }],
      });
      if (!path || typeof path !== "string") return null;
      return invoke("open_file", { path });
    }
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".keylayout";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        resolve(await this.openContent(await file.text()));
      };
      input.click();
    });
  },

  /** Native save dialog (Tauri) or browser download (web). */
  async saveFileDialog(id: number, kbIndex: number, name: string): Promise<boolean> {
    if (isTauri) {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const path = await save({
        defaultPath: `${name}.keylayout`,
        filters: [{ name: i18n.t("dialog.keyboardLayout"), extensions: ["keylayout"] }],
      });
      if (!path) return false;
      await invoke("save_file", { id, kbIndex, path, format: "keylayout" });
      return true;
    }
    const xml = await this.getXml(id, kbIndex, false);
    const blob = new Blob([xml], { type: "application/xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.keylayout`;
    a.click();
    URL.revokeObjectURL(a.href);
    return true;
  },

  async listDocuments(): Promise<DocSummary[]> {
    if (isTauri) return invoke("list_documents", {});
    return getWeb().listDocuments();
  },

  async closeDocument(id: number): Promise<void> {
    if (isTauri) return invoke("close_document", { id });
    return getWeb().closeDocument(id);
  },

  async renameDocument(id: number, kbIndex: number, name: string): Promise<DocSummary> {
    if (isTauri) return invoke("rename_document", { id, kbIndex, name });
    return getWeb().rename(id, kbIndex, name);
  },

  async duplicateDocument(id: number): Promise<DocSummary> {
    if (isTauri) return invoke("duplicate_document", { id });
    return getWeb().duplicate(id);
  },

  async getSnapshot(
    id: number,
    kbIndex: number,
    typeCode: number,
    mask: number,
    deadState: string,
  ): Promise<KeyboardSnapshot> {
    if (isTauri)
      return invoke("get_snapshot", { id, kbIndex, typeCode, mask, deadState });
    return getWeb().getSnapshot(id, kbIndex, typeCode, mask, deadState);
  },

  async setKeyOutput(
    id: number,
    kbIndex: number,
    typeCode: number,
    mask: number,
    deadState: string,
    code: number,
    output: string,
  ): Promise<KeyboardSnapshot> {
    if (isTauri)
      return invoke("set_key_output", { id, kbIndex, typeCode, mask, deadState, code, output });
    return getWeb().setKeyOutput(id, kbIndex, typeCode, mask, deadState, code, output);
  },

  async clearKey(
    id: number,
    kbIndex: number,
    typeCode: number,
    mask: number,
    deadState: string,
    code: number,
  ): Promise<KeyboardSnapshot> {
    if (isTauri)
      return invoke("clear_key", { id, kbIndex, typeCode, mask, deadState, code });
    return getWeb().clearKey(id, kbIndex, typeCode, mask, deadState, code);
  },

  async makeKeyDead(
    id: number,
    kbIndex: number,
    typeCode: number,
    mask: number,
    code: number,
    nextState: string,
    terminator: string,
  ): Promise<KeyboardSnapshot> {
    if (isTauri)
      return invoke("make_key_dead", { id, kbIndex, typeCode, mask, code, nextState, terminator });
    return getWeb().makeKeyDead(id, kbIndex, typeCode, mask, code, nextState, terminator);
  },

  async swapKeys(
    id: number,
    kbIndex: number,
    typeCode: number,
    mask: number,
    deadState: string,
    codeA: number,
    codeB: number,
  ): Promise<KeyboardSnapshot> {
    if (isTauri)
      return invoke("swap_keys", { id, kbIndex, typeCode, mask, deadState, codeA, codeB });
    return getWeb().swapKeys(id, kbIndex, typeCode, mask, deadState, codeA, codeB);
  },

  async unlinkKey(
    id: number,
    kbIndex: number,
    typeCode: number,
    mask: number,
    deadState: string,
    code: number,
  ): Promise<KeyboardSnapshot> {
    if (isTauri)
      return invoke("unlink_key", { id, kbIndex, typeCode, mask, deadState, code });
    return getWeb().unlinkKey(id, kbIndex, typeCode, mask, deadState, code);
  },

  async relinkKey(
    id: number,
    kbIndex: number,
    typeCode: number,
    mask: number,
    deadState: string,
    code: number,
  ): Promise<KeyboardSnapshot> {
    if (isTauri)
      return invoke("relink_key", { id, kbIndex, typeCode, mask, deadState, code });
    return getWeb().relinkKey(id, kbIndex, typeCode, mask, deadState, code);
  },

  async undo(id: number): Promise<void> {
    if (isTauri) return invoke("undo", { id });
    return getWeb().undo(id);
  },
  async redo(id: number): Promise<void> {
    if (isTauri) return invoke("redo", { id });
    return getWeb().redo(id);
  },
  async undoLabel(id: number): Promise<string | null> {
    if (isTauri) return invoke("undo_label", { id });
    return getWeb().undoLabel(id);
  },

  async validate(id: number, kbIndex: number): Promise<Issue[]> {
    if (isTauri) return invoke("validate", { id, kbIndex });
    return getWeb().validate(id, kbIndex);
  },
  async repair(id: number, kbIndex: number): Promise<string[]> {
    if (isTauri) return invoke("repair", { id, kbIndex });
    return getWeb().repair(id, kbIndex);
  },

  async actionsView(id: number, kbIndex: number): Promise<ActionsView> {
    if (isTauri) return invoke("actions_view", { id, kbIndex });
    return getWeb().actionsView(id, kbIndex);
  },

  async modifierMapView(id: number, kbIndex: number, typeCode: number): Promise<ModifierSelectView[]> {
    if (isTauri) return invoke("modifier_map_view", { id, kbIndex, typeCode });
    return getWeb().modifierMapView(id, kbIndex, typeCode);
  },

  async setTerminator(id: number, kbIndex: number, layoutState: string, output: string): Promise<void> {
    if (isTauri) return invoke("set_terminator", { id, kbIndex, layoutState, output });
    return getWeb().setTerminator(id, kbIndex, layoutState, output);
  },

  async removeUnusedStates(id: number, kbIndex: number): Promise<number> {
    if (isTauri) return invoke("remove_unused_states", { id, kbIndex });
    return getWeb().removeUnusedStates(id, kbIndex);
  },

  async removeUnusedActions(id: number, kbIndex: number): Promise<number> {
    if (isTauri) return invoke("remove_unused_actions", { id, kbIndex });
    return getWeb().removeUnusedActions(id, kbIndex);
  },

  async addSpecialKeys(id: number, kbIndex: number): Promise<number> {
    if (isTauri) return invoke("add_special_keys", { id, kbIndex });
    return getWeb().addSpecialKeys(id, kbIndex);
  },

  async getXml(id: number, kbIndex: number, codeNonAscii: boolean): Promise<string> {
    if (isTauri) return invoke("get_xml", { id, kbIndex, codeNonAscii });
    return getWeb().getXml(id, kbIndex, codeNonAscii);
  },

  /** Export the document as a `.bundle` (desktop writes the directory; web
   * downloads a `<Name>.bundle.zip` archive — browsers can't write directory
   * packages, so the zip is the closest portable artifact: unzip it once and
   * the result is a real macOS keyboard bundle). */
  async exportBundleDialog(id: number, kbIndex: number, name: string): Promise<boolean> {
    if (isTauri) {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const path = await save({ defaultPath: `${name}.bundle` });
      if (!path) return false;
      await invoke("save_file", { id, kbIndex, path, format: "bundle" });
      return true;
    }
    const bytes = await getWeb().exportBundleZip(id);
    const filename = await getWeb().bundleZipFilename(id);
    const blob = new Blob([new Uint8Array(bytes)], { type: "application/zip" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    return true;
  },

  /** Install the active layout into ~/Library/Keyboard Layouts (macOS). */
  async installLayout(id: number, kbIndex: number): Promise<InstallResult> {
    if (isTauri) {
      const path = await invoke<string>("install_layout", { id, kbIndex });
      return { kind: "installed", path };
    }
    // web: can't write into the system Keyboard Layouts folder from a browser.
    // Hand the user the right artifact for what they have open: a bundle doc
    // downloads as `.bundle.zip` (unzip + drop into ~/Library/Keyboard Layouts),
    // a standalone keylayout downloads as `.keylayout`.
    const doc = (await this.listDocuments()).find((d) => d.id === id);
    const name = doc?.name ?? "Keyboard";
    if (doc?.is_bundle) {
      await this.exportBundleDialog(id, kbIndex, name);
    } else {
      await this.saveFileDialog(id, kbIndex, name);
    }
    return { kind: "downloaded" };
  },

  async saveFile(
    id: number,
    kbIndex: number,
    path: string,
    format: SaveFormat,
  ): Promise<void> {
    if (isTauri) return invoke("save_file", { id, kbIndex, path, format });
    return getWeb().saveFile(id, kbIndex, path);
  },
};
