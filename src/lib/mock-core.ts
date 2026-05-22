// In-browser web-mock backend (. DESIGN-REVIEW / E2E ONLY.
// NOT a source of truth — the real app uses keylayout-core via Tauri. This is a
// thin functional stand-in so the whole UI runs via `pnpm dev` with no Rust.

import type {
  DocSummary,
  Issue,
  KeyView,
  KeyboardSnapshot,
  TemplateName,
} from "./types";
import { Mod } from "./types";

interface Cell {
  output?: string;
  actionId?: string;
}
interface When {
  state: string;
  output?: string;
  next?: string;
}
interface ModSelect {
  mapIndex: number;
  specs: string[];
}
interface LayoutEntry {
  first: number;
  last: number;
  modifiers?: string;
  mapSet?: string;
}
interface MockKb {
  name: string;
  group: number;
  id: number;
  layers: Record<number, Record<number, Cell>>;
  actions: Record<string, When[]>;
  terminators: When[];
  /** Imported modifier map (from a real .keylayout). When present, mask→index
   *  resolution honors it instead of the fixed basic map. */
  selects?: ModSelect[];
  defaultIndex?: number;
  /** Imported keyMapSet id — round-tripped on web Save so a non-ANSI layout
   *  isn't rewritten to "ANSI". Undefined for fresh docs (falls back). */
  keyMapSetId?: string;
  /** Imported modifierMap id — round-tripped on web Save. */
  modifierMapId?: string;
  /** Imported <layouts> entries — round-tripped on web Save so device/range
   *  bindings aren't clobbered to first=0 last=17. */
  layouts?: LayoutEntry[];
}
interface MockDoc {
  id: number;
  name: string;
  path: string | null;
  isBundle: boolean;
  keyboards: MockKb[];
  dirty: boolean;
  /** Serialized keyboard at last save/open; dirty = current differs from this. */
  savedSnap: string;
  undo: string[];
  redo: string[];
  lastAction: string | null;
}

const US_BASE: Array<[number, string]> = [
  [0, "a"], [1, "s"], [2, "d"], [3, "f"], [4, "h"], [5, "g"], [6, "z"], [7, "x"],
  [8, "c"], [9, "v"], [11, "b"], [12, "q"], [13, "w"], [14, "e"], [15, "r"],
  [16, "y"], [17, "t"], [18, "1"], [19, "2"], [20, "3"], [21, "4"], [22, "6"],
  [23, "5"], [24, "="], [25, "9"], [26, "7"], [27, "-"], [28, "8"], [29, "0"],
  [30, "]"], [31, "o"], [32, "u"], [33, "["], [34, "i"], [35, "p"], [37, "l"],
  [38, "j"], [39, "'"], [40, "k"], [41, ";"], [42, "\\"], [43, ","], [44, "/"],
  [45, "n"], [46, "m"], [47, "."], [49, " "], [50, "`"],
];
const US_SHIFT: Array<[number, string]> = [
  [0, "A"], [1, "S"], [2, "D"], [3, "F"], [4, "H"], [5, "G"], [6, "Z"], [7, "X"],
  [8, "C"], [9, "V"], [11, "B"], [12, "Q"], [13, "W"], [14, "E"], [15, "R"],
  [16, "Y"], [17, "T"], [18, "!"], [19, "@"], [20, "#"], [21, "$"], [22, "^"],
  [23, "%"], [24, "+"], [25, "("], [26, "&"], [27, "_"], [28, "*"], [29, ")"],
  [30, "}"], [31, "O"], [32, "U"], [33, "{"], [34, "I"], [35, "P"], [37, "L"],
  [38, "J"], [39, '"'], [40, "K"], [41, ":"], [42, "|"], [43, "<"], [44, "?"],
  [45, "N"], [46, "M"], [47, ">"], [49, " "], [50, "~"],
];
const SPECIAL: Array<[number, number]> = [
  [36, 0x0d], [48, 0x09], [53, 0x1b], [51, 0x08], [117, 0x7f], [76, 0x03],
];

function tableToLayer(t: Array<[number, string]>): Record<number, Cell> {
  const o: Record<number, Cell> = {};
  for (const [c, out] of t) o[c] = { output: out };
  return o;
}

