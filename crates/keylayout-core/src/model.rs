//! Core data model mirroring the `.keylayout` XML structure (.
//! All types derive Debug/Clone/PartialEq + serde for IPC + snapshot tests.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap};

/// A whole document: a standalone keyboard or a bundle of layouts.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "data")]
pub enum Document {
    Standalone(Keyboard),
    Bundle(crate::bundle::KeyboardBundle),
}

impl Document {
    /// All keyboards in the document, in order.
    pub fn keyboards(&self) -> Vec<&Keyboard> {
        match self {
            Document::Standalone(kb) => vec![kb],
            Document::Bundle(b) => b.layouts.iter().map(|l| &l.keyboard).collect(),
        }
    }
}

/// One keyboard layout (the root `<keyboard>` element).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Keyboard {
    pub group: i32,
    pub id: i32,
    pub name: String,
    /// Recomputed on serialize via [`Keyboard::update_maxout`].
    pub maxout: Option<u32>,
    pub layouts: Vec<LayoutRange>,
    pub modifier_maps: Vec<ModifierMap>,
    pub keymap_sets: Vec<KeyMapSet>,
    pub actions: Vec<Action>,
    pub terminators: Vec<When>,
    #[serde(default)]
    pub comments: Comments,
}

impl Keyboard {
    /// Longest output string length across all keymaps, actions, and terminators.
    pub fn compute_maxout(&self) -> u32 {
        let mut max = 0usize;
        // macOS sizes the typing buffer in UTF-16 code units, so an astral
        // output (e.g. an emoji = 1 scalar but 2 UTF-16 units) must count as 2 —
        // counting Unicode scalars would under-report and let macOS truncate.
        let chars = |s: &str| s.encode_utf16().count();
        for set in &self.keymap_sets {
            for map in &set.maps {
                for key in &map.keys {
                    match &key.value {
                        KeyValue::Output(s) => max = max.max(chars(s)),
                        KeyValue::InlineAction(a) => {
                            for w in &a.whens {
                                if let Some(o) = &w.output {
                                    max = max.max(chars(o));
                                }
                            }
                        }
                        KeyValue::ActionRef(_) => {}
                    }
                }
            }
        }
        for a in &self.actions {
            for w in &a.whens {
                if let Some(o) = &w.output {
                    max = max.max(chars(o));
                }
            }
        }
        for w in &self.terminators {
            if let Some(o) = &w.output {
                max = max.max(chars(o));
            }
        }
        // Apple emits a minimum of 1 even for an all-empty layout.
        (max as u32).max(1)
    }

    /// Recompute and store `maxout`. Called by the serializer.
    pub fn update_maxout(&mut self) {
        self.maxout = Some(self.compute_maxout());
    }

    /// Find a keymap set by id.
    pub fn keymap_set(&self, id: &str) -> Option<&KeyMapSet> {
        self.keymap_sets.iter().find(|s| s.id == id)
    }

    pub fn keymap_set_mut(&mut self, id: &str) -> Option<&mut KeyMapSet> {
        self.keymap_sets.iter_mut().find(|s| s.id == id)
    }

    /// Find a modifier map by id.
    pub fn modifier_map(&self, id: &str) -> Option<&ModifierMap> {
        self.modifier_maps.iter().find(|m| m.id == id)
    }

    /// Find an action by id.
    pub fn action(&self, id: &str) -> Option<&Action> {
        self.actions.iter().find(|a| a.id == id)
    }

    pub fn action_mut(&mut self, id: &str) -> Option<&mut Action> {
        self.actions.iter_mut().find(|a| a.id == id)
    }

    /// Pick the layout range covering a physical keyboard-type code.
    pub fn layout_for_type(&self, type_code: u32) -> Option<&LayoutRange> {
        self.layouts
            .iter()
            .find(|l| type_code >= l.first && type_code <= l.last)
    }

    /// All state names referenced anywhere (for the dead-state dropdown).
    pub fn states(&self) -> BTreeSet<String> {
        let mut set = BTreeSet::new();
        set.insert("none".to_string());
        for a in &self.actions {
            for w in &a.whens {
                set.insert(w.state.clone());
                if let Some(n) = &w.next {
                    set.insert(n.clone());
                }
            }
        }
        for w in &self.terminators {
            set.insert(w.state.clone());
        }
        set
    }
}

/// Maps a range of physical keyboard-type codes to a modifierMap + keyMapSet.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LayoutRange {
    pub first: u32,
    pub last: u32,
    pub modifiers: String,
    pub map_set: String,
}

/// `<modifierMap>` — selects a keymap index from a physical modifier combination.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModifierMap {
    pub id: String,
    pub default_index: u32,
    pub selects: Vec<KeyMapSelect>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct KeyMapSelect {
    pub map_index: u32,
    /// `<modifier keys="...">` children; any match selects this index.
    pub modifiers: Vec<ModifierSpec>,
}

/// One `<modifier keys="...">` token list.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModifierSpec {
    pub tokens: Vec<ModifierToken>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModifierToken {
    pub modifier: Modifier,
    pub optional: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Modifier {
    Shift,
    RightShift,
    AnyShift,
    Option,
    RightOption,
    AnyOption,
    Control,
    RightControl,
    AnyControl,
    Command,
    Caps,
}

/// `<keyMapSet>` — a set of keymaps (one per modifier index).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct KeyMapSet {
    pub id: String,
    pub maps: Vec<KeyMap>,
}

