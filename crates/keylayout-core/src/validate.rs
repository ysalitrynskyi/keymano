//! Structural validation + repairs (docs/07, docs/12 §4). Returns `Vec<Issue>`.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

use crate::encoding::is_valid_unicode;
use crate::ids::id_plausible;
use crate::model::*;
use crate::special_keys::add_special_key_output;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Severity {
    Error,
    Warning,
}

/// A validation finding. `code` is a stable machine id; `auto_fixable` marks
/// issues [`repair`] can address.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Issue {
    pub severity: Severity,
    pub code: String,
    pub message: String,
    pub auto_fixable: bool,
}

impl Issue {
    fn error(code: &str, msg: impl Into<String>, fixable: bool) -> Self {
        Issue {
            severity: Severity::Error,
            code: code.into(),
            message: msg.into(),
            auto_fixable: fixable,
        }
    }
    fn warn(code: &str, msg: impl Into<String>, fixable: bool) -> Self {
        Issue {
            severity: Severity::Warning,
            code: code.into(),
            message: msg.into(),
            auto_fixable: fixable,
        }
    }
}

/// Validate a keyboard, returning all issues found.
pub fn validate(kb: &Keyboard) -> Vec<Issue> {
    let mut issues = Vec::new();

    if !id_plausible(kb.group, kb.id) {
        issues.push(Issue::error(
            "InvalidKeyboardID",
            format!("id {} is missing or out of range", kb.id),
            true,
        ));
    }

    let set_ids: HashSet<&str> = kb.keymap_sets.iter().map(|s| s.id.as_str()).collect();
    let modmap_ids: HashSet<&str> = kb.modifier_maps.iter().map(|m| m.id.as_str()).collect();

    for l in &kb.layouts {
        if l.first > l.last {
            issues.push(Issue::error(
                "LayoutRangeInverted",
                format!("layout range first={} > last={}", l.first, l.last),
                false,
            ));
        }
        if !modmap_ids.contains(l.modifiers.as_str()) {
            issues.push(Issue::error(
                "DanglingModifierRef",
                format!("layout references unknown modifierMap '{}'", l.modifiers),
                false,
            ));
        }
        if !set_ids.contains(l.map_set.as_str()) {
            issues.push(Issue::error(
                "DanglingMapSetRef",
                format!("layout references unknown keyMapSet '{}'", l.map_set),
                false,
            ));
        }
    }

    let action_ids: HashSet<&str> = kb.actions.iter().map(|a| a.id.as_str()).collect();

    // base ref validity + key/action checks
    for set in &kb.keymap_sets {
        let map_indices: HashSet<u32> = set.maps.iter().map(|m| m.index).collect();
        for map in &set.maps {
            if let Some(base) = &map.base {
                match kb.keymap_set(&base.map_set) {
                    None => issues.push(Issue::error(
                        "InvalidBaseIndex",
                        format!("keyMap base references unknown set '{}'", base.map_set),
                        true,
                    )),
                    Some(bs) => {
                        if bs.map(base.index).is_none() {
                            issues.push(Issue::error(
                                "InvalidBaseIndex",
                                format!(
                                    "keyMap base index {} missing in set '{}'",
                                    base.index, base.map_set
                                ),
                                true,
                            ));
                        }
                    }
                }
            }
            for key in &map.keys {
                check_key_value(kb, &key.value, &action_ids, &mut issues);
            }
        }
        // keymap index gap detection
        if let (Some(min), Some(max)) = (map_indices.iter().min(), map_indices.iter().max()) {
            for i in *min..=*max {
                if !map_indices.contains(&i) {
                    issues.push(Issue::warn(
                        "KeyMapSetGap",
                        format!("keyMapSet '{}' missing index {}", set.id, i),
                        false,
                    ));
                }
            }
        }
    }

    // base-map cycles
    for set in &kb.keymap_sets {
        for map in &set.maps {
            if has_cycle(kb, &set.id, map.index) {
                issues.push(Issue::error(
                    "BaseMapCycle",
                    format!("base-map cycle at set '{}' index {}", set.id, map.index),
                    false,
                ));
            }
        }
    }

    // A `next` target must be *defined* somewhere: handled by an action `when`
    // for that state, or given a terminator. (`kb.states()` can't be used here —
    // it folds `next` targets in, which makes the check vacuous.) An undefined
    // target means pressing the dead key then any key produces nothing.
    let mut defined_states: HashSet<&str> = HashSet::new();
    defined_states.insert("none");
    for a in &kb.actions {
        for w in &a.whens {
            defined_states.insert(w.state.as_str());
        }
    }
    for w in &kb.terminators {
        defined_states.insert(w.state.as_str());
    }
    for a in &kb.actions {
        for w in &a.whens {
            if let Some(n) = &w.next {
                if !defined_states.contains(n.as_str()) {
                    issues.push(Issue::warn(
                        "UnknownNextState",
                        format!(
                            "action '{}' transitions to state '{}' with no terminator or handler",
                            a.id, n
                        ),
                        false,
                    ));
                }
            }
        }
    }

    // duplicate ids (P1-04) — last-wins silently otherwise
    dup_ids(
        "modifierMap",
        kb.modifier_maps.iter().map(|m| m.id.as_str()),
        &mut issues,
    );
    dup_ids(
        "keyMapSet",
        kb.keymap_sets.iter().map(|s| s.id.as_str()),
        &mut issues,
    );
    dup_ids(
        "action",
        kb.actions.iter().map(|a| a.id.as_str()),
        &mut issues,
    );

    // duplicate <key code> inside one keyMap (P1-04)
    for set in &kb.keymap_sets {
        for map in &set.maps {
            let mut seen = HashSet::new();
            for key in &map.keys {
                if !seen.insert(key.code) {
                    issues.push(Issue::error(
                        "DuplicateKeyCode",
                        format!(
                            "keyMapSet '{}' index {} has duplicate key code {}",
                            set.id, map.index, key.code
                        ),
                        false,
                    ));
                }
            }
        }
    }

    // defaultIndex must be a declared mapIndex (P1-05)
    for m in &kb.modifier_maps {
        let declared: HashSet<u32> = m.selects.iter().map(|s| s.map_index).collect();
        if !declared.is_empty() && !declared.contains(&m.default_index) {
            issues.push(Issue::error(
                "InvalidDefaultIndex",
                format!(
                    "modifierMap '{}' defaultIndex {} is not a declared mapIndex",
                    m.id, m.default_index
                ),
                false,
            ));
        }
    }

    // invalid Unicode in any output
    check_unicode(kb, &mut issues);

    // MissingSpecialKeyOutput: a set with absolute maps but where NO map
    // defines the special control-char keys (sentinel: Return code 36). Avoids
    // false positives on real layouts whose specials live in any map index.
    for set in &kb.keymap_sets {
        let has_absolute = set.maps.iter().any(|m| m.base.is_none());
        let defines_specials = set
            .maps
            .iter()
            .any(|m| m.key(36).is_some() || m.key(48).is_some());
        if has_absolute && !defines_specials {
            issues.push(Issue::warn(
                "MissingSpecialKeyOutput",
                format!("keyMapSet '{}' defines no special-key output", set.id),
                true,
            ));
        }
    }

    issues
}

