# 12 — Edge Cases, Reference Tables & Full Parity

Second-pass findings from the original Ukelele code. Things the first plan under-specified. Implement these to reach true parity. Cross-refs: [02](02-keylayout-format.md), [04](04-physical-keyboards.md), [07](07-data-model.md), [08](08-ui-pages.md), [10](10-implementation-plan.md).

---

## 1. Keyboard `id` / `group` ranges (CRITICAL for new keyboards)

`group` = Mac script code. `id` must fall in a script-specific range, else macOS may reject/clash. New keyboards pick a RANDOM id in range (collision avoidance). Ukelele `GetRandomKeyboardID`:

| Script (group) | group val | id min | id max |
|---|---|---|---|
| MacUnicode (default) | 0 | **-32768** | **-2** |
| MacRoman | 0 | 2 | 16383 |
| MacJapanese | 0 | 16384 | 16895 |
| MacChineseTrad | 0 | 16896 | 17407 |
| MacKorean | 0 | 17408 | 17919 |
| MacCyrillic | 0 | 19456 | 19967 |
| MacChineseSimp | 0 | 28672 | 29183 |
| MacCentralEurRoman | 0 | 30720 | 31231 |

> Note: Ukelele stores these as `group` numbers per script; modern custom layouts almost always use **Unicode group with a negative id** (e.g. -15000). Default new keyboard = Unicode group, random id in [-32768, -2].

Core: `fn random_keyboard_id(script: Script) -> i32`, `fn id_is_valid(group, id) -> bool`. Expose script enum + ranges as data.

---

## 2. New-keyboard templates (core must generate these)

Three constructors, all assign random id (above):

- **Basic** — Unicode group; ModifierMap = "Modifiers" (basic set); KeyMapSets: `ANSI` (empty) + `JIS` (base=ANSI); layouts: 0–17→ANSI, 18→JIS, 21–23→JIS, 30→JIS; `maxout=1`.
- **Standard** — like Basic but ANSI keymaps prefilled from a chosen base/command/capsLock layout; modifier map gets caps/command variants when those differ from base.
- **Script** — group = chosen script; standard modifier map; empty keymaps.

Constant names to reuse: keymap set ids `ANSI` / `ISO` / `JIS`; modifier map id `Modifiers`.

**Basic modifier map** (the common starter set) ≈ indices:
```
0: (none)
1: anyShift caps?
2: caps
3: anyOption
4: anyShift anyOption
5: command ...   (command variants when present)
```
Ship these as a `templates.rs` in core + starter `.keylayout` fixtures the UI "New from preset" uses.

---

## 3. Special-key output injection (`AddSpecialKeyOutput`)

macOS expects certain keys to emit control chars. Ukelele injects defaults for ~40 keys when **undefined** (skips relative/base maps; never overwrites user output). Provide `add_special_key_output(keymap)` + a "Add Special Key Output" command + auto-run on import for absolute base maps.

Table (keycode → output, hex char ref):

| code | key | output |
|---|---|---|
| 36 | Return | `&#x000D;` |
| 48 | Tab | `&#x0009;` |
| 76 | Enter (keypad) | `&#x0003;` |
| 53 | Escape | `&#x001B;` |
| 51 | Delete (back) | `&#x0008;` |
| 117 | Forward Delete | `&#x007F;` |
| 122–111 etc. F1–F19 | function | `&#x0010;` |
| 114 | Help | `&#x0005;` |
| 115 | Home | `&#x0001;` |
| 119 | End | `&#x0004;` |
| 116 | Page Up | `&#x000B;` |
| 121 | Page Down | `&#x000C;` |
| 123 | Left Arrow | `&#x001C;` |
| 124 | Right Arrow | `&#x001D;` |
| 126 | Up Arrow | `&#x001E;` |
| 125 | Down Arrow | `&#x001F;` |
| 66,70,72,77 | keypad dirs | FS/GS/US/RS variants |

(F-keys all map to `&#x0010;`. Verify exact codes against `KeyMapElement.mm` + our geometry; keep the table in one place in core.)

---

## 4. Validation & repair (expand `validate.rs`)

Ukelele repair flags → our `Issue` + optional auto-fix:

| flag | problem | fix |
|---|---|---|
| MissingSpecialKeyOutput | special keys undefined in absolute base map | inject (§3) |
| KeyMapSetGap | gap in keymap index coverage | fill/inherit |
| InvalidBaseIndex | base map ref out of bounds / dangling | drop/repair ref |
| ExtraKeyMapSet | duplicate/extra keymap set | merge/remove |
| InvalidKeyboardID | id missing or out of script range (§1) | assign valid random id |

Plus our checks from [07](07-data-model.md): dangling action refs, base-map cycles, unknown states in `next`, invalid Unicode output, duplicate ids in bundle.

**RepairJIS**: if a `JIS` keymap set is absolute (no base) but has empty keymaps → make it relative to `ANSI` (`baseMapSet="ANSI"`). Provide as a repair.

**Housekeeping** (commands + undo): `remove_unused_states` (reachability: none + any `next` target + terminator targets), `remove_unused_actions` (actions not referenced by any key).

---

## 5. Key codes & JIS specifics

