//! Round-trip a real `.keylayout` file: parse → serialize → re-parse, assert
//! model-equality, print a summary + validation. Usage:
//!   cargo run -p keylayout-core --example roundtrip -- <path>

use keylayout_core::{parse_keylayout, serialize_keylayout, validate, EncodeOpts};

fn main() {
    let path = std::env::args().nth(1).expect("usage: roundtrip <path>");
    let xml = std::fs::read_to_string(&path).expect("read file");

    let kb = parse_keylayout(&xml).expect("parse");
    println!(
        "parsed: name={:?} group={} id={} maxout={:?}",
        kb.name, kb.group, kb.id, kb.maxout
    );
    println!(
        "  layouts={} modifierMaps={} keyMapSets={} actions={} terminators={}",
        kb.layouts.len(),
        kb.modifier_maps.len(),
        kb.keymap_sets.len(),
        kb.actions.len(),
        kb.terminators.len()
    );
    for set in &kb.keymap_sets {
        let total: usize = set.maps.iter().map(|m| m.keys.len()).sum();
        println!(
            "  keyMapSet {:?}: {} maps, {} keys",
            set.id,
            set.maps.len(),
            total
        );
    }

    let out = serialize_keylayout(
        &kb,
        &EncodeOpts {
            code_non_ascii: true,
        },
    );
    let kb2 = parse_keylayout(&out).expect("reparse");

    let mut a = kb.clone();
    a.update_maxout();
    if a == kb2 {
        println!("ROUND-TRIP: model-equal ✓");
    } else {
        println!("ROUND-TRIP: MODEL MISMATCH ✗");
        std::process::exit(1);
    }

    let issues = validate(&kb);
    println!("validation: {} issue(s)", issues.len());
    for i in &issues {
        println!("  [{:?}] {}: {}", i.severity, i.code, i.message);
    }

    // write serialized output next to a temp for manual inspection
    let tmp = std::env::temp_dir().join("keymano_roundtrip.keylayout");
    std::fs::write(&tmp, &out).expect("write");
    println!("serialized → {}", tmp.display());
}