impl KeyMapSet {
    pub fn map(&self, index: u32) -> Option<&KeyMap> {
        self.maps.iter().find(|m| m.index == index)
    }
    pub fn map_mut(&mut self, index: u32) -> Option<&mut KeyMap> {
        self.maps.iter_mut().find(|m| m.index == index)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct KeyMap {
    pub index: u32,
    pub base: Option<BaseRef>,
    /// Sparse: only defined keys are listed.
    pub keys: Vec<Key>,
}

impl KeyMap {
    pub fn key(&self, code: u16) -> Option<&Key> {
        self.keys.iter().find(|k| k.code == code)
    }
    pub fn key_mut(&mut self, code: u16) -> Option<&mut Key> {
        self.keys.iter_mut().find(|k| k.code == code)
    }
    /// Insert or replace a key by code, keeping the list sorted by code.
    pub fn set_key(&mut self, key: Key) {
        if let Some(existing) = self.key_mut(key.code) {
            *existing = key;
        } else {
            self.keys.push(key);
            self.keys.sort_by_key(|k| k.code);
        }
    }
    pub fn remove_key(&mut self, code: u16) {
        self.keys.retain(|k| k.code != code);
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BaseRef {
    pub map_set: String,
    pub index: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Key {
    pub code: u16,
    pub value: KeyValue,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", content = "value")]
pub enum KeyValue {
    Output(String),
    ActionRef(String),
    InlineAction(Action),
}

/// `<action>` — dead-key / multi-state finite state machine.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Action {
    pub id: String,
    pub whens: Vec<When>,
}

impl Action {
    pub fn when(&self, state: &str) -> Option<&When> {
        self.whens.iter().find(|w| w.state == state)
    }
    pub fn when_mut(&mut self, state: &str) -> Option<&mut When> {
        self.whens.iter_mut().find(|w| w.state == state)
    }
}

/// `<when>` — one transition in an action or terminator.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct When {
    pub state: String,
    pub output: Option<String>,
    pub next: Option<String>,
    pub through: Option<String>,
    pub multiplier: Option<String>,
}

impl When {
    pub fn is_transition(&self) -> bool {
        self.next.is_some() && self.output.is_none()
    }
    pub fn is_output(&self) -> bool {
        self.output.is_some() && self.next.is_none()
    }
}

/// Round-trip comment storage. Keyed by a stable node path → preceding comments.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct Comments {
    pub before: HashMap<String, Vec<String>>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn when(state: &str, output: Option<&str>, next: Option<&str>) -> When {
        When {
            state: state.into(),
            output: output.map(Into::into),
            next: next.map(Into::into),
            through: None,
            multiplier: None,
        }
    }

    fn empty_kb() -> Keyboard {
        Keyboard {
            group: 0,
            id: -5,
            name: "E".into(),
            maxout: None,
            layouts: vec![],
            modifier_maps: vec![],
            keymap_sets: vec![],
            actions: vec![],
            terminators: vec![],
            comments: Comments::default(),
        }
    }

    #[test]
    fn when_transition_vs_output() {
        assert!(when("none", None, Some("s")).is_transition());
        assert!(!when("none", None, Some("s")).is_output());
        assert!(when("none", Some("x"), None).is_output());
        assert!(!when("none", Some("x"), None).is_transition());
        // both set → neither "pure" form
        assert!(!when("none", Some("x"), Some("s")).is_transition());
        assert!(!when("none", Some("x"), Some("s")).is_output());
    }

    #[test]
    fn set_key_replaces_in_place_and_keeps_sorted() {
        let mut m = KeyMap {
            index: 0,
            base: None,
            keys: vec![],
        };
        m.set_key(Key {
            code: 5,
            value: KeyValue::Output("e".into()),
        });
        m.set_key(Key {
            code: 1,
            value: KeyValue::Output("a".into()),
        });
        m.set_key(Key {
            code: 5,
            value: KeyValue::Output("E".into()),
        }); // replace, must not duplicate
        assert_eq!(m.keys.len(), 2);
        assert_eq!(
            m.keys.iter().map(|k| k.code).collect::<Vec<_>>(),
            vec![1, 5]
        );
        assert_eq!(m.key(5).unwrap().value, KeyValue::Output("E".into()));
        m.remove_key(1);
        assert!(m.key(1).is_none());
        assert_eq!(m.keys.len(), 1);
    }

    #[test]
    fn compute_maxout_minimum_is_one_when_empty() {
        assert_eq!(empty_kb().compute_maxout(), 1);
    }

    #[test]
    fn states_includes_none_and_next_targets() {
        let mut kb = empty_kb();
        kb.actions.push(Action {
            id: "a".into(),
            whens: vec![when("none", None, Some("acute"))],
        });
        let s = kb.states();
        assert!(s.contains("none"));
        assert!(s.contains("acute"));
    }

    #[test]
    fn layout_for_type_matches_range() {
        let mut kb = empty_kb();
        kb.layouts.push(LayoutRange {
            first: 0,
            last: 17,
            modifiers: "M".into(),
            map_set: "ANSI".into(),
        });
        assert!(kb.layout_for_type(0).is_some());
        assert!(kb.layout_for_type(17).is_some());
        assert!(kb.layout_for_type(18).is_none());
    }
}