function newKeyboard(name: string, prefill: boolean): MockKb {
  const base = prefill ? tableToLayer(US_BASE) : {};
  if (prefill) for (const [c, cp] of SPECIAL) base[c] = { output: String.fromCodePoint(cp) };
  const layers: Record<number, Record<number, Cell>> = { 0: base };
  if (prefill) layers[1] = tableToLayer(US_SHIFT);
  for (const i of [2, 3, 4, 5]) if (!layers[i]) layers[i] = {};
  return {
    name,
    group: 0,
    id: -(15000 + Math.floor(Math.random() * 1000)),
    layers,
    actions: {},
    terminators: [],
  };
}

// Apple's `.keylayout` files declare `<?xml version="1.1" ?>` and routinely
// encode C0 control codes (Backspace U+0008, Escape U+001B, F-key sentinels,
// …) as `&#x000N;` char refs. Browser DOMParser implementations (libxml2,
// MSXML, Blink) reject XML 1.1 outright AND refuse the bare C0 char refs in
// 1.0 — so the file the desktop build saves can't be reopened in the hosted
// web build, and Apple-format files dragged into the browser fail silently.
//
// Normalise before parsing: rewrite the version declaration to 1.0, and swap
// every forbidden-in-1.0 control char ref to a Unicode Private Use Area
// sentinel (`U+E0NN` for code point `U+00NN`). DOMParser accepts the PUA
// chars fine in attribute values; `decodeXmlOutput` swaps them back to the
// real C0/C1 code points after extraction, so round-trips through the
// browser preserve the exact same XML output as the desktop build.
function normalizeForBrowserParser(xml: string): string {
  let out = xml.replace(/<\?xml\s+version\s*=\s*"1\.1"/i, '<?xml version="1.0"');
  out = out.replace(/&#x00([0-9a-f]{2});/gi, (m, hex: string) => {
    const cp = parseInt(hex, 16);
    // XML 1.0 allows tab/LF/CR + everything from U+0020 except U+007F.
    if (cp === 0x09 || cp === 0x0a || cp === 0x0d) return m;
    if (cp >= 0x20 && cp !== 0x7f) return m;
    return String.fromCharCode(0xe000 + cp);
  });
  return out;
}

