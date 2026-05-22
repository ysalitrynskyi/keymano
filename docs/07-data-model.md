# 07 — Rust Core Data Model (`keylayout-core`)

Mirrors the `.keylayout` structure (see [02](02-keylayout-format.md)) but idiomatic Rust. All types `#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]`.

## Top types

```rust
/// A whole document: standalone keyboard or a bundle.
pub enum Document {
    Standalone(Keyboard),
    Bundle(KeyboardBundle),
}

pub struct Keyboard {
    pub group: i32,
    pub id: i32,
    pub name: String,
    pub maxout: Option<u32>,          // recomputed on serialize
    pub layouts: Vec<LayoutRange>,
    pub modifier_maps: Vec<ModifierMap>,
    pub keymap_sets: Vec<KeyMapSet>,
    pub actions: Vec<Action>,
    pub terminators: Vec<When>,
    pub comments: Comments,           // attached comments for round-trip
}
```

## Layouts

```rust
pub struct LayoutRange {
    pub first: u32,
    pub last: u32,
    pub modifiers: String,   // ref → ModifierMap.id
    pub map_set: String,     // ref → KeyMapSet.id
}
```

## Modifiers

```rust
pub struct ModifierMap {
    pub id: String,
    pub default_index: u32,
    pub selects: Vec<KeyMapSelect>,
}
pub struct KeyMapSelect {
    pub map_index: u32,
    pub modifiers: Vec<ModifierSpec>,   // <modifier keys="...">; any match selects this index
}
pub struct ModifierSpec {
    pub tokens: Vec<ModifierToken>,
}
pub struct ModifierToken {
    pub modifier: Modifier,   // which physical modifier
    pub optional: bool,       // the trailing '?'
}
pub enum Modifier {
    Shift, RightShift, AnyShift,
    Option, RightOption, AnyOption,
    Control, RightControl, AnyControl,
    Command, Caps,
}
```

### Modifier resolution (the important algorithm)

A physical modifier state = bitmask over { shiftL, shiftR, optL, optR, ctrlL, ctrlR, cmd, caps }. To render/resolve we need: given a mask, which `map_index`?

```
fn resolve_map_index(map: &ModifierMap, mask: ModMask) -> u32 {
    for select in &map.selects {
        for spec in &select.modifiers {
            if spec_matches(spec, mask) { return select.map_index; }
        }
    }
    map.default_index
}
```

`spec_matches`: for each token, required modifier must be present (anyX = left OR right); optional tokens always pass; any modifier NOT mentioned must be ABSENT (Apple semantics: a spec lists exactly the relevant modifiers; unmentioned must be up). Verify against real Apple layouts in tests — this is the subtle bit. Provide `expand_to_masks(spec) -> Vec<ModMask>` for building a full 256-entry lookup table identical to Ukelele's `mModifierMap[256]`.

The UI offers a friendly toggle bar (Shift/Option/Control/Command/Caps); it builds a `ModMask`, calls core to get the active `map_index`, then renders that keymap.

## Keymaps & keys

```rust
pub struct KeyMapSet {
    pub id: String,
    pub maps: Vec<KeyMap>,
}
pub struct KeyMap {
    pub index: u32,
    pub base: Option<BaseRef>,      // baseMapSet + baseIndex
    pub keys: Vec<Key>,             // sparse: only defined keys
}
pub struct BaseRef { pub map_set: String, pub index: u32 }

pub struct Key {
    pub code: u16,                  // 0..=127 (allow up to 511)
    pub value: KeyValue,
}
pub enum KeyValue {
    Output(String),                 // <key output="...">
    ActionRef(String),              // <key action="id">
    InlineAction(Action),           // nested <action> child
}
```

Resolution with inheritance: to get key `code` in map `index`, look in that map; if absent and `base` set, recurse into base map. Detect/(reject) cycles.

## Actions (dead keys / FSM)

```rust
pub struct Action {
    pub id: String,
    pub whens: Vec<When>,
}
pub struct When {
    pub state: String,              // "none" = base
    pub output: Option<String>,
    pub next: Option<String>,
    pub through: Option<String>,    // preserve verbatim
    pub multiplier: Option<String>, // preserve verbatim
}
```

