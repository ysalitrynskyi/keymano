# 02 — `.keylayout` XML Format (Exhaustive Spec)

Apple keyboard layout format. This is the canonical spec our Rust parser/serializer must implement. Element + attribute names are EXACT (case-sensitive).

## File header

```xml
<?xml version="1.1" encoding="UTF-8"?>
<!DOCTYPE keyboard PUBLIC "-//Apple//DTD Keyboard Layout//EN"
  "file://localhost/System/Library/DTDs/KeyboardLayout.dtd">
```

- XML **1.1** (Apple uses 1.1; allows more control chars). UTF-8.
- DOCTYPE optional in practice but Apple emits it. We emit it; parser must tolerate absence.

## Element tree

```
keyboard
├── layouts
│   └── layout            (1+)
├── modifierMap           (1+)
│   └── keyMapSelect       (1+)
│       └── modifier        (1+)
├── keyMapSet             (1+)
│   └── keyMap             (1+)
│       └── key             (0+)   [key may contain inline <action>]
├── actions               (0..1)
│   └── action             (1+)
│       └── when            (1+)
└── terminators           (0..1)
    └── when               (1+)
```

## Elements + attributes

### `<keyboard>` (root)
| Attr | Type | Meaning |
|------|------|---------|
| `group` | int | Script group (1 = Roman/Latin, etc.) |
| `id` | int | Unique id within group. Negative ids common for custom (e.g. -15000). |
| `name` | string | Display name |
| `maxout` | int (optional) | Longest output string length across all keys. Recompute on save. |

### `<layouts>` → `<layout>`
Maps a *range of physical keyboard type codes* to a modifierMap + keyMapSet.
| Attr | Type | Meaning |
|------|------|---------|
| `first` | int | First keyboard-type code in range |
| `last` | int | Last keyboard-type code in range |
| `modifiers` | string | id ref → a `<modifierMap>` |
| `mapSet` | string | id ref → a `<keyMapSet>` |

Typical: ANSI `first="0" last="17"`, plus extra ranges for JIS (18, 21–23, 30, 33, 36, 194, 197, 200–201, 206–207). A simple layout often has one `<layout>` covering the common range and a second for JIS.

### `<modifierMap>` → `<keyMapSelect>` → `<modifier>`
| Element | Attr | Meaning |
|---------|------|---------|
| `modifierMap` | `id` | unique id |
| `modifierMap` | `defaultIndex` | keymap index used when no modifier matches (usually 0) |
| `keyMapSelect` | `mapIndex` | which keyMap (0,1,2,…) this selection activates |
| `modifier` | `keys` | space-separated modifier tokens |

**`keys` tokens** (full set — sorted as in source):
```
anyControl  anyControl?  anyOption  anyOption?  anyShift  anyShift?
caps        caps?        command    command?    control   control?
option      option?      rightControl rightControl?
rightOption rightOption? rightShift  rightShift?  shift     shift?
```
- Plain token → modifier MUST be down.
- `token?` → modifier OPTIONAL (matches with or without).
- `anyX` → either left or right of that modifier.
- Multiple tokens in one `keys` → all listed are required (cartesian product over the optional `?` ones determines which physical combos map here).
- Multiple `<modifier>` children of one `keyMapSelect` → any of them selects that mapIndex.

Internally Ukelele expands tokens into a 256-entry table: modifier-bit-pattern → mapIndex. We do the same (see [07-data-model](07-data-model.md)).

### `<keyMapSet>` → `<keyMap>` → `<key>`
| Element | Attr | Meaning |
|---------|------|---------|
| `keyMapSet` | `id` | unique id (e.g. "ANSI") |
| `keyMap` | `index` | which modifier index this map is for |
| `keyMap` | `baseMapSet` (opt) | inherit from another set's map |
| `keyMap` | `baseIndex` (opt) | which index in the base to inherit |
| `key` | `code` | key code 0–127 (ADB). Up to 0–511 theoretically. |
| `key` | `output` (opt) | literal output string for this key |
| `key` | `action` (opt) | id ref → `<action>` (dead key / multi-state) |

A `<key>` has **exactly one** of: `output`, `action`, or a nested inline `<action>` child. With `baseMapSet`/`baseIndex`, only overridden keys need listing.