fn dup_ids<'a>(kind: &str, ids: impl Iterator<Item = &'a str>, issues: &mut Vec<Issue>) {
    let mut seen = HashSet::new();
    for id in ids {
        if !seen.insert(id) {
            issues.push(Issue::error(
                "DuplicateId",
                format!("duplicate {kind} id '{id}'"),
                false,
            ));
        }
    }
}

fn check_key_value(
    kb: &Keyboard,
    value: &KeyValue,
    action_ids: &HashSet<&str>,
    issues: &mut Vec<Issue>,
) {
    match value {
        KeyValue::ActionRef(id) => {
            if !action_ids.contains(id.as_str()) {
                issues.push(Issue::error(
                    "DanglingActionRef",
                    format!("key references unknown action '{}'", id),
                    false,
                ));
            }
        }
        KeyValue::Output(s) => {
            for ch in s.chars() {
                if !is_valid_unicode(ch as u32) {
                    issues.push(Issue::error(
                        "InvalidUnicode",
                        format!("invalid code point U+{:04X}", ch as u32),
                        false,
                    ));
                }
            }
        }
        KeyValue::InlineAction(a) => {
            for w in &a.whens {
                if let Some(o) = &w.output {
                    for ch in o.chars() {
                        if !is_valid_unicode(ch as u32) {
                            issues.push(Issue::error(
                                "InvalidUnicode",
                                format!("invalid code point U+{:04X}", ch as u32),
                                false,
                            ));
                        }
                    }
                }
            }
            let _ = kb;
        }
    }
}

fn check_unicode(kb: &Keyboard, issues: &mut Vec<Issue>) {
    let mut check = |s: &str| {
        for ch in s.chars() {
            if !is_valid_unicode(ch as u32) {
                issues.push(Issue::error(
                    "InvalidUnicode",
                    format!("invalid code point U+{:04X}", ch as u32),
                    false,
                ));
            }
        }
    };
    for a in &kb.actions {
        for w in &a.whens {
            if let Some(o) = &w.output {
                check(o);
            }
        }
    }
    for w in &kb.terminators {
        if let Some(o) = &w.output {
            check(o);
        }
    }
}

