//! New-keyboard templates (. Constructors assign a random valid id.
//!
//! Constant ids reused: keymap set ids `ANSI`/`ISO`/`JIS`; modifier map id
//! `Modifiers`. Basic template ships a usable US QWERTY base so "New" produces
//! an installable layout.

use crate::ids::{random_keyboard_id, Script};
use crate::model::*;
use crate::special_keys::add_special_key_output;

/// Which starter template to build.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Template {
    /// Unicode group, empty ANSI + relative JIS, basic modifier set.
    Basic,
    /// Like Basic but ANSI prefilled from a US QWERTY base.
    Standard,
    /// Chosen script group, standard modifier map, empty keymaps.
    Script(Script),
}

const MODMAP_ID: &str = "Modifiers";
const ANSI_ID: &str = "ANSI";
const JIS_ID: &str = "JIS";

/// US QWERTY unshifted base (code, output).
const US_BASE: &[(u16, &str)] = &[
    (0, "a"),
    (1, "s"),
    (2, "d"),
    (3, "f"),
    (4, "h"),
    (5, "g"),
    (6, "z"),
    (7, "x"),
    (8, "c"),
    (9, "v"),
    (11, "b"),
    (12, "q"),
    (13, "w"),
    (14, "e"),
    (15, "r"),
    (16, "y"),
    (17, "t"),
    (18, "1"),
    (19, "2"),
    (20, "3"),
    (21, "4"),
    (22, "6"),
    (23, "5"),
    (24, "="),
    (25, "9"),
    (26, "7"),
    (27, "-"),
    (28, "8"),
    (29, "0"),
    (30, "]"),
    (31, "o"),
    (32, "u"),
    (33, "["),
    (34, "i"),
    (35, "p"),
    (37, "l"),
    (38, "j"),
    (39, "'"),
    (40, "k"),
    (41, ";"),
    (42, "\\"),
    (43, ","),
    (44, "/"),
    (45, "n"),
    (46, "m"),
    (47, "."),
    (49, " "),
    (50, "`"),
];

/// US QWERTY shifted (code, output).
const US_SHIFT: &[(u16, &str)] = &[
    (0, "A"),
    (1, "S"),
    (2, "D"),
    (3, "F"),
    (4, "H"),
    (5, "G"),
    (6, "Z"),
    (7, "X"),
    (8, "C"),
    (9, "V"),
    (11, "B"),
    (12, "Q"),
    (13, "W"),
    (14, "E"),
    (15, "R"),
    (16, "Y"),
    (17, "T"),
    (18, "!"),
    (19, "@"),
    (20, "#"),
    (21, "$"),
    (22, "^"),
    (23, "%"),
    (24, "+"),
    (25, "("),
    (26, "&"),
    (27, "_"),
    (28, "*"),
    (29, ")"),
    (30, "}"),
    (31, "O"),
    (32, "U"),
    (33, "{"),
    (34, "I"),
    (35, "P"),
    (37, "L"),
    (38, "J"),
    (39, "\""),
    (40, "K"),
    (41, ":"),
    (42, "|"),
    (43, "<"),
    (44, "?"),
    (45, "N"),
    (46, "M"),
    (47, ">"),
    (49, " "),
    (50, "~"),
];

fn keys_from(table: &[(u16, &str)]) -> Vec<Key> {
    table
        .iter()
        .map(|(c, o)| Key {
            code: *c,
            value: KeyValue::Output((*o).to_string()),
        })
        .collect()
}

/// The basic starter modifier map (.
pub fn basic_modifier_map() -> ModifierMap {
    let sel = |idx: u32, keys: &str| KeyMapSelect {
        map_index: idx,
        modifiers: vec![crate::modifiers::parse_spec(keys).expect("static spec")],
    };
    ModifierMap {
        id: MODMAP_ID.to_string(),
        default_index: 0,
        selects: vec![
            sel(0, ""),
            sel(1, "anyShift caps?"),
            sel(2, "caps"),
            sel(3, "anyOption"),
            sel(4, "anyShift anyOption"),
            sel(5, "command"),
        ],
    }
}

