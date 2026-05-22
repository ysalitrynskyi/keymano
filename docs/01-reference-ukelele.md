# 01 — Reference: How Ukelele Works

Condensed map of the original (Objective-C/C++ Cocoa, macOS-only). We copy the *logic and UX*, not the code.

## Layered model

```
UKKeyboardDocument (NSDocument)         ← file I/O, bundle vs standalone
└── UkeleleKeyboardObject (ObjC bridge) ← public API over C++
    └── KeyboardElement (C++ root)
        ├── LayoutsElement      → LayoutElement[]  (which mapSet+modifierMap per physical keyboard type range)
        ├── ModifierMap         → KeyMapSelect[] → ModifierElement[]  (modifier combos → keymap index)
        ├── KeyMapSetList       → KeyMapSet → KeyMapElement → KeyElement[128]
        ├── ActionElementSet    → ActionElement → WhenElement[]  (dead-key FSM)
        └── TerminatorsElement  → WhenElement[]  (fallback output per state)
```

Every element extends `XMLCommentHolder` so inline XML comments survive round-trips.

## Key concepts

- **KeyElement**: one physical key in one modifier state. Either direct `output`, or references an `action` (dead key / multi-state), or an inline action.
- **Modifier map**: lookup table `mModifierMap[256]` mapping a modifier-bit-pattern → a keymap index. Built from `<modifier keys="...">` tokens.
- **Dead key = FSM**: `ActionElement` is a set of `<when state=... output=... next=...>` transitions. Press dead-acute (state none→acute), then `a` (state acute→none, output `á`). `terminators` give output when a state has no matching next key.
- **Base map inheritance**: a `<keyMap baseMapSet baseIndex>` inherits from another, overriding only changed keys (less duplication).

## Document forms

- **Standalone** `.keylayout`: single XML file, one keyboard.
- **Bundle** `.bundle`: package, 1+ keyboards, icon, localized names. `convertToBundle` / `convertToUnbundled` switch.

## UI (what we replicate as UX)

- **NSDocument → one window per layout.** Main window has tabs: Keyboard / Modifiers / Comments.
- **UkeleleView** renders keyboard; **KeyCapView** per key (states: down/dead/selected/fallback). Scale 0.5×–5.0×. Geometry from binary `KCAPResources.plist`.
- **Double-click key → editing flow** via *Interaction Handler* pattern: one active `id<UKInteractionHandler>` at a time (DoubleClickHandler, CreateDeadKeyHandler, UnlinkKeyHandler, SwapKeysController, ImportDeadKeyHandler, DragTextHandler), completion callback when done. Clean alternative to a giant controller switch.
- **EditKey** sheet/popover: tabs Output (string) and DeadKey (state + terminator).
- **Singletons**: Inspector (key details on selection), Toolbox (drag chars), Preferences.
- **Sheets use callback blocks**, not delegates — loose coupling. ~20 dialogs.

## Patterns worth keeping

1. ObjC↔C++ bridge → our equivalent: Rust core ↔ TS frontend via Tauri commands.
2. Interaction-handler state machine for multi-step edits → our equivalent: a UI "interaction mode" state in the frontend store.
3. Dialogs return results via callbacks → our equivalent: promises/async + Radix dialogs.
4. Comment preservation in model → keep in Rust model.
5. Base-map inheritance → keep in model + serializer.

## Physical-keyboard handling (the hard part)

- Keyboard *types*: Universal(1), ANSI(2), ISO(4), JIS(8). Plus availability combos (ANSI-only … ANSI+ISO+JIS).
- `LayoutInfo.mm` maps dozens of gestalt keyboard IDs → type + name + ANSI/ISO/JIS variant.
- Per-keycode classification table (128 entries): modifier / special / ordinary / protected.
- Special key glyphs: Return ⏎, Tab ⇥, Delete ⌫, arrows, modifiers ⇧⌃⌥⌘⇪, function-key glyph.
- Geometry in binary KCAP resources keyed by keyboard type id; supports 2-rect keys (L-shaped ISO Enter).

**We replace** the gestalt/KCAP machinery with **declarative JSON geometry** per keyboard preset. See [04-physical-keyboards](04-physical-keyboards.md).

## What we drop / modernize

- Carbon `TISCopy...` system capture → optional macOS-only feature later, behind a trait.
- Binary KCAP plist → human-editable JSON geometry.
- 32/64-bit `kluchrtoxml` legacy resource-fork converter → out of scope (we import XML `.keylayout`, not classic `.rsrc`).
- Sparkle auto-update → optional; use Tauri updater if wanted.