fn has_cycle(kb: &Keyboard, set_id: &str, index: u32) -> bool {
    let mut visited: HashSet<(String, u32)> = HashSet::new();
    let mut cur = Some((set_id.to_string(), index));
    while let Some((sid, idx)) = cur {
        if !visited.insert((sid.clone(), idx)) {
            return true;
        }
        match kb.keymap_set(&sid).and_then(|s| s.map(idx)) {
            Some(map) => {
                cur = map.base.as_ref().map(|b| (b.map_set.clone(), b.index));
            }
            None => break,
        }
    }
    false
}

/// Result of running auto-repair.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RepairReport {
    pub fixed: Vec<String>,
}

/// Apply auto-repairs for fixable issues. Idempotent.
pub fn repair(kb: &mut Keyboard) -> RepairReport {
    let mut fixed = Vec::new();

    // InvalidKeyboardID → assign valid random id (Unicode group)
    if !id_plausible(kb.group, kb.id) {
        kb.group = crate::ids::Script::MacUnicode.group();
        kb.id = crate::ids::random_keyboard_id(crate::ids::Script::MacUnicode);
        fixed.push("InvalidKeyboardID".into());
    }

    // MissingSpecialKeyOutput → inject into absolute base maps
    for set in &mut kb.keymap_sets {
        for map in &mut set.maps {
            if map.base.is_none() && map.index == 0 {
                let added = add_special_key_output(map);
                if added > 0 {
                    fixed.push("MissingSpecialKeyOutput".into());
                }
            }
        }
    }

    // InvalidBaseIndex → drop dangling base refs
    let set_indices: HashMap<String, HashSet<u32>> = kb
        .keymap_sets
        .iter()
        .map(|s| (s.id.clone(), s.maps.iter().map(|m| m.index).collect()))
        .collect();
    for set in &mut kb.keymap_sets {
        for map in &mut set.maps {
            if let Some(base) = &map.base {
                let ok = set_indices
                    .get(&base.map_set)
                    .map(|idx| idx.contains(&base.index))
                    .unwrap_or(false);
                if !ok {
                    map.base = None;
                    fixed.push("InvalidBaseIndex".into());
                }
            }
        }
    }

    // RepairJIS: absolute JIS set with all-empty maps → make relative to ANSI
    repair_jis(kb, &mut fixed);

    fixed.dedup();
    RepairReport { fixed }
}

fn repair_jis(kb: &mut Keyboard, fixed: &mut Vec<String>) {
    let ansi_exists = kb.keymap_set("ANSI").is_some();
    if !ansi_exists {
        return;
    }
    if let Some(jis) = kb.keymap_set_mut("JIS") {
        let all_absolute_empty = jis
            .maps
            .iter()
            .all(|m| m.base.is_none() && m.keys.is_empty());
        if all_absolute_empty && !jis.maps.is_empty() {
            for m in &mut jis.maps {
                m.base = Some(BaseRef {
                    map_set: "ANSI".into(),
                    index: m.index,
                });
            }
            fixed.push("RepairJIS".into());
        }
    }
}

/// Remove states unreachable from `none` + terminator targets.
pub fn remove_unused_states(kb: &mut Keyboard) -> usize {
    let mut reachable: HashSet<String> = HashSet::new();
    reachable.insert("none".to_string());
    // any `next` target reachable from a reachable state's whens; fixpoint
    loop {
        let mut changed = false;
        for a in &kb.actions {
            for w in &a.whens {
                if reachable.contains(&w.state) {
                    if let Some(n) = &w.next {
                        if reachable.insert(n.clone()) {
                            changed = true;
                        }
                    }
                }
            }
        }
        if !changed {
            break;
        }
    }
    let before: usize = kb.actions.iter().map(|a| a.whens.len()).sum();
    for a in &mut kb.actions {
        a.whens.retain(|w| reachable.contains(&w.state));
    }
    kb.terminators.retain(|w| reachable.contains(&w.state));
    let after: usize = kb.actions.iter().map(|a| a.whens.len()).sum();
    before - after
}