Semantics encoded in helpers:
- `when.is_transition()` = `next.is_some() && output.is_none()`
- `when.is_output()` = `output.is_some() && next.is_none()`
- terminator fallback: `Keyboard.terminators` searched by `state` when no action `when` matches.

`states(&self) -> BTreeSet<String>` collects every state name referenced (for the dead-state dropdown). `unused_states()`, `unused_actions()` for housekeeping.

## Comments (round-trip)

```rust
pub struct Comments {
    /// keyed by a stable node path → comment text(s) that preceded it
    pub before: HashMap<NodePath, Vec<String>>,
}
```

v1 may stub this (parse+drop) and implement full round-trip in a later phase. Document the limitation if stubbed.

## Output string encoding

```rust
pub struct EncodeOpts { pub code_non_ascii: bool }

fn encode_output(s: &str, opts: &EncodeOpts) -> String;   // → XML attr-safe string with &#x..; refs
fn decode_output(raw: &str) -> Result<String, ParseError>; // ← parse decimal/hex/surrogate refs

fn is_valid_unicode(cp: u32) -> bool;  // reject 0, >10FFFF, surrogates, noncharacters
```

Always-encode set: `& < > " '`, C0 (00–1F), 7F, C1 (80–9F). When `code_non_ascii`, also encode all > 0x7F.

## Bundle types

See [03-bundle-format](03-bundle-format.md) for `KeyboardBundle`, `BundledLayout`, `Localization`.

## Module map

```
keylayout-core/src/
├── lib.rs          (re-exports, Document)
├── model.rs        (all structs/enums above)
├── parse.rs        (quick-xml → model)
├── serialize.rs    (model → quick-xml string; recompute maxout; ordering)
├── encoding.rs     (encode_output/decode_output/is_valid_unicode)
├── modifiers.rs    (token parse, resolve_map_index, expand_to_masks, ModMask)
├── resolve.rs      (key resolution w/ base inheritance; build KeyboardSnapshot)
├── bundle.rs       (read/write .bundle dir, Info.plist, .strings, icons)
├── validate.rs     (structural checks + repairs → Vec<Issue>; see 12 §4)
├── templates.rs    (CreateBasic/Standard/Script keyboards; default modifier maps; see 12 §2)
├── ids.rs          (script enum + id ranges + random_keyboard_id + id_is_valid; see 12 §1)
├── special_keys.rs (add_special_key_output table + injection; see 12 §3)
└── error.rs        (ParseError, etc. via thiserror)
```

Also: `Keyboard::update_maxout()` recomputes `maxout` from all keymaps/actions/terminators on every serialize ([12](12-edge-cases-and-parity.md) §6). Key codes are `u16` (right-Command = 257 exists but is display-only, not in the 0–127 render table). `BundledLayout` carries `does_caps_lock_switching: bool` ([12](12-edge-cases-and-parity.md) §5).

## Snapshot builder (frontend-facing)

```rust
pub fn build_snapshot(
    kb: &Keyboard, keyboard_type_code: u32, mask: ModMask, dead_state: &str
) -> KeyboardSnapshot;
```

Picks the `LayoutRange` covering `keyboard_type_code` → its modifierMap + keyMapSet → `resolve_map_index(mask)` → for each code 0..=127 resolve KeyValue (following base + action/state) → KeyView with display glyph. This is the single function the UI leans on for rendering.

## Invariants / validation (`Vec<Issue>`)

- Every `layout.modifiers`/`map_set` ref resolves.
- Every `key.action` ref resolves to an `Action`.
- No base-map cycles.
- State names referenced by `next` exist (or are terminator-only).
- Output strings valid Unicode.
- `id`/`group` present; warn on duplicate keyboard ids in a bundle.

## Why owned-by-Rust

All resolution (modifier expansion, base inheritance, dead-key FSM) is fiddly. Keeping it in tested Rust avoids re-implementing it in TS and guarantees the XML we emit matches what we render. See [05-architecture](05-architecture.md).
