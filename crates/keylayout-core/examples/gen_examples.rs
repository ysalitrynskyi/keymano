//! Generates the bundled `examples/*.keylayout` files. These are Keymano's own
//! phonetic Cyrillic layouts: each maps a Latin (QWERTY) key to the
//! sound-alike letter of the target alphabet, with every letter of the alphabet
//! placed (verified by `tests/examples.rs`). They are produced entirely by this
//! generator through the project's own serializer — no third-party layout
//! files are involved.
//!
//! Run:  cargo run -p keylayout-core --example gen_examples
//!
//! The layouts are intentionally "phonetic" (a Keymano design), not the
//! national ЙЦУКЕН/standard defaults — those are defined by external standards
//! we don't want to approximate by hand. Open one in Keymano to see / tweak it.

use std::fs;
use std::path::PathBuf;

use keylayout_core::{new_keyboard, serialize_keylayout, EncodeOpts, Key, KeyValue, Template};

/// (keycode, base letter). Shift is the upper-case of the same letter.
type Letters = &'static [(u16, &'static str)];

/// Standard non-letter keys (digits row + dash/equals + comma/period/space).
/// Added only where a layout doesn't repurpose the key for a letter.
const PUNCT: &[(u16, &str, &str)] = &[
    (18, "1", "!"),
    (19, "2", "@"),
    (20, "3", "#"),
    (21, "4", "$"),
    (23, "5", "%"),
    (22, "6", "^"),
    (26, "7", "&"),
    (28, "8", "*"),
    (25, "9", "("),
    (29, "0", ")"),
    (27, "-", "_"),
    (24, "=", "+"),
    (43, ",", "<"),
    (47, ".", ">"),
    (44, "/", "?"),
    (50, "`", "~"),
    (33, "[", "{"),
    (30, "]", "}"),
    (41, ";", ":"),
    (39, "'", "\""),
    (42, "\\", "|"),
    (49, " ", " "),
];

/// US QWERTY letters by keycode — used for the Command keymap so that ⌘-key
/// shortcuts (⌘C, ⌘V, …) stay Latin on these Cyrillic layouts, matching how
/// Apple's own Cyrillic layouts behave.
const LATIN: Letters = &[
    (0, "a"),
    (1, "s"),
    (2, "d"),
    (3, "f"),
    (5, "g"),
    (4, "h"),
    (38, "j"),
    (40, "k"),
    (37, "l"),
    (12, "q"),
    (13, "w"),
    (14, "e"),
    (15, "r"),
    (17, "t"),
    (16, "y"),
    (32, "u"),
    (34, "i"),
    (31, "o"),
    (35, "p"),
    (6, "z"),
    (7, "x"),
    (8, "c"),
    (9, "v"),
    (11, "b"),
    (45, "n"),
    (46, "m"),
];

// Phonetic letter tables, split into:
//   CORE  — the 26 sound-alike letters carried by the Latin A–Z keys
//           (base / Shift / Caps Lock),
//   EXTRA — the remaining letters of the alphabet, carried by the OPTION layer
//           of the ` [ ] ; ' \ / keys.
// Putting EXTRA on Option (instead of stealing the punctuation keys) means
// `[ ] ; ' \ / `` and friends are still typeable on the base layer — no loss of
// punctuation — while every letter of the alphabet remains reachable. Coverage
// (CORE ∪ EXTRA = full alphabet) is enforced by tests/examples.rs.

const UK_CORE: Letters = &[
    (0, "а"),
    (11, "б"),
    (8, "ц"),
    (2, "д"),
    (14, "е"),
    (3, "ф"),
    (5, "г"),
    (4, "х"),
    (34, "і"),
    (38, "й"),
    (40, "к"),
    (37, "л"),
    (46, "м"),
    (45, "н"),
    (31, "о"),
    (35, "п"),
    (12, "я"),
    (15, "р"),
    (1, "с"),
    (17, "т"),
    (32, "у"),
    (9, "в"),
    (13, "ш"),
    (7, "ж"),
    (16, "и"),
    (6, "з"),
];
const UK_EXTRA: Letters = &[
    (50, "ґ"),
    (33, "ч"),
    (30, "щ"),
    (41, "є"),
    (39, "ї"),
    (42, "ь"),
    (44, "ю"),
];

const BG_CORE: Letters = &[
    (0, "а"),
    (11, "б"),
    (8, "ц"),
    (2, "д"),
    (14, "е"),
    (3, "ф"),
    (5, "г"),
    (4, "х"),
    (34, "и"),
    (38, "й"),
    (40, "к"),
    (37, "л"),
    (46, "м"),
    (45, "н"),
    (31, "о"),
    (35, "п"),
    (12, "я"),
    (15, "р"),
    (1, "с"),
    (17, "т"),
    (32, "у"),
    (9, "в"),
    (13, "ш"),
    (7, "ж"),
    (16, "ъ"),
    (6, "з"),
];
const BG_EXTRA: Letters = &[(33, "ч"), (30, "щ"), (41, "ь"), (39, "ю")];