// Best-effort import of a real .keylayout into the mock model, using the
// browser's DOMParser. Web-only (DOMParser is a browser global). Honors the
// file's keyMapSet layers, modifierMap, actions and terminators so an opened
// layout actually renders — not a perfect parser, but functional for editing
// and re-export in the browser preview.
function importKeylayout(xml: string): MockKb | null {
  if (typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(normalizeForBrowserParser(xml), "application/xml");
  const kbEl = doc.querySelector("keyboard");
  if (!kbEl || doc.querySelector("parsererror")) return null;

  const layers: Record<number, Record<number, Cell>> = {};
  doc.querySelectorAll("keyMapSet > keyMap").forEach((km) => {
    // A keyMap with no/invalid index attr is malformed — skip it rather than
    // silently folding it into layer 0 (Number(null) === 0).
    const indexAttr = km.getAttribute("index");
    if (indexAttr == null) return;
    const index = Number(indexAttr);
    if (!Number.isInteger(index) || index < 0) return;
    const layer = (layers[index] ??= {});
    km.querySelectorAll("key").forEach((k) => {
      const codeAttr = k.getAttribute("code");
      if (codeAttr == null) return;
      const code = Number(codeAttr);
      if (!Number.isInteger(code) || code < 0) return;
      // Sentinel 512 is the dummy key that keeps an empty <keyMap> DTD-valid
      // (see the serializer); never import it into the model.
      if (code === 512) return;
      const action = k.getAttribute("action");
      const output = k.getAttribute("output");
      layer[code] = action != null ? { actionId: action } : { output: decodeXmlOutput(output ?? "") };
    });
  });

  const selects: ModSelect[] = [];
  const modMap = doc.querySelector("modifierMap");
  modMap?.querySelectorAll("keyMapSelect").forEach((sel) => {
    const miAttr = sel.getAttribute("mapIndex");
    if (miAttr == null) return;
    const mapIndex = Number(miAttr);
    if (!Number.isInteger(mapIndex) || mapIndex < 0) return;
    const specs = [...sel.querySelectorAll("modifier")].map((m) => m.getAttribute("keys") ?? "");
    selects.push({ mapIndex, specs });
  });
  const diAttr = modMap?.getAttribute("defaultIndex");
  const defaultIndex = diAttr != null && Number.isInteger(Number(diAttr)) ? Number(diAttr) : 0;

  // Round-trip the layout bindings and container ids so web Save doesn't
  // rewrite an imported non-ANSI layout to the default ANSI/Modifiers/0..17.
  const keyMapSetId = doc.querySelector("keyMapSet")?.getAttribute("id") ?? undefined;
  const modifierMapId = modMap?.getAttribute("id") ?? undefined;
  const layouts: LayoutEntry[] = [];
  doc.querySelectorAll("layouts > layout").forEach((l) => {
    const first = Number(l.getAttribute("first") ?? "");
    const last = Number(l.getAttribute("last") ?? "");
    layouts.push({
      first: Number.isInteger(first) ? first : 0,
      last: Number.isInteger(last) ? last : 0,
      modifiers: l.getAttribute("modifiers") ?? undefined,
      mapSet: l.getAttribute("mapSet") ?? undefined,
    });
  });

  const actions: Record<string, When[]> = {};
  doc.querySelectorAll("actions > action").forEach((a) => {
    const id = a.getAttribute("id");
    if (!id) return;
    actions[id] = [...a.querySelectorAll("when")].map((w) => ({
      state: w.getAttribute("state") ?? "none",
      next: w.getAttribute("next") ?? undefined,
      output: w.getAttribute("output") != null ? decodeXmlOutput(w.getAttribute("output")!) : undefined,
    }));
  });

  const terminators: When[] = [...doc.querySelectorAll("terminators > when")].map((w) => ({
    state: w.getAttribute("state") ?? "none",
    output: w.getAttribute("output") != null ? decodeXmlOutput(w.getAttribute("output")!) : undefined,
  }));

  if (Object.keys(layers).length === 0) return null;
  return {
    name: kbEl.getAttribute("name") || "Imported",
    group: Number(kbEl.getAttribute("group") ?? "0"),
    id: Number(kbEl.getAttribute("id") ?? "-15000"),
    layers,
    actions,
    terminators,
    selects: selects.length ? selects : undefined,
    defaultIndex,
    keyMapSetId,
    modifierMapId,
    layouts: layouts.length ? layouts : undefined,
  };
}

// Decode the few numeric/hex char refs Apple uses in output attributes.
function decodeXmlOutput(s: string): string {
  // Swap PUA sentinels (planted by normalizeForBrowserParser) back to the
  // real C0/C1 control codes the source `.keylayout` encoded as `&#x00NN;`.
  const unsentinel = s.replace(/[\uE000-\uE0FF]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xe000),
  );
  return unsentinel.replace(/&#x([0-9A-Fa-f]+);|&#(\d+);/g, (_, hex, dec) =>
    String.fromCodePoint(parseInt(hex ?? dec, hex ? 16 : 10)),
  );
}

// mask → modifier index, mirroring the basic modifier map.
function resolveIndex(mask: number): number {
  const shift = (mask & (Mod.ShiftL | Mod.ShiftR)) !== 0;
  const option = (mask & (Mod.OptionL | Mod.OptionR)) !== 0;
  const caps = (mask & Mod.Caps) !== 0;
  const command = (mask & Mod.Command) !== 0;
  if (command) return 5;
  if (shift && option) return 4;
  if (option) return 3;
  if (shift) return 1; // anyShift caps?
  if (caps) return 2;
  return 0;
}
function maskCovered(mask: number): boolean {
  // command-only and the basic combos are covered; control combos are not.
  if (mask & (Mod.ControlL | Mod.ControlR)) return false;
  return true;
}

