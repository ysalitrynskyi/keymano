// Typed command client (. Two backends chosen at runtime:
//  - tauri: real invoke() when window.__TAURI_INTERNALS__ present.
//  - web-mock: in-browser MockBackend for design review + e2e (no Rust).

import i18n from "./i18n";
import { MockBackend } from "./mock-core";
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

let mock: MockBackend | null = null;
function getMock(): MockBackend {
  if (!mock) mock = new MockBackend();
  return mock;
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
    return getMock().newDocument(template, name);
  },

  async openContent(xml: string): Promise<DocSummary> {
    if (isTauri) return invoke("open_content", { xml });
    // web: real best-effort import of the .keylayout via DOMParser
    const m = /name="([^"]*)"/.exec(xml);
    return getMock().openKeylayout(xml, m ? m[1] : "Imported");
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
    return path; // web-mock: no filesystem
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
    const m = /([^/]+)\.(keylayout|bundle)$/.exec(path);
    return getMock().newDocument("standard", m ? m[1] : "Imported");
  },

  /** Native open dialog (Tauri) or browser file picker (web-mock). */
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

  /** Native save dialog (Tauri) or browser download (web-mock). */
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
    return getMock().listDocuments();
  },

  async closeDocument(id: number): Promise<void> {
    if (isTauri) return invoke("close_document", { id });
    getMock().closeDocument(id);
  },

  async renameDocument(id: number, kbIndex: number, name: string): Promise<DocSummary> {
    if (isTauri) return invoke("rename_document", { id, kbIndex, name });
    return getMock().rename(id, kbIndex, name);
  },

  async duplicateDocument(id: number): Promise<DocSummary> {
    if (isTauri) return invoke("duplicate_document", { id });
    return getMock().duplicate(id);
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
    return getMock().getSnapshot(id, kbIndex, typeCode, mask, deadState);
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
    return getMock().setKeyOutput(id, kbIndex, typeCode, mask, deadState, code, output);
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
    return getMock().clearKey(id, kbIndex, typeCode, mask, deadState, code);
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
    return getMock().makeKeyDead(id, kbIndex, typeCode, mask, code, nextState, terminator);
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
    return getMock().swapKeys(id, kbIndex, typeCode, mask, deadState, codeA, codeB);
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
    return getMock().unlinkKey(id, kbIndex, typeCode, mask, deadState, code);
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
    return getMock().relinkKey(id, kbIndex, typeCode, mask, deadState, code);
  },

  async undo(id: number): Promise<void> {
    if (isTauri) return invoke("undo", { id });
    getMock().undo(id);
  },
  async redo(id: number): Promise<void> {
    if (isTauri) return invoke("redo", { id });
    getMock().redo(id);
  },
  async undoLabel(id: number): Promise<string | null> {
    if (isTauri) return invoke("undo_label", { id });
    return getMock().undoLabel(id);
  },

  async validate(id: number, kbIndex: number): Promise<Issue[]> {
    if (isTauri) return invoke("validate", { id, kbIndex });
    return getMock().validate(id, kbIndex);
  },
  async repair(id: number, kbIndex: number): Promise<string[]> {
    if (isTauri) return invoke("repair", { id, kbIndex });
    return getMock().repair(id, kbIndex);
  },

  async actionsView(id: number, kbIndex: number): Promise<ActionsView> {
    if (isTauri) return invoke("actions_view", { id, kbIndex });
    return getMock().actionsView(id, kbIndex);
  },

  async modifierMapView(id: number, kbIndex: number, typeCode: number): Promise<ModifierSelectView[]> {
    if (isTauri) return invoke("modifier_map_view", { id, kbIndex, typeCode });
    return getMock().modifierMapView();
  },

  async setTerminator(id: number, kbIndex: number, layoutState: string, output: string): Promise<void> {
    if (isTauri) return invoke("set_terminator", { id, kbIndex, layoutState, output });
    getMock().setTerminator(id, kbIndex, layoutState, output);
  },

  async removeUnusedStates(id: number, kbIndex: number): Promise<number> {
    if (isTauri) return invoke("remove_unused_states", { id, kbIndex });
    return getMock().removeUnusedStates(id, kbIndex);
  },

  async removeUnusedActions(id: number, kbIndex: number): Promise<number> {
    if (isTauri) return invoke("remove_unused_actions", { id, kbIndex });
    return getMock().removeUnusedActions(id, kbIndex);
  },

  async addSpecialKeys(id: number, kbIndex: number): Promise<number> {
    if (isTauri) return invoke("add_special_keys", { id, kbIndex });
    return getMock().addSpecialKeys(id, kbIndex);
  },

  async getXml(id: number, kbIndex: number, codeNonAscii: boolean): Promise<string> {
    if (isTauri) return invoke("get_xml", { id, kbIndex, codeNonAscii });
    return getMock().getXml(id, kbIndex, codeNonAscii);
  },

  /** Export the document as a .bundle directory (desktop save dialog). */
  async exportBundleDialog(id: number, kbIndex: number, name: string): Promise<boolean> {
    if (isTauri) {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const path = await save({ defaultPath: `${name}.bundle` });
      if (!path) return false;
      await invoke("save_file", { id, kbIndex, path, format: "bundle" });
      return true;
    }
    // web: a .bundle is a folder the browser can't write; download the
    // standalone .keylayout instead so the action still produces a real file.
    return this.saveFileDialog(id, kbIndex, name);
  },

  /** Install the active layout into ~/Library/Keyboard Layouts (macOS). */
  async installLayout(id: number, kbIndex: number): Promise<InstallResult> {
    if (isTauri) {
      const path = await invoke<string>("install_layout", { id, kbIndex });
      return { kind: "installed", path };
    }
    // web: can't write to ~/Library/Keyboard Layouts from a browser — download
    // the .keylayout so the user can place it themselves.
    const name = (await this.listDocuments()).find((d) => d.id === id)?.name ?? "Keyboard";
    await this.saveFileDialog(id, kbIndex, name);
    return { kind: "downloaded" };
  },

  async saveFile(
    id: number,
    kbIndex: number,
    path: string,
    format: SaveFormat,
  ): Promise<void> {
    if (isTauri) return invoke("save_file", { id, kbIndex, path, format });
    getMock().saveFile(id, kbIndex, path);
  },
};
