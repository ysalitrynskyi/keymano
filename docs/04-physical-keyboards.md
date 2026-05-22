# 04 — Physical Keyboards: Types & Geometry

The visual keyboard must draw the right physical shape (ANSI / ISO / JIS …) and label each key. Ukelele used binary KCAP resources keyed by macOS gestalt ids. **We replace that with declarative JSON geometry presets.** Much simpler, editable, portable.

## Keyboard type codes (from layout XML)

`.keylayout` `<layout first last>` ranges refer to **keyboard type codes**. Map them to a physical shape:
- Codes `0–17` → **ANSI** (US-style; tall Enter, no extra key by left-Shift).
- `18` and JIS-specific codes (21–23, 30, 33, 36, 194, 197, 200–201, 206–207) → **JIS** (extra keys near Space: 英数/かな, short Space, extra key row).
- ISO codes → **ISO** (L-shaped Enter, extra key beside left-Shift = ISO key, code 10).

For authoring we expose three primary presets: **ANSI**, **ISO**, **JIS**. Advanced: allow custom geometry JSON.

## Key code → physical position

macOS uses **ADB/HID key codes 0–127**. The code is fixed per physical location regardless of legend. Our geometry preset is the single source of truth mapping code → rectangle(s).

### Geometry JSON schema (`assets/keyboards/<preset>.json`)

```jsonc
{
  "id": "ansi",
  "name": "ANSI (US)",
  "type": "ANSI",          // ANSI | ISO | JIS
  "unit": 56,               // base px per 1u key at scale 1.0
  "rows": [
    {
      "y": 0,
      "keys": [
        { "code": 53, "x": 0,   "w": 1,   "label": "esc",  "kind": "special" },
        { "code": 122,"x": 1,   "w": 1,   "label": "F1",   "kind": "special" }
        // ...
      ]
    },
    {
      "y": 1,
      "keys": [
        { "code": 50, "x": 0, "w": 1, "kind": "ordinary" },
        { "code": 18, "x": 1, "w": 1, "kind": "ordinary" }
        // ...
      ]
    }
  ]
}
```

Field meanings:
- `code` — ADB key code 0–127. Drives lookup into the layout model.
- `x`, `y`, `w`, `h` — position/size in key units `u` (1u = `unit` px at scale 1). `h` defaults 1, `w` defaults 1.
- `kind` — `ordinary | modifier | special | protected`. Controls styling + whether editable.
- `label` — optional override legend (for special keys). Ordinary keys derive their legend from the layout model output for the current modifier+state.
- `shape` (optional) — `"l-enter"` for ISO L-shaped Enter (two rects); renderer draws polygon. Otherwise plain rect.

ISO Enter / 2-rect keys: `{ "code": 36, "shape": "l-enter", "rects": [ {"x":..,"y":..,"w":..,"h":..}, {...} ] }`. Renderer unions the two rects into an L polygon.

### Why units not pixels

Scale = multiply `unit`. Zoom slider (0.5×–5×) just changes `unit`. Crisp at any size (SVG/CSS). No binary blobs.

## Key classification (kind)

Mirror Ukelele's 128-entry table. Defaults (override per preset):
- **modifier**: 54 cmd-R, 55 cmd-L, 56 shift-L, 57 caps, 58 option-L, 59 control-L, 60 shift-R, 61 option-R, 62 control-R, 63 fn.
- **special**: 36 Return, 48 Tab, 49 Space, 51 Delete(back), 53 Escape, 71 Clear, 76 Enter(keypad), 96–122 function keys, 114–119 help/home/pgup/del-fwd/end/pgdn, 123–126 arrows.
- **protected**: keys the editor should not let you remap (typically modifiers; some apps protect them). Configurable.
- **ordinary**: everything else (letters, digits, punctuation, keypad digits).

`modifier`/`protected` keys: not output-editable (greyed in UI). `ordinary`/`special`: editable (special editable but warns).

## Legends & glyphs

Special-key glyphs (Unicode) for display:
| Key | Glyph | U+ |
|-----|-------|----|
| Shift | ⇧ | 21E7 |
| Control | ⌃ | 2303 |
| Option | ⌥ | 2325 |
| Command | ⌘ | 2318 |
| Caps Lock | ⇪ | 21EA |
| Return | ↩ | 21A9 |
| Enter | ⌤ | 2324 |
| Tab | ⇥ | 21E5 |
| Delete (back) | ⌫ | 232B |
| Fwd Delete | ⌦ | 2326 |
| Escape | esc | — |
| Space | (blank / "space") | — |
| Left/Right/Up/Down | ←→↑↓ | 2190–2193 |
| Page Up/Down | ⇞ ⇟ | 21DE 21DF |
| Home/End | ↖ ↘ | 2196 2198 |
| Function keys | F1… | text |

For **ordinary keys**, legend = the model output for the *current modifier state + dead-key state*. Empty output → blank. Dead-key key → show its accent glyph + a "dead" marker. Non-printable output → show code point chip.

## Presets to ship in v1

1. `ansi.json` — US ANSI full keyboard (with function row, arrows, keypad).
2. `iso.json` — ISO (L-Enter, ISO key code 10, function row).
3. `jis.json` — JIS (英数/かな keys, short space).
4. (optional) `ansi-compact.json` — laptop-style without keypad.

Hand-author these from known geometry (reference: keyboard-layout-editor.com community JSON, or QMK info.json — adapt coordinates). Keep codes accurate; that's what matters for correctness.

## Rendering target

SVG or absolutely-positioned `<div>`s. SVG preferred: clean polygons for L-Enter, easy hit-testing, crisp scaling, export-to-PNG for free. See [09-interactive-keyboard](09-interactive-keyboard.md).
