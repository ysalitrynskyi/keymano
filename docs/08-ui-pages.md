# 08 — UI: Page-by-Page Plan

Desktop app, single window, document-tab model. Layout shell = top bar + optional left sidebar + main canvas + right inspector + bottom status. Built from shadcn/ui components, Tailwind. Dark/light themes.

## App shell

```
┌───────────────────────────────────────────────────────────────┐
│ TopBar: [Keymano] [New ▾] [Open] [Save] [Export ▾] | tabs: doc1 doc2 + │
├──────────┬──────────────────────────────────────┬─────────────┤
│ Sidebar  │  Main canvas (page content)           │  Inspector  │
│ (layouts │  e.g. interactive keyboard            │ (key/action │
│  in      │                                       │  details)   │
│  bundle) │                                       │             │
├──────────┴──────────────────────────────────────┴─────────────┤
│ StatusBar: layout name · modifiers active · dead state · zoom · validation badge │
└───────────────────────────────────────────────────────────────┘
```

Routing: lightweight (state-driven view switch, or `react-router` memory router). Pages below are *views*, not URLs necessarily.

---

## P1 — Welcome / Start

Shown when no document open.
- Big actions: **New blank layout**, **New from preset** (ANSI/ISO/JIS starter), **Open file…**, **Open recent** (list).
- (macOS only) **Import current system layout** (later phase, behind flag).
- Drag-drop a `.keylayout`/`.bundle` onto window to open.
- Footer: link to docs, version.

Components: shadcn `Card`, `Button`, recent-files `Command` list.

---

## P2 — Editor (the core page)

The heart. Active for a selected keyboard.

Regions:
1. **Modifier bar** (top of canvas): toggle chips Shift / Option / Control / Command / Caps (+ left/right split toggle for advanced). Active combo → core resolves map index → keyboard re-renders legends. Show resolved `mapIndex`.
2. **Dead-state selector**: dropdown of states (`none` + every action state). Selecting a state previews "what each key outputs while in this dead state". Default `none`.
3. **Interactive keyboard** (center): see [09](09-interactive-keyboard.md). Click selects; double-click edits.
4. **Keyboard-type switch**: ANSI / ISO / JIS segmented control → swaps geometry preset.
5. **Zoom**: slider/combo 50%–500% + "fit width".
6. **Toolbar**: tools that set interaction mode — Edit, Make Dead Key, Unlink/Relink, Swap, Import Dead Key, Add Comment. (Radix `ToggleGroup`.)
7. **Quick Entry Mode** (toggle): selected key listens for typed char → fills output → auto-advances to next key. Fast bulk authoring. ([12](12-edge-cases-and-parity.md) §7)
8. **Sticky Modifiers** (toggle): lock current modifier combo while editing many keys. ([12](12-edge-cases-and-parity.md) §7)
9. **Find / jump**: "Find key stroke" (search by output string) and "Select key by code" → selects + scrolls to key. (⌘F / ⌘L)

Inspector (right) shows selected key: code, current modifiers, current state, output (editable), isDead, action ref, comment, and whether value is inherited (fallback) from a base map.

Status bar: validation badge (click → P7 issues), unsaved-dot.

---

## P3 — Key Editor (popover + full dialog)

Two entry points:
- **Quick popover** (single source of edit for ordinary keys): anchored to the key. Field: output string (with a "insert special char" button → P-aux char palette). Buttons: Make Dead Key, Clear, More….
- **Full dialog** ("More…"): tabs:
  - **Output**: output string; live preview; encode-as-codepoint toggle (per-key override of global).
  - **Dead Key**: turn this key into a dead key → choose/create target state + terminator output.
  - **Action**: if key references a named action, jump to P5 for that action.

Validated with react-hook-form + zod (e.g. output length vs maxout, valid Unicode).

Components: shadcn `Popover`, `Dialog`, `Tabs`, `Input`, `Button`.

---

## P4 — Modifiers Editor

Manage modifier maps for the active keyboard.
- Table of `keyMapSelect` rows: mapIndex | modifier token chips | preview (which physical combos hit it).
- Add/remove select; edit tokens via a **token builder**: per modifier (Shift/Option/Control/Command/Caps, with any/left/right + optional `?`) pick state Required / Optional / Off. Live shows generated `keys="..."` string + count of physical combos covered.
- "Simplify" action (merge redundant), "Standard set" presets (the common 5–8 index setup).
- Warn on uncovered masks / overlaps.

Components: shadcn `Table`, `Badge`, `Select`, `Switch`, `Tooltip`.

---

## P5 — Dead Keys & Actions Editor

Visualize and edit the dead-key state machine.
- **State list** (left): all states; `none` pinned. Add/rename/delete state. Show terminator output per state (editable).
- **Action list / matrix** (center): for selected action (or "all"), a table: rows = states, columns = output / next. Edit `when` rows inline. Add/remove `when`.
- **FSM graph** (optional, nice): nodes = states, edges = transitions (key → next). Visual aid using a simple force/dagre layout. v1 can ship the table; graph later.
- Housekeeping buttons: Remove unused states, Remove unused actions.
- "Import dead key from another keyboard/bundle layout" → picker → maps states in.

Components: shadcn `Table`, `Tabs`, `ScrollArea`, virtualized list; optional graph via `@xyflow/react` (React Flow) later.

