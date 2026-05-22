//! model → `.keylayout` XML (docs/02). Stable, diff-friendly output.
//!
//! - Recomputes `maxout` on serialize.
//! - Sorts keys by code, maps by index for stable output.
//! - Emits the Apple DOCTYPE.
//! - Configurable non-ASCII encoding via [`EncodeOpts`].

use crate::encoding::{encode_output, EncodeOpts};
use crate::model::*;
use crate::modifiers::spec_to_keys;

/// Serialize a keyboard to a `.keylayout` XML string. Recomputes `maxout`.
pub fn serialize_keylayout(kb: &Keyboard, opts: &EncodeOpts) -> String {
    let mut kb = kb.clone();
    kb.update_maxout();
    let mut s = String::new();
    s.push_str("<?xml version=\"1.1\" encoding=\"UTF-8\"?>\n");
    s.push_str("<!DOCTYPE keyboard PUBLIC \"-//Apple//DTD Keyboard Layout//EN\"\n");
    s.push_str("  \"file://localhost/System/Library/DTDs/KeyboardLayout.dtd\">\n");
    // re-emit preserved leading comments (provenance), verbatim
    if let Some(header) = kb.comments.before.get("header") {
        for c in header {
            s.push_str("<!--");
            s.push_str(c);
            s.push_str("-->\n");
        }
    }

    let maxout = kb.maxout.unwrap_or(0);
    s.push_str(&format!(
        "<keyboard group=\"{}\" id=\"{}\" name=\"{}\" maxout=\"{}\">\n",
        kb.group,
        kb.id,
        attr_escape(&kb.name),
        maxout
    ));

    // layouts
    s.push_str("  <layouts>\n");
    for l in &kb.layouts {
        s.push_str(&format!(
            "    <layout first=\"{}\" last=\"{}\" modifiers=\"{}\" mapSet=\"{}\"/>\n",
            l.first,
            l.last,
            attr_escape(&l.modifiers),
            attr_escape(&l.map_set)
        ));
    }
    s.push_str("  </layouts>\n");

    // modifier maps
    for m in &kb.modifier_maps {
        s.push_str(&format!(
            "  <modifierMap id=\"{}\" defaultIndex=\"{}\">\n",
            attr_escape(&m.id),
            m.default_index
        ));
        for sel in &m.selects {
            s.push_str(&format!(
                "    <keyMapSelect mapIndex=\"{}\">",
                sel.map_index
            ));
            for spec in &sel.modifiers {
                s.push_str(&format!(
                    "<modifier keys=\"{}\"/>",
                    attr_escape(&spec_to_keys(spec))
                ));
            }
            s.push_str("</keyMapSelect>\n");
        }
        s.push_str("  </modifierMap>\n");
    }

    // keymap sets
    for set in &kb.keymap_sets {
        s.push_str(&format!("  <keyMapSet id=\"{}\">\n", attr_escape(&set.id)));
        let mut maps: Vec<&KeyMap> = set.maps.iter().collect();
        maps.sort_by_key(|m| m.index);
        for map in maps {
            match &map.base {
                Some(b) => s.push_str(&format!(
                    "    <keyMap index=\"{}\" baseMapSet=\"{}\" baseIndex=\"{}\">\n",
                    map.index,
                    attr_escape(&b.map_set),
                    b.index
                )),
                None => s.push_str(&format!("    <keyMap index=\"{}\">\n", map.index)),
            }
            let mut keys: Vec<&Key> = map.keys.iter().collect();
            keys.sort_by_key(|k| k.code);
            if keys.is_empty() {
                // The Apple DTD declares `<!ELEMENT keyMap (key+)>` — a keyMap
                // must hold at least one <key>. An empty map (e.g. an unfilled
                // template index, or a base-inheriting map with no overrides)
                // would be DTD-invalid and macOS may reject the layout. Emit a
                // dummy key with the sentinel code 512 (matches Ukelele's
                // kDummyKeyCode); the parser skips code 512 so it never enters
                // the model and round-trips stay clean.
                s.push_str("      <key code=\"512\" output=\"\"/>\n");
            }
            for key in keys {
                write_key(&mut s, key, opts);
            }
            s.push_str("    </keyMap>\n");
        }
        s.push_str("  </keyMapSet>\n");
    }

    // actions
    if !kb.actions.is_empty() {
        s.push_str("  <actions>\n");
        for a in &kb.actions {
            s.push_str(&format!("    <action id=\"{}\">\n", attr_escape(&a.id)));
            write_action_whens(&mut s, &a.whens, opts, 6);
            s.push_str("    </action>\n");
        }
        s.push_str("  </actions>\n");
    }

    // terminators
    if !kb.terminators.is_empty() {
        s.push_str("  <terminators>\n");
        for w in &kb.terminators {
            write_when(&mut s, w, opts, 4);
        }
        s.push_str("  </terminators>\n");
    }

    s.push_str("</keyboard>\n");
    s
}

