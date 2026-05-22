//! Key resolution with base-map inheritance + dead-state lookup, and the
//! frontend-facing [`KeyboardSnapshot`] builder (docs/05, docs/07).

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

use crate::model::*;
use crate::modifiers::{resolve_map_index, ModMask};

/// One resolved key, ready to render.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct KeyView {
    pub code: u16,
    /// Resolved literal output, or null when the key produces nothing.
    pub output: Option<String>,
    /// True when pressing the key enters a dead-key state.
    pub is_dead: bool,
    /// Action id if the key references / contains an action.
    pub action_id: Option<String>,
    /// Glyph/legend to draw.
    pub display: String,
    /// Code points of `output` (for chip display).
    pub code_points: Vec<u32>,
    /// True when the value came from a base map (inherited fallback).
    pub inherited: bool,
}

/// Flat render-ready snapshot for one (type, mask, dead-state).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct KeyboardSnapshot {
    pub keyboard_name: String,
    pub modifier_index: u32,
    pub dead_state: String,
    pub keys: Vec<KeyView>,
    pub available_modifier_indices: Vec<u32>,
    pub dead_states: Vec<String>,
    /// True when the requested mask was actually covered by a select (else the
    /// default index was used).
    pub mask_covered: bool,
}

/// Resolve a key value following base-map inheritance. Returns the value and
/// whether it was inherited from a base map. Detects cycles.
pub fn resolve_key_value<'a>(
    kb: &'a Keyboard,
    set_id: &str,
    index: u32,
    code: u16,
) -> Option<(&'a KeyValue, bool)> {
    let mut visited: HashSet<(String, u32)> = HashSet::new();
    resolve_inner(kb, set_id, index, code, false, &mut visited)
}

fn resolve_inner<'a>(
    kb: &'a Keyboard,
    set_id: &str,
    index: u32,
    code: u16,
    inherited: bool,
    visited: &mut HashSet<(String, u32)>,
) -> Option<(&'a KeyValue, bool)> {
    if !visited.insert((set_id.to_string(), index)) {
        return None; // cycle
    }
    let set = kb.keymap_set(set_id)?;
    let map = set.map(index)?;
    if let Some(key) = map.key(code) {
        return Some((&key.value, inherited));
    }
    if let Some(base) = &map.base {
        return resolve_inner(kb, &base.map_set, base.index, code, true, visited);
    }
    None
}

/// Build the render-ready snapshot. The single function the UI leans on.
pub fn build_snapshot(
    kb: &Keyboard,
    keyboard_type_code: u32,
    mask: ModMask,
    dead_state: &str,
) -> KeyboardSnapshot {
    let layout = kb
        .layout_for_type(keyboard_type_code)
        .or_else(|| kb.layouts.first());

    let (modmap_id, set_id) = match layout {
        Some(l) => (l.modifiers.clone(), l.map_set.clone()),
        None => (String::new(), String::new()),
    };

    let modmap = kb.modifier_map(&modmap_id);
    let (modifier_index, mask_covered) = match modmap {
        Some(m) => {
            let idx = resolve_map_index(m, mask);
            let covered = m.selects.iter().any(|s| {
                s.modifiers
                    .iter()
                    .any(|spec| crate::modifiers::spec_matches(spec, mask))
            });
            (idx, covered)
        }
        None => (0, false),
    };

    let mut keys = Vec::with_capacity(128);
    for code in 0u16..=127 {
        keys.push(resolve_key_view(
            kb,
            &set_id,
            modifier_index,
            code,
            dead_state,
        ));
    }

    let available_modifier_indices = modmap
        .map(|m| {
            let mut v: Vec<u32> = m.selects.iter().map(|s| s.map_index).collect();
            v.sort_unstable();
            v.dedup();
            v
        })
        .unwrap_or_default();

    KeyboardSnapshot {
        keyboard_name: kb.name.clone(),
        modifier_index,
        dead_state: dead_state.to_string(),
        keys,
        available_modifier_indices,
        dead_states: kb.states().into_iter().collect(),
        mask_covered,
    }
}

