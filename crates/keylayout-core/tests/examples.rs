//! The bundled `examples/` layouts are Keymano's own generated phonetic Cyrillic
//! layouts (see `examples/gen_examples.rs`). Every one must, in CI: parse with
//! the real parser; validate with no Error-severity issues; expose its
//! language's full alphabet (base + Shift + Option layers); keep its punctuation
//! on the base layer (no glyphs lost to letters); upper-case on Caps Lock; stay
//! Latin under Command (so ⌘-shortcuts work); and round-trip through
//! serialize → parse → serialize unchanged. So a regenerated/edited example
//! can't ship broken, lossy, or unusable.

use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

use keylayout_core::{
    build_snapshot, parse_keylayout, serialize_keylayout, validate, EncodeOpts, KeyValue, ModMask,
    Severity,
};

fn examples_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../examples")
        .canonicalize()
        .expect("examples/ dir should exist")
}

/// Expected full alphabet (lower-case) per example file stem.
fn expected_alphabet(stem: &str) -> Option<&'static str> {
    match stem {
        "Ukrainian (Phonetic)" => Some("абвгґдеєжзиіїйклмнопрстуфхцчшщьюя"),
        "Bulgarian (Phonetic)" => Some("абвгдежзийклмнопрстуфхцчшщъьюя"),
        "Serbian (Phonetic)" => Some("абвгдђежзијклљмнњопрстћуфхцчџш"),
        "Macedonian (Phonetic)" => Some("абвгдѓежзѕијклљмнњопрстќуфхцчџш"),
        _ => None,
    }
}

#[test]
fn every_bundled_example_parses_validates_and_covers_its_alphabet() {
    let dir = examples_dir();
    let mut checked = 0;
    for entry in fs::read_dir(&dir).expect("read examples/") {
        let path = entry.unwrap().path();
        if path.extension().and_then(|e| e.to_str()) != Some("keylayout") {
            continue;
        }
        let stem = path.file_stem().unwrap().to_string_lossy().to_string();
        let xml = fs::read_to_string(&path).unwrap_or_else(|e| panic!("{stem}: read failed: {e}"));

        // 1. Parses with the real parser.
        let kb = parse_keylayout(&xml).unwrap_or_else(|e| panic!("{stem}: parse failed: {e}"));

        // 2. No Error-severity validation issues.
        let errors: Vec<_> = validate(&kb)
            .into_iter()
            .filter(|i| i.severity == Severity::Error)
            .collect();
        assert!(
            errors.is_empty(),
            "{stem}: validation errors: {:?}",
            errors.iter().map(|i| &i.code).collect::<Vec<_>>()
        );

        // 3. base + Shift + Option + Shift-Option keymaps together expose the
        // language's full alphabet (extras live on the Option layer).
        let expected = expected_alphabet(&stem)
            .unwrap_or_else(|| panic!("{stem}: no expected alphabet registered for this example"));
        let set = kb.keymap_set("ANSI").expect("ANSI keymap set");
        let mut produced: HashSet<char> = HashSet::new();
        for idx in [0u32, 1, 3, 4] {
            if let Some(map) = set.map(idx) {
                for key in &map.keys {
                    if let KeyValue::Output(s) = &key.value {
                        for c in s.chars().flat_map(|c| c.to_lowercase()) {
                            produced.insert(c);
                        }
                    }
                }
            }
        }
        let missing: Vec<char> = expected.chars().filter(|c| !produced.contains(c)).collect();
        assert!(
            missing.is_empty(),
            "{stem}: alphabet letters missing: {missing:?}"
        );

        // 3b. Punctuation must NOT be lost to letters: the base layer still
        // types the symbols that share a key with an Option-layer letter.
        let base = build_snapshot(&kb, 0, ModMask::empty(), "none");
        let base_out: HashSet<String> = base.keys.iter().filter_map(|k| k.output.clone()).collect();
        for sym in ["[", "]", ";", "'", "\\", "/", "`"] {
            assert!(
                base_out.contains(sym),
                "{stem}: base layer lost punctuation {sym:?}"
            );
        }

        // 4. Caps Lock must uppercase letters (caps keymap populated, not empty).
        let caps = build_snapshot(&kb, 0, ModMask::empty().with(ModMask::CAPS), "none");
        let a_caps = caps
            .keys
            .iter()
            .find(|k| k.code == 0)
            .and_then(|k| k.output.clone());
        assert!(
            a_caps
                .as_deref()
                .is_some_and(|s| s.chars().all(|c| !c.is_lowercase())),
            "{stem}: Caps Lock should produce an upper-case letter on key 0, got {a_caps:?}"
        );

        // 5. Command keeps Latin so ⌘-shortcuts work (⌘C, ⌘V, …).
        let cmd = build_snapshot(&kb, 0, ModMask::empty().with(ModMask::COMMAND), "none");
        let get = |code: u16| {
            cmd.keys
                .iter()
                .find(|k| k.code == code)
                .and_then(|k| k.output.clone())
        };
        assert_eq!(
            get(0).as_deref(),
            Some("a"),
            "{stem}: ⌘ key 0 should be Latin 'a'"
        );
        assert_eq!(
            get(8).as_deref(),
            Some("c"),
            "{stem}: ⌘ key 8 should be Latin 'c'"
        );
        assert_eq!(
            get(9).as_deref(),
            Some("v"),
            "{stem}: ⌘ key 9 should be Latin 'v'"
        );

        // 6. Round-trips cleanly: serialize → parse → serialize is stable, so
        // opening + saving the file in Keymano won't churn or corrupt it.
        let once = serialize_keylayout(&kb, &EncodeOpts::default());
        let reparsed =
            parse_keylayout(&once).unwrap_or_else(|e| panic!("{stem}: re-parse failed: {e}"));
        let twice = serialize_keylayout(&reparsed, &EncodeOpts::default());
        assert_eq!(once, twice, "{stem}: serialize is not idempotent");

        checked += 1;
    }
    assert!(
        checked >= 4,
        "expected >= 4 example layouts, found {checked}"
    );
}
