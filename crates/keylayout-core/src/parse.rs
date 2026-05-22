//! `.keylayout` XML → model (docs/02). Hand-rolled quick-xml event parser.
//!
//! Comments are parsed but dropped in v1 (docs/07 allows stubbing). Round-trip
//! of comments is a later phase.

use std::collections::HashMap;

use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;

use crate::encoding::decode_output;
use crate::error::{CoreError, Result};
use crate::model::*;
use crate::modifiers::parse_spec;

/// Parse a `.keylayout` XML string into a [`Keyboard`].
pub fn parse_keylayout(xml: &str) -> Result<Keyboard> {
    let mut reader = Reader::from_str(xml);
    let config = reader.config_mut();
    config.trim_text(true);
    config.expand_empty_elements = false;

    let mut kb = Keyboard {
        group: 0,
        id: 0,
        name: String::new(),
        maxout: None,
        layouts: Vec::new(),
        modifier_maps: Vec::new(),
        keymap_sets: Vec::new(),
        actions: Vec::new(),
        terminators: Vec::new(),
        comments: Comments::default(),
    };

    // parser context stack
    let mut stack: Vec<Ctx> = Vec::new();
    let mut saw_keyboard = false;
    let mut header_comments: Vec<String> = Vec::new();

    loop {
        match reader.read_event() {
            Err(e) => return Err(CoreError::Xml(e.to_string())),
            Ok(Event::Eof) => break,
            Ok(Event::Decl(_)) | Ok(Event::DocType(_)) | Ok(Event::PI(_)) => {}
            Ok(Event::Comment(c)) => {
                // preserve comments that precede the <keyboard> root (provenance)
                if !saw_keyboard {
                    header_comments.push(String::from_utf8_lossy(c.as_ref()).to_string());
                }
            }
            Ok(Event::Text(_)) | Ok(Event::CData(_)) => {}
            Ok(Event::Start(e)) => {
                if e.name().as_ref() == b"keyboard" {
                    if saw_keyboard {
                        return Err(CoreError::Other("multiple <keyboard> root elements".into()));
                    }
                    saw_keyboard = true;
                }
                handle_start(&e, &mut kb, &mut stack, false)?;
            }
            Ok(Event::Empty(e)) => {
                if e.name().as_ref() == b"keyboard" {
                    if saw_keyboard {
                        return Err(CoreError::Other("multiple <keyboard> root elements".into()));
                    }
                    saw_keyboard = true;
                }
                handle_start(&e, &mut kb, &mut stack, true)?;
            }
            Ok(Event::End(_)) => {
                stack.pop();
            }
        }
    }

    if !saw_keyboard {
        return Err(CoreError::Other(
            "no <keyboard> root element found".to_string(),
        ));
    }

    if !header_comments.is_empty() {
        kb.comments
            .before
            .insert("header".to_string(), header_comments);
    }

    Ok(kb)
}

/// Parser context: which open element we are inside.
enum Ctx {
    Keyboard,
    Layouts,
    ModifierMap(usize),             // index into kb.modifier_maps
    KeyMapSelect(usize, usize),     // (modmap idx, select idx)
    KeyMapSet(usize),               // index into kb.keymap_sets
    KeyMap(usize, usize),           // (set idx, map idx)
    KeyInline(usize, usize, usize), // (set, map, key) holding inline action
    Actions,
    Action(usize),                               // index into kb.actions
    InlineActionWhenParent(usize, usize, usize), // mirrors KeyInline for <when>
    Terminators,
    Other,
}

fn attrs(e: &BytesStart) -> Result<HashMap<String, String>> {
    let mut map = HashMap::new();
    for a in e.attributes() {
        let a = a.map_err(|e| CoreError::Xml(e.to_string()))?;
        // Reject non-UTF-8 rather than silently substituting U+FFFD (P1-14).
        let key = std::str::from_utf8(a.key.as_ref())
            .map_err(|err| CoreError::Xml(err.to_string()))?
            .to_string();
        let raw =
            std::str::from_utf8(a.value.as_ref()).map_err(|err| CoreError::Xml(err.to_string()))?;
        // Decode EVERY attribute exactly once here (well-formed XML attribute
        // values are entity-escaped, so a bare '&' can't appear). The model thus
        // always holds decoded strings, and the serializer re-escapes exactly
        // once — no double-encoding of ids/states/names (P0-01).
        map.insert(key, decode_output(raw)?);
    }
    Ok(map)
}

