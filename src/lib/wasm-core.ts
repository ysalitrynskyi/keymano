// Browser backend: the REAL keylayout-core, compiled to WebAssembly.
//
// Replaces the old hand-written JS stand-in — the web build now runs the exact
// same Rust parser / serializer / validator / modifier resolver as the desktop
// app (via keymano-session::AppState wrapped in crates/keymano-wasm), so there
// is one source of truth for the format on every platform.
//
// The wasm module is loaded with a dynamic import so the desktop (Tauri) bundle
// — which talks to the native core over IPC and never calls this — doesn't ship
// the wasm payload.

import type {
  ActionsView,
  DocSummary,
  Issue,
  KeyboardSnapshot,
  ModifierSelectView,
} from "./types";

// Minimal shape of the wasm-bindgen `Session` we rely on (names are the Rust
// method names, preserved by wasm-bindgen). Structured results come back as
// JSON strings; scalars come back directly.
interface WasmSession {
  new_document(template: string, name: string): string;
  open_keylayout(xml: string): string;
  list_documents(): string;
  close_document(id: number): void;
  rename(id: number, kbIndex: number, name: string): string;
  duplicate(id: number): string;
  mark_saved(id: number, path: string): void;
  get_snapshot(id: number, kbIndex: number, type: number, mask: number, dead: string): string;
  get_xml(id: number, kbIndex: number, codeNonAscii: boolean): string;
  validate(id: number, kbIndex: number): string;
  undo_label(id: number): string | undefined;
  actions_view(id: number, kbIndex: number): string;
  modifier_map_view(id: number, kbIndex: number, type: number): string;
  set_key_output(id: number, kbIndex: number, type: number, mask: number, dead: string, code: number, output: string): string;
  clear_key(id: number, kbIndex: number, type: number, mask: number, dead: string, code: number): string;
  make_key_dead(id: number, kbIndex: number, type: number, mask: number, code: number, next: string, term: string): string;
  swap_keys(id: number, kbIndex: number, type: number, mask: number, dead: string, a: number, b: number): string;
  unlink_key(id: number, kbIndex: number, type: number, mask: number, dead: string, code: number): string;
  relink_key(id: number, kbIndex: number, type: number, mask: number, dead: string, code: number): string;
  set_terminator(id: number, kbIndex: number, state: string, output: string): void;
  remove_unused_states(id: number, kbIndex: number): number;
  remove_unused_actions(id: number, kbIndex: number): number;
  add_special_keys(id: number, kbIndex: number): number;
  repair(id: number, kbIndex: number): string;
  undo(id: number): void;
  redo(id: number): void;
}

let sessionPromise: Promise<WasmSession> | null = null;

/**
 * Lazily instantiate the wasm core (once). `loadWasm` lets tests inject the
 * compiled `.wasm` bytes directly (Node has no `fetch(import.meta.url)`); the
 * browser path passes nothing and the glue fetches the asset itself.
 */
async function getSession(loadWasm?: () => Promise<unknown>): Promise<WasmSession> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const wasm = await import("@/wasm/keymano_wasm.js");
      const input = (loadWasm ? await loadWasm() : undefined) as Parameters<typeof wasm.default>[0];
      await wasm.default(input);
      return new wasm.Session() as unknown as WasmSession;
    })();
  }
  return sessionPromise;
}

/** Test-only hook: provide the wasm bytes/module and reset the singleton. */
export async function __initWasmForTest(loadWasm: () => Promise<unknown>): Promise<void> {
  sessionPromise = null;
  await getSession(loadWasm);
}

export class WasmBackend {
  private async s(): Promise<WasmSession> {
    return getSession();
  }

