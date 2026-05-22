//! Edge cases & adversarial inputs not covered by the other suites: the
//! parse-lenient / validate-strict contract, dead-key state-machine validation,
//! base-map cycles, inline actions, mixed character references, and modifier
//! coverage. Public-API only.

use keylayout_core::model::*;
use keylayout_core::modifiers::ModMask;
use keylayout_core::validate::remove_unused_states;
use keylayout_core::{
    build_snapshot, decode_output, new_keyboard, parse_keylayout, repair, serialize_keylayout,
    validate, EncodeOpts, Template,
};

fn kb_from(xml: &str) -> Keyboard {
    parse_keylayout(xml).expect("xml should parse")
}
fn codes(kb: &Keyboard) -> Vec<String> {
    validate(kb).into_iter().map(|i| i.code).collect()
}

// ---- parse-lenient / validate-strict contract --------------------------------

#[test]
fn decode_allows_nul_but_validate_flags_it() {
    // decode only rejects non-scalars; validation is the strict gate that
    // rejects NUL / noncharacters that slip through as valid scalar values.
    assert_eq!(decode_output("&#x0000;").unwrap(), "\u{0}");
    let kb = kb_from(
        r#"<keyboard group="0" id="-5" name="Nul">
          <keyMapSet id="ANSI"><keyMap index="0"><key code="0" output="&#x0000;"/></keyMap></keyMapSet>
        </keyboard>"#,
    );
    assert!(codes(&kb).contains(&"InvalidUnicode".to_string()));
}

#[test]
fn noncharacter_output_flagged() {
    let kb = kb_from(
        r#"<keyboard group="0" id="-5" name="NC">
          <keyMapSet id="ANSI"><keyMap index="0"><key code="0" output="&#xFFFF;"/></keyMap></keyMapSet>
        </keyboard>"#,
    );
    assert!(codes(&kb).contains(&"InvalidUnicode".to_string()));
}

// ---- validate codes that previously lacked dedicated coverage ----------------

#[test]
fn base_map_cycle_flagged() {
    let kb = kb_from(
        r#"<keyboard group="0" id="-5" name="Cycle">
          <keyMapSet id="ANSI">
            <keyMap index="0" baseMapSet="ANSI" baseIndex="1"/>
            <keyMap index="1" baseMapSet="ANSI" baseIndex="0"/>
          </keyMapSet>
        </keyboard>"#,
    );
    assert!(codes(&kb).contains(&"BaseMapCycle".to_string()));
}

#[test]
fn duplicate_key_code_flagged() {
    let kb = kb_from(
        r#"<keyboard group="0" id="-5" name="Dup">
          <keyMapSet id="ANSI"><keyMap index="0">
            <key code="0" output="a"/><key code="0" output="b"/>
          </keyMap></keyMapSet>
        </keyboard>"#,
    );
    assert!(codes(&kb).contains(&"DuplicateKeyCode".to_string()));
}

#[test]
fn keymap_set_gap_flagged() {
    // indices 0 and 2 present, 1 missing → gap warning
    let kb = kb_from(
        r#"<keyboard group="0" id="-5" name="Gap">
          <keyMapSet id="ANSI">
            <keyMap index="0"><key code="0" output="a"/></keyMap>
            <keyMap index="2"><key code="0" output="b"/></keyMap>
          </keyMapSet>
        </keyboard>"#,
    );
    assert!(codes(&kb).contains(&"KeyMapSetGap".to_string()));
}

#[test]
fn unknown_next_state_flagged_when_dangling() {
    // "ghost" is a `next` target with no terminator and no action handling it.
    let kb = kb_from(
        r#"<keyboard group="0" id="-5" name="Next">
          <keyMapSet id="ANSI"><keyMap index="0"><key code="0" action="a1"/></keyMap></keyMapSet>
          <actions><action id="a1"><when state="none" next="ghost"/></action></actions>
        </keyboard>"#,
    );
    assert!(
        codes(&kb).contains(&"UnknownNextState".to_string()),
        "dangling next target must be flagged (regression: check used to be vacuous)"
    );
}

#[test]
fn well_formed_dead_key_has_no_unknown_next_state() {
    let kb = kb_from(
        r#"<keyboard group="0" id="-5" name="Acute">
          <keyMapSet id="ANSI"><keyMap index="0"><key code="0" action="a1"/></keyMap></keyMapSet>
          <actions><action id="a1">
            <when state="none" next="acute"/>
            <when state="acute" output="á"/>
          </action></actions>
          <terminators><when state="acute" output="´"/></terminators>
        </keyboard>"#,
    );
    assert!(!codes(&kb).contains(&"UnknownNextState".to_string()));
}

#[test]
fn invalid_base_index_flagged_and_repaired() {
    let mut kb = kb_from(
        r#"<keyboard group="0" id="-5" name="BadBase">
          <keyMapSet id="ANSI">
            <keyMap index="0"><key code="0" output="a"/></keyMap>
            <keyMap index="1" baseMapSet="ANSI" baseIndex="9"/>
          </keyMapSet>
        </keyboard>"#,
    );
    assert!(codes(&kb).contains(&"InvalidBaseIndex".to_string()));
    let report = repair(&mut kb);
    assert!(report.fixed.contains(&"InvalidBaseIndex".to_string()));
    assert!(!codes(&kb).contains(&"InvalidBaseIndex".to_string()));
    // dangling base ref dropped, not left pointing at a missing index
    assert!(kb
        .keymap_set("ANSI")
        .unwrap()
        .map(1)
        .unwrap()
        .base
        .is_none());
}

// ---- inline actions ----------------------------------------------------------