fn write_key(s: &mut String, key: &Key, opts: &EncodeOpts) {
    match &key.value {
        KeyValue::Output(out) => s.push_str(&format!(
            "      <key code=\"{}\" output=\"{}\"/>\n",
            key.code,
            encode_output(out, opts)
        )),
        KeyValue::ActionRef(id) => s.push_str(&format!(
            "      <key code=\"{}\" action=\"{}\"/>\n",
            key.code,
            attr_escape(id)
        )),
        KeyValue::InlineAction(act) => {
            s.push_str(&format!("      <key code=\"{}\">\n", key.code));
            s.push_str("        <action>\n");
            write_action_whens(s, &act.whens, opts, 10);
            s.push_str("        </action>\n");
            s.push_str("      </key>\n");
        }
    }
}

/// Emit an action's `<when>` children with the `state="none"` when first,
/// synthesizing an empty one if the model lacks it. Mirrors Ukelele's
/// `ActionElement::CreateXMLTree`, which always writes a `none` when first — it
/// defines the action's base-state behavior, and a re-import that loses it would
/// change the dead-key FSM. Remaining whens keep their stored order.
fn write_action_whens(s: &mut String, whens: &[When], opts: &EncodeOpts, indent: usize) {
    if let Some(none) = whens.iter().find(|w| w.state == "none") {
        write_when(s, none, opts, indent);
    } else {
        let pad = " ".repeat(indent);
        s.push_str(&format!("{pad}<when state=\"none\"/>\n"));
    }
    for w in whens.iter().filter(|w| w.state != "none") {
        write_when(s, w, opts, indent);
    }
}

fn write_when(s: &mut String, w: &When, opts: &EncodeOpts, indent: usize) {
    let pad = " ".repeat(indent);
    s.push_str(&format!("{pad}<when state=\"{}\"", attr_escape(&w.state)));
    if let Some(o) = &w.output {
        s.push_str(&format!(" output=\"{}\"", encode_output(o, opts)));
    }
    if let Some(n) = &w.next {
        s.push_str(&format!(" next=\"{}\"", attr_escape(n)));
    }
    if let Some(t) = &w.through {
        s.push_str(&format!(" through=\"{}\"", attr_escape(t)));
    }
    if let Some(m) = &w.multiplier {
        s.push_str(&format!(" multiplier=\"{}\"", attr_escape(m)));
    }
    s.push_str("/>\n");
}

