# 09 — Interactive Keyboard Component

The signature feature: a good-looking, clickable keyboard where each key shows its current output and can be edited. Lives at `src/features/keyboard/`.

## Goals

- Render any geometry preset (ANSI/ISO/JIS/custom) from JSON ([04](04-physical-keyboards.md)).
- Show, per key, the resolved output for the **current modifier combo + dead state** ([05](05-architecture.md) snapshot).
- Click to select, double-click (or popover) to edit, right-click for context menu.
- Live update when modifiers/state/type/zoom change.
- States: normal / hover / selected / dead-key / fallback (inherited from base) / disabled (modifier/protected) / drag-target.
- Beautiful: rounded keycaps, subtle depth, theme-able, smooth transitions, crisp at any zoom.
- Exportable to PNG/SVG (free with SVG rendering).

## Rendering approach: SVG

Use a single `<svg>` with one `<g>` per key. Why SVG over divs:
- Clean L-shaped (ISO Enter) polygons.
- Crisp scaling (zoom = viewBox/transform), no blurry text.
- Easy hit-testing, easy PNG/SVG export.
- Accessible (role, aria-label per key).

(Optional alt: `react-konva` if we want canvas perf for huge zoom — not needed v1.)

## Component tree

```
<Keyboard>                         // orchestrates; subscribes to store + snapshot
 ├─ <ModifierBar/>                 // (lives in page, drives snapshot) — see 08
 ├─ <svg viewBox=...>
 │   └─ <KeyCap key=code .../>     // one per geometry key
 │        ├─ <KeyShape/>           // rect or L-polygon, themed fill/stroke
 │        ├─ <KeyLegend/>          // main glyph/char (center or corners)
 │        └─ <KeyBadges/>          // dead-key dot, codepoint chip, comment dot
 └─ <KeyPopover/>                  // anchored editor for selected key (08/P3)
```

## Data flow

```
store: { docId, keyboardId, keyboardTypeCode, modMask, deadState, selectedCode, interactionMode }
        │
        ├─ on any of (keyboardTypeCode|modMask|deadState) change:
        │     ipc.get_snapshot(...) → KeyboardSnapshot (cached/memoized)
        │
        └─ Keyboard renders geometry[preset] zipped with snapshot.keys[code]
```

Geometry (static JSON, loaded once per preset) + Snapshot (dynamic from core) are merged by `code`. Geometry gives position/size/kind/label; snapshot gives `display`/`isDead`/`output`/`codePoints`.

## KeyCap rendering rules

- Position: `x*unit, y*unit, w*unit, h*unit` (unit from preset × zoom).
- `kind=modifier|protected` → muted fill, not clickable for editing (still selectable for info). Show glyph (⇧⌘ etc.).
- `kind=special` → glyph from table ([04](04-physical-keyboards.md)); editable with warning.
- `kind=ordinary` → main legend = `snapshot.display`. If empty → faint placeholder. If `isDead` → accent glyph + small colored dot (e.g. amber). If output is non-printable → small monospace `U+XXXX` chip. If value inherited from base map (fallback) → slightly reduced opacity.
- Selected → accent ring. Hover → lift/shadow. Drag-target (mode=dragText) → dashed highlight.
- Corner micro-labels (optional): show the *unshifted* base char in a corner when viewing a modified state, for orientation.

## Interaction

- **Click**: select key → inspector updates. In a "select key for X" interaction mode, completes that mode (e.g. swap second key).
- **Double-click** (or click in `editKey` default): open `<KeyPopover>` to edit output. Confirm → `ipc.set_key_output` → snapshot refresh.
- **Right-click**: `ContextMenu` — Edit, Make Dead Key, Clear, Unlink, Copy/Cut/Paste key, Add Comment, Swap with….
- **Drag char from palette → key**: sets output. (`dragText` mode.)
- **Keyboard nav**: arrow keys move selection between physical neighbors (precompute adjacency from geometry); Enter edits; Esc cancels mode.

## Modifier bar behavior

Toggling a chip updates `modMask`; core resolves to a `mapIndex`; snapshot re-fetched; legends animate to new chars. Show which `mapIndex` is active and whether the current mask is *covered* (else falls to defaultIndex — indicate). Support holding physical modifier keys to preview (optional; capture keydown/up).

## Dead-state preview

Selecting a dead state in the dropdown re-renders: each key shows what it would output *if pressed now in that state* (from action `when` for that state, else terminator, else nothing). Dead keys that *enter* a state are marked. Helps authors see "after dead-acute, which keys produce accented forms".

## Theming

`ColorTheme` object → CSS variables: keycap fill/stroke/text, modifier tint, dead tint, selected accent, background. Ship a few presets (Light, Dark, Mono, Colorful). Tailwind + CSS vars; switch live.

## Export

`exportPng()` / `exportSvg()`: serialize the `<svg>` (inline computed styles), rasterize via canvas for PNG. Useful for sharing layout images / docs. Reuses the exact render.

## Performance

~80–110 keys; trivial. Memoize `KeyCap` on `(geometryKey, keyView)`. Refetch snapshot only when inputs change (debounce rapid modifier toggles). No virtualization needed.

## Accessibility

Each key `role="button"`, `aria-label="key {code}: outputs {display}"`. Focus ring visible. Full keyboard navigation. Respect prefers-reduced-motion (disable lift animation).

## Build order (for this component)

1. Load + render geometry (static), no data → boxes with key codes.
2. Merge snapshot → real legends for state 0, no modifiers.
3. Modifier bar → re-render on mask change.
4. Selection + inspector.
5. Popover editor → write path (set_key_output) → live refresh.
6. Dead-state dropdown + dead/fallback styling.
7. Right-click menu + advanced modes (swap/unlink/dead-key/drag).
8. Theming + export.
