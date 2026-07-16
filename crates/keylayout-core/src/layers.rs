use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

use crate::model::*;
use crate::resolve::resolve_key_value;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LayerMatrix {
    pub keyboard_name: String,
    pub map_set: String,
    pub key_codes: Vec<u16>,
    pub rows: Vec<LayerRow>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LayerRow {
    pub map_index: u32,
    pub modifier_specs: Vec<String>,
    pub cells: Vec<LayerCell>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LayerCell {
    pub code: u16,
    pub source: LayerCellSource,
    pub output: Option<String>,
    pub action_id: Option<String>,
    pub is_dead: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LayerCellSource {
    Local,
    Inherited,
    Missing,
}

pub fn layer_matrix(
    kb: &Keyboard,
    keyboard_type_code: u32,
    include_high_codes: bool,
) -> LayerMatrix {
    let layout = kb
        .layout_for_type(keyboard_type_code)
        .or_else(|| kb.layouts.first());
    let (modmap, set) = match layout {
        Some(layout) => (
            kb.modifier_map(&layout.modifiers),
            kb.keymap_set(&layout.map_set),
        ),
        None => (None, None),
    };
    let set_id = set.map(|s| s.id.clone()).unwrap_or_default();
    let key_codes = matrix_key_codes(set, include_high_codes);
    let mut row_indices: Vec<u32> = match modmap {
        Some(m) => m.selects.iter().map(|s| s.map_index).collect(),
        None => set
            .map(|s| s.maps.iter().map(|m| m.index).collect())
            .unwrap_or_default(),
    };
    row_indices.sort_unstable();
    row_indices.dedup();

    let rows = row_indices
        .into_iter()
        .map(|map_index| {
            let modifier_specs = modmap
                .map(|m| {
                    m.selects
                        .iter()
                        .filter(|s| s.map_index == map_index)
                        .flat_map(|s| s.modifiers.iter().map(modifier_spec_label))
                        .collect()
                })
                .unwrap_or_default();
            let cells = key_codes
                .iter()
                .map(|code| layer_cell(kb, &set_id, map_index, *code))
                .collect();
            LayerRow {
                map_index,
                modifier_specs,
                cells,
            }
        })
        .collect();

    LayerMatrix {
        keyboard_name: kb.name.clone(),
        map_set: set_id,
        key_codes,
        rows,
    }
}

fn matrix_key_codes(set: Option<&KeyMapSet>, include_high_codes: bool) -> Vec<u16> {
    let mut codes: BTreeSet<u16> = (0u16..=127).collect();
    if include_high_codes {
        if let Some(set) = set {
            for map in &set.maps {
                for key in &map.keys {
                    if key.code > 127 {
                        codes.insert(key.code);
                    }
                }
            }
        }
    }
    codes.into_iter().collect()
}

fn layer_cell(kb: &Keyboard, set_id: &str, map_index: u32, code: u16) -> LayerCell {
    let local = kb
        .keymap_set(set_id)
        .and_then(|set| set.map(map_index))
        .and_then(|map| map.key(code));
    let resolved = resolve_key_value(kb, set_id, map_index, code);
    let source = match (local, resolved) {
        (Some(_), _) => LayerCellSource::Local,
        (None, Some((_, true))) => LayerCellSource::Inherited,
        (None, Some((_, false))) => LayerCellSource::Local,
        (None, None) => LayerCellSource::Missing,
    };
    let value = resolved.map(|(value, _)| value);
    let (output, action_id, is_dead) = match value {
        Some(KeyValue::Output(output)) => (Some(output.clone()), None, false),
        Some(KeyValue::ActionRef(id)) => (None, Some(id.clone()), true),
        Some(KeyValue::InlineAction(action)) => (None, Some(action.id.clone()), true),
        None => (None, None, false),
    };
    LayerCell {
        code,
        source,
        output,
        action_id,
        is_dead,
    }
}

fn modifier_spec_label(spec: &ModifierSpec) -> String {
    spec.tokens
        .iter()
        .map(|token| {
            let name = format!("{:?}", token.modifier);
            if token.optional {
                format!("{name}?")
            } else {
                name
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modifiers::ModMask;
    use crate::parse::parse_keylayout;
    use crate::resolve::build_snapshot;

    const SAMPLE: &str = include_str!("../tests/fixtures/sample_dead.keylayout");

    #[test]
    fn layer_matrix_marks_local_inherited_and_high_keys() {
        let mut kb = parse_keylayout(SAMPLE).unwrap();
        kb.keymap_set_mut("ANSI")
            .unwrap()
            .map_mut(0)
            .unwrap()
            .set_key(Key {
                code: 200,
                value: KeyValue::Output("Ω".into()),
            });

        let matrix = layer_matrix(&kb, 0, true);

        assert!(matrix.key_codes.contains(&200));
        let row0 = matrix.rows.iter().find(|r| r.map_index == 0).unwrap();
        assert_eq!(
            row0.cells.iter().find(|c| c.code == 0).unwrap().source,
            LayerCellSource::Local
        );
        let row1 = matrix.rows.iter().find(|r| r.map_index == 1).unwrap();
        assert_eq!(
            row1.cells.iter().find(|c| c.code == 1).unwrap().source,
            LayerCellSource::Inherited
        );

        let snap = build_snapshot(&kb, 0, ModMask::empty(), "none");
        assert_eq!(snap.keys[0].output.as_deref(), Some("a"));
    }
}
