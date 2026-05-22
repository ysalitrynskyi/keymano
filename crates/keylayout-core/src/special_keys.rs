//! Special-key control-char output injection (docs/12 §3).
//!
//! macOS expects certain keys to emit control characters. We inject defaults
//! for these keys only when they are currently undefined (never overwrite user
//! output), and only into absolute base maps (callers decide that policy).

use crate::model::{Key, KeyMap, KeyValue};

/// `(adb_code, control_char_codepoint)` table. F-keys all map to U+0010.
pub const SPECIAL_OUTPUTS: &[(u16, u32)] = &[
    (36, 0x000D),  // Return
    (48, 0x0009),  // Tab
    (76, 0x0003),  // Enter (keypad)
    (53, 0x001B),  // Escape
    (51, 0x0008),  // Delete (back)
    (117, 0x007F), // Forward Delete
    (114, 0x0005), // Help
    (115, 0x0001), // Home
    (119, 0x0004), // End
    (116, 0x000B), // Page Up
    (121, 0x000C), // Page Down
    (123, 0x001C), // Left Arrow
    (124, 0x001D), // Right Arrow
    (126, 0x001E), // Up Arrow
    (125, 0x001F), // Down Arrow
    (71, 0x001B),  // Clear (esc-like)
    // Function keys F1–F19 → U+0010
    (122, 0x0010),
    (120, 0x0010),
    (99, 0x0010),
    (118, 0x0010),
    (96, 0x0010),
    (97, 0x0010),
    (98, 0x0010),
    (100, 0x0010),
    (101, 0x0010),
    (109, 0x0010),
    (103, 0x0010),
    (111, 0x0010),
    (105, 0x0010),
    (107, 0x0010),
    (113, 0x0010),
    (106, 0x0010),
    (64, 0x0010),
    (79, 0x0010),
    (80, 0x0010),
    // Keypad direction keys (verified against Ukelele KeyMapElement.mm
    // sSpecialKeyList): 66→RS-as-right, 70→FS-as-left, 72→US-as-down, 77→RS-as-up.
    (66, 0x001D),
    (70, 0x001C),
    (72, 0x001F),
    (77, 0x001E),
];

/// Output codepoint for a special key code, if any.
pub fn special_output_for(code: u16) -> Option<u32> {
    SPECIAL_OUTPUTS
        .iter()
        .find(|(c, _)| *c == code)
        .map(|(_, cp)| *cp)
}

/// Inject default control-char outputs into a keymap for every special key that
/// is currently undefined. Returns the number of keys added.
pub fn add_special_key_output(map: &mut KeyMap) -> usize {
    let mut added = 0;
    for (code, cp) in SPECIAL_OUTPUTS {
        if map.key(*code).is_none() {
            let ch = char::from_u32(*cp).expect("special table contains only valid scalars");
            map.set_key(Key {
                code: *code,
                value: KeyValue::Output(ch.to_string()),
            });
            added += 1;
        }
    }
    added
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lookup_known_codes() {
        assert_eq!(special_output_for(36), Some(0x000D));
        assert_eq!(special_output_for(53), Some(0x001B));
        assert_eq!(special_output_for(122), Some(0x0010));
        // keypad direction keys (Ukelele parity, P1-11)
        assert_eq!(special_output_for(66), Some(0x001D));
        assert_eq!(special_output_for(70), Some(0x001C));
        assert_eq!(special_output_for(72), Some(0x001F));
        assert_eq!(special_output_for(77), Some(0x001E));
        assert_eq!(special_output_for(0), None);
    }

    #[test]
    fn inject_only_undefined() {
        let mut map = KeyMap {
            index: 0,
            base: None,
            keys: vec![
                Key {
                    code: 36,
                    value: KeyValue::Output("custom".into()),
                },
                Key {
                    code: 0,
                    value: KeyValue::Output("a".into()),
                },
            ],
        };
        let added = add_special_key_output(&mut map);
        assert!(added > 0);
        // existing Return output untouched
        assert_eq!(
            map.key(36).unwrap().value,
            KeyValue::Output("custom".into())
        );
        // Tab now injected
        assert_eq!(
            map.key(48).unwrap().value,
            KeyValue::Output("\u{0009}".into())
        );
        // idempotent
        assert_eq!(add_special_key_output(&mut map), 0);
    }
}
