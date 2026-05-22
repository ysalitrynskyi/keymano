// Zustand store: UI/selection/interaction state + snapshot cache (docs/05/09).
// Holds NO authoritative model — that lives in core. Edits go through ipc.

import { create } from "zustand";
import { toast } from "sonner";

import { ipc } from "@/lib/ipc";
import i18n from "@/lib/i18n";
import { Mod } from "@/lib/types";
import type { DocSummary, Issue, KeyboardSnapshot, RecentFile } from "@/lib/types";
import { geometryFor } from "@/features/keyboard/geometry";
import { buildReferenceSheetSvg, downloadSvgAsPng } from "@/features/keyboard/referenceSheet";
import type { SheetSection } from "@/features/keyboard/referenceSheet";

/** i18n shortcut bound to the live language (re-resolves on every call). */
const tr = (key: string, vars?: Record<string, unknown>) =>
  i18n.t(key, vars as Record<string, unknown>);

/**
 * Run an async op; on failure show a toast and swallow so the UI survives.
 * `labelKey` is a translation key (e.g. `guard.save`); the toast title is
 * translated, the raw error message stays in the (English) description for
 * debuggability — backend errors are sourced in the Rust core and don't go
 * through i18n yet.
 */
async function guard<T>(labelKey: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    toast.error(tr(labelKey), { description: msg });
    return undefined;
  }
}

export type InteractionMode =
  | "idle"
  | "editKey"
  | "createDeadKey"
  | "unlinkKey"
  | "relinkKey"
  | "swapKeys"
  | "selectKeyForX";

export type KbType = "ansi" | "iso" | "jis";

const TYPE_CODE: Record<KbType, number> = { ansi: 0, iso: 0, jis: 18 };

const RECENTS_KEY = "keymano-recents";
const RECENTS_MAX = 8;

const NAME_WORDS = [
  "Custom", "Daily", "Compact", "Nordic", "Classic", "Modern", "Studio",
  "Polyglot", "Scholar", "Voyager", "Atlas", "Ember", "Harbor", "Meridian",
];

/** A representative modifier mask for a keyMapSelect spec string (required
 *  tokens only; ignores optional `?` modifiers). Used to render a reference
 *  sheet section per declared keymap. */
function specToMask(spec: string): number {
  let mask = 0;
  for (const tok of spec.trim().split(/\s+/).filter(Boolean)) {
    if (tok.endsWith("?")) continue;
    const t = tok.toLowerCase();
    if (t.includes("shift")) mask |= Mod.ShiftL;
    else if (t.includes("option")) mask |= Mod.OptionL;
    else if (t.includes("control")) mask |= Mod.ControlL;
    else if (t.includes("command")) mask |= Mod.Command;
    else if (t.includes("caps")) mask |= Mod.Caps;
  }
  return mask;
}

/** A friendly, unique layout name not already used by an open document. */
function suggestLayoutName(taken: string[]): string {
  const used = new Set(taken.map((t) => t.toLowerCase()));
  const shuffled = [...NAME_WORDS].sort(() => Math.random() - 0.5);
  for (const w of shuffled) {
    const name = `${w} Layout`;
    if (!used.has(name.toLowerCase())) return name;
  }
  // all base names taken — append an incrementing suffix
  for (let i = 2; ; i++) {
    const name = `${NAME_WORDS[0]} Layout ${i}`;
    if (!used.has(name.toLowerCase())) return name;
  }
}

function loadRecents(): RecentFile[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const arr = raw ? (JSON.parse(raw) as RecentFile[]) : [];
    return Array.isArray(arr) ? arr.filter((r) => r && r.path) : [];
  } catch {
    return [];
  }
}

function saveRecents(list: RecentFile[]) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

interface EditorState {
  docs: DocSummary[];
  activeDocId: number | null;
  kbIndex: number;