---

## P6 — Bundle Manager

Shown when document is a bundle (or to convert standalone → bundle).
- **Layouts list**: each bundled `.keylayout` (name, id, language, icon thumb). Add (new/import), remove, duplicate, reorder. Click → opens that layout in P2.
- **Bundle metadata**: identifier (`com.apple.keyboardlayout.X`), name, version, build/project/source version.
- **Localizations**: per-locale table mapping layout internal name → display name. Add locale (`en`, `fr`, `ja`…).
- **Icons**: assign `.icns`/PNG per layout (PNG→icns generation later).
- Convert standalone ⇄ bundle buttons.

Components: shadcn `Table`, `Dialog`, `Tabs`, `Input`, file pickers (Tauri dialog plugin).

---

## P7 — XML Preview & Validation

- Live, read-only XML of the active layout (core `get_xml`), syntax-highlighted (Shiki or Prism). Reflects encode options.
- Validation panel: list of `Issue`s (error/warning) with jump-to. Click issue → selects offending key/state in P2.
- Copy XML / Save As buttons.

Components: `ScrollArea`, code highlighter, `Alert`, `Badge`.

---

## P8 — Preferences

App + document defaults.
- **Appearance**: theme (light/dark/system), accent, key font, key color theme presets.
- **Editing defaults**: default keyboard type, default zoom, diacritic display, show code points.
- **XML output**: encode non-ASCII as code points (global default), include DTD/stylesheet PI, indentation.
- **Updates** (optional): check for updates (Tauri updater).
- Reset suppressed warnings.

Persisted via Tauri store / local config file. Components: shadcn `Tabs`, `Switch`, `Select`, `Slider`, color picker.

---

## P9 — Export / Install

- **Export**: `.keylayout` (standalone) or `.bundle` (folder or zipped). Choose path via Tauri dialog. Show post-export hint.
- **Install** (macOS only): copy to `~/Library/Keyboard Layouts/` (user) or instructions for `/Library/Keyboard Layouts/` (all users, needs admin). Then "log out/in or re-add in System Settings → Keyboard → Input Sources".
- **Organiser** (macOS only): list installed layouts (user + all-users), install/uninstall, fs-watch for live refresh ([12](12-edge-cases-and-parity.md) §7).
- **Print / reference sheet**: export PDF/PNG of the keyboard across all (or chosen) modifier combos × dead-key states, monochrome theme, paginated ([12](12-edge-cases-and-parity.md) §9). Reuses SVG render ([09](09-interactive-keyboard.md)).
- Other OS: explain the file is for macOS; offer to reveal in file manager.

Components: `Dialog`, `RadioGroup`, `Button`, `Callout`, `Table` (organiser).

---

## Auxiliary — Character Palette

Reusable popover/panel to insert characters into output fields: search by name/code point, recent, categories (accents, symbols, currency…), Unicode search. Drag a char onto a key (sets interaction mode `dragText`). Powering: a bundled Unicode name table (or `unicode_names2` crate exposed via command, or a JSON in frontend).

---

## Component inventory (shadcn/ui)

Button, Card, Dialog, Popover, Tabs, Tooltip, DropdownMenu, Select, Switch, Slider, Input, Table, Badge, ScrollArea, Command (palette), Toast (sonner), ToggleGroup, RadioGroup, Alert, Separator, ContextMenu (right-click key), Resizable (panels). Add as needed via shadcn CLI.

## Keyboard-shortcuts (app)

⌘/Ctrl+N new, O open, S save, Z/⇧Z undo/redo, +/- zoom, 1/2/3 switch keyboard type, toggle modifiers via Shift/Alt/Ctrl/Cmd held or chip click, Esc cancels interaction mode. cmdk command palette (⌘K) for everything.

---

## As-built notes (v1)

Where the shipped app differs from or extends the plan above:

- **Preferences** is a modal reachable from the gear in the top bar and ⌘, /
  the app menu — it is **app-level**, not a per-document tab. Ships with
  theme (light/dark/system, default *system* on first launch), keycap font
  (Sans/Serif/Mono/Round), and UI language; persisted to `localStorage`.
- **Welcome** shows a **recent files** list (file-backed docs only), persisted
  to `localStorage`, with a Clear action.
- **Help / guided tour**: a `?` button in the top bar opens a per-page
  spotlight tour (welcome/editor/modifiers/dead-keys/bundle/xml). First-run
  pulse on the button + a one-time nudge toast on the first document.
- **Export**: PNG of the current view and a monochrome **reference sheet**
  (every distinct modifier map, deduped) are in the Editor toolbar.
- **Organiser**: install writes a unicode-safe filename (non-Latin names are
  preserved, not stripped to ASCII); uninstall moves to the Trash (reversible,
  user-scope only); a `notify` watcher refreshes the list live.
- **System layouts**: Apple's built-in input sources are sealed and cannot be
  read by any app, so picking one starts a **blank** layout named after it
  (never a US-QWERTY one). Real `.keylayout`/`.bundle` files open fully.
- **i18n**: shipped in 24 languages (en + 23 translated), including RTL scripts
  (Arabic/Urdu/Persian) which set `<html dir="rtl">`. Tour content and all UI
  strings are localized.
- Not yet built: cmdk command palette (⌘K), character palette, Tauri updater.
