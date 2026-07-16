//! Structural validation + repairs (. Returns `Vec<Issue>`.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};

use crate::encoding::is_valid_unicode;
use crate::ids::id_plausible;
use crate::model::*;
use crate::special_keys::SPECIAL_OUTPUTS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Severity {
    Error,
    Warning,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum IssueCategory {
    Keyboard,
    Layout,
    ModifierMap,
    KeyMapSet,
    KeyMap,
    Key,
    Action,
    DeadState,
    Unicode,
}

impl IssueCategory {
    pub fn as_str(self) -> &'static str {
        match self {
            IssueCategory::Keyboard => "keyboard",
            IssueCategory::Layout => "layout",
            IssueCategory::ModifierMap => "modifierMap",
            IssueCategory::KeyMapSet => "keyMapSet",
            IssueCategory::KeyMap => "keyMap",
            IssueCategory::Key => "key",
            IssueCategory::Action => "action",
            IssueCategory::DeadState => "deadState",
            IssueCategory::Unicode => "unicode",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value")]
pub enum IssueLocation {
    Keyboard,
    LayoutRange {
        index: usize,
    },
    ModifierMap {
        id: String,
    },
    KeyMapSet {
        id: String,
    },
    KeyMap {
        set_id: String,
        map_index: u32,
    },
    Key {
        set_id: String,
        map_index: u32,
        code: u16,
    },
    Action {
        id: String,
    },
    State {
        state: String,
    },
}

/// A validation finding. `code` is a stable machine id; `auto_fixable` marks
/// issues [`repair`] can address.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Issue {
    pub severity: Severity,
    pub code: String,
    pub message: String,
    pub auto_fixable: bool,
    pub category: IssueCategory,
    pub location: Option<IssueLocation>,
    #[serde(default)]
    pub affected: Vec<String>,
}

impl Issue {
    fn error(code: &str, msg: impl Into<String>, fixable: bool) -> Self {
        Issue {
            severity: Severity::Error,
            code: code.into(),
            message: msg.into(),
            auto_fixable: fixable,
            category: IssueCategory::Keyboard,
            location: None,
            affected: Vec::new(),
        }
    }
    fn warn(code: &str, msg: impl Into<String>, fixable: bool) -> Self {
        Issue {
            severity: Severity::Warning,
            code: code.into(),
            message: msg.into(),
            auto_fixable: fixable,
            category: IssueCategory::Keyboard,
            location: None,
            affected: Vec::new(),
        }
    }
    fn category(mut self, category: IssueCategory) -> Self {
        self.category = category;
        self
    }
    fn at(mut self, location: IssueLocation) -> Self {
        self.location = Some(location);
        self
    }
    fn affects(mut self, values: impl IntoIterator<Item = impl Into<String>>) -> Self {
        self.affected = values.into_iter().map(Into::into).collect();
        self
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ValidationReport {
    pub issues: Vec<Issue>,
    pub error_count: usize,
    pub warning_count: usize,
    pub auto_fixable_count: usize,
    pub by_category: BTreeMap<String, usize>,
}

pub fn validation_report(kb: &Keyboard) -> ValidationReport {
    report_from_issues(validate(kb))
}

pub fn validate_document(document: &Document) -> ValidationReport {
    let mut issues = Vec::new();
    match document {
        Document::Standalone(kb) => issues.extend(validate(kb)),
        Document::Bundle(bundle) => {
            if bundle.layouts.is_empty() {
                issues.push(
                    Issue::error(
                        "ZeroLayoutBundle",
                        "bundle contains no keyboard layouts",
                        false,
                    )
                    .category(IssueCategory::KeyMapSet),
                );
            }
            for layout in &bundle.layouts {
                issues.extend(validate(&layout.keyboard));
            }
        }
    }
    report_from_issues(issues)
}

fn report_from_issues(issues: Vec<Issue>) -> ValidationReport {
    let mut by_category = BTreeMap::new();
    for issue in &issues {
        *by_category
            .entry(issue.category.as_str().to_string())
            .or_insert(0) += 1;
    }
    ValidationReport {
        error_count: issues
            .iter()
            .filter(|i| i.severity == Severity::Error)
            .count(),
        warning_count: issues
            .iter()
            .filter(|i| i.severity == Severity::Warning)
            .count(),
        auto_fixable_count: issues.iter().filter(|i| i.auto_fixable).count(),
        issues,
        by_category,
    }
}

/// Validate a keyboard, returning all issues found.
pub fn validate(kb: &Keyboard) -> Vec<Issue> {
    let mut issues = Vec::new();

    if !id_plausible(kb.group, kb.id) {
        issues.push(
            Issue::error(
                "InvalidKeyboardID",
                format!("id {} is missing or out of range", kb.id),
                true,
            )
            .category(IssueCategory::Keyboard)
            .at(IssueLocation::Keyboard),
        );
    }

    let set_ids: HashSet<&str> = kb.keymap_sets.iter().map(|s| s.id.as_str()).collect();
    let modmap_ids: HashSet<&str> = kb.modifier_maps.iter().map(|m| m.id.as_str()).collect();

    for (layout_index, l) in kb.layouts.iter().enumerate() {
        if l.first > l.last {
            issues.push(
                Issue::error(
                    "LayoutRangeInverted",
                    format!("layout range first={} > last={}", l.first, l.last),
                    false,
                )
                .category(IssueCategory::Layout)
                .at(IssueLocation::LayoutRange {
                    index: layout_index,
                }),
            );
        }
        if !modmap_ids.contains(l.modifiers.as_str()) {
            issues.push(
                Issue::error(
                    "DanglingModifierRef",
                    format!("layout references unknown modifierMap '{}'", l.modifiers),
                    false,
                )
                .category(IssueCategory::Layout)
                .at(IssueLocation::LayoutRange {
                    index: layout_index,
                })
                .affects([l.modifiers.clone()]),
            );
        }
        if !set_ids.contains(l.map_set.as_str()) {
            issues.push(
                Issue::error(
                    "DanglingMapSetRef",
                    format!("layout references unknown keyMapSet '{}'", l.map_set),
                    false,
                )
                .category(IssueCategory::Layout)
                .at(IssueLocation::LayoutRange {
                    index: layout_index,
                })
                .affects([l.map_set.clone()]),
            );
        }
        if let (Some(modmap), Some(set)) =
            (kb.modifier_map(&l.modifiers), kb.keymap_set(&l.map_set))
        {
            for select in &modmap.selects {
                if set.map(select.map_index).is_none() {
                    issues.push(
                        Issue::warn(
                            "InvalidModifierMapIndex",
                            format!(
                                "modifierMap '{}' selects missing keyMap index {} in set '{}'",
                                modmap.id, select.map_index, set.id
                            ),
                            false,
                        )
                        .category(IssueCategory::ModifierMap)
                        .at(IssueLocation::ModifierMap {
                            id: modmap.id.clone(),
                        })
                        .affects([set.id.clone(), select.map_index.to_string()]),
                    );
                }
            }
        }
    }

    let action_ids: HashSet<&str> = kb.actions.iter().map(|a| a.id.as_str()).collect();

    // base ref validity + key/action checks
    for set in &kb.keymap_sets {
        let map_indices: HashSet<u32> = set.maps.iter().map(|m| m.index).collect();
        let mut seen_map_indices = HashSet::new();
        for map in &set.maps {
            if !seen_map_indices.insert(map.index) {
                issues.push(
                    Issue::error(
                        "DuplicateKeyMapIndex",
                        format!(
                            "keyMapSet '{}' has duplicate keyMap index {}",
                            set.id, map.index
                        ),
                        false,
                    )
                    .category(IssueCategory::KeyMap)
                    .at(IssueLocation::KeyMap {
                        set_id: set.id.clone(),
                        map_index: map.index,
                    }),
                );
            }
            if let Some(base) = &map.base {
                match kb.keymap_set(&base.map_set) {
                    None => issues.push(
                        Issue::error(
                            "InvalidBaseIndex",
                            format!("keyMap base references unknown set '{}'", base.map_set),
                            true,
                        )
                        .category(IssueCategory::KeyMap)
                        .at(IssueLocation::KeyMap {
                            set_id: set.id.clone(),
                            map_index: map.index,
                        })
                        .affects([base.map_set.clone()]),
                    ),
                    Some(bs) => {
                        if bs.map(base.index).is_none() {
                            issues.push(
                                Issue::error(
                                    "InvalidBaseIndex",
                                    format!(
                                        "keyMap base index {} missing in set '{}'",
                                        base.index, base.map_set
                                    ),
                                    true,
                                )
                                .category(IssueCategory::KeyMap)
                                .at(IssueLocation::KeyMap {
                                    set_id: set.id.clone(),
                                    map_index: map.index,
                                })
                                .affects([base.map_set.clone(), base.index.to_string()]),
                            );
                        }
                    }
                }
            }
            for key in &map.keys {
                check_key_value(
                    &key.value,
                    &action_ids,
                    Some((set.id.as_str(), map.index, key.code)),
                    &mut issues,
                );
            }
        }
        // keymap index gap detection
        if let (Some(min), Some(max)) = (map_indices.iter().min(), map_indices.iter().max()) {
            for i in *min..=*max {
                if !map_indices.contains(&i) {
                    issues.push(
                        Issue::warn(
                            "KeyMapSetGap",
                            format!("keyMapSet '{}' missing index {}", set.id, i),
                            false,
                        )
                        .category(IssueCategory::KeyMapSet)
                        .at(IssueLocation::KeyMapSet { id: set.id.clone() })
                        .affects([i.to_string()]),
                    );
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
        if a.id.trim().is_empty() {
            issues.push(
                Issue::error("InvalidActionId", "action id is empty", false)
                    .category(IssueCategory::Action)
                    .at(IssueLocation::Action { id: a.id.clone() }),
            );
        }
        for w in &a.whens {
            if w.state.trim().is_empty() {
                issues.push(
                    Issue::warn("InvalidStateId", "action has an empty state", false)
                        .category(IssueCategory::DeadState)
                        .at(IssueLocation::Action { id: a.id.clone() }),
                );
            }
            if let Some(n) = &w.next {
                if !defined_states.contains(n.as_str()) {
                    issues.push(
                        Issue::warn(
                            "UnknownNextState",
                            format!(
                            "action '{}' transitions to state '{}' with no terminator or handler",
                            a.id, n
                        ),
                            false,
                        )
                        .category(IssueCategory::DeadState)
                        .at(IssueLocation::State { state: n.clone() })
                        .affects([a.id.clone()]),
                    );
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
            issues.push(
                Issue::error(
                    "InvalidDefaultIndex",
                    format!(
                        "modifierMap '{}' defaultIndex {} is not a declared mapIndex",
                        m.id, m.default_index
                    ),
                    false,
                )
                .category(IssueCategory::ModifierMap)
                .at(IssueLocation::ModifierMap { id: m.id.clone() })
                .affects([m.default_index.to_string()]),
            );
        }
    }

    // invalid Unicode in any output
    check_unicode(kb, &mut issues);

    // MissingSpecialKeyOutput: a set with absolute maps but missing one or more
    // Apple-conventional special control-char outputs. Report exact key codes
    // so a repair preview can show the impact before mutating.
    for set in &kb.keymap_sets {
        let has_absolute = set.maps.iter().any(|m| m.base.is_none());
        let defines_any_special = SPECIAL_OUTPUTS
            .iter()
            .any(|(code, _)| set.maps.iter().any(|m| m.key(*code).is_some()));
        let missing: Vec<String> = SPECIAL_OUTPUTS
            .iter()
            .filter(|(code, _)| !set.maps.iter().any(|m| m.key(*code).is_some()))
            .map(|(code, _)| code.to_string())
            .collect();
        if has_absolute && !defines_any_special && !missing.is_empty() {
            issues.push(
                Issue::warn(
                    "MissingSpecialKeyOutput",
                    format!(
                        "keyMapSet '{}' is missing special-key outputs for codes {}",
                        set.id,
                        missing.join(", ")
                    ),
                    true,
                )
                .category(IssueCategory::KeyMapSet)
                .at(IssueLocation::KeyMapSet { id: set.id.clone() })
                .affects(missing),
            );
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
    value: &KeyValue,
    action_ids: &HashSet<&str>,
    key_addr: Option<(&str, u32, u16)>,
    issues: &mut Vec<Issue>,
) {
    let key_location = || {
        key_addr.map(|(set_id, map_index, code)| IssueLocation::Key {
            set_id: set_id.to_string(),
            map_index,
            code,
        })
    };
    match value {
        KeyValue::ActionRef(id) => {
            if !action_ids.contains(id.as_str()) {
                let mut issue = Issue::error(
                    "DanglingActionRef",
                    format!("key references unknown action '{}'", id),
                    false,
                )
                .category(IssueCategory::Key)
                .affects([id.clone()]);
                if let Some(location) = key_location() {
                    issue = issue.at(location);
                }
                issues.push(issue);
            }
        }
        KeyValue::Output(s) => {
            for ch in s.chars() {
                if !is_valid_unicode(ch as u32) {
                    let mut issue = Issue::error(
                        "InvalidUnicode",
                        format!("invalid code point U+{:04X}", ch as u32),
                        false,
                    )
                    .category(IssueCategory::Unicode);
                    if let Some(location) = key_location() {
                        issue = issue.at(location);
                    }
                    issues.push(issue);
                }
            }
        }
        KeyValue::InlineAction(a) => {
            if a.id.trim().is_empty() {
                let mut issue = Issue::warn("InvalidActionId", "inline action has empty id", false)
                    .category(IssueCategory::Action);
                if let Some(location) = key_location() {
                    issue = issue.at(location);
                }
                issues.push(issue);
            }
            for w in &a.whens {
                if w.state.trim().is_empty() {
                    let mut issue =
                        Issue::warn("InvalidStateId", "inline action has empty state", false)
                            .category(IssueCategory::DeadState);
                    if let Some(location) = key_location() {
                        issue = issue.at(location);
                    }
                    issues.push(issue);
                }
                if let Some(o) = &w.output {
                    for ch in o.chars() {
                        if !is_valid_unicode(ch as u32) {
                            let mut issue = Issue::error(
                                "InvalidUnicode",
                                format!("invalid code point U+{:04X}", ch as u32),
                                false,
                            )
                            .category(IssueCategory::Unicode);
                            if let Some(location) = key_location() {
                                issue = issue.at(location);
                            }
                            issues.push(issue);
                        }
                    }
                }
            }
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
    let plan = crate::repair_plan::plan_repairs(kb);
    let report = crate::repair_plan::apply_repair_plan(kb, &plan);
    RepairReport {
        fixed: report.fixed,
    }
}

#[cfg(test)]
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
    fn validation_report_counts_and_locations() {
        let mut kb = new_keyboard(Template::Standard, "T");
        let duplicate_map = kb.keymap_set("ANSI").unwrap().maps[0].clone();
        kb.keymap_set_mut("ANSI").unwrap().maps.push(duplicate_map);

        let report = validation_report(&kb);

        assert!(report.error_count > 0);
        assert!(report.by_category.get("keyMap").copied().unwrap_or(0) > 0);
        let dup = report
            .issues
            .iter()
            .find(|i| i.code == "DuplicateKeyMapIndex")
            .unwrap();
        assert!(matches!(dup.location, Some(IssueLocation::KeyMap { .. })));
    }

    #[test]
    fn document_validation_flags_zero_layout_bundle() {
        let bundle = crate::bundle::KeyboardBundle {
            identifier: "app.keymano.empty".into(),
            name: "Empty".into(),
            version: "1".into(),
            build_version: None,
            project_name: None,
            source_version: None,
            layouts: vec![],
            localizations: vec![],
            extra_plist: Default::default(),
        };

        let report = validate_document(&Document::Bundle(bundle));

        assert!(report.issues.iter().any(|i| i.code == "ZeroLayoutBundle"));
    }

    #[test]
    fn modifier_map_indices_must_target_existing_keymaps() {
        let mut kb = new_keyboard(Template::Standard, "T");
        kb.modifier_maps[0].selects[0].map_index = 999;

        let issues = validate(&kb);

        assert!(issues.iter().any(|i| i.code == "InvalidModifierMapIndex"));
    }

    #[test]
    fn missing_special_key_output_reports_exact_codes() {
        let mut kb = new_keyboard(Template::Standard, "T");
        let map = kb.keymap_set_mut("ANSI").unwrap().map_mut(0).unwrap();
        for (code, _) in SPECIAL_OUTPUTS {
            map.remove_key(*code);
        }

        let issue = validate(&kb)
            .into_iter()
            .find(|i| i.code == "MissingSpecialKeyOutput")
            .unwrap();

        assert!(issue.affected.contains(&"36".to_string()));
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
    fn repair_special_output_into_nonzero_absolute_map() {
        // A set whose only absolute map is at a non-zero index must still get
        // its specials injected — otherwise the auto-fixable flag is a lie.
        let mut kb = Keyboard {
            group: 1,
            id: -15000,
            name: "T".into(),
            maxout: None,
            layouts: vec![],
            modifier_maps: vec![],
            keymap_sets: vec![KeyMapSet {
                id: "ANSI".into(),
                maps: vec![KeyMap {
                    index: 1,
                    base: None,
                    keys: vec![Key {
                        code: 0,
                        value: KeyValue::Output("a".into()),
                    }],
                }],
            }],
            actions: vec![],
            terminators: vec![],
            comments: Comments::default(),
        };
        assert!(validate(&kb)
            .iter()
            .any(|i| i.code == "MissingSpecialKeyOutput"));
        let report = repair(&mut kb);
        assert!(report
            .fixed
            .contains(&"MissingSpecialKeyOutput".to_string()));
        assert!(!validate(&kb)
            .iter()
            .any(|i| i.code == "MissingSpecialKeyOutput"));
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