// Which modifier classes a mask has pressed.
function maskClasses(mask: number) {
  return {
    shift: (mask & (Mod.ShiftL | Mod.ShiftR)) !== 0,
    option: (mask & (Mod.OptionL | Mod.OptionR)) !== 0,
    control: (mask & (Mod.ControlL | Mod.ControlR)) !== 0,
    command: (mask & Mod.Command) !== 0,
    caps: (mask & Mod.Caps) !== 0,
  };
}
type ModClass = keyof ReturnType<typeof maskClasses>;
function tokenClass(tok: string): ModClass | null {
  const t = tok.toLowerCase();
  if (t.includes("shift")) return "shift";
  if (t.includes("option")) return "option";
  if (t.includes("control")) return "control";
  if (t.includes("command")) return "command";
  if (t.includes("caps")) return "caps";
  return null;
}
// Mirror of core spec_matches: a class not in the spec must be ABSENT; a bare
// token requires it; a `?` token makes it optional.
function specMatches(spec: string, mask: number): boolean {
  const required: Partial<Record<ModClass, boolean>> = {};
  const optional: Partial<Record<ModClass, boolean>> = {};
  for (const tok of spec.trim().split(/\s+/).filter(Boolean)) {
    const cls = tokenClass(tok);
    if (!cls) continue;
    if (tok.endsWith("?")) optional[cls] = true;
    else required[cls] = true;
  }
  const have = maskClasses(mask);
  for (const cls of ["shift", "option", "control", "command", "caps"] as ModClass[]) {
    if (required[cls] && !have[cls]) return false;
    if (!required[cls] && !optional[cls] && have[cls]) return false;
  }
  return true;
}
// Resolve mask → keymap index honoring an imported modifier map when present.
function resolveIndexFor(kb: MockKb, mask: number): number {
  if (!kb.selects || kb.selects.length === 0) return resolveIndex(mask);
  for (const sel of kb.selects) {
    if (sel.specs.some((s) => specMatches(s, mask))) return sel.mapIndex;
  }
  return kb.defaultIndex ?? 0;
}

function terminatorOutput(kb: MockKb, state: string): string | undefined {
  return kb.terminators.find((w) => w.state === state)?.output;
}

function resolveCell(kb: MockKb, index: number, code: number): { cell: Cell; inherited: boolean } | null {
  const layer = kb.layers[index];
  if (layer && layer[code]) return { cell: layer[code], inherited: false };
  if (index !== 0 && kb.layers[0] && kb.layers[0][code]) return { cell: kb.layers[0][code], inherited: true };
  return null;
}

function keyView(kb: MockKb, index: number, code: number, deadState: string): KeyView {
  const view: KeyView = {
    code,
    output: null,
    is_dead: false,
    action_id: null,
    display: "",
    code_points: [],
    inherited: false,
  };
  const r = resolveCell(kb, index, code);
  if (r) {
    view.inherited = r.inherited;
    if (r.cell.actionId) {
      view.action_id = r.cell.actionId;
      const whens = kb.actions[r.cell.actionId] ?? [];
      const w = whens.find((x) => x.state === deadState);
      if (w) {
        if (w.output) {
          view.output = w.output;
          view.display = w.output;
        }
        if (w.next) {
          view.is_dead = true;
          if (!view.output) {
            const term = terminatorOutput(kb, w.next);
            if (term) view.display = term;
          }
        }
      }
    } else if (r.cell.output !== undefined) {
      view.output = r.cell.output;
      view.display = r.cell.output;
    }
  }
  view.code_points = [...(view.output ?? "")].map((c) => c.codePointAt(0)!);
  return view;
}

function statesOf(kb: MockKb): string[] {
  const s = new Set<string>(["none"]);
  for (const whens of Object.values(kb.actions))
    for (const w of whens) {
      s.add(w.state);
      if (w.next) s.add(w.next);
    }
  for (const w of kb.terminators) s.add(w.state);
  return [...s].sort();
}

function snapshot(kb: MockKb, mask: number, deadState: string): KeyboardSnapshot {
  const index = resolveIndexFor(kb, mask);
  const keys: KeyView[] = [];
  for (let code = 0; code <= 127; code++) keys.push(keyView(kb, index, code, deadState));
  const avail = kb.selects
    ? [...new Set(kb.selects.map((s) => s.mapIndex))].sort((a, b) => a - b)
    : [0, 1, 2, 3, 4, 5];
  return {
    keyboard_name: kb.name,
    modifier_index: index,
    dead_state: deadState,
    keys,
    available_modifier_indices: avail,
    dead_states: statesOf(kb),
    mask_covered: kb.selects ? true : maskCovered(mask),
  };
}

export class MockBackend {
  private docs = new Map<number, MockDoc>();
  private nextId = 1;