### `<actions>` → `<action>` → `<when>`
| Element | Attr | Meaning |
|---------|------|---------|
| `action` | `id` | unique id (e.g. "dead-acute") |
| `when` | `state` | current state name ("none" = base) |
| `when` | `output` (opt) | output string in this state |
| `when` | `next` (opt) | state to transition to |
| `when` | `through` (opt) | rarely used; preserve verbatim |
| `when` | `multiplier` (opt) | rarely used; preserve verbatim |

`<when>` semantics:
- `output` only → emit output, return to none.
- `next` only → pure state transition (the classic dead key entry: `state="none" next="acute"`).
- `output`+`next` → emit and go to state.
- neither → falls back to terminator for that state.

### `<terminators>` → `<when>`
Same `<when>` attrs. Output emitted when a dead-key `state` is active and the next key has no matching `<when>` in any action. I.e. "you pressed dead-acute then something with no acute form → emit the bare accent".

## Output string encoding

Output may contain literal chars OR numeric character references:
- Decimal `&#DDDD;` or hex `&#xHHHH;` (and 5-digit hex for astral, e.g. `&#x1F600;`).
- **Always** encode: XML-reserved (`& < > " '`), C0 controls (0x00–0x1F), DEL (0x7F), C1 (0x80–0x9F).
- **Optionally** encode all non-ASCII as numeric refs — user preference "code non-ASCII". When off, emit literal UTF-8 (except the always-encode set).
- Decode: accept decimal + hex refs; reconstruct astral from surrogate pairs if present.
- Validate Unicode: reject U+0000, > U+10FFFF, surrogates U+D800–DFFF, noncharacters (`x & 0xFFFE == 0xFFFE`, U+FDD0–FDEF).

## Comments

XML comments `<!-- ... -->` may appear before elements. Ukelele attaches them to the following element and re-emits. We store an optional `comment_before: Vec<String>` on each model node and round-trip them. (Nice-to-have for v1; required for full parity.)

## Full example

```xml
<?xml version="1.1" encoding="UTF-8"?>
<!DOCTYPE keyboard PUBLIC "-//Apple//DTD Keyboard Layout//EN"
  "file://localhost/System/Library/DTDs/KeyboardLayout.dtd">
<keyboard group="1" id="-15000" name="My Layout" maxout="2">
  <layouts>
    <layout first="0" last="17" modifiers="Mods" mapSet="ANSI"/>
    <layout first="18" last="18" modifiers="Mods" mapSet="ANSI"/>
  </layouts>
  <modifierMap id="Mods" defaultIndex="0">
    <keyMapSelect mapIndex="0"><modifier keys=""/></keyMapSelect>
    <keyMapSelect mapIndex="1"><modifier keys="anyShift caps?"/></keyMapSelect>
    <keyMapSelect mapIndex="2"><modifier keys="caps"/></keyMapSelect>
    <keyMapSelect mapIndex="3"><modifier keys="anyOption"/></keyMapSelect>
    <keyMapSelect mapIndex="4"><modifier keys="anyShift anyOption"/></keyMapSelect>
  </modifierMap>
  <keyMapSet id="ANSI">
    <keyMap index="0">
      <key code="0" output="a"/>
      <key code="1" output="s"/>
      <key code="2" action="dead-acute"/>
    </keyMap>
    <keyMap index="1" baseMapSet="ANSI" baseIndex="0">
      <key code="0" output="A"/>
      <key code="2" output="&#x00B4;"/>
    </keyMap>
  </keyMapSet>
  <actions>
    <action id="dead-acute">
      <when state="none" next="acute"/>
      <when state="acute" output="&#x00E1;"/>  <!-- á -->
    </action>
  </actions>
  <terminators>
    <when state="acute" output="&#x00B4;"/>
  </terminators>
</keyboard>
```

## Parser/serializer requirements

- Preserve attribute presence (don't emit `baseMapSet` if absent; don't invent `output=""`).
- Recompute `maxout` on save.
- Stable, diff-friendly output ordering (sort keys by code, maps by index).
- Configurable non-ASCII encoding.
- Round-trip test: parse → serialize → parse must be model-equal (and ideally byte-stable on our own output).