/// Standard layout ranges: ANSI for 0–17, JIS for the JIS type codes.
fn standard_layouts() -> Vec<LayoutRange> {
    vec![
        LayoutRange {
            first: 0,
            last: 17,
            modifiers: MODMAP_ID.into(),
            map_set: ANSI_ID.into(),
        },
        LayoutRange {
            first: 18,
            last: 18,
            modifiers: MODMAP_ID.into(),
            map_set: JIS_ID.into(),
        },
        LayoutRange {
            first: 21,
            last: 23,
            modifiers: MODMAP_ID.into(),
            map_set: JIS_ID.into(),
        },
        LayoutRange {
            first: 30,
            last: 30,
            modifiers: MODMAP_ID.into(),
            map_set: JIS_ID.into(),
        },
    ]
}

/// JIS set relative to ANSI (.
fn relative_jis_set() -> KeyMapSet {
    let maps = (0..6)
        .map(|i| KeyMap {
            index: i,
            base: Some(BaseRef {
                map_set: ANSI_ID.into(),
                index: i,
            }),
            keys: Vec::new(),
        })
        .collect();
    KeyMapSet {
        id: JIS_ID.to_string(),
        maps,
    }
}

/// Build a new keyboard from a template.
pub fn new_keyboard(template: Template, name: &str) -> Keyboard {
    let (script, prefill) = match template {
        Template::Basic => (Script::MacUnicode, false),
        Template::Standard => (Script::MacUnicode, true),
        Template::Script(s) => (s, false),
    };

    let id = random_keyboard_id(script);

    // ANSI keymap set: 6 indices. Index 0 base, 1 shifted; others empty.
    let mut ansi_maps: Vec<KeyMap> = Vec::new();
    for i in 0..6 {
        let keys = if prefill && i == 0 {
            keys_from(US_BASE)
        } else if prefill && i == 1 {
            keys_from(US_SHIFT)
        } else {
            Vec::new()
        };
        ansi_maps.push(KeyMap {
            index: i,
            base: None,
            keys,
        });
    }
    // Inject special control-char outputs into the absolute base map (index 0).
    add_special_key_output(&mut ansi_maps[0]);

    let mut kb = Keyboard {
        group: script.group(),
        id,
        name: name.to_string(),
        maxout: Some(1),
        layouts: standard_layouts(),
        modifier_maps: vec![basic_modifier_map()],
        keymap_sets: vec![
            KeyMapSet {
                id: ANSI_ID.to_string(),
                maps: ansi_maps,
            },
            relative_jis_set(),
        ],
        actions: Vec::new(),
        terminators: Vec::new(),
        comments: Comments::default(),
    };
    kb.update_maxout();
    kb
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ids::id_is_valid;
    use crate::modifiers::ModMask;
    use crate::resolve::build_snapshot;

    #[test]
    fn basic_has_valid_id_and_structure() {
        let kb = new_keyboard(Template::Basic, "Test");
        assert!(id_is_valid(kb.group, kb.id));
        assert!(kb.keymap_set(ANSI_ID).is_some());
        assert!(kb.keymap_set(JIS_ID).is_some());
        assert_eq!(kb.modifier_maps[0].id, MODMAP_ID);
        // special key output injected
        let m0 = kb.keymap_set(ANSI_ID).unwrap().map(0).unwrap();
        assert!(m0.key(36).is_some()); // Return
    }

    #[test]
    fn standard_is_typeable() {
        let kb = new_keyboard(Template::Standard, "US-ish");
        let snap = build_snapshot(&kb, 0, ModMask::empty(), "none");
        assert_eq!(snap.keys[0].output.as_deref(), Some("a"));
        let shift = build_snapshot(&kb, 0, ModMask::empty().with(ModMask::SHIFT_L), "none");
        assert_eq!(shift.keys[0].output.as_deref(), Some("A"));
        assert_eq!(shift.keys[18].output.as_deref(), Some("!"));
    }

    #[test]
    fn jis_inherits_from_ansi() {
        let kb = new_keyboard(Template::Standard, "US-ish");
        // type code 18 → JIS set, base=ANSI → 'a' inherited
        let snap = build_snapshot(&kb, 18, ModMask::empty(), "none");
        assert_eq!(snap.keys[0].output.as_deref(), Some("a"));
        assert!(snap.keys[0].inherited);
    }

    #[test]
    fn script_template_uses_group() {
        let kb = new_keyboard(Template::Script(Script::MacRoman), "Roman");
        assert!(id_is_valid(kb.group, kb.id));
    }
}