  private snap(kb: MockKb): string {
    return JSON.stringify(kb);
  }
  private pushUndo(doc: MockDoc, action: string) {
    doc.undo.push(this.snap(doc.keyboards[0]));
    doc.redo = [];
    doc.dirty = true;
    doc.lastAction = action;
  }

  private summary(doc: MockDoc): DocSummary {
    return {
      id: doc.id,
      name: doc.name,
      path: doc.path,
      is_bundle: doc.isBundle,
      keyboard_names: doc.keyboards.map((k) => k.name),
      dirty: doc.dirty,
    };
  }

  newDocument(template: TemplateName, name: string): DocSummary {
    const id = this.nextId++;
    const kb = newKeyboard(name, template !== "basic");
    const doc: MockDoc = {
      id,
      name,
      path: null,
      isBundle: false,
      keyboards: [kb],
      dirty: false,
      savedSnap: this.snap(kb),
      undo: [],
      redo: [],
      lastAction: null,
    };
    this.docs.set(id, doc);
    return this.summary(doc);
  }

  /** Open a real .keylayout in the browser (best-effort DOMParser import).
   *  Falls back to a Standard template named after the file if parsing fails. */
  openKeylayout(xml: string, fallbackName: string): DocSummary {
    const kb = importKeylayout(xml);
    if (!kb) return this.newDocument("standard", fallbackName);
    const id = this.nextId++;
    const doc: MockDoc = {
      id,
      name: kb.name,
      path: null,
      isBundle: false,
      keyboards: [kb],
      dirty: false,
      savedSnap: this.snap(kb),
      undo: [],
      redo: [],
      lastAction: null,
    };
    this.docs.set(id, doc);
    return this.summary(doc);
  }

  listDocuments(): DocSummary[] {
    return [...this.docs.values()].map((d) => this.summary(d));
  }
  closeDocument(id: number) {
    this.docs.delete(id);
  }
  rename(id: number, kbIndex: number, name: string): DocSummary {
    const doc = this.doc(id);
    this.pushUndo(doc, "Rename");
    doc.keyboards[kbIndex].name = name;
    doc.name = doc.keyboards[0].name;
    return this.summary(doc);
  }
  duplicate(id: number): DocSummary {
    const src = this.doc(id);
    const newId = this.nextId++;
    const kbs: MockKb[] = JSON.parse(JSON.stringify(src.keyboards));
    for (const kb of kbs) {
      kb.name = `${kb.name} copy`;
      kb.id = -(15000 + Math.floor(Math.random() * 1000));
    }
    const doc: MockDoc = {
      id: newId,
      name: kbs[0].name,
      path: null,
      isBundle: src.isBundle,
      keyboards: kbs,
      dirty: false,
      savedSnap: this.snap(kbs[0]),
      undo: [],
      redo: [],
      lastAction: null,
    };
    this.docs.set(newId, doc);
    return this.summary(doc);
  }

  private kb(id: number, kbIndex: number): MockKb {
    const doc = this.docs.get(id);
    if (!doc) throw new Error(`no document ${id}`);
    const kb = doc.keyboards[kbIndex];
    if (!kb) throw new Error("keyboard index out of range");
    return kb;
  }
  private doc(id: number): MockDoc {
    const doc = this.docs.get(id);
    if (!doc) throw new Error(`no document ${id}`);
    return doc;
  }

  getSnapshot(id: number, kbIndex: number, _type: number, mask: number, deadState: string): KeyboardSnapshot {
    return snapshot(this.kb(id, kbIndex), mask, deadState);
  }

  setKeyOutput(id: number, kbIndex: number, _type: number, mask: number, deadState: string, code: number, output: string): KeyboardSnapshot {
    if (deadState !== "none") throw new Error("Switch the dead state back to ‘none’ before editing a key");
    const doc = this.doc(id);
    this.pushUndo(doc, "Change output");
    const kb = this.kb(id, kbIndex);
    const index = resolveIndexFor(kb, mask);
    (kb.layers[index] ??= {})[code] = { output };
    return snapshot(kb, mask, deadState);
  }

  clearKey(id: number, kbIndex: number, _type: number, mask: number, deadState: string, code: number): KeyboardSnapshot {
    if (deadState !== "none") throw new Error("Switch the dead state back to ‘none’ before clearing a key");
    const doc = this.doc(id);
    this.pushUndo(doc, "Clear key");
    const kb = this.kb(id, kbIndex);
    const index = resolveIndexFor(kb, mask);
    if (kb.layers[index]) delete kb.layers[index][code];
    return snapshot(kb, mask, deadState);
  }

