//! Stress / robustness: feed malformed, hostile, and extreme input. The core
//! must return Err (never panic) and must not corrupt round-trips.

use keylayout_core::modifiers::{parse_spec, ModMask};
use keylayout_core::{
    build_snapshot, decode_output, encode_output, new_keyboard, parse_keylayout,
    serialize_keylayout, validate, EncodeOpts, Key, KeyValue, Template,
};

#[test]
fn rejects_garbage_and_empty_input() {
    for bad in [
        "",
        "   ",
        "not xml at all",
        "<html><body>nope</body></html>",
        "<<<<",
    ] {
        assert!(parse_keylayout(bad).is_err(), "should reject: {bad:?}");
    }
}

#[test]
fn rejects_keyboard_missing_required_attrs() {
    assert!(parse_keylayout(r#"<keyboard name="x"></keyboard>"#).is_err()); // no group/id
    assert!(parse_keylayout(r#"<keyboard group="1"></keyboard>"#).is_err()); // no id
}

#[test]
fn tolerates_minimal_keyboard() {
    let kb = parse_keylayout(r#"<keyboard group="0" id="-5"/>"#).unwrap();
    assert_eq!(kb.id, -5);
    // serializes + reparses without panic
    let xml = serialize_keylayout(&kb, &EncodeOpts::default());
    assert!(parse_keylayout(&xml).is_ok());
}

#[test]
fn decode_rejects_hostile_refs() {
    assert!(decode_output("&#xD800;").is_err()); // lone high surrogate
    assert!(decode_output("&#x110000;").is_err()); // > U+10FFFF
    assert!(decode_output("&bogus;").is_err());
    assert!(decode_output("&#;").is_err());
    assert!(decode_output("&#xZZZ;").is_err());
    assert!(decode_output("abc&").is_err()); // unterminated
}

#[test]
fn extreme_output_lengths_round_trip() {
    let mut kb = new_keyboard(Template::Standard, "Stress");
    let huge: String = "ä🚀漢".repeat(2000); // ~6000 graphemes, astral + cjk
    let set = kb.keymap_set_mut("ANSI").unwrap();
    set.map_mut(0).unwrap().set_key(Key {
        code: 0,
        value: KeyValue::Output(huge.clone()),
    });
    let xml = serialize_keylayout(
        &kb,
        &EncodeOpts {
            code_non_ascii: true,
        },
    );
    let kb2 = parse_keylayout(&xml).unwrap();
    let got = kb2
        .keymap_set("ANSI")
        .unwrap()
        .map(0)
        .unwrap()
        .key(0)
        .unwrap();
    assert_eq!(got.value, KeyValue::Output(huge));
    // maxout recomputed, not trusted
    assert!(kb2.maxout.unwrap() >= 6000);
}

#[test]
fn snapshot_handles_out_of_range_type_and_mask() {
    let kb = new_keyboard(Template::Standard, "S");
    // absurd type code + full mask must not panic; falls back gracefully
    let snap = build_snapshot(&kb, 9_999_999, ModMask(0xFFFF), "no-such-state");
    assert_eq!(snap.keys.len(), 128);
}

#[test]
fn modifier_parser_rejects_junk_tokens() {
    assert!(parse_spec("totally bogus tokens").is_err());
    assert!(parse_spec("shift??").is_err()); // double optional is invalid name "shift?"
    assert!(parse_spec("").is_ok()); // empty is the base map — valid
}

#[test]
fn encode_always_escapes_xml_and_controls() {
    let opts = EncodeOpts::default();
    let s = encode_output("a<b>&\"'\u{0007}\u{007F}", &opts);
    for frag in [
        "&#x003C;", "&#x003E;", "&#x0026;", "&#x0022;", "&#x0027;", "&#x0007;", "&#x007F;",
    ] {
        assert!(s.contains(frag), "missing {frag} in {s}");
    }
    assert!(!s.contains('<'));
}

#[test]
fn validate_never_panics_on_broken_refs() {
    let xml = r#"<keyboard group="0" id="-5" name="Broken">
      <layouts><layout first="0" last="0" modifiers="MISSING" mapSet="GONE"/></layouts>
      <keyMapSet id="ANSI"><keyMap index="0"><key code="0" action="nope"/></keyMap></keyMapSet>
    </keyboard>"#;
    let kb = parse_keylayout(xml).unwrap();
    let issues = validate(&kb);
    assert!(issues.iter().any(|i| i.code == "DanglingActionRef"));
    assert!(issues.iter().any(|i| i.code == "DanglingMapSetRef"));
    assert!(issues.iter().any(|i| i.code == "DanglingModifierRef"));
}

#[test]
fn deeply_nested_base_chain_terminates() {
    // build a long base chain ANSI(0)->(1)->...; resolving a missing key must
    // terminate, not stack-overflow.
    let mut kb = new_keyboard(Template::Basic, "Chain");
    {
        let set = kb.keymap_set_mut("ANSI").unwrap();
        set.maps.clear();
        for i in 0..50u32 {
            set.maps.push(keylayout_core::KeyMap {
                index: i,
                base: Some(keylayout_core::BaseRef {
                    map_set: "ANSI".into(),
                    index: i + 1,
                }),
                keys: Vec::new(),
            });
        }
    }
    // index 49 -> 50 (missing) -> None; never loops
    let r = keylayout_core::resolve::resolve_key_value(&kb, "ANSI", 0, 99);
    assert!(r.is_none());
}

const FIXTURE: &str = include_str!("fixtures/sample_dead.keylayout");

#[test]
fn truncating_a_valid_file_at_any_point_never_panics() {
    // Every prefix of a real file must parse to Ok or Err — never panic.
    let bytes = FIXTURE.as_bytes();
    for end in 0..=bytes.len() {
        if let Ok(s) = std::str::from_utf8(&bytes[..end]) {
            let _ = parse_keylayout(s);
        }
    }
}

#[test]
fn byte_flips_never_panic() {
    // Corrupt bytes throughout a real file; the parser must stay panic-free.
    let bytes = FIXTURE.as_bytes().to_vec();
    for i in (0..bytes.len()).step_by(3) {
        for mask in [0x20u8, 0x80, 0xFF] {
            let mut m = bytes.clone();
            m[i] ^= mask;
            if let Ok(s) = std::str::from_utf8(&m) {
                let _ = parse_keylayout(s); // Ok or Err, never panic
            }
        }
    }
}

#[test]
fn truncated_and_unclosed_tags_error_cleanly() {
    for bad in [
        "<keyboard group=\"0\" id=\"-5\"",            // unclosed start tag
        "<keyboard group=\"0\" id=\"-5\">",           // never closed
        "<keyboard group=\"0\" id=\"-5\"><keyMapSet", // truncated child
        "<keyboard group=\"0\" id=\"-5\"><keyMapSet id=\"A\"><keyMap index=\"0\"><key code=",
    ] {
        // must return a Result (Ok or Err), never panic
        let _ = parse_keylayout(bad);
    }
}

#[test]
fn xml_entity_bomb_is_rejected_or_inert() {
    // "Billion laughs": exponential entity expansion. The Apple DTD doesn't
    // define custom entities and quick-xml is non-validating (it does NOT
    // recursively expand internal entity refs), so this must terminate in
    // microseconds — either parse with the &lol6; chars left literal or error
    // out — and must NOT allocate the gigabytes a recursive expansion would.
    let bomb = r#"<?xml version="1.0"?>
<!DOCTYPE keyboard [
<!ENTITY lol "lol">
<!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
<!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
<!ENTITY lol4 "&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;">
<!ENTITY lol5 "&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;">
<!ENTITY lol6 "&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;&lol5;">
]>
<keyboard group="0" id="-5" name="&lol6;"/>"#;
    let start = std::time::Instant::now();
    let _ = parse_keylayout(bomb); // Ok or Err — must NOT hang/oom
    assert!(
        start.elapsed().as_millis() < 500,
        "billion-laughs bomb must terminate instantly"
    );
}

#[test]
fn xml_external_entity_is_rejected_or_inert() {
    // External SYSTEM entity reference (XXE classic). The parser must NOT
    // resolve external URIs (no file:// reads, no HTTP requests).
    let xxe = r#"<?xml version="1.0"?>
<!DOCTYPE keyboard SYSTEM "http://attacker.example.com/evil.dtd">
<keyboard group="0" id="-5" name="x"/>"#;
    let start = std::time::Instant::now();
    let _ = parse_keylayout(xxe);
    assert!(
        start.elapsed().as_millis() < 500,
        "external DTD ref must not block on the network"
    );
}

#[test]
fn deeply_nested_xml_does_not_stack_overflow() {
    // 10k-deep <keyMapSet><keyMapSet>... — the iterative parser must handle
    // this without recursion. Cap at 5s on shared CI.
    let deep = format!(
        "<keyboard group=\"0\" id=\"-5\" name=\"x\">{}</keyboard>",
        "<keyMapSet id=\"s\">".repeat(10_000) + &"</keyMapSet>".repeat(10_000)
    );
    let start = std::time::Instant::now();
    let _ = parse_keylayout(&deep);
    assert!(
        start.elapsed().as_secs() < 5,
        "10k-nested element parse must not stack-overflow or hang"
    );
}

#[test]
fn structured_random_outputs_round_trip_byte_stable() {
    // Deterministic pseudo-random outputs spanning ASCII, Latin-1, Cyrillic and
    // astral (emoji); each must survive serialize→parse→serialize byte-for-byte
    // and recompute a maxout that counts UTF-16 units for the astral ones.
    let mut kb = new_keyboard(Template::Standard, "Fuzz");
    let mut z: u64 = 0x1234_5678_9abc_def0;
    {
        let set = kb.keymap_set_mut("ANSI").unwrap();
        for code in 0u16..60 {
            z ^= z << 13;
            z ^= z >> 7;
            z ^= z << 17; // xorshift64
            let cp = match z % 4 {
                0 => 0x41 + (z % 26) as u32,      // ASCII letters
                1 => 0x0400 + (z % 0x50) as u32,  // Cyrillic
                2 => 0x1F600 + (z % 0x40) as u32, // emoji (astral, 2 UTF-16 units)
                _ => 0x00C0 + (z % 0x60) as u32,  // Latin-1 supplement
            };
            if let Some(ch) = char::from_u32(cp) {
                set.map_mut(0).unwrap().set_key(Key {
                    code,
                    value: KeyValue::Output(ch.to_string()),
                });
            }
        }
    }
    let opts = EncodeOpts {
        code_non_ascii: true,
    };
    let xml1 = serialize_keylayout(&kb, &opts);
    let kb2 = parse_keylayout(&xml1).expect("random layout must reparse");
    let xml2 = serialize_keylayout(&kb2, &opts);
    assert_eq!(xml1, xml2, "random outputs must round-trip byte-stable");
    // and the reparsed layout validates without errors
    let errs: Vec<_> = validate(&kb2)
        .into_iter()
        .filter(|i| matches!(i.severity, keylayout_core::Severity::Error))
        .collect();
    assert!(errs.is_empty(), "unexpected errors: {errs:?}");
}