fn req<'a>(m: &'a HashMap<String, String>, el: &str, k: &str) -> Result<&'a String> {
    m.get(k).ok_or_else(|| CoreError::MissingAttr {
        element: el.into(),
        attr: k.into(),
    })
}

fn parse_int<T: std::str::FromStr>(el: &str, attr: &str, v: &str) -> Result<T> {
    v.trim().parse::<T>().map_err(|_| CoreError::InvalidAttr {
        element: el.into(),
        attr: attr.into(),
        value: v.into(),
    })
}

fn handle_start(
    e: &BytesStart,
    kb: &mut Keyboard,
    stack: &mut Vec<Ctx>,
    empty: bool,
) -> Result<()> {
    // Reject non-UTF-8 element names rather than substituting U+FFFD (matches
    // the attribute-key handling in attrs()).
    let name = std::str::from_utf8(e.name().as_ref())
        .map_err(|err| CoreError::Xml(err.to_string()))?
        .to_string();
    let a = attrs(e)?;

    match name.as_str() {
        "keyboard" => {
            kb.group = parse_int("keyboard", "group", req(&a, "keyboard", "group")?)?;
            kb.id = parse_int("keyboard", "id", req(&a, "keyboard", "id")?)?;
            kb.name = a.get("name").cloned().unwrap_or_default();
            if let Some(m) = a.get("maxout") {
                kb.maxout = Some(parse_int("keyboard", "maxout", m)?);
            }
            push(stack, Ctx::Keyboard, empty);
        }
        "layouts" => push(stack, Ctx::Layouts, empty),
        "layout" => {
            kb.layouts.push(LayoutRange {
                first: parse_int("layout", "first", req(&a, "layout", "first")?)?,
                last: parse_int("layout", "last", req(&a, "layout", "last")?)?,
                modifiers: req(&a, "layout", "modifiers")?.clone(),
                map_set: req(&a, "layout", "mapSet")?.clone(),
            });
            push(stack, Ctx::Other, empty);
        }
        "modifierMap" => {
            kb.modifier_maps.push(ModifierMap {
                id: req(&a, "modifierMap", "id")?.clone(),
                default_index: parse_int(
                    "modifierMap",
                    "defaultIndex",
                    req(&a, "modifierMap", "defaultIndex")?,
                )?,
                selects: Vec::new(),
            });
            push(stack, Ctx::ModifierMap(kb.modifier_maps.len() - 1), empty);
        }
        "keyMapSelect" => {
            let mm = current_modmap(stack)?;
            kb.modifier_maps[mm].selects.push(KeyMapSelect {
                map_index: parse_int(
                    "keyMapSelect",
                    "mapIndex",
                    req(&a, "keyMapSelect", "mapIndex")?,
                )?,
                modifiers: Vec::new(),
            });
            let si = kb.modifier_maps[mm].selects.len() - 1;
            push(stack, Ctx::KeyMapSelect(mm, si), empty);
        }
        "modifier" => {
            let (mm, si) = current_select(stack)?;
            let keys = a.get("keys").map(|s| s.as_str()).unwrap_or("");
            let spec = parse_spec(keys)?;
            kb.modifier_maps[mm].selects[si].modifiers.push(spec);
            push(stack, Ctx::Other, empty);
        }
        "keyMapSet" => {
            kb.keymap_sets.push(KeyMapSet {
                id: req(&a, "keyMapSet", "id")?.clone(),
                maps: Vec::new(),
            });
            push(stack, Ctx::KeyMapSet(kb.keymap_sets.len() - 1), empty);
        }
        "keyMap" => {
            let set = current_keymapset(stack)?;
            let base = match (a.get("baseMapSet"), a.get("baseIndex")) {
                (Some(ms), Some(bi)) => Some(BaseRef {
                    map_set: ms.clone(),
                    index: parse_int("keyMap", "baseIndex", bi)?,
                }),
                _ => None,
            };
            kb.keymap_sets[set].maps.push(KeyMap {
                index: parse_int("keyMap", "index", req(&a, "keyMap", "index")?)?,
                base,
                keys: Vec::new(),
            });
            let mi = kb.keymap_sets[set].maps.len() - 1;
            push(stack, Ctx::KeyMap(set, mi), empty);
        }
        "key" => {
            let (set, mi) = current_keymap(stack)?;
            let code: u16 = parse_int("key", "code", req(&a, "key", "code")?)?;
            // Sentinel code 512 is the dummy `<key>` the serializer emits to keep
            // an otherwise-empty keyMap DTD-valid (`keyMap (key+)`). It carries no
            // real binding — skip it so it never enters the model and round-trips
            // stay clean (matches Ukelele's kDummyKeyCode).
            if code == 512 {
                // Skip the dummy: don't add it to the model.
                push(stack, Ctx::Other, empty);
            } else if a.contains_key("output") && a.contains_key("action") {
                // DTD declares output/action mutually exclusive (P1-06).
                return Err(CoreError::Other(
                    "<key> has both output and action".to_string(),
                ));
            } else if let Some(out) = a.get("output") {
                kb.keymap_sets[set].maps[mi].keys.push(Key {
                    code,
                    value: KeyValue::Output(out.clone()),
                });
                push(stack, Ctx::Other, empty);
            } else if let Some(act) = a.get("action") {
                kb.keymap_sets[set].maps[mi].keys.push(Key {
                    code,
                    value: KeyValue::ActionRef(act.clone()),
                });
                push(stack, Ctx::Other, empty);
            } else {
                // inline action child expected
                kb.keymap_sets[set].maps[mi].keys.push(Key {
                    code,
                    value: KeyValue::InlineAction(Action {
                        id: String::new(),
                        whens: Vec::new(),
                    }),
                });
                let ki = kb.keymap_sets[set].maps[mi].keys.len() - 1;
                push(stack, Ctx::KeyInline(set, mi, ki), empty);
            }
        }
        "actions" => push(stack, Ctx::Actions, empty),
        "action" => {
            // could be top-level <action> or inline child of <key>
            if let Some(&Ctx::KeyInline(set, mi, ki)) = stack.last() {
                push(stack, Ctx::InlineActionWhenParent(set, mi, ki), empty);
            } else {
                kb.actions.push(Action {
                    id: req(&a, "action", "id")?.clone(),
                    whens: Vec::new(),
                });
                push(stack, Ctx::Action(kb.actions.len() - 1), empty);
            }
        }
        "terminators" => push(stack, Ctx::Terminators, empty),
        "when" => {
            let w = parse_when(&a)?;
            match stack.last() {
                Some(Ctx::Action(ai)) => kb.actions[*ai].whens.push(w),
                Some(Ctx::Terminators) => kb.terminators.push(w),
                Some(Ctx::InlineActionWhenParent(set, mi, ki)) => {
                    if let KeyValue::InlineAction(act) =
                        &mut kb.keymap_sets[*set].maps[*mi].keys[*ki].value
                    {
                        act.whens.push(w);
                    }
                }
                _ => {}
            }
            push(stack, Ctx::Other, empty);
        }
        _ => push(stack, Ctx::Other, empty),
    }
    Ok(())
}