  makeKeyDead(id: number, kbIndex: number, _type: number, mask: number, code: number, nextState: string, terminator: string): KeyboardSnapshot {
    const doc = this.doc(id);
    this.pushUndo(doc, "Make dead key");
    const kb = this.kb(id, kbIndex);
    const index = resolveIndexFor(kb, mask);
    const actionId = `dead-${nextState}`;
    if (!kb.actions[actionId]) kb.actions[actionId] = [{ state: "none", next: nextState }];
    if (!kb.terminators.some((w) => w.state === nextState))
      kb.terminators.push({ state: nextState, output: terminator });
    (kb.layers[index] ??= {})[code] = { actionId };
    return snapshot(kb, mask, "none");
  }

  swapKeys(id: number, kbIndex: number, _type: number, mask: number, deadState: string, a: number, b: number): KeyboardSnapshot {
    const doc = this.doc(id);
    this.pushUndo(doc, "Swap keys");
    const kb = this.kb(id, kbIndex);
    const index = resolveIndexFor(kb, mask);
    const layer = (kb.layers[index] ??= {});
    const av = layer[a];
    const bv = layer[b];
    if (bv) layer[a] = bv; else delete layer[a];
    if (av) layer[b] = av; else delete layer[b];
    return snapshot(kb, mask, deadState);
  }

  unlinkKey(id: number, kbIndex: number, _type: number, mask: number, deadState: string, code: number): KeyboardSnapshot {
    const doc = this.doc(id);
    this.pushUndo(doc, "Unlink key");
    const kb = this.kb(id, kbIndex);
    const index = resolveIndexFor(kb, mask);
    const r = resolveCell(kb, index, code);
    if (r) (kb.layers[index] ??= {})[code] = { ...r.cell };
    return snapshot(kb, mask, deadState);
  }

  relinkKey(id: number, kbIndex: number, _type: number, mask: number, deadState: string, code: number): KeyboardSnapshot {
    const doc = this.doc(id);
    this.pushUndo(doc, "Relink key");
    const kb = this.kb(id, kbIndex);
    const index = resolveIndexFor(kb, mask);
    // drop the local override so the key inherits from the base map (layer 0)
    if (index !== 0 && kb.layers[index]?.[code]) delete kb.layers[index][code];
    return snapshot(kb, mask, deadState);
  }

  undo(id: number) {
    const doc = this.doc(id);
    const prev = doc.undo.pop();
    if (prev) {
      doc.redo.push(this.snap(doc.keyboards[0]));
      doc.keyboards[0] = JSON.parse(prev);
      doc.dirty = this.snap(doc.keyboards[0]) !== doc.savedSnap;
    }
  }
  redo(id: number) {
    const doc = this.doc(id);
    const next = doc.redo.pop();
    if (next) {
      doc.undo.push(this.snap(doc.keyboards[0]));
      doc.keyboards[0] = JSON.parse(next);
      doc.dirty = this.snap(doc.keyboards[0]) !== doc.savedSnap;
    }
  }
  undoLabel(id: number): string | null {
    return this.doc(id).lastAction;
  }

  validate(id: number, kbIndex: number): Issue[] {
    const kb = this.kb(id, kbIndex);
    const issues: Issue[] = [];
    const hasSpecial = SPECIAL.every(([c]) => kb.layers[0]?.[c]);
    if (!hasSpecial)
      issues.push({ severity: "Warning", code: "MissingSpecialKeyOutput", message: "absolute base map missing special-key output", auto_fixable: true });
    return issues;
  }

  repair(id: number, kbIndex: number): string[] {
    const doc = this.doc(id);
    this.pushUndo(doc, "Repair");
    const kb = this.kb(id, kbIndex);
    const fixed: string[] = [];
    for (const [c, cp] of SPECIAL)
      if (!kb.layers[0][c]) {
        kb.layers[0][c] = { output: String.fromCodePoint(cp) };
        if (!fixed.includes("MissingSpecialKeyOutput")) fixed.push("MissingSpecialKeyOutput");
      }
    return fixed;
  }