/// Remove actions not referenced by any key.
pub fn remove_unused_actions(kb: &mut Keyboard) -> usize {
    let mut referenced: HashSet<String> = HashSet::new();
    for set in &kb.keymap_sets {
        for map in &set.maps {
            for key in &map.keys {
                if let KeyValue::ActionRef(id) = &key.value {
                    referenced.insert(id.clone());
                }
            }
        }
    }
    let before = kb.actions.len();
    kb.actions.retain(|a| referenced.contains(&a.id));
    before - kb.actions.len()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse::parse_keylayout;
    use crate::templates::{new_keyboard, Template};

    const SAMPLE: &str = include_str!("../tests/fixtures/sample_dead.keylayout");

    #[test]
    fn sample_flags_missing_special_only() {
        let kb = parse_keylayout(SAMPLE).unwrap();
        let issues = validate(&kb);
        // id -15000 is plausible → no InvalidKeyboardID
        assert!(!issues.iter().any(|i| i.code == "InvalidKeyboardID"));
        // ANSI set defines no Return/Tab → flagged
        assert!(issues.iter().any(|i| i.code == "MissingSpecialKeyOutput"));
    }

    #[test]
    fn flags_inverted_layout_dup_id_and_bad_default_index() {
        let mut kb = new_keyboard(Template::Standard, "T");
        // P1-07 inverted range
        if let Some(l) = kb.layouts.first_mut() {
            l.first = 100;
            l.last = 50;
        }
        // P1-04 duplicate modifierMap id
        let dup = kb.modifier_maps[0].clone();
        kb.modifier_maps.push(dup);
        // P1-05 out-of-range defaultIndex
        kb.modifier_maps[0].default_index = 9999;
        let issues = validate(&kb);
        assert!(issues.iter().any(|i| i.code == "LayoutRangeInverted"));
        assert!(issues.iter().any(|i| i.code == "DuplicateId"));
        assert!(issues.iter().any(|i| i.code == "InvalidDefaultIndex"));
    }

    #[test]
    fn zero_id_flagged_and_repaired() {
        let mut kb = parse_keylayout(SAMPLE).unwrap();
        kb.id = 0;
        assert!(validate(&kb).iter().any(|i| i.code == "InvalidKeyboardID"));
        let report = repair(&mut kb);
        assert!(report.fixed.contains(&"InvalidKeyboardID".to_string()));
        assert!(!validate(&kb).iter().any(|i| i.code == "InvalidKeyboardID"));
    }

    #[test]
    fn template_validates_clean() {
        let kb = new_keyboard(Template::Standard, "T");
        let issues = validate(&kb);
        let errors: Vec<_> = issues
            .iter()
            .filter(|i| i.severity == Severity::Error)
            .collect();
        assert!(errors.is_empty(), "unexpected errors: {:?}", errors);
    }

    #[test]
    fn dangling_action_ref_detected() {
        let mut kb = parse_keylayout(SAMPLE).unwrap();
        kb.actions.clear();
        let issues = validate(&kb);
        assert!(issues.iter().any(|i| i.code == "DanglingActionRef"));
    }

    #[test]
    fn repair_injects_special_output() {
        let mut kb = parse_keylayout(SAMPLE).unwrap();
        let report = repair(&mut kb);
        assert!(report
            .fixed
            .contains(&"MissingSpecialKeyOutput".to_string()));
        // re-validate: special-output issue gone
        let issues = validate(&kb);
        assert!(!issues.iter().any(|i| i.code == "MissingSpecialKeyOutput"));
        // idempotent
        let r2 = repair(&mut kb);
        assert!(!r2.fixed.contains(&"MissingSpecialKeyOutput".to_string()));
    }

    #[test]
    fn repair_jis_makes_relative() {
        // Build a keyboard with absolute empty JIS set.
        let mut kb = new_keyboard(Template::Basic, "T");
        // force JIS maps absolute + empty
        let jis = kb.keymap_set_mut("JIS").unwrap();
        for m in &mut jis.maps {
            m.base = None;
            m.keys.clear();
        }
        let mut fixed = Vec::new();
        repair_jis(&mut kb, &mut fixed);
        assert!(fixed.contains(&"RepairJIS".to_string()));
        assert!(kb.keymap_set("JIS").unwrap().maps[0].base.is_some());
    }

    #[test]
    fn housekeeping_removes_unused() {
        let mut kb = parse_keylayout(SAMPLE).unwrap();
        // add an orphan action + orphan state
        kb.actions.push(Action {
            id: "orphan".into(),
            whens: vec![When {
                state: "ghost".into(),
                output: Some("x".into()),
                next: None,
                through: None,
                multiplier: None,
            }],
        });
        let removed_actions = remove_unused_actions(&mut kb);
        assert_eq!(removed_actions, 1);
        let removed_states = remove_unused_states(&mut kb);
        assert!(removed_states <= 1);
    }
}