fn parse_when(a: &HashMap<String, String>) -> Result<When> {
    Ok(When {
        // `state` is required by the DTD — don't silently invent "none" (P1-02).
        state: req(a, "when", "state")?.clone(),
        output: a.get("output").cloned(),
        next: a.get("next").cloned(),
        through: a.get("through").cloned(),
        multiplier: a.get("multiplier").cloned(),
    })
}

fn push(stack: &mut Vec<Ctx>, ctx: Ctx, empty: bool) {
    if !empty {
        stack.push(ctx);
    }
}

fn current_modmap(stack: &[Ctx]) -> Result<usize> {
    for c in stack.iter().rev() {
        if let Ctx::ModifierMap(i) = c {
            return Ok(*i);
        }
    }
    Err(CoreError::Other("modifier outside modifierMap".into()))
}
fn current_select(stack: &[Ctx]) -> Result<(usize, usize)> {
    for c in stack.iter().rev() {
        if let Ctx::KeyMapSelect(m, s) = c {
            return Ok((*m, *s));
        }
    }
    Err(CoreError::Other("modifier outside keyMapSelect".into()))
}
fn current_keymapset(stack: &[Ctx]) -> Result<usize> {
    for c in stack.iter().rev() {
        if let Ctx::KeyMapSet(i) = c {
            return Ok(*i);
        }
    }
    Err(CoreError::Other("keyMap outside keyMapSet".into()))
}
fn current_keymap(stack: &[Ctx]) -> Result<(usize, usize)> {
    for c in stack.iter().rev() {
        if let Ctx::KeyMap(s, m) = c {
            return Ok((*s, *m));
        }
    }
    Err(CoreError::Other("key outside keyMap".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = include_str!("../tests/fixtures/sample_dead.keylayout");

    #[test]
    fn parse_sample_basic_fields() {
        let kb = parse_keylayout(SAMPLE).unwrap();
        assert_eq!(kb.group, 1);
        assert_eq!(kb.id, -15000);
        assert_eq!(kb.name, "My Layout");
        assert_eq!(kb.layouts.len(), 2);
        assert_eq!(kb.modifier_maps.len(), 1);
        assert_eq!(kb.modifier_maps[0].selects.len(), 5);
        assert_eq!(kb.keymap_sets.len(), 1);
        assert_eq!(kb.actions.len(), 1);
        assert_eq!(kb.terminators.len(), 1);
    }

    #[test]
    fn parse_key_values() {
        let kb = parse_keylayout(SAMPLE).unwrap();
        let set = &kb.keymap_sets[0];
        let m0 = set.map(0).unwrap();
        assert_eq!(m0.key(0).unwrap().value, KeyValue::Output("a".into()));
        assert_eq!(
            m0.key(2).unwrap().value,
            KeyValue::ActionRef("dead-acute".into())
        );
        let m1 = set.map(1).unwrap();
        assert_eq!(m1.base.as_ref().unwrap().map_set, "ANSI");
        assert_eq!(m1.key(2).unwrap().value, KeyValue::Output("´".into()));
    }

    #[test]
    fn parse_action_and_terminator() {
        let kb = parse_keylayout(SAMPLE).unwrap();
        let act = kb.action("dead-acute").unwrap();
        assert!(act.when("none").unwrap().is_transition());
        assert_eq!(act.when("acute").unwrap().output.as_deref(), Some("á"));
        assert_eq!(kb.terminators[0].state, "acute");
    }

    #[test]
    fn parse_missing_required_attr_errors() {
        let bad = r#"<keyboard group="1"></keyboard>"#;
        assert!(parse_keylayout(bad).is_err());
    }

    #[test]
    fn attribute_entities_decoded_once_no_double_encode() {
        // P0-01: an action id with an escaped '&' must decode to a literal '&'
        // and round-trip without becoming '&amp;amp;'.
        let xml = r#"<keyboard group="1" id="-15000" name="N">
          <keyMapSet id="s"><keyMap index="0"><key code="0" action="a&amp;b"/></keyMap></keyMapSet>
          <actions><action id="a&amp;b"><when state="none" output="x"/></action></actions>
        </keyboard>"#;
        let kb = parse_keylayout(xml).unwrap();
        assert_eq!(kb.actions[0].id, "a&b");
        let out = crate::serialize::serialize_keylayout(&kb, &crate::EncodeOpts::default());
        // re-parse must yield the same id (no double-encoding on the way out)
        assert_eq!(parse_keylayout(&out).unwrap().actions[0].id, "a&b");
    }

    #[test]
    fn when_missing_state_errors() {
        // P1-02
        let xml = r#"<keyboard group="1" id="-15000" name="N">
          <terminators><when output="x"/></terminators></keyboard>"#;
        assert!(parse_keylayout(xml).is_err());
    }

    #[test]
    fn multiple_keyboard_roots_error() {
        // P1-03
        let xml = r#"<keyboard group="1" id="-15000" name="A"></keyboard><keyboard group="1" id="-15001" name="B"></keyboard>"#;
        assert!(parse_keylayout(xml).is_err());
    }

    #[test]
    fn key_with_output_and_action_errors() {
        // P1-06
        let xml = r#"<keyboard group="1" id="-15000" name="N">
          <keyMapSet id="s"><keyMap index="0"><key code="0" output="a" action="x"/></keyMap></keyMapSet></keyboard>"#;
        assert!(parse_keylayout(xml).is_err());
    }

    #[test]
    fn missing_default_index_errors() {
        // P1-05 (required at parse)
        let xml = r#"<keyboard group="1" id="-15000" name="N">
          <modifierMap id="m"><keyMapSelect mapIndex="0"><modifier keys=""/></keyMapSelect></modifierMap></keyboard>"#;
        assert!(parse_keylayout(xml).is_err());
    }
}
