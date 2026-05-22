//! Modifier-token parsing + resolution (docs/02, docs/07).
//!
//! A physical modifier state is a bitmask over 8 physical modifiers. Each
//! `<modifier keys="...">` spec is a list of tokens; we resolve a mask to a
//! keymap index by finding the first matching spec, else the default index.

use crate::error::{CoreError, Result};
use crate::model::{Modifier, ModifierMap, ModifierSpec, ModifierToken};

/// Physical modifier bitmask. 8 independent physical keys.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ModMask(pub u16);

impl ModMask {
    pub const SHIFT_L: u16 = 1 << 0;
    pub const SHIFT_R: u16 = 1 << 1;
    pub const OPTION_L: u16 = 1 << 2;
    pub const OPTION_R: u16 = 1 << 3;
    pub const CONTROL_L: u16 = 1 << 4;
    pub const CONTROL_R: u16 = 1 << 5;
    pub const COMMAND: u16 = 1 << 6;
    pub const CAPS: u16 = 1 << 7;

    pub const ALL: u16 = 0xFF;

    pub fn empty() -> Self {
        ModMask(0)
    }
    pub fn has(self, bit: u16) -> bool {
        self.0 & bit != 0
    }
    pub fn with(self, bit: u16) -> Self {
        ModMask(self.0 | bit)
    }
    pub fn without(self, bit: u16) -> Self {
        ModMask(self.0 & !bit)
    }
    /// Friendly toggle: any-shift = both sides.
    pub fn set_shift(self, on: bool) -> Self {
        self.set_pair(Self::SHIFT_L, on)
    }
    pub fn set_option(self, on: bool) -> Self {
        self.set_pair(Self::OPTION_L, on)
    }
    pub fn set_control(self, on: bool) -> Self {
        self.set_pair(Self::CONTROL_L, on)
    }
    pub fn set_command(self, on: bool) -> Self {
        if on {
            self.with(Self::COMMAND)
        } else {
            self.without(Self::COMMAND)
        }
    }
    pub fn set_caps(self, on: bool) -> Self {
        if on {
            self.with(Self::CAPS)
        } else {
            self.without(Self::CAPS)
        }
    }
    fn set_pair(self, left_bit: u16, on: bool) -> Self {
        if on {
            self.with(left_bit)
        } else {
            self.without(left_bit)
        }
    }
}

/// Parse a `keys="..."` string into a [`ModifierSpec`].
pub fn parse_spec(keys: &str) -> Result<ModifierSpec> {
    let mut tokens = Vec::new();
    for raw in keys.split_whitespace() {
        let (name, optional) = match raw.strip_suffix('?') {
            Some(n) => (n, true),
            None => (raw, false),
        };
        let modifier = parse_modifier(name)?;
        tokens.push(ModifierToken { modifier, optional });
    }
    Ok(ModifierSpec { tokens })
}

fn parse_modifier(name: &str) -> Result<Modifier> {
    Ok(match name {
        "shift" => Modifier::Shift,
        "rightShift" => Modifier::RightShift,
        "anyShift" => Modifier::AnyShift,
        "option" => Modifier::Option,
        "rightOption" => Modifier::RightOption,
        "anyOption" => Modifier::AnyOption,
        "control" => Modifier::Control,
        "rightControl" => Modifier::RightControl,
        "anyControl" => Modifier::AnyControl,
        "command" => Modifier::Command,
        "caps" => Modifier::Caps,
        other => {
            return Err(CoreError::InvalidAttr {
                element: "modifier".into(),
                attr: "keys".into(),
                value: other.into(),
            })
        }
    })
}

/// Serialize a single modifier token back to its source name.
pub fn modifier_name(m: Modifier) -> &'static str {
    match m {
        Modifier::Shift => "shift",
        Modifier::RightShift => "rightShift",
        Modifier::AnyShift => "anyShift",
        Modifier::Option => "option",
        Modifier::RightOption => "rightOption",
        Modifier::AnyOption => "anyOption",
        Modifier::Control => "control",
        Modifier::RightControl => "rightControl",
        Modifier::AnyControl => "anyControl",
        Modifier::Command => "command",
        Modifier::Caps => "caps",
    }
}

