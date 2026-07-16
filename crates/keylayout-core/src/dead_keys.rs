use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashSet};

use crate::model::*;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DeadKeyGraph {
    pub states: Vec<String>,
    pub edges: Vec<DeadKeyEdge>,
    pub terminators: Vec<DeadKeyTerminator>,
    pub unreachable_states: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DeadKeyEdge {
    pub action_id: String,
    pub from_state: String,
    pub to_state: Option<String>,
    pub output: Option<String>,
    pub key_codes: Vec<u16>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DeadKeyTerminator {
    pub state: String,
    pub output: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AccentRecipe {
    pub action_id: String,
    pub state: String,
    pub dead_key_code: u16,
    pub terminator: String,
    pub outputs: BTreeMap<String, String>,
}

pub fn dead_key_graph(kb: &Keyboard) -> DeadKeyGraph {
    let mut states = BTreeSet::new();
    states.insert("none".to_string());
    let mut key_bindings: BTreeMap<String, Vec<u16>> = BTreeMap::new();
    for set in &kb.keymap_sets {
        for map in &set.maps {
            for key in &map.keys {
                if let KeyValue::ActionRef(id) = &key.value {
                    key_bindings.entry(id.clone()).or_default().push(key.code);
                }
            }
        }
    }

    let mut edges = Vec::new();
    for action in &kb.actions {
        for when in &action.whens {
            states.insert(when.state.clone());
            if let Some(next) = &when.next {
                states.insert(next.clone());
            }
            edges.push(DeadKeyEdge {
                action_id: action.id.clone(),
                from_state: when.state.clone(),
                to_state: when.next.clone(),
                output: when.output.clone(),
                key_codes: key_bindings.get(&action.id).cloned().unwrap_or_default(),
            });
        }
    }
    let terminators = kb
        .terminators
        .iter()
        .map(|when| {
            states.insert(when.state.clone());
            DeadKeyTerminator {
                state: when.state.clone(),
                output: when.output.clone(),
            }
        })
        .collect();
    let unreachable_states = unreachable_states(&edges, &states);
    DeadKeyGraph {
        states: states.into_iter().collect(),
        edges,
        terminators,
        unreachable_states,
    }
}

fn unreachable_states(edges: &[DeadKeyEdge], states: &BTreeSet<String>) -> Vec<String> {
    let mut reachable = HashSet::from(["none".to_string()]);
    loop {
        let mut changed = false;
        for edge in edges {
            if reachable.contains(&edge.from_state) {
                if let Some(next) = &edge.to_state {
                    if reachable.insert(next.clone()) {
                        changed = true;
                    }
                }
            }
        }
        if !changed {
            break;
        }
    }
    states
        .iter()
        .filter(|state| !reachable.contains(*state))
        .cloned()
        .collect()
}

pub fn accent_recipe_action(recipe: &AccentRecipe) -> (Action, When) {
    let mut whens = vec![When {
        state: "none".into(),
        output: None,
        next: Some(recipe.state.clone()),
        through: None,
        multiplier: None,
    }];
    for (base, output) in &recipe.outputs {
        whens.push(When {
            state: recipe.state.clone(),
            output: Some(output.clone()),
            next: None,
            through: Some(base.clone()),
            multiplier: None,
        });
    }
    (
        Action {
            id: recipe.action_id.clone(),
            whens,
        },
        When {
            state: recipe.state.clone(),
            output: Some(recipe.terminator.clone()),
            next: None,
            through: None,
            multiplier: None,
        },
    )
}

pub fn apply_accent_recipe(
    kb: &mut Keyboard,
    set_id: &str,
    map_index: u32,
    recipe: &AccentRecipe,
) -> crate::Result<()> {
    let (action, terminator) = accent_recipe_action(recipe);
    if let Some(existing) = kb.action_mut(&recipe.action_id) {
        *existing = action;
    } else {
        kb.actions.push(action);
    }
    if let Some(existing) = kb
        .terminators
        .iter_mut()
        .find(|when| when.state == recipe.state)
    {
        *existing = terminator;
    } else {
        kb.terminators.push(terminator);
    }
    let set = kb
        .keymap_set_mut(set_id)
        .ok_or_else(|| crate::CoreError::Other(format!("missing keyMapSet {set_id}")))?;
    let map = set
        .map_mut(map_index)
        .ok_or_else(|| crate::CoreError::Other(format!("missing keyMap index {map_index}")))?;
    map.set_key(Key {
        code: recipe.dead_key_code,
        value: KeyValue::ActionRef(recipe.action_id.clone()),
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse::parse_keylayout;

    const SAMPLE: &str = include_str!("../tests/fixtures/sample_dead.keylayout");

    #[test]
    fn dead_key_graph_lists_edges_and_terminators() {
        let kb = parse_keylayout(SAMPLE).unwrap();
        let graph = dead_key_graph(&kb);

        assert!(graph.states.contains(&"acute".to_string()));
        assert!(graph
            .edges
            .iter()
            .any(|e| e.to_state.as_deref() == Some("acute")));
        assert!(graph.terminators.iter().any(|t| t.state == "acute"));
    }

    #[test]
    fn accent_recipe_builds_action_terminator_and_binding() {
        let mut kb = parse_keylayout(SAMPLE).unwrap();
        let recipe = AccentRecipe {
            action_id: "dead-grave".into(),
            state: "grave".into(),
            dead_key_code: 10,
            terminator: "`".into(),
            outputs: BTreeMap::from([("a".into(), "à".into())]),
        };

        apply_accent_recipe(&mut kb, "ANSI", 0, &recipe).unwrap();

        assert!(kb.action("dead-grave").is_some());
        assert_eq!(
            kb.terminators
                .iter()
                .find(|w| w.state == "grave")
                .and_then(|w| w.output.as_deref()),
            Some("`")
        );
        assert!(matches!(
            kb.keymap_set("ANSI")
                .unwrap()
                .map(0)
                .unwrap()
                .key(10)
                .map(|key| &key.value),
            Some(KeyValue::ActionRef(id)) if id == "dead-grave"
        ));
    }
}