  modifierMapView() {
    // mirrors the basic modifier map the mock keyboards use
    return [
      { map_index: 0, specs: [""] },
      { map_index: 1, specs: ["anyShift caps?"] },
      { map_index: 2, specs: ["caps"] },
      { map_index: 3, specs: ["anyOption"] },
      { map_index: 4, specs: ["anyShift anyOption"] },
      { map_index: 5, specs: ["command"] },
    ];
  }

  actionsView(id: number, kbIndex: number) {
    const kb = this.kb(id, kbIndex);
    const toWhen = (w: When) => ({
      state: w.state,
      output: w.output ?? null,
      next: w.next ?? null,
      through: null,
      multiplier: null,
    });
    return {
      actions: Object.entries(kb.actions).map(([idr, whens]) => ({
        id: idr,
        whens: whens.map(toWhen),
      })),
      terminators: kb.terminators.map(toWhen),
      states: statesOf(kb),
    };
  }
  setTerminator(id: number, kbIndex: number, state: string, output: string) {
    const doc = this.doc(id);
    this.pushUndo(doc, "Set terminator");
    const kb = this.kb(id, kbIndex);
    const t = kb.terminators.find((w) => w.state === state);
    if (t) t.output = output;
    else kb.terminators.push({ state, output });
  }
  removeUnusedStates(id: number, kbIndex: number): number {
    const doc = this.doc(id);
    this.pushUndo(doc, "Remove unused states");
    const kb = this.kb(id, kbIndex);
    const reachable = new Set<string>(["none"]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const whens of Object.values(kb.actions))
        for (const w of whens)
          if (reachable.has(w.state) && w.next && !reachable.has(w.next)) {
            reachable.add(w.next);
            changed = true;
          }
    }
    let removed = 0;
    for (const id2 of Object.keys(kb.actions)) {
      const before = kb.actions[id2].length;
      kb.actions[id2] = kb.actions[id2].filter((w) => reachable.has(w.state));
      removed += before - kb.actions[id2].length;
    }
    const tb = kb.terminators.length;
    kb.terminators = kb.terminators.filter((w) => reachable.has(w.state));
    removed += tb - kb.terminators.length;
    return removed;
  }
  removeUnusedActions(id: number, kbIndex: number): number {
    const doc = this.doc(id);
    this.pushUndo(doc, "Remove unused actions");
    const kb = this.kb(id, kbIndex);
    const referenced = new Set<string>();
    for (const layer of Object.values(kb.layers))
      for (const cell of Object.values(layer)) if (cell.actionId) referenced.add(cell.actionId);
    let removed = 0;
    for (const id2 of Object.keys(kb.actions))
      if (!referenced.has(id2)) {
        delete kb.actions[id2];
        removed++;
      }
    return removed;
  }
  addSpecialKeys(id: number, kbIndex: number): number {
    const doc = this.doc(id);
    this.pushUndo(doc, "Add special key output");
    const kb = this.kb(id, kbIndex);
    let added = 0;
    for (const [c, cp] of SPECIAL)
      if (!kb.layers[0][c]) {
        kb.layers[0][c] = { output: String.fromCodePoint(cp) };
        added++;
      }
    return added;
  }

  getXml(id: number, kbIndex: number, codeNonAscii: boolean): string {
    const kb = this.kb(id, kbIndex);
    const enc = (s: string) =>
      [...s]
        .map((ch) => {
          const cp = ch.codePointAt(0)!;
          const must = "&<>\"'".includes(ch) || cp <= 0x1f || cp === 0x7f || (cp >= 0x80 && cp <= 0x9f);
          if (must || (codeNonAscii && cp > 0x7f)) return `&#x${cp.toString(16).toUpperCase().padStart(4, "0")};`;
          return ch;
        })
        .join("");
    // maxout counts UTF-16 code units (macOS sizes its output buffer in UTF-16),
    // across key, action and terminator outputs.
    let maxout = 1;
    const consider = (s: string | undefined) => { if (s) maxout = Math.max(maxout, s.length); };
    for (const layer of Object.values(kb.layers))
      for (const cell of Object.values(layer)) consider(cell.output);
    for (const whens of Object.values(kb.actions)) for (const w of whens) consider(w.output);
    for (const w of kb.terminators) consider(w.output);

    // Round-trip the imported container ids / layout bindings / modifier map so
    // an opened non-ANSI layout isn't rewritten to the ANSI default on Save.
    const mapSetId = kb.keyMapSetId ?? "ANSI";
    const modMapId = kb.modifierMapId ?? "Modifiers";
    let xml = `<?xml version="1.1" encoding="UTF-8"?>\n`;
    xml += `<!DOCTYPE keyboard PUBLIC "-//Apple//DTD Keyboard Layout//EN"\n  "file://localhost/System/Library/DTDs/KeyboardLayout.dtd">\n`;
    xml += `<keyboard group="${kb.group}" id="${kb.id}" name="${enc(kb.name)}" maxout="${maxout}">\n`;
    xml += `  <layouts>\n`;
    if (kb.layouts && kb.layouts.length) {
      for (const l of kb.layouts)
        xml += `    <layout first="${l.first}" last="${l.last}" modifiers="${enc(l.modifiers ?? modMapId)}" mapSet="${enc(l.mapSet ?? mapSetId)}"/>\n`;
    } else {
      xml += `    <layout first="0" last="17" modifiers="${enc(modMapId)}" mapSet="${enc(mapSetId)}"/>\n`;
    }
    xml += `  </layouts>\n`;
    xml += `  <modifierMap id="${enc(modMapId)}" defaultIndex="${kb.defaultIndex ?? 0}">\n`;
    if (kb.selects && kb.selects.length) {
      for (const sel of kb.selects) {
        xml += `    <keyMapSelect mapIndex="${sel.mapIndex}">\n`;
        for (const spec of sel.specs) xml += `      <modifier keys="${enc(spec)}"/>\n`;
        xml += `    </keyMapSelect>\n`;
      }
    } else {
      const sels = ["", "anyShift caps?", "caps", "anyOption", "anyShift anyOption", "command"];
      sels.forEach((k, i) => (xml += `    <keyMapSelect mapIndex="${i}"><modifier keys="${k}"/></keyMapSelect>\n`));
    }
    xml += `  </modifierMap>\n  <keyMapSet id="${enc(mapSetId)}">\n`;
    for (const idx of Object.keys(kb.layers).map(Number).sort((x, y) => x - y)) {
      const layer = kb.layers[idx];
      const codes = Object.keys(layer).map(Number).sort((x, y) => x - y);
      if (codes.length === 0 && idx !== 0) continue;
      xml += `    <keyMap index="${idx}">\n`;
      // DTD requires `keyMap (key+)` — emit the dummy sentinel for an empty map.
      if (codes.length === 0) xml += `      <key code="512" output=""/>\n`;
      for (const c of codes) {
        const cell = layer[c];
        if (cell.actionId) xml += `      <key code="${c}" action="${cell.actionId}"/>\n`;
        else xml += `      <key code="${c}" output="${enc(cell.output ?? "")}"/>\n`;
      }
      xml += `    </keyMap>\n`;
    }
    xml += `  </keyMapSet>\n`;
    const actIds = Object.keys(kb.actions);
    if (actIds.length) {
      xml += `  <actions>\n`;
      for (const aid of actIds) {
        xml += `    <action id="${aid}">\n`;
        // The `state="none"` when must come first (synthesize if absent) —
        // matches the Rust core + core output.
        const whens = kb.actions[aid];
        if (!whens.some((w) => w.state === "none")) xml += `      <when state="none"/>\n`;
        for (const w of [...whens].sort((a, b) => (a.state === "none" ? -1 : b.state === "none" ? 1 : 0))) {
          xml += `      <when state="${w.state}"`;
          if (w.output) xml += ` output="${enc(w.output)}"`;
          if (w.next) xml += ` next="${w.next}"`;
          xml += `/>\n`;
        }
        xml += `    </action>\n`;
      }
      xml += `  </actions>\n`;
    }
    if (kb.terminators.length) {
      xml += `  <terminators>\n`;
      for (const w of kb.terminators) xml += `    <when state="${w.state}" output="${enc(w.output ?? "")}"/>\n`;
      xml += `  </terminators>\n`;
    }
    xml += `</keyboard>\n`;
    return xml;
  }

  saveFile(id: number, _kbIndex: number, path: string): void {
    const doc = this.doc(id);
    doc.path = path;
    doc.savedSnap = this.snap(doc.keyboards[0]);
    doc.dirty = false;
  }
}