- **Codes can exceed 127.** Right Command = **257** (only extended code in practice). Right Shift/Option/Control use 60/61/62. Codes >127 are NOT in the 0–127 keymap table; they're modifier-display metadata. Our model: store keys sparsely by `u16` (already), but the keymap render table is 0–127; treat 257 as display-only in geometry (`kind=modifier`, not output-editable).
- **JIS keys**: code **102** = 英数 (Eisu, "alphanumeric"), code **104** = かな (Kana). Protected special keys, always present on JIS geometry. Display 2-char glyphs: 英数 (U+82F1 U+6570) and カナ (U+30AB U+30CA). Add to `jis.json` as `kind=special`, `label` set, not editable.
- **Caps Lock as state switch** (`doesCapsLockSwitching`): per-bundled-layout boolean flag. When set, caps lock enters a state rather than acting as a plain modifier. Store on `BundledLayout` ([03](03-bundle-format.md)) + expose in Bundle Manager.

---

## 6. `maxout`

= max output string length across all keymaps, actions, and terminators. **Recompute on every serialize** (`update_maxout()`), don't trust input value. Also useful to size keycap text in the UI (long output → smaller font / chip).

---

## 7. Full operations inventory (feature-parity checklist)

The first UI plan covered most; these were under-specified. Map each to a command + UI surface.

**File / document**
- New layout collection (bundle) · New layout · New from current input source (macOS only) · Open · Open recent · Save / Save As · Revert to saved · Duplicate document · Duplicate layout within bundle · Page Setup · Print · Export installer image (macOS; we do "Export bundle/zip" instead).

**Per-key editing**
- Change output · Make dead key · Make output (dead→plain) · Change next state · Change terminator · Edit key (full) · Cut/Copy/Paste key · Swap keys (by selection / by code) · **Unlink key** (break inheritance from base map → make absolute) · **Relink key** (re-attach to base/action) · Unlink modifier set · Select key by code · **Find key stroke** (search by output string) · Attach/edit/remove comment.

**States / actions**
- Create dead key · Enter / leave dead-key state (editing context) · Import dead-key state from another keyboard · Change state name · Change action name · Remove unused states · Remove unused actions · Add special key output.

**Modifiers**
- Add/remove modifier combination · Edit modifier tokens · Set default index · Simplify modifiers · Reorder (drag) · Unlink modifier set.

**Keyboard identity / metadata**
- Set name + script (group) · Set/assign id (auto random or custom, validated §1) · Set intended language · Remove language · Localise name (per-locale) · Attach/remove icon · Add/edit/remove locale.

**View / UX modes**
- **Quick Entry Mode** (type a char → it fills the selected key, auto-advance — fast bulk entry) · **Sticky Modifiers** (lock a modifier combo while editing) · Show code points toggle · Colour themes (choose + edit) · Keyboard type switch · Zoom/scale · Inspector / Toolbox panels.

**Install / manage (macOS only; cross-platform = export + instructions)**
- Install for current user (`~/Library/Keyboard Layouts/`) · Install for all users (`/Library/Keyboard Layouts/`, needs admin) · Uninstall · **Organiser** window: list installed (user/all) + uninstalled, drag to install, file-system watch.

---

## 8. Undo semantics

Original = invocation-based, **bidirectional** (each op registers its inverse), with **named actions** ("Unlink key", "Swap keys", "Remove unused states", …) and **grouping** for compound ops (e.g. change-default-index + remove-keymap = one undo). Our snapshot-clone approach ([05](05-architecture.md)) is simpler and fine, BUT:
- Give each undo entry an **action name** (show in Edit ▸ Undo "<name>").
- **Group compound edits** into one undo step.
- Keep redo stack; clear on new edit.

---

## 9. Printing (was missing from UI plan)

Add ability to print/export a keyboard reference sheet: all (or current) modifier combinations × all (or current) dead-key states, each as a labeled keyboard image, paginated. Reuse the SVG keyboard render (a "print/monochrome" theme). On our stack this is "Export PDF/PNG sheet" rather than native NSPrint — implement via the same SVG → render pipeline ([09](09-interactive-keyboard.md) export). Add as a feature in P9 Export.

---

## 10. Quick Look / preview parity

Ukelele's QuickLook renders a bitmap of the keyboard (state 0, no modifiers) at 800×600. Our equivalent = the SVG keyboard PNG/SVG export ([09](09-interactive-keyboard.md)). A macOS Quick Look plugin is out of scope (not cross-platform), but the same render powers thumbnails/sharing. Note in docs; don't build a QL plugin in v1.

---

## Action items folded into other docs

- [00-overview](00-overview.md) parity checklist — extended (templates, special-key output, repair, unlink/relink, search, quick-entry, sticky mods, print/export sheet, organiser, caps-lock flag).
- [07-data-model](07-data-model.md) — add id ranges, `update_maxout`, templates, repair to module map.
- [08-ui-pages](08-ui-pages.md) — add Quick Entry + Sticky Modifiers + Find/Select-by-code to Editor; add Installed-Layouts Organiser (macOS) and Print/Export-sheet to P9.
- [10-implementation-plan](10-implementation-plan.md) — phases extended (templates+ids in P1/P2, special-key+repair in P6, organiser+print in P9/P10).
