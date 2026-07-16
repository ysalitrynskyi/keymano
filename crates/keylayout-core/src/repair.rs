use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

use crate::ids::{id_plausible, random_keyboard_id, Script};
use crate::model::*;
use crate::special_keys::{add_special_key_output, SPECIAL_OUTPUTS};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RepairPlan {
    pub ops: Vec<RepairOp>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RepairOp {
    pub code: String,
    pub title: String,
    pub before: String,
    pub after: String,
    pub impact: String,
    pub kind: RepairKind,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum RepairKind {
    AssignKeyboardId,
    AddSpecialKeys { set_id: String, map_index: u32 },
    DropInvalidBase { set_id: String, map_index: u32 },
    RepairJis { set_id: String },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RepairApplyReport {
    pub fixed: Vec<String>,
}

pub fn plan_repairs(kb: &Keyboard) -> RepairPlan {
    let mut ops = Vec::new();

    if !id_plausible(kb.group, kb.id) {
        ops.push(RepairOp {
            code: "InvalidKeyboardID".into(),
            title: "Assign valid keyboard id".into(),
            before: format!("group={}, id={}", kb.group, kb.id),
            after: "new MacUnicode group/id".into(),
            impact: "macOS can load the layout under a valid Unicode keyboard id".into(),
            kind: RepairKind::AssignKeyboardId,
        });
    }

    for set in &kb.keymap_sets {
        if let Some(map) = set
            .maps
            .iter()
            .filter(|m| m.base.is_none())
            .min_by_key(|m| m.index)
        {
            let missing: Vec<u16> = SPECIAL_OUTPUTS
                .iter()
                .filter(|(code, _)| !set.maps.iter().any(|m| m.key(*code).is_some()))
                .map(|(code, _)| *code)
                .collect();
            if !missing.is_empty() {
                ops.push(RepairOp {
                    code: "MissingSpecialKeyOutput".into(),
                    title: "Add special-key outputs".into(),
                    before: format!("missing key codes {:?}", missing),
                    after: format!("inject defaults into {} index {}", set.id, map.index),
                    impact: "Return, Tab, arrows, function keys, and related control keys get macOS-compatible outputs".into(),
                    kind: RepairKind::AddSpecialKeys {
                        set_id: set.id.clone(),
                        map_index: map.index,
                    },
                });
            }
        }
    }

    let set_indices: HashMap<String, HashSet<u32>> = kb
        .keymap_sets
        .iter()
        .map(|s| (s.id.clone(), s.maps.iter().map(|m| m.index).collect()))
        .collect();
    for set in &kb.keymap_sets {
        for map in &set.maps {
            if let Some(base) = &map.base {
                let ok = set_indices
                    .get(&base.map_set)
                    .map(|idx| idx.contains(&base.index))
                    .unwrap_or(false);
                if !ok {
                    ops.push(RepairOp {
                        code: "InvalidBaseIndex".into(),
                        title: "Drop invalid base reference".into(),
                        before: format!("base {} index {}", base.map_set, base.index),
                        after: "absolute keyMap".into(),
                        impact: "prevents inheritance from a missing base map".into(),
                        kind: RepairKind::DropInvalidBase {
                            set_id: set.id.clone(),
                            map_index: map.index,
                        },
                    });
                }
            }
        }
    }

    if kb.keymap_set("ANSI").is_some() {
        if let Some(jis) = kb.keymap_set("JIS") {
            let all_absolute_empty = jis
                .maps
                .iter()
                .all(|m| m.base.is_none() && m.keys.is_empty());
            if all_absolute_empty && !jis.maps.is_empty() {
                ops.push(RepairOp {
                    code: "RepairJIS".into(),
                    title: "Make empty JIS maps inherit ANSI".into(),
                    before: "absolute empty JIS maps".into(),
                    after: "relative JIS maps with ANSI bases".into(),
                    impact: "JIS physical layout stops shadowing the ANSI key data with empty maps"
                        .into(),
                    kind: RepairKind::RepairJis {
                        set_id: "JIS".into(),
                    },
                });
            }
        }
    }

    RepairPlan { ops }
}

pub fn apply_repair_plan(kb: &mut Keyboard, plan: &RepairPlan) -> RepairApplyReport {
    let mut fixed = Vec::new();
    for op in &plan.ops {
        match &op.kind {
            RepairKind::AssignKeyboardId => {
                if !id_plausible(kb.group, kb.id) {
                    kb.group = Script::MacUnicode.group();
                    kb.id = random_keyboard_id(Script::MacUnicode);
                    fixed.push(op.code.clone());
                }
            }
            RepairKind::AddSpecialKeys { set_id, map_index } => {
                if let Some(map) = kb
                    .keymap_set_mut(set_id)
                    .and_then(|set| set.map_mut(*map_index))
                {
                    if add_special_key_output(map) > 0 {
                        fixed.push(op.code.clone());
                    }
                }
            }
            RepairKind::DropInvalidBase { set_id, map_index } => {
                if let Some(map) = kb
                    .keymap_set_mut(set_id)
                    .and_then(|set| set.map_mut(*map_index))
                {
                    if map.base.is_some() {
                        map.base = None;
                        fixed.push(op.code.clone());
                    }
                }
            }
            RepairKind::RepairJis { set_id } => {
                if let Some(set) = kb.keymap_set_mut(set_id) {
                    let mut changed = false;
                    for map in &mut set.maps {
                        if map.base.is_none() {
                            map.base = Some(BaseRef {
                                map_set: "ANSI".into(),
                                index: map.index,
                            });
                            changed = true;
                        }
                    }
                    if changed {
                        fixed.push(op.code.clone());
                    }
                }
            }
        }
    }
    fixed.sort();
    fixed.dedup();
    RepairApplyReport { fixed }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse::parse_keylayout;

    const SAMPLE: &str = include_str!("../tests/fixtures/sample_dead.keylayout");

    #[test]
    fn repair_plan_previews_and_applies_special_keys() {
        let mut kb = parse_keylayout(SAMPLE).unwrap();

        let plan = plan_repairs(&kb);

        let op = plan
            .ops
            .iter()
            .find(|op| op.code == "MissingSpecialKeyOutput")
            .unwrap();
        assert!(op.before.contains("36"));

        let report = apply_repair_plan(&mut kb, &plan);

        assert!(report
            .fixed
            .contains(&"MissingSpecialKeyOutput".to_string()));
    }
}