const SR_CORE: Letters = &[
    (0, "а"),
    (11, "б"),
    (8, "ц"),
    (2, "д"),
    (14, "е"),
    (3, "ф"),
    (5, "г"),
    (4, "х"),
    (34, "и"),
    (38, "ј"),
    (40, "к"),
    (37, "л"),
    (46, "м"),
    (45, "н"),
    (31, "о"),
    (35, "п"),
    (12, "ч"),
    (15, "р"),
    (1, "с"),
    (17, "т"),
    (32, "у"),
    (9, "в"),
    (13, "ш"),
    (7, "џ"),
    (16, "ж"),
    (6, "з"),
];
const SR_EXTRA: Letters = &[(33, "ђ"), (30, "љ"), (41, "њ"), (39, "ћ")];

const MK_CORE: Letters = &[
    (0, "а"),
    (11, "б"),
    (8, "ц"),
    (2, "д"),
    (14, "е"),
    (3, "ф"),
    (5, "г"),
    (4, "х"),
    (34, "и"),
    (38, "ј"),
    (40, "к"),
    (37, "л"),
    (46, "м"),
    (45, "н"),
    (31, "о"),
    (35, "п"),
    (12, "ч"),
    (15, "р"),
    (1, "с"),
    (17, "т"),
    (32, "у"),
    (9, "в"),
    (13, "ш"),
    (7, "џ"),
    (16, "ж"),
    (6, "з"),
];
const MK_EXTRA: Letters = &[(33, "ѓ"), (30, "ѕ"), (41, "љ"), (39, "њ"), (42, "ќ")];

fn upper(s: &str) -> String {
    s.chars().flat_map(|c| c.to_uppercase()).collect()
}

fn out(set: &mut keylayout_core::KeyMapSet, idx: u32, code: u16, s: &str) {
    set.map_mut(idx).unwrap().set_key(Key {
        code,
        value: KeyValue::Output(s.to_string()),
    });
}

fn build(name: &str, core: Letters, extra: Letters) -> String {
    // Modifier-map indices (see basic_modifier_map): 0 = base, 1 = shift,
    // 2 = caps lock, 3 = option, 4 = shift+option, 5 = command.
    let mut kb = new_keyboard(Template::Basic, name);
    // Only the A–Z (core) keys are "occupied" on the base layer; the EXTRA
    // letters live on Option, so their keys keep their punctuation on base.
    let used: std::collections::HashSet<u16> = core.iter().map(|(c, _)| *c).collect();
    let set = kb.keymap_set_mut("ANSI").expect("ANSI set");

    for &(code, ch) in core {
        out(set, 0, code, ch); // base
        out(set, 1, code, &upper(ch)); // shift → upper-case
        out(set, 2, code, &upper(ch)); // caps lock → upper-case
    }
    for &(code, ch) in extra {
        out(set, 3, code, ch); // option → extra letter
        out(set, 4, code, &upper(ch)); // shift+option → upper-case
    }
    // Command keymap → Latin (+ punctuation), so ⌘C / ⌘V / ⌘[ behave normally.
    for &(code, lat) in LATIN {
        out(set, 5, code, lat);
    }
    // Digits / punctuation on base, shift, caps and command. Punctuation stays
    // on the base layer even where an EXTRA letter is on that key's Option.
    for &(code, base, shift) in PUNCT {
        if used.contains(&code) {
            continue;
        }
        out(set, 0, code, base);
        out(set, 1, code, shift);
        out(set, 2, code, base);
        out(set, 5, code, base);
    }
    kb.update_maxout();
    serialize_keylayout(&kb, &EncodeOpts::default())
}

fn main() {
    let out = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples");
    fs::create_dir_all(&out).unwrap();
    let layouts: &[(&str, Letters, Letters)] = &[
        ("Ukrainian (Phonetic)", UK_CORE, UK_EXTRA),
        ("Bulgarian (Phonetic)", BG_CORE, BG_EXTRA),
        ("Serbian (Phonetic)", SR_CORE, SR_EXTRA),
        ("Macedonian (Phonetic)", MK_CORE, MK_EXTRA),
    ];
    for (name, core, extra) in layouts {
        let xml = build(name, core, extra);
        let path = out.join(format!("{name}.keylayout"));
        fs::write(&path, xml).unwrap();
        println!("wrote {}", path.display());
    }
}
