# 05 — Architecture

## Big picture

```
┌─────────────────────────────────────────────┐
│ Frontend (React/TS, runs in WebView)          │
│  pages → features → components/ui             │
│  zustand stores (UI/selection/interaction)    │
│  lib/ipc.ts  ── typed invoke() ──┐            │
└──────────────────────────────────┼───────────┘
                                    │ Tauri IPC (JSON)
┌──────────────────────────────────▼───────────┐
│ src-tauri (thin shell)                         │
│  commands.rs: open/save/edit/query → core      │
│  holds in-memory Document state (Mutex)        │
└──────────────────────────────────┬───────────┘
                                    │ plain Rust calls
┌──────────────────────────────────▼───────────┐
│ keylayout-core (pure lib, no Tauri)            │
│  model · parse · serialize · bundle ·          │
│  modifiers · validate                          │
└────────────────────────────────────────────────┘
```

## Where logic lives

- **keylayout-core** owns the *truth*: parse `.keylayout`/`.bundle` → model, mutate model, serialize back, expand modifier tokens → tables, validate. No UI, no Tauri, no I/O beyond pure functions (file reading done by caller passing bytes/paths). 100% unit-testable.
- **src-tauri** holds the *session*: the open `Document`(s) in a `Mutex<AppState>`, maps frontend commands to core operations, does filesystem + dialogs. Thin — no business logic.
- **frontend** owns *presentation + interaction*: renders keyboard from a serialized view-model, dispatches edit commands, manages transient UI state (which key selected, which modifiers toggled, current dead-key state, active interaction mode).

## State ownership rule

**The Rust side owns the document model. The frontend never holds the authoritative model** — it holds a *view-model snapshot* + UI state. Every edit is a command to core; core returns the updated snapshot (or a patch). This mirrors Ukelele's ObjC↔C++ split and keeps undo/validation centralized.

### View-model snapshot

Frontend doesn't need the whole C++-style tree. Core computes a flat, render-ready snapshot for the current (keyboardId, modifierIndex, deadState):

```ts
type KeyView = {
  code: number;
  output: string | null;     // resolved literal, or null
  isDead: boolean;
  actionId: string | null;
  display: string;           // glyph/legend to draw
  codePoints: number[];      // for chip display
};
type KeyboardSnapshot = {
  keyboardName: string;
  modifierIndex: number;
  deadState: string;          // "none" or a state name
  keys: KeyView[];            // by code
  availableModifierIndices: number[];
  deadStates: string[];
};
```

Frontend asks: `get_snapshot({ modifierMask, deadState })`. Core resolves modifier mask → modifier index → keymap → per-key output (following base-map inheritance + action/state lookup). This keeps all the gnarly resolution logic in Rust.

## Undo/redo

Centralized in core (or src-tauri layer): keep an `undo: Vec<Document>` / command-log. Frontend calls `undo()`/`redo()`. Simplest robust v1: snapshot-based (clone Document on each mutating command — documents are small). Optimize to command-diff later if needed.

## Edit command flow (example: change a key's output)

```
user double-clicks key 0 in current state
  → frontend opens KeyEditor (interaction mode = "editKey")
  → user types "ä", confirms
  → ipc.invoke("set_key_output", { code:0, modifierIndex, deadState, output:"ä" })
  → src-tauri: lock state, call core::set_key_output(...), push undo
  → core mutates model, returns new KeyboardSnapshot
  → frontend updates store → keyboard re-renders
```

## Interaction modes (replaces Ukelele's interaction-handler objects)

A single `interactionMode` enum in the frontend store, one active at a time:
`idle | editKey | createDeadKey | unlinkKey | swapKeys | importDeadKey | dragText | selectKeyForX`.

Each mode defines: how a key click is interpreted, what overlay/cursor shows, and the completion action. Centralizing prevents the "two dialogs fighting over a click" bug. Mirrors Ukelele's "one active handler" rule.

## Multi-document / multi-window

- Each open file = one `Document` in core/session, addressed by `docId`.
- Tauri supports multiple windows; v1 can be single-window with a document tab bar (simpler) and add real multi-window later. Bundle with N layouts = one Document holding N keyboards; switch active keyboard in-window.

## Commands surface (initial)

```
open_file(path) -> DocSummary
save_file(docId, path?, format) -> ()
new_document(template) -> DocSummary
get_snapshot(docId, keyboardId, modifierMask, deadState) -> KeyboardSnapshot
set_key_output(docId, kbId, code, modIndex, deadState, output) -> KeyboardSnapshot
make_key_dead(docId, kbId, code, modIndex, stateName) -> KeyboardSnapshot
set_action_when(docId, actionId, state, output?, next?) -> ()
add_state / remove_state / set_terminator(...)
swap_keys(docId, kbId, codeA, codeB) -> KeyboardSnapshot
list_modifier_maps(docId, kbId) -> [...]; edit_modifier_map(...)
get_xml(docId, kbId, opts) -> String        // live preview
validate(docId) -> [Issue]
bundle_add_layout / bundle_remove_layout / set_bundle_meta(...)
undo(docId) / redo(docId) -> KeyboardSnapshot
```

All commands serialize via serde; `lib/ipc.ts` wraps each with types from `lib/types.ts`.

## Platform-specific behavior behind traits

`Installer` trait in core (or src-tauri): `install(bundle_or_layout) -> Result`. macOS impl copies to `~/Library/Keyboard Layouts/`. Other OSes: `Unsupported` + show instructions. Keeps the cross-platform promise clean.

## Testing strategy

- **core**: unit tests per module; snapshot (`insta`) round-trip tests with golden `.keylayout` files (include real Apple samples + tricky ones: ISO, JIS, dead keys, base-map inheritance, comments, astral output).
- **frontend**: vitest for store logic + snapshot resolution display; component tests for keyboard rendering.
- **integration**: a few Tauri command tests.