#[test]
fn inline_action_round_trips_and_resolves() {
    let kb = kb_from(
        r#"<keyboard group="0" id="-5" name="Inline">
          <layouts><layout first="0" last="0" modifiers="M" mapSet="ANSI"/></layouts>
          <modifierMap id="M" defaultIndex="0">
            <keyMapSelect mapIndex="0"><modifier keys=""/></keyMapSelect>
          </modifierMap>
          <keyMapSet id="ANSI"><keyMap index="0">
            <key code="0"><action><when state="none" output="x" next="s1"/></action></key>
          </keyMap></keyMapSet>
          <terminators><when state="s1" output="^"/></terminators>
        </keyboard>"#,
    );
    let xml = serialize_keylayout(&kb, &EncodeOpts::default());
    let kb2 = parse_keylayout(&xml).unwrap();
    let mut a = kb.clone();
    a.update_maxout();
    assert_eq!(
        a, kb2,
        "inline action must survive a serialize→reparse round trip"
    );

    let v = &build_snapshot(&kb, 0, ModMask::empty(), "none").keys[0];
    assert_eq!(v.output.as_deref(), Some("x"));
    assert!(v.is_dead);
}

// ---- character references ----------------------------------------------------

#[test]
fn mixed_char_refs_decode_in_one_output() {
    // literal + decimal ref + hex ref + named entity, decoded exactly once.
    let kb = kb_from(
        r#"<keyboard group="0" id="-5" name="Refs">
          <keyMapSet id="ANSI"><keyMap index="0"><key code="0" output="A&#66;&#x43;&amp;"/></keyMap></keyMapSet>
        </keyboard>"#,
    );
    let v = kb
        .keymap_set("ANSI")
        .unwrap()
        .map(0)
        .unwrap()
        .key(0)
        .unwrap();
    assert_eq!(v.value, KeyValue::Output("ABC&".into()));
}

#[test]
fn crlf_and_extra_whitespace_tolerated() {
    let xml = "<keyboard group=\"0\" id=\"-5\" name=\"CRLF\">\r\n  <keyMapSet id=\"ANSI\">\r\n    <keyMap index=\"0\">\r\n      <key code=\"0\" output=\"a\"/>\r\n    </keyMap>\r\n  </keyMapSet>\r\n</keyboard>\r\n";
    let kb = parse_keylayout(xml).unwrap();
    assert_eq!(
        kb.keymap_set("ANSI")
            .unwrap()
            .map(0)
            .unwrap()
            .key(0)
            .unwrap()
            .value,
        KeyValue::Output("a".into())
    );
}

// ---- modifier coverage in snapshots ------------------------------------------

#[test]
fn uncovered_mask_falls_back_to_default_index() {
    let kb = kb_from(
        r#"<keyboard group="0" id="-5" name="Cov">
          <layouts><layout first="0" last="0" modifiers="M" mapSet="ANSI"/></layouts>
          <modifierMap id="M" defaultIndex="0">
            <keyMapSelect mapIndex="0"><modifier keys=""/></keyMapSelect>
            <keyMapSelect mapIndex="1"><modifier keys="anyShift"/></keyMapSelect>
          </modifierMap>
          <keyMapSet id="ANSI">
            <keyMap index="0"><key code="0" output="a"/></keyMap>
            <keyMap index="1"><key code="0" output="A"/></keyMap>
          </keyMapSet>
        </keyboard>"#,
    );
    // shift IS covered
    let shift = build_snapshot(&kb, 0, ModMask::empty().with(ModMask::SHIFT_L), "none");
    assert!(shift.mask_covered);
    assert_eq!(shift.modifier_index, 1);
    assert_eq!(shift.keys[0].output.as_deref(), Some("A"));
    // control is NOT covered → default index 0, mask_covered false
    let ctrl = build_snapshot(&kb, 0, ModMask::empty().with(ModMask::CONTROL_L), "none");
    assert!(!ctrl.mask_covered);
    assert_eq!(ctrl.modifier_index, 0);
}

// ---- housekeeping ------------------------------------------------------------

#[test]
fn remove_unused_states_keeps_multi_hop_reachable() {
    // none → s1 → s2 reachable; "orphan" is unreachable and must be pruned.
    let mut kb = kb_from(
        r#"<keyboard group="0" id="-5" name="States">
          <keyMapSet id="ANSI"><keyMap index="0"><key code="0" action="a"/></keyMap></keyMapSet>
          <actions><action id="a">
            <when state="none" next="s1"/>
            <when state="s1" next="s2"/>
            <when state="s2" output="z"/>
            <when state="orphan" output="o"/>
          </action></actions>
          <terminators>
            <when state="s1" output="1"/>
            <when state="s2" output="2"/>
            <when state="orphan" output="x"/>
          </terminators>
        </keyboard>"#,
    );
    let removed = remove_unused_states(&mut kb);
    assert_eq!(removed, 1, "only the orphan action `when` is removed");
    let whens = &kb.action("a").unwrap().whens;
    assert!(!whens.iter().any(|w| w.state == "orphan"));
    assert!(whens.iter().any(|w| w.state == "s2"));
    // orphan terminator pruned too
    assert!(!kb.terminators.iter().any(|w| w.state == "orphan"));
    assert!(kb.terminators.iter().any(|w| w.state == "s1"));
}

// ---- templates sanity --------------------------------------------------------

#[test]
fn basic_template_is_empty_standard_is_typeable() {
    let basic = new_keyboard(Template::Basic, "B");
    let standard = new_keyboard(Template::Standard, "S");
    // Standard base map types 'a' on code 0; Basic has no output there.
    let sb = build_snapshot(&standard, 0, ModMask::empty(), "none");
    assert_eq!(sb.keys[0].output.as_deref(), Some("a"));
    let bb = build_snapshot(&basic, 0, ModMask::empty(), "none");
    assert_eq!(bb.keys[0].output, None);
}