/// Serialize a spec to its `keys="..."` string form.
pub fn spec_to_keys(spec: &ModifierSpec) -> String {
    spec.tokens
        .iter()
        .map(|t| {
            let mut s = modifier_name(t.modifier).to_string();
            if t.optional {
                s.push('?');
            }
            s
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Which physical bits does a token "claim"? `anyX` claims both sides.
fn token_bits(m: Modifier) -> u16 {
    match m {
        Modifier::Shift => ModMask::SHIFT_L,
        Modifier::RightShift => ModMask::SHIFT_R,
        Modifier::AnyShift => ModMask::SHIFT_L | ModMask::SHIFT_R,
        Modifier::Option => ModMask::OPTION_L,
        Modifier::RightOption => ModMask::OPTION_R,
        Modifier::AnyOption => ModMask::OPTION_L | ModMask::OPTION_R,
        Modifier::Control => ModMask::CONTROL_L,
        Modifier::RightControl => ModMask::CONTROL_R,
        Modifier::AnyControl => ModMask::CONTROL_L | ModMask::CONTROL_R,
        Modifier::Command => ModMask::COMMAND,
        Modifier::Caps => ModMask::CAPS,
    }
}

/// Does a mask satisfy a spec?
///
/// Apple semantics: a spec lists exactly the relevant modifiers. For each
/// required token at least one claimed bit must be down; optional tokens never
/// fail; any physical modifier NOT mentioned by ANY token must be UP.
pub fn spec_matches(spec: &ModifierSpec, mask: ModMask) -> bool {
    let mut mentioned: u16 = 0;
    for tok in &spec.tokens {
        let bits = token_bits(tok.modifier);
        mentioned |= bits;
        if !tok.optional {
            // required: at least one claimed physical bit must be present
            if mask.0 & bits == 0 {
                return false;
            }
        }
    }
    // any unmentioned modifier must be absent
    let unmentioned = ModMask::ALL & !mentioned;
    if mask.0 & unmentioned != 0 {
        return false;
    }
    true
}

/// Resolve a mask to a keymap index for a modifier map.
pub fn resolve_map_index(map: &ModifierMap, mask: ModMask) -> u32 {
    for select in &map.selects {
        for spec in &select.modifiers {
            if spec_matches(spec, mask) {
                return select.map_index;
            }
        }
    }
    map.default_index
}

/// All masks (0..=255) that match a spec — used to build a 256-entry table.
pub fn expand_to_masks(spec: &ModifierSpec) -> Vec<ModMask> {
    (0u16..=ModMask::ALL)
        .map(ModMask)
        .filter(|m| spec_matches(spec, *m))
        .collect()
}

/// Build the full 256-entry mask→index lookup table for a modifier map
/// (mirrors Ukelele's `mModifierMap[256]`).
pub fn build_table(map: &ModifierMap) -> [u32; 256] {
    let mut table = [map.default_index; 256];
    for (i, slot) in table.iter_mut().enumerate() {
        *slot = resolve_map_index(map, ModMask(i as u16));
    }
    table
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec(s: &str) -> ModifierSpec {
        parse_spec(s).unwrap()
    }

    #[test]
    fn parse_and_roundtrip_keys() {
        let s = spec("anyShift caps? command");
        assert_eq!(s.tokens.len(), 3);
        assert_eq!(spec_to_keys(&s), "anyShift caps? command");
    }

    #[test]
    fn parse_rejects_unknown() {
        assert!(parse_spec("bogus").is_err());
    }

    #[test]
    fn empty_spec_matches_only_empty_mask() {
        let s = spec("");
        assert!(spec_matches(&s, ModMask::empty()));
        assert!(!spec_matches(&s, ModMask::empty().with(ModMask::SHIFT_L)));
    }

    #[test]
    fn anyshift_matches_either_side_not_others() {
        let s = spec("anyShift");
        assert!(spec_matches(&s, ModMask(ModMask::SHIFT_L)));
        assert!(spec_matches(&s, ModMask(ModMask::SHIFT_R)));
        // command also down → unmentioned → no match
        assert!(!spec_matches(
            &s,
            ModMask(ModMask::SHIFT_L | ModMask::COMMAND)
        ));
        assert!(!spec_matches(&s, ModMask::empty()));
    }

    #[test]
    fn optional_caps_passes_with_or_without() {
        // "anyShift caps?" matches shift alone AND shift+caps
        let s = spec("anyShift caps?");
        assert!(spec_matches(&s, ModMask(ModMask::SHIFT_L)));
        assert!(spec_matches(&s, ModMask(ModMask::SHIFT_L | ModMask::CAPS)));
        // caps alone (no shift) → required shift missing → no
        assert!(!spec_matches(&s, ModMask(ModMask::CAPS)));
    }

    #[test]
    fn resolve_basic_modifier_map() {
        // Mirror docs example indices.
        let map = ModifierMap {
            id: "Mods".into(),
            default_index: 0,
            selects: vec![
                sel(0, ""),
                sel(1, "anyShift caps?"),
                sel(2, "caps"),
                sel(3, "anyOption"),
                sel(4, "anyShift anyOption"),
            ],
        };
        assert_eq!(resolve_map_index(&map, ModMask::empty()), 0);
        assert_eq!(resolve_map_index(&map, ModMask(ModMask::SHIFT_L)), 1);
        assert_eq!(
            resolve_map_index(&map, ModMask(ModMask::SHIFT_L | ModMask::CAPS)),
            1
        );
        assert_eq!(resolve_map_index(&map, ModMask(ModMask::CAPS)), 2);
        assert_eq!(resolve_map_index(&map, ModMask(ModMask::OPTION_R)), 3);
        assert_eq!(
            resolve_map_index(&map, ModMask(ModMask::SHIFT_R | ModMask::OPTION_L)),
            4
        );
        // command not covered → default
        assert_eq!(resolve_map_index(&map, ModMask(ModMask::COMMAND)), 0);
    }

    #[test]
    fn build_table_covers_256() {
        let map = ModifierMap {
            id: "M".into(),
            default_index: 0,
            selects: vec![sel(1, "anyShift")],
        };
        let table = build_table(&map);
        assert_eq!(table[ModMask::SHIFT_L as usize], 1);
        assert_eq!(table[0], 0);
    }

    #[test]
    fn expand_masks_anyshift_count() {
        // anyShift: shiftL or shiftR set, all others off → 3 masks.
        let masks = expand_to_masks(&spec("anyShift"));
        assert_eq!(masks.len(), 3);
    }

    fn sel(idx: u32, keys: &str) -> super::super::model::KeyMapSelect {
        super::super::model::KeyMapSelect {
            map_index: idx,
            modifiers: vec![spec(keys)],
        }
    }
}