  kbType: KbType;
  modMask: number;
  deadState: string;
  zoom: number;
  selectedCode: number | null;
  interactionMode: InteractionMode;
  swapFirst: number | null;
  quickEntry: boolean;
  keyClipboard: string | null;

  snapshot: KeyboardSnapshot | null;
  issues: Issue[];
  loading: boolean;
  recents: RecentFile[];

  // actions
  addRecent: (path: string | null, name: string) => void;
  clearRecents: () => void;
  refreshDocs: () => Promise<void>;
  newDocument: (template: "basic" | "standard", name: string) => Promise<void>;
  importXml: (xml: string) => Promise<void>;
  openFile: () => Promise<void>;
  openInstalled: (path: string) => Promise<void>;
  saveActive: () => Promise<boolean>;
  saveActiveAs: () => Promise<boolean>;
  installActive: () => Promise<void>;
  exportBundle: () => Promise<void>;
  setActiveDoc: (id: number) => Promise<void>;
  closeDoc: (id: number) => Promise<void>;
  goHome: () => void;
  renameDoc: (id: number, name: string) => Promise<void>;
  generateName: () => Promise<void>;
  duplicateActive: () => Promise<void>;

  setKbType: (t: KbType) => Promise<void>;
  toggleMod: (bit: number) => Promise<void>;
  setDeadState: (s: string) => Promise<void>;
  setZoom: (z: number) => void;
  selectKey: (code: number | null) => void;
  setMode: (m: InteractionMode) => void;
  toggleQuickEntry: () => void;