fn resolve_key_view(
    kb: &Keyboard,
    set_id: &str,
    index: u32,
    code: u16,
    dead_state: &str,
) -> KeyView {
    let resolved = resolve_key_value(kb, set_id, index, code);
    let (value, inherited) = match resolved {
        Some((v, inh)) => (Some(v), inh),
        None => (None, false),
    };

    let mut view = KeyView {
        code,
        output: None,
        is_dead: false,
        action_id: None,
        display: String::new(),
        code_points: Vec::new(),
        inherited,
    };

    match value {
        None => {}
        Some(KeyValue::Output(s)) => {
            // Plain output keys produce their literal regardless of dead state.
            view.output = Some(s.clone());
            view.display = s.clone();
        }
        Some(KeyValue::ActionRef(id)) => {
            view.action_id = Some(id.clone());
            if let Some(act) = kb.action(id) {
                apply_action(kb, act, dead_state, &mut view);
            }
        }
        Some(KeyValue::InlineAction(act)) => {
            view.action_id = Some(act.id.clone()).filter(|s| !s.is_empty());
            apply_action(kb, act, dead_state, &mut view);
        }
    }

    view.code_points = view
        .output
        .as_deref()
        .unwrap_or("")
        .chars()
        .map(|c| c as u32)
        .collect();
    view
}

/// Apply an action's `when` for the current dead state to a key view.
fn apply_action(kb: &Keyboard, act: &Action, dead_state: &str, view: &mut KeyView) {
    match act.when(dead_state) {
        Some(w) => {
            if let Some(o) = &w.output {
                view.output = Some(o.clone());
                view.display = o.clone();
            }
            if w.next.is_some() {
                view.is_dead = true;
                // entry key with no output: show the accent (terminator of the
                // target state) as a hint glyph.
                if view.output.is_none() {
                    if let Some(term) = terminator_output(kb, w.next.as_deref().unwrap()) {
                        view.display = term;
                    }
                }
            }
        }
        None => {
            // No transition for this state: would emit the terminator. Leave
            // empty display (UI shows nothing / placeholder).
        }
    }
}

/// Terminator output string for a state, if defined.
pub fn terminator_output(kb: &Keyboard, state: &str) -> Option<String> {
    kb.terminators
        .iter()
        .find(|w| w.state == state)
        .and_then(|w| w.output.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse::parse_keylayout;

    const SAMPLE: &str = include_str!("../tests/fixtures/sample_dead.keylayout");

    #[test]
    fn inheritance_resolves_from_base() {
        let kb = parse_keylayout(SAMPLE).unwrap();
        // code 1 absent in map 1, inherited from base map 0 ("s")
        let (val, inherited) = resolve_key_value(&kb, "ANSI", 1, 1).unwrap();
        assert_eq!(*val, KeyValue::Output("s".into()));
        assert!(inherited);
        // code 0 present in map 1 directly ("A")
        let (val, inherited) = resolve_key_value(&kb, "ANSI", 1, 0).unwrap();
        assert_eq!(*val, KeyValue::Output("A".into()));
        assert!(!inherited);
    }

    #[test]
    fn snapshot_base_state() {
        let kb = parse_keylayout(SAMPLE).unwrap();
        let snap = build_snapshot(&kb, 0, ModMask::empty(), "none");
        assert_eq!(snap.modifier_index, 0);
        let k0 = &snap.keys[0];
        assert_eq!(k0.output.as_deref(), Some("a"));
        let k2 = &snap.keys[2];
        assert!(k2.is_dead);
        assert_eq!(k2.action_id.as_deref(), Some("dead-acute"));
        // dead-key entry shows accent glyph from terminator of "acute"
        assert_eq!(k2.display, "´");
    }

    #[test]
    fn snapshot_shift_state() {
        let kb = parse_keylayout(SAMPLE).unwrap();
        let snap = build_snapshot(&kb, 0, ModMask::empty().with(ModMask::SHIFT_L), "none");
        assert_eq!(snap.modifier_index, 1);
        assert_eq!(snap.keys[0].output.as_deref(), Some("A"));
        // inherited from base
        assert_eq!(snap.keys[1].output.as_deref(), Some("s"));
        assert!(snap.keys[1].inherited);
    }

    #[test]
    fn snapshot_dead_state_preview() {
        let kb = parse_keylayout(SAMPLE).unwrap();
        let snap = build_snapshot(&kb, 0, ModMask::empty(), "acute");
        // code 2 action: when state=acute output á (re-pressing dead-acute)
        assert_eq!(snap.keys[2].output.as_deref(), Some("á"));
        assert!(!snap.keys[2].is_dead);
    }

    #[test]
    fn cycle_is_rejected() {
        let mut kb = parse_keylayout(SAMPLE).unwrap();
        // make map 0 base onto map 1 and map 1 base onto map 0 → cycle
        let set = kb.keymap_set_mut("ANSI").unwrap();
        set.map_mut(0).unwrap().base = Some(BaseRef {
            map_set: "ANSI".into(),
            index: 1,
        });
        set.map_mut(1).unwrap().base = Some(BaseRef {
            map_set: "ANSI".into(),
            index: 0,
        });
        // code 9 defined nowhere → recursion must terminate, return None
        assert!(resolve_key_value(&kb, "ANSI", 0, 9).is_none());
    }
}