/// Escape a plain attribute value (ids, names, refs) — the five XML entities.
fn attr_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(ch),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse::parse_keylayout;

    const SAMPLE: &str = include_str!("../tests/fixtures/sample_dead.keylayout");

    #[test]
    fn empty_keymap_gets_dummy_key_and_round_trips_clean() {
        use crate::templates::{new_keyboard, Template};
        // Basic template has unfilled keyMaps (indices 2-5) + base-inheriting
        // JIS maps — all empty. The DTD requires `keyMap (key+)`.
        let kb = new_keyboard(Template::Basic, "T");
        let xml = serialize_keylayout(&kb, &EncodeOpts::default());
        // No keyMap is emitted empty (no open immediately followed by close).
        assert!(
            !xml.contains("\">\n    </keyMap>"),
            "an empty <keyMap> was serialized:\n{xml}"
        );
        // The dummy sentinel is present for the empty maps.
        assert!(xml.contains("<key code=\"512\" output=\"\"/>"));
        // The dummy never enters the model: re-parse drops it (round-trip clean).
        let kb2 = parse_keylayout(&xml).unwrap();
        for set in &kb2.keymap_sets {
            for map in &set.maps {
                assert!(
                    map.keys.iter().all(|k| k.code != 512),
                    "dummy key 512 leaked into the model"
                );
            }
        }
        // Serialize is idempotent across the round-trip.
        assert_eq!(xml, serialize_keylayout(&kb2, &EncodeOpts::default()));
    }

    #[test]
    fn action_always_emits_state_none_when_first() {
        // Action whose whens lack a `none` entry — serializer must synthesize it
        // and place it before the others (Ukelele parity).
        let xml = r#"<keyboard group="0" id="-1" name="A">
  <actions>
    <action id="acute"><when state="adia" output="é"/></action>
  </actions>
</keyboard>"#;
        let kb = parse_keylayout(xml).unwrap();
        let out = serialize_keylayout(&kb, &EncodeOpts::default());
        let none_at = out.find("<when state=\"none\"").expect("none when present");
        let adia_at = out.find("<when state=\"adia\"").expect("adia when present");
        assert!(none_at < adia_at, "none when must come first:\n{out}");
    }

    #[test]
    fn high_key_codes_round_trip() {
        // Codes > 127 (right-Command 257) and JIS extras (102/104) must survive
        // parse → serialize, and not be confused with the dummy 512.
        let xml = r#"<keyboard group="0" id="-1" name="A">
  <keyMapSet id="ANSI"><keyMap index="0">
    <key code="257" output="x"/>
    <key code="102" output="y"/>
    <key code="104" output="z"/>
  </keyMap></keyMapSet>
</keyboard>"#;
        let kb = parse_keylayout(xml).unwrap();
        let out = serialize_keylayout(&kb, &EncodeOpts::default());
        let kb2 = parse_keylayout(&out).unwrap();
        let codes: Vec<u16> = kb2.keymap_sets[0].maps[0]
            .keys
            .iter()
            .map(|k| k.code)
            .collect();
        assert!(codes.contains(&257) && codes.contains(&102) && codes.contains(&104));
    }

    #[test]
    fn round_trip_model_equal() {
        let kb = parse_keylayout(SAMPLE).unwrap();
        let xml = serialize_keylayout(&kb, &EncodeOpts::default());
        let kb2 = parse_keylayout(&xml).unwrap();
        // maxout is recomputed; compare everything else by re-normalizing
        let mut a = kb.clone();
        a.update_maxout();
        assert_eq!(a, kb2);
    }

    #[test]
    fn byte_stable_on_own_output() {
        let kb = parse_keylayout(SAMPLE).unwrap();
        let xml1 = serialize_keylayout(&kb, &EncodeOpts::default());
        let kb2 = parse_keylayout(&xml1).unwrap();
        let xml2 = serialize_keylayout(&kb2, &EncodeOpts::default());
        assert_eq!(xml1, xml2);
    }

    #[test]
    fn maxout_recomputed() {
        let mut kb = parse_keylayout(SAMPLE).unwrap();
        kb.maxout = Some(999);
        let xml = serialize_keylayout(&kb, &EncodeOpts::default());
        assert!(xml.contains("maxout=\"1\""));
    }

    #[test]
    fn encode_non_ascii_option() {
        let kb = parse_keylayout(SAMPLE).unwrap();
        let plain = serialize_keylayout(&kb, &EncodeOpts::default());
        assert!(plain.contains("á") || plain.contains("&#x00E1;"));
        let coded = serialize_keylayout(
            &kb,
            &EncodeOpts {
                code_non_ascii: true,
            },
        );
        assert!(coded.contains("&#x00E1;"));
        assert!(!coded.contains('á'));
    }
}