  async newDocument(template: string, name: string): Promise<DocSummary> {
    return JSON.parse((await this.s()).new_document(template, name));
  }
  async openKeylayout(xml: string): Promise<DocSummary> {
    return JSON.parse((await this.s()).open_keylayout(xml));
  }
  async listDocuments(): Promise<DocSummary[]> {
    return JSON.parse((await this.s()).list_documents());
  }
  async closeDocument(id: number): Promise<void> {
    (await this.s()).close_document(id);
  }
  async rename(id: number, kbIndex: number, name: string): Promise<DocSummary> {
    return JSON.parse((await this.s()).rename(id, kbIndex, name));
  }
  async duplicate(id: number): Promise<DocSummary> {
    return JSON.parse((await this.s()).duplicate(id));
  }
  async saveFile(id: number, _kbIndex: number, path: string): Promise<void> {
    (await this.s()).mark_saved(id, path);
  }
  async getSnapshot(id: number, kbIndex: number, type: number, mask: number, dead: string): Promise<KeyboardSnapshot> {
    return JSON.parse((await this.s()).get_snapshot(id, kbIndex, type, mask, dead));
  }
  async getXml(id: number, kbIndex: number, codeNonAscii: boolean): Promise<string> {
    return (await this.s()).get_xml(id, kbIndex, codeNonAscii);
  }
  async validate(id: number, kbIndex: number): Promise<Issue[]> {
    return JSON.parse((await this.s()).validate(id, kbIndex));
  }
  async undoLabel(id: number): Promise<string | null> {
    return (await this.s()).undo_label(id) ?? null;
  }
  async actionsView(id: number, kbIndex: number): Promise<ActionsView> {
    return JSON.parse((await this.s()).actions_view(id, kbIndex));
  }
  async modifierMapView(id: number, kbIndex: number, type: number): Promise<ModifierSelectView[]> {
    return JSON.parse((await this.s()).modifier_map_view(id, kbIndex, type));
  }
  async setKeyOutput(id: number, kbIndex: number, type: number, mask: number, dead: string, code: number, output: string): Promise<KeyboardSnapshot> {
    return JSON.parse((await this.s()).set_key_output(id, kbIndex, type, mask, dead, code, output));
  }
  async clearKey(id: number, kbIndex: number, type: number, mask: number, dead: string, code: number): Promise<KeyboardSnapshot> {
    return JSON.parse((await this.s()).clear_key(id, kbIndex, type, mask, dead, code));
  }
  async makeKeyDead(id: number, kbIndex: number, type: number, mask: number, code: number, next: string, term: string): Promise<KeyboardSnapshot> {
    return JSON.parse((await this.s()).make_key_dead(id, kbIndex, type, mask, code, next, term));
  }
  async swapKeys(id: number, kbIndex: number, type: number, mask: number, dead: string, a: number, b: number): Promise<KeyboardSnapshot> {
    return JSON.parse((await this.s()).swap_keys(id, kbIndex, type, mask, dead, a, b));
  }
  async unlinkKey(id: number, kbIndex: number, type: number, mask: number, dead: string, code: number): Promise<KeyboardSnapshot> {
    return JSON.parse((await this.s()).unlink_key(id, kbIndex, type, mask, dead, code));
  }
  async relinkKey(id: number, kbIndex: number, type: number, mask: number, dead: string, code: number): Promise<KeyboardSnapshot> {
    return JSON.parse((await this.s()).relink_key(id, kbIndex, type, mask, dead, code));
  }
  async setTerminator(id: number, kbIndex: number, state: string, output: string): Promise<void> {
    (await this.s()).set_terminator(id, kbIndex, state, output);
  }
  async removeUnusedStates(id: number, kbIndex: number): Promise<number> {
    return (await this.s()).remove_unused_states(id, kbIndex);
  }
  async removeUnusedActions(id: number, kbIndex: number): Promise<number> {
    return (await this.s()).remove_unused_actions(id, kbIndex);
  }
  async addSpecialKeys(id: number, kbIndex: number): Promise<number> {
    return (await this.s()).add_special_keys(id, kbIndex);
  }
  async repair(id: number, kbIndex: number): Promise<string[]> {
    return JSON.parse((await this.s()).repair(id, kbIndex));
  }
  async undo(id: number): Promise<void> {
    (await this.s()).undo(id);
  }
  async redo(id: number): Promise<void> {
    (await this.s()).redo(id);
  }
}