  refreshSnapshot: () => Promise<void>;
  refreshIssues: () => Promise<void>;
  setKeyOutput: (code: number, output: string) => Promise<void>;
  clearKey: (code: number) => Promise<void>;
  makeKeyDead: (code: number, state: string, terminator: string) => Promise<void>;
  unlinkKey: (code: number) => Promise<void>;
  relinkKey: (code: number) => Promise<void>;
  exportReferenceSheet: () => Promise<void>;
  swapKeys: (a: number, b: number) => Promise<void>;
  copyKeyOutput: (code: number) => void;
  pasteKeyOutput: (code: number) => Promise<void>;
  repair: () => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

export const useEditor = create<EditorState>((set, get) => ({
  docs: [],
  activeDocId: null,
  kbIndex: 0,
  kbType: "ansi",
  modMask: 0,
  deadState: "none",
  zoom: 1,
  selectedCode: null,
  interactionMode: "idle",
  swapFirst: null,
  quickEntry: false,
  keyClipboard: null,
  snapshot: null,
  issues: [],
  loading: false,
  recents: loadRecents(),

  addRecent: (path, name) => {
    if (!path) return; // only file-backed docs are recallable
    const entry: RecentFile = { path, name, ts: Date.now() };
    const list = [entry, ...get().recents.filter((r) => r.path !== path)].slice(0, RECENTS_MAX);
    saveRecents(list);
    set({ recents: list });
  },

  clearRecents: () => {
    saveRecents([]);
    set({ recents: [] });
  },

  refreshDocs: async () => {
    set({ docs: await ipc.listDocuments() });
  },

  newDocument: async (template, name) => {
    const doc = await guard("guard.newLayout", () => ipc.newDocument(template, name));
    if (!doc) return;
    await get().refreshDocs();
    await get().setActiveDoc(doc.id);
  },

  importXml: async (xml) => {
    const doc = await guard("guard.open", () => ipc.openContent(xml));
    if (!doc) return;
    await get().refreshDocs();
    await get().setActiveDoc(doc.id);
  },

  openFile: async () => {
    const doc = await guard("guard.openFile", () => ipc.openFileDialog());
    if (!doc) return;
    await get().refreshDocs();
    await get().setActiveDoc(doc.id);
    get().addRecent(doc.path, doc.name);
  },

  openInstalled: async (path) => {
    const doc = await guard("guard.openLayout", () => ipc.openPath(path));
    if (!doc) return;
    await get().refreshDocs();
    await get().setActiveDoc(doc.id);
    get().addRecent(doc.path, doc.name);
  },

  // Save: overwrite the document's existing file in place — no dialog. A doc
  // with no on-disk path yet (a freshly created layout, or any web build where
  // the browser can't write files) falls back to Save As so the first save
  // still asks where to put it. Note: this writes the *file*, never the live
  // installed keyboard — use installActive() to copy it into the system.
  saveActive: async () => {
    const { activeDocId, kbIndex, docs } = get();
    if (activeDocId == null) return false;
    const doc = docs.find((d) => d.id === activeDocId);
    if (!ipc.isTauri || !doc?.path) return get().saveActiveAs();
    const path = doc.path;
    const format = doc.is_bundle ? "bundle" : "keylayout";
    const ok = await guard("guard.save", async () => {
      await ipc.saveFile(activeDocId, kbIndex, path, format);
      return true;
    });
    if (ok) {
      await get().refreshDocs();
      get().addRecent(path, doc.name);
      toast.success(tr("toast.saved"));
    }
    return ok ?? false;
  },

  // Save As…: always prompt for a new destination (native save dialog on the
  // desktop, a browser download on the web). Used for the first save and to
  // fork a copy to a new file. A bundle doc forks as a .bundle (so its extra
  // keyboards survive); a standalone doc forks as a single .keylayout.
  saveActiveAs: async () => {
    const { activeDocId, kbIndex, docs } = get();
    if (activeDocId == null) return false;
    const doc = docs.find((d) => d.id === activeDocId);
    const name = doc?.name ?? tr("tabs.untitled");
    const ok = await guard("guard.save", () =>
      doc?.is_bundle
        ? ipc.exportBundleDialog(activeDocId, kbIndex, name)
        : ipc.saveFileDialog(activeDocId, kbIndex, name),
    );
    if (ok) {
      await get().refreshDocs();
      const saved = get().docs.find((d) => d.id === activeDocId);
      if (saved) get().addRecent(saved.path, saved.name);
      toast.success(tr("toast.saved"));
    }
    return ok ?? false;
  },

  installActive: async () => {
    const { activeDocId, kbIndex } = get();
    if (activeDocId == null) return;
    const res = await guard("guard.install", () => ipc.installLayout(activeDocId, kbIndex));
    if (!res) return;
    if (res.kind === "downloaded") {
      toast.success(tr("toast.downloaded"), { description: tr("toast.downloadedDesc") });
    } else {
      toast.success(tr("toast.installed"), { description: tr("toast.installedDesc") });
    }
  },

  exportBundle: async () => {
    const { activeDocId, kbIndex, docs } = get();
    if (activeDocId == null) return;
    const name = docs.find((d) => d.id === activeDocId)?.name ?? tr("tabs.untitled");
    const ok = await guard("guard.exportBundle", () => ipc.exportBundleDialog(activeDocId, kbIndex, name));
    if (ok) toast.success(tr("toast.exportedBundle"));
  },

  setActiveDoc: async (id) => {
    set({ activeDocId: id, kbIndex: 0, selectedCode: null, deadState: "none", modMask: 0 });
    await get().refreshSnapshot();
    await get().refreshIssues();
  },

  closeDoc: async (id) => {
    await ipc.closeDocument(id);
    await get().refreshDocs();
    const docs = get().docs;
    if (get().activeDocId === id) {
      if (docs.length) await get().setActiveDoc(docs[0].id);
      else set({ activeDocId: null, snapshot: null, issues: [], selectedCode: null, deadState: "none", modMask: 0 });
    }
  },

  goHome: () =>
    set({
      activeDocId: null,
      snapshot: null,
      selectedCode: null,
      issues: [],
      interactionMode: "idle",
      swapFirst: null,
    }),

  renameDoc: async (id, name) => {
    const r = await guard("guard.rename", () => ipc.renameDocument(id, get().kbIndex, name));
    if (r) await get().refreshDocs();
  },

  generateName: async () => {
    const { activeDocId, docs } = get();
    if (activeDocId == null) return;
    const name = suggestLayoutName(docs.map((d) => d.name));
    await get().renameDoc(activeDocId, name);
    toast.success(`Renamed to “${name}”`);
  },

  duplicateActive: async () => {
    const { activeDocId } = get();
    if (activeDocId == null) return;
    const doc = await guard("guard.duplicate", () => ipc.duplicateDocument(activeDocId));
    if (!doc) return;
    await get().refreshDocs();
    await get().setActiveDoc(doc.id);
    toast.success(`Created “${doc.name}” — editing the new copy`);
  },

  setKbType: async (t) => {
    set({ kbType: t });
    await get().refreshSnapshot();
  },

  toggleMod: async (bit) => {
    set({ modMask: get().modMask ^ bit });
    await get().refreshSnapshot();
  },

  setDeadState: async (s) => {
    set({ deadState: s });
    await get().refreshSnapshot();
  },

  setZoom: (z) => set({ zoom: Math.min(3, Math.max(0.5, Math.round(z * 100) / 100)) }),

  selectKey: (code) => set({ selectedCode: code }),

  setMode: (m) => set({ interactionMode: m, swapFirst: null }),

  toggleQuickEntry: () => set({ quickEntry: !get().quickEntry }),

  refreshSnapshot: async () => {
    const { activeDocId, kbIndex, kbType, modMask, deadState } = get();
    if (activeDocId == null) {
      set({ snapshot: null });
      return;
    }
    set({ loading: true });
    try {
      const snap = await ipc.getSnapshot(activeDocId, kbIndex, TYPE_CODE[kbType], modMask, deadState);
      set({ snapshot: snap });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Render: ${msg}`);
    } finally {
      set({ loading: false });
    }
  },

  refreshIssues: async () => {
    const { activeDocId, kbIndex } = get();
    if (activeDocId == null) return;
    set({ issues: await ipc.validate(activeDocId, kbIndex) });
  },

  setKeyOutput: async (code, output) => {
    const { activeDocId, kbIndex, kbType, modMask, deadState } = get();
    if (activeDocId == null) return;
    const snap = await guard("guard.setOutput", () =>
      ipc.setKeyOutput(activeDocId, kbIndex, TYPE_CODE[kbType], modMask, deadState, code, output),
    );
    if (!snap) return;
    set({ snapshot: snap });
    await get().refreshDocs();
    await get().refreshIssues();
  },

  clearKey: async (code) => {
    const { activeDocId, kbIndex, kbType, modMask, deadState } = get();
    if (activeDocId == null) return;
    const snap = await ipc.clearKey(activeDocId, kbIndex, TYPE_CODE[kbType], modMask, deadState, code);
    set({ snapshot: snap });
    await get().refreshDocs();
    await get().refreshIssues();
  },

  makeKeyDead: async (code, state, terminator) => {
    const { activeDocId, kbIndex, kbType, modMask } = get();
    if (activeDocId == null) return;
    const snap = await ipc.makeKeyDead(activeDocId, kbIndex, TYPE_CODE[kbType], modMask, code, state, terminator);
    set({ snapshot: snap, deadState: "none" });
    await get().refreshDocs();
    await get().refreshIssues();
  },

  unlinkKey: async (code) => {
    const { activeDocId, kbIndex, kbType, modMask, deadState } = get();
    if (activeDocId == null) return;
    const snap = await ipc.unlinkKey(activeDocId, kbIndex, TYPE_CODE[kbType], modMask, deadState, code);
    set({ snapshot: snap });
    await get().refreshDocs();
    await get().refreshIssues();
  },

  relinkKey: async (code) => {
    const { activeDocId, kbIndex, kbType, modMask, deadState } = get();
    if (activeDocId == null) return;
    const snap = await ipc.relinkKey(activeDocId, kbIndex, TYPE_CODE[kbType], modMask, deadState, code);
    set({ snapshot: snap });
    await get().refreshDocs();
    await get().refreshIssues();
  },

  exportReferenceSheet: async () => {
    const { activeDocId, kbIndex, kbType, snapshot } = get();
    if (activeDocId == null) return;
    const type = TYPE_CODE[kbType];
    const sections: SheetSection[] = [];
    const seen = new Set<number>();
    await guard("guard.referenceSheet", async () => {
      // Derive one section per DECLARED keymap (from the layout's real modifier
      // map), synthesising a representative mask for each — so the sheet covers
      // every map even when a layout's modifiers aren't the standard set.
      const rows = await ipc.modifierMapView(activeDocId, kbIndex, type).catch(() => []);
      const fallback: Array<[number, string]> = [
        [0, tr("refSheet.noModifiers")],
        [Mod.ShiftL, tr("refSheet.shift")],
        [Mod.OptionL, tr("refSheet.option")],
        [Mod.ShiftL | Mod.OptionL, tr("refSheet.shiftOption")],
        [Mod.Command, tr("refSheet.command")],
        [Mod.Caps, tr("refSheet.capsLock")],
      ];
      if (rows.length > 0) {
        for (const row of rows) {
          if (seen.has(row.map_index)) continue;
          seen.add(row.map_index);
          const mask = specToMask(row.specs[0] ?? "");
          const snap = await ipc.getSnapshot(activeDocId, kbIndex, type, mask, "none");
          sections.push({ label: row.specs.filter(Boolean).join("  ·  ") || tr("refSheet.noModifiers"), keys: snap.keys });
        }
      } else {
        for (const [mask, label] of fallback) {
          const snap = await ipc.getSnapshot(activeDocId, kbIndex, type, mask, "none");
          if (seen.has(snap.modifier_index)) continue;
          seen.add(snap.modifier_index);
          sections.push({ label, keys: snap.keys });
        }
      }
      const svg = buildReferenceSheetSvg(geometryFor(kbType), sections);
      await downloadSvgAsPng(svg, `${snapshot?.keyboard_name || tr("refSheet.filename")}-reference.png`);
    });
  },

  swapKeys: async (a, b) => {
    const { activeDocId, kbIndex, kbType, modMask, deadState } = get();
    if (activeDocId == null) return;
    const snap = await ipc.swapKeys(activeDocId, kbIndex, TYPE_CODE[kbType], modMask, deadState, a, b);
    set({ snapshot: snap, interactionMode: "idle", swapFirst: null });
    await get().refreshDocs();
    await get().refreshIssues();
  },

  copyKeyOutput: (code) => {
    const view = get().snapshot?.keys.find((k) => k.code === code);
    set({ keyClipboard: view?.output ?? "" });
    toast.message(tr("toast.copiedOutput"));
  },

  pasteKeyOutput: async (code) => {
    const clip = get().keyClipboard;
    if (clip == null) return;
    await get().setKeyOutput(code, clip);
  },

  repair: async () => {
    const { activeDocId, kbIndex } = get();
    if (activeDocId == null) return;
    const fixed = await guard("guard.repair", () => ipc.repair(activeDocId, kbIndex));
    if (fixed === undefined) return;
    await get().refreshSnapshot();
    await get().refreshIssues();
    toast.success(fixed.length ? tr("toast.repaired", { names: fixed.join(", ") }) : tr("toast.nothingToRepair"));
  },

  undo: async () => {
    const { activeDocId } = get();
    if (activeDocId == null) return;
    await ipc.undo(activeDocId);
    await get().refreshSnapshot();
    await get().refreshDocs();
    await get().refreshIssues();
  },

  redo: async () => {
    const { activeDocId } = get();
    if (activeDocId == null) return;
    await ipc.redo(activeDocId);
    await get().refreshSnapshot();
    await get().refreshDocs();
    await get().refreshIssues();
  },
}));

export { Mod, TYPE_CODE };
