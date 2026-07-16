//! In-memory document session (. Pure logic, no Tauri — unit-testable.
//!
//! Holds open documents by id with snapshot-clone undo/redo. The Tauri command
//! layer is a thin lock-and-call wrapper around this.
//!
//! Edit commands carry the full (id, kb_index, type, mask, dead_state, …)
//! addressing tuple to mirror the IPC surface, so the arg-count lint is muted.
#![allow(clippy::too_many_arguments)]

use std::collections::HashMap;
use std::path::PathBuf;

use keylayout_core::bundle::{
    bundle_from_files, bundle_to_files, read_bundle, write_bundle, BundleFile, KeyboardBundle,
};
use keylayout_core::modifiers::ModMask;
use keylayout_core::{
    apply_repair_plan, build_snapshot, build_snapshot_with_options, dead_key_graph, layer_matrix,
    new_keyboard, parse_keylayout, plan_repairs, repair, serialize_keylayout, validate,
    validation_report, Action, Comments, CoreError, DeadKeyGraph, Document, EncodeOpts, Issue, Key,
    KeyValue, Keyboard, KeyboardSnapshot, LayerMatrix, RepairPlan, Result, SnapshotOptions,
    Template, ValidationReport, When,
};
use serde::{Deserialize, Serialize};

/// Dead-key state machine view for the editor (P5).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ActionsView {
    pub actions: Vec<Action>,
    pub terminators: Vec<When>,
    pub states: Vec<String>,
}

/// One `keyMapSelect` row for the modifier editor (P4).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModifierSelectView {
    pub map_index: u32,
    /// `keys="..."` strings, one per `<modifier>` child.
    pub specs: Vec<String>,
}

/// Summary of an open document for the UI document tabs.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DocSummary {
    pub id: u32,
    pub name: String,
    pub path: Option<String>,
    pub is_bundle: bool,
    pub keyboard_names: Vec<String>,
    pub dirty: bool,
}

/// File save format.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SaveFormat {
    Keylayout,
    Bundle,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BundleMetadataView {
    pub identifier: String,
    pub name: String,
    pub version: String,
    pub build_version: Option<String>,
    pub project_name: Option<String>,
    pub source_version: Option<String>,
    pub layout_count: usize,
    pub localizations: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BundleMetadataPatch {
    pub identifier: Option<String>,
    pub name: Option<String>,
    pub version: Option<String>,
    pub build_version: Option<Option<String>>,
    pub project_name: Option<Option<String>>,
    pub source_version: Option<Option<String>>,
}

fn bundle_metadata_view(bundle: &KeyboardBundle) -> BundleMetadataView {
    BundleMetadataView {
        identifier: bundle.identifier.clone(),
        name: bundle.name.clone(),
        version: bundle.version.clone(),
        build_version: bundle.build_version.clone(),
        project_name: bundle.project_name.clone(),
        source_version: bundle.source_version.clone(),
        layout_count: bundle.layouts.len(),
        localizations: bundle
            .localizations
            .iter()
            .map(|loc| loc.locale.clone())
            .collect(),
    }
}

struct DocEntry {
    document: Document,
    path: Option<PathBuf>,
    undo: Vec<Document>,
    redo: Vec<Document>,
    dirty: bool,
    /// Document content at the last save/open. `dirty` is recomputed by comparing
    /// the current document to this on undo/redo, so undoing back to the saved
    /// state clears dirty and redoing away re-sets it (no spurious prompts).
    saved_doc: Option<Document>,
    /// Name of the last action (for Edit ▸ Undo "<name>").
    last_action: Option<String>,
}

impl DocEntry {
    fn summary(&self, id: u32) -> DocSummary {
        let (is_bundle, names) = match &self.document {
            Document::Standalone(kb) => (false, vec![kb.name.clone()]),
            Document::Bundle(b) => (
                true,
                b.layouts.iter().map(|l| l.keyboard.name.clone()).collect(),
            ),
        };
        DocSummary {
            id,
            name: names.first().cloned().unwrap_or_default(),
            path: self.path.as_ref().map(|p| p.display().to_string()),
            is_bundle,
            keyboard_names: names,
            dirty: self.dirty,
        }
    }

    fn keyboard(&self, index: usize) -> Result<&Keyboard> {
        match &self.document {
            Document::Standalone(kb) if index == 0 => Ok(kb),
            Document::Standalone(_) => Err(CoreError::Other("keyboard index out of range".into())),
            Document::Bundle(b) => b
                .layouts
                .get(index)
                .map(|l| &l.keyboard)
                .ok_or_else(|| CoreError::Other("keyboard index out of range".into())),
        }
    }

    fn keyboard_mut(&mut self, index: usize) -> Result<&mut Keyboard> {
        match &mut self.document {
            Document::Standalone(kb) if index == 0 => Ok(kb),
            Document::Standalone(_) => Err(CoreError::Other("keyboard index out of range".into())),
            Document::Bundle(b) => b
                .layouts
                .get_mut(index)
                .map(|l| &mut l.keyboard)
                .ok_or_else(|| CoreError::Other("keyboard index out of range".into())),
        }
    }

    /// Snapshot current document onto the undo stack before a mutation.
    fn push_undo(&mut self, action: &str) {
        self.undo.push(self.document.clone());
        self.redo.clear();
        // The caller mutates `document` right after this, so it diverges from
        // the saved content.
        self.dirty = true;
        self.last_action = Some(action.to_string());
    }

    /// Record an already-captured pre-mutation snapshot onto the undo stack.
    /// For operations that may be a no-op (housekeeping/repair): clone first,
    /// run the op, and only call this when something actually changed, so a
    /// "nothing to do" click can't create an empty undo step or dirty the doc.
    fn commit_undo(&mut self, before: Document, action: &str) {
        self.undo.push(before);
        self.redo.clear();
        self.dirty = true;
        self.last_action = Some(action.to_string());
    }

    /// Recompute dirty by comparing the current document to the saved content.
    fn recompute_dirty(&mut self) {
        self.dirty = self.saved_doc.as_ref() != Some(&self.document);
    }
}

/// The whole app session: all open documents.
#[derive(Default)]
pub struct AppState {
    docs: HashMap<u32, DocEntry>,
    next_id: u32,
    pub encode_opts: EncodeOpts,
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            docs: HashMap::new(),
            next_id: 1,
            encode_opts: EncodeOpts::default(),
        }
    }

    fn insert(&mut self, document: Document, path: Option<PathBuf>) -> DocSummary {
        let id = self.next_id;
        self.next_id += 1;
        let entry = DocEntry {
            saved_doc: Some(document.clone()),
            document,
            path,
            undo: Vec::new(),
            redo: Vec::new(),
            dirty: false,
            last_action: None,
        };
        let summary = entry.summary(id);
        self.docs.insert(id, entry);
        summary
    }

    fn entry(&self, id: u32) -> Result<&DocEntry> {
        self.docs
            .get(&id)
            .ok_or_else(|| CoreError::Other(format!("no document {id}")))
    }
    fn entry_mut(&mut self, id: u32) -> Result<&mut DocEntry> {
        self.docs
            .get_mut(&id)
            .ok_or_else(|| CoreError::Other(format!("no document {id}")))
    }

    // ---- document lifecycle ----

    pub fn new_document(&mut self, template: Template, name: &str) -> DocSummary {
        let kb = new_keyboard(template, name);
        self.insert(Document::Standalone(kb), None)
    }

    /// Open from raw bytes/string content (file I/O done by the caller/shell).
    pub fn open_keylayout_str(&mut self, xml: &str, path: Option<PathBuf>) -> Result<DocSummary> {
        let kb = parse_keylayout(xml)?;
        Ok(self.insert(Document::Standalone(kb), path))
    }

    pub fn open_bundle_dir(&mut self, dir: PathBuf) -> Result<DocSummary> {
        let bundle = read_bundle(&dir)?;
        Ok(self.insert(Document::Bundle(bundle), Some(dir)))
    }

    pub fn open_bundle_files(
        &mut self,
        files: Vec<BundleFile>,
        path: Option<PathBuf>,
    ) -> Result<DocSummary> {
        let bundle = bundle_from_files(files)?;
        Ok(self.insert(Document::Bundle(bundle), path))
    }

    pub fn close_document(&mut self, id: u32) {
        self.docs.remove(&id);
    }

    /// Rename a keyboard (and the document tab/file stem follows).
    pub fn rename(&mut self, id: u32, kb_index: usize, name: String) -> Result<DocSummary> {
        {
            let entry = self.entry_mut(id)?;
            entry.push_undo("Rename");
            entry.keyboard_mut(kb_index)?.name = name;
        }
        self.summary(id)
    }

    /// Duplicate a document to use as a template: fresh keyboard ids, " copy"
    /// suffix, no path. Returns the new document.
    pub fn duplicate(&mut self, id: u32) -> Result<DocSummary> {
        let mut document = self.entry(id)?.document.clone();
        let rename_kb = |kb: &mut Keyboard| {
            kb.name = format!("{} copy", kb.name);
            kb.id = keylayout_core::random_keyboard_id(keylayout_core::Script::MacUnicode);
            kb.group = keylayout_core::Script::MacUnicode.group();
        };
        match &mut document {
            Document::Standalone(kb) => rename_kb(kb),
            Document::Bundle(b) => {
                for l in &mut b.layouts {
                    rename_kb(&mut l.keyboard);
                }
            }
        }
        Ok(self.insert(document, None))
    }

    pub fn list_documents(&self) -> Vec<DocSummary> {
        let mut v: Vec<_> = self.docs.iter().map(|(id, e)| e.summary(*id)).collect();
        v.sort_by_key(|s| s.id);
        v
    }

    pub fn summary(&self, id: u32) -> Result<DocSummary> {
        Ok(self.entry(id)?.summary(id))
    }

    // ---- queries ----

    pub fn get_snapshot(
        &self,
        id: u32,
        kb_index: usize,
        type_code: u32,
        mask: u16,
        dead_state: &str,
    ) -> Result<KeyboardSnapshot> {
        let kb = self.entry(id)?.keyboard(kb_index)?;
        Ok(build_snapshot(kb, type_code, ModMask(mask), dead_state))
    }

    pub fn get_snapshot_with_options(
        &self,
        id: u32,
        kb_index: usize,
        type_code: u32,
        mask: u16,
        dead_state: &str,
        options: SnapshotOptions,
    ) -> Result<KeyboardSnapshot> {
        let kb = self.entry(id)?.keyboard(kb_index)?;
        Ok(build_snapshot_with_options(
            kb,
            type_code,
            ModMask(mask),
            dead_state,
            options,
        ))
    }

    pub fn get_xml(&self, id: u32, kb_index: usize, code_non_ascii: bool) -> Result<String> {
        let kb = self.entry(id)?.keyboard(kb_index)?;
        Ok(serialize_keylayout(kb, &EncodeOpts { code_non_ascii }))
    }

    pub fn validate(&self, id: u32, kb_index: usize) -> Result<Vec<Issue>> {
        let kb = self.entry(id)?.keyboard(kb_index)?;
        Ok(validate(kb))
    }

    pub fn validation_report(&self, id: u32, kb_index: usize) -> Result<ValidationReport> {
        let kb = self.entry(id)?.keyboard(kb_index)?;
        Ok(validation_report(kb))
    }

    pub fn repair_plan(&self, id: u32, kb_index: usize) -> Result<RepairPlan> {
        let kb = self.entry(id)?.keyboard(kb_index)?;
        Ok(plan_repairs(kb))
    }

    pub fn layer_matrix(
        &self,
        id: u32,
        kb_index: usize,
        type_code: u32,
        include_high_codes: bool,
    ) -> Result<LayerMatrix> {
        let kb = self.entry(id)?.keyboard(kb_index)?;
        Ok(layer_matrix(kb, type_code, include_high_codes))
    }

    pub fn dead_key_graph(&self, id: u32, kb_index: usize) -> Result<DeadKeyGraph> {
        let kb = self.entry(id)?.keyboard(kb_index)?;
        Ok(dead_key_graph(kb))
    }

    pub fn comments(&self, id: u32, kb_index: usize) -> Result<Comments> {
        Ok(self.entry(id)?.keyboard(kb_index)?.comments.clone())
    }

    pub fn bundle_metadata(&self, id: u32) -> Result<Option<BundleMetadataView>> {
        let entry = self.entry(id)?;
        let Document::Bundle(bundle) = &entry.document else {
            return Ok(None);
        };
        Ok(Some(bundle_metadata_view(bundle)))
    }

    pub fn undo_label(&self, id: u32) -> Result<Option<String>> {
        Ok(self.entry(id)?.last_action.clone())
    }

    // ---- mutations (each returns a fresh snapshot for the editing context) ----

    /// Resolve (set_id, map_index) for the given type + mask.
    fn target_map(kb: &Keyboard, type_code: u32, mask: u16) -> Result<(String, u32)> {
        let layout = kb
            .layout_for_type(type_code)
            .or_else(|| kb.layouts.first())
            .ok_or_else(|| CoreError::Other("no layout range".into()))?;
        let set_id = layout.map_set.clone();
        let modmap = kb
            .modifier_map(&layout.modifiers)
            .ok_or_else(|| CoreError::Other("no modifier map".into()))?;
        let index = keylayout_core::modifiers::resolve_map_index(modmap, ModMask(mask));
        Ok((set_id, index))
    }

    fn ensure_map<'a>(
        kb: &'a mut Keyboard,
        set_id: &str,
        index: u32,
    ) -> Result<&'a mut keylayout_core::KeyMap> {
        let set = kb
            .keymap_set_mut(set_id)
            .ok_or_else(|| CoreError::Other(format!("no keyMapSet {set_id}")))?;
        if set.map(index).is_none() {
            set.maps.push(keylayout_core::KeyMap {
                index,
                base: None,
                keys: Vec::new(),
            });
        }
        Ok(set.map_mut(index).unwrap())
    }

    pub fn set_key_output(
        &mut self,
        id: u32,
        kb_index: usize,
        type_code: u32,
        mask: u16,
        dead_state: &str,
        code: u16,
        output: String,
    ) -> Result<KeyboardSnapshot> {
        // Editing the keymap while previewing a dead state would overwrite an
        // action reference with a literal and destroy the dead key (P1-10).
        if dead_state != "none" {
            return Err(CoreError::Other(
                "Switch the dead state back to ‘none’ before editing a key (or edit the action on the Dead Keys page)".into(),
            ));
        }
        let entry = self.entry_mut(id)?;
        entry.push_undo("Change output");
        let kb = entry.keyboard_mut(kb_index)?;
        let (set_id, index) = Self::target_map(kb, type_code, mask)?;
        let map = Self::ensure_map(kb, &set_id, index)?;
        map.set_key(Key {
            code,
            value: KeyValue::Output(output),
        });
        Ok(build_snapshot(
            self.entry(id)?.keyboard(kb_index)?,
            type_code,
            ModMask(mask),
            dead_state,
        ))
    }

    pub fn clear_key(
        &mut self,
        id: u32,
        kb_index: usize,
        type_code: u32,
        mask: u16,
        dead_state: &str,
        code: u16,
    ) -> Result<KeyboardSnapshot> {
        if dead_state != "none" {
            return Err(CoreError::Other(
                "Switch the dead state back to ‘none’ before clearing a key".into(),
            ));
        }
        let entry = self.entry_mut(id)?;
        entry.push_undo("Clear key");
        let kb = entry.keyboard_mut(kb_index)?;
        let (set_id, index) = Self::target_map(kb, type_code, mask)?;
        let map = Self::ensure_map(kb, &set_id, index)?;
        map.remove_key(code);
        Ok(build_snapshot(
            self.entry(id)?.keyboard(kb_index)?,
            type_code,
            ModMask(mask),
            dead_state,
        ))
    }

    /// Make a key a dead key entering `state`, creating the action + a
    /// terminator if needed.
    pub fn make_key_dead(
        &mut self,
        id: u32,
        kb_index: usize,
        type_code: u32,
        mask: u16,
        code: u16,
        state: &str,
        terminator: &str,
    ) -> Result<KeyboardSnapshot> {
        let entry = self.entry_mut(id)?;
        entry.push_undo("Make dead key");
        let kb = entry.keyboard_mut(kb_index)?;
        let (set_id, index) = Self::target_map(kb, type_code, mask)?;
        let action_id = format!("dead-{state}");
        // create action if missing
        if kb.action(&action_id).is_none() {
            kb.actions.push(keylayout_core::Action {
                id: action_id.clone(),
                whens: vec![keylayout_core::When {
                    state: "none".into(),
                    output: None,
                    next: Some(state.to_string()),
                    through: None,
                    multiplier: None,
                }],
            });
        }
        // terminator
        if !kb.terminators.iter().any(|w| w.state == state) {
            kb.terminators.push(keylayout_core::When {
                state: state.to_string(),
                output: Some(terminator.to_string()),
                next: None,
                through: None,
                multiplier: None,
            });
        }
        let map = Self::ensure_map(kb, &set_id, index)?;
        map.set_key(Key {
            code,
            value: KeyValue::ActionRef(action_id),
        });
        Ok(build_snapshot(
            self.entry(id)?.keyboard(kb_index)?,
            type_code,
            ModMask(mask),
            "none",
        ))
    }

    pub fn swap_keys(
        &mut self,
        id: u32,
        kb_index: usize,
        type_code: u32,
        mask: u16,
        dead_state: &str,
        code_a: u16,
        code_b: u16,
    ) -> Result<KeyboardSnapshot> {
        let entry = self.entry_mut(id)?;
        entry.push_undo("Swap keys");
        let kb = entry.keyboard_mut(kb_index)?;
        let (set_id, index) = Self::target_map(kb, type_code, mask)?;
        let map = Self::ensure_map(kb, &set_id, index)?;
        let a = map.key(code_a).map(|k| k.value.clone());
        let b = map.key(code_b).map(|k| k.value.clone());
        match (a, b) {
            (Some(av), Some(bv)) => {
                map.set_key(Key {
                    code: code_a,
                    value: bv,
                });
                map.set_key(Key {
                    code: code_b,
                    value: av,
                });
            }
            (Some(av), None) => {
                map.remove_key(code_a);
                map.set_key(Key {
                    code: code_b,
                    value: av,
                });
            }
            (None, Some(bv)) => {
                map.remove_key(code_b);
                map.set_key(Key {
                    code: code_a,
                    value: bv,
                });
            }
            (None, None) => {}
        }
        Ok(build_snapshot(
            self.entry(id)?.keyboard(kb_index)?,
            type_code,
            ModMask(mask),
            dead_state,
        ))
    }

    /// Unlink a key: copy the inherited (base) value into the current map as an
    /// absolute override (.
    pub fn unlink_key(
        &mut self,
        id: u32,
        kb_index: usize,
        type_code: u32,
        mask: u16,
        dead_state: &str,
        code: u16,
    ) -> Result<KeyboardSnapshot> {
        let entry = self.entry_mut(id)?;
        entry.push_undo("Unlink key");
        let kb = entry.keyboard_mut(kb_index)?;
        let (set_id, index) = Self::target_map(kb, type_code, mask)?;
        let resolved = keylayout_core::resolve::resolve_key_value(kb, &set_id, index, code)
            .map(|(v, _)| v.clone());
        if let Some(value) = resolved {
            let map = Self::ensure_map(kb, &set_id, index)?;
            map.set_key(Key { code, value });
        }
        Ok(build_snapshot(
            self.entry(id)?.keyboard(kb_index)?,
            type_code,
            ModMask(mask),
            dead_state,
        ))
    }

    /// Relink a key: drop the absolute override in the current map so it
    /// inherits from its base map again (inverse of `unlink_key`, .
    /// No-op when the current map has no base to fall back to or carries no
    /// local override for this key.
    pub fn relink_key(
        &mut self,
        id: u32,
        kb_index: usize,
        type_code: u32,
        mask: u16,
        dead_state: &str,
        code: u16,
    ) -> Result<KeyboardSnapshot> {
        let entry = self.entry_mut(id)?;
        entry.push_undo("Relink key");
        let kb = entry.keyboard_mut(kb_index)?;
        let (set_id, index) = Self::target_map(kb, type_code, mask)?;
        if let Some(set) = kb.keymap_set_mut(&set_id) {
            if let Some(map) = set.map_mut(index) {
                if map.base.is_some() && map.key(code).is_some() {
                    map.remove_key(code);
                }
            }
        }
        Ok(build_snapshot(
            self.entry(id)?.keyboard(kb_index)?,
            type_code,
            ModMask(mask),
            dead_state,
        ))
    }

    pub fn repair(&mut self, id: u32, kb_index: usize) -> Result<Vec<String>> {
        let entry = self.entry_mut(id)?;
        let before = entry.document.clone();
        let fixed = repair(entry.keyboard_mut(kb_index)?).fixed;
        if !fixed.is_empty() {
            entry.commit_undo(before, "Repair");
        }
        Ok(fixed)
    }

    pub fn apply_repair_plan(
        &mut self,
        id: u32,
        kb_index: usize,
        plan: RepairPlan,
    ) -> Result<Vec<String>> {
        let entry = self.entry_mut(id)?;
        let before = entry.document.clone();
        let fixed = apply_repair_plan(entry.keyboard_mut(kb_index)?, &plan).fixed;
        if !fixed.is_empty() {
            entry.commit_undo(before, "Apply repair plan");
        }
        Ok(fixed)
    }

    pub fn set_key_output_in_map(
        &mut self,
        id: u32,
        kb_index: usize,
        set_id: &str,
        map_index: u32,
        code: u16,
        output: String,
    ) -> Result<()> {
        let entry = self.entry_mut(id)?;
        let before = entry.document.clone();
        let kb = entry.keyboard_mut(kb_index)?;
        let map = Self::ensure_map(kb, set_id, map_index)?;
        let current = map.key(code).map(|key| key.value.clone());
        let next = KeyValue::Output(output);
        if current.as_ref() != Some(&next) {
            map.set_key(Key { code, value: next });
            entry.commit_undo(before, "Change map output");
        }
        Ok(())
    }

    pub fn set_comments(&mut self, id: u32, kb_index: usize, comments: Comments) -> Result<()> {
        let entry = self.entry_mut(id)?;
        let before = entry.document.clone();
        let kb = entry.keyboard_mut(kb_index)?;
        if kb.comments != comments {
            kb.comments = comments;
            entry.commit_undo(before, "Set comments");
        }
        Ok(())
    }

    pub fn set_bundle_metadata(
        &mut self,
        id: u32,
        patch: BundleMetadataPatch,
    ) -> Result<Option<BundleMetadataView>> {
        let entry = self.entry_mut(id)?;
        let before = entry.document.clone();
        let Document::Bundle(bundle) = &mut entry.document else {
            return Ok(None);
        };
        if let Some(identifier) = patch.identifier {
            bundle.identifier = identifier;
        }
        if let Some(name) = patch.name {
            bundle.name = name;
        }
        if let Some(version) = patch.version {
            bundle.version = version;
        }
        if let Some(build_version) = patch.build_version {
            bundle.build_version = build_version;
        }
        if let Some(project_name) = patch.project_name {
            bundle.project_name = project_name;
        }
        if let Some(source_version) = patch.source_version {
            bundle.source_version = source_version;
        }
        let view = bundle_metadata_view(bundle);
        if entry.document != before {
            entry.commit_undo(before, "Set bundle metadata");
        }
        Ok(Some(view))
    }

    // ---- dead-key / action editing (P5) ----

    /// The active layout's modifier map as `keyMapSelect` rows (P4).
    pub fn modifier_map_view(
        &self,
        id: u32,
        kb_index: usize,
        type_code: u32,
    ) -> Result<Vec<ModifierSelectView>> {
        let kb = self.entry(id)?.keyboard(kb_index)?;
        let layout = kb
            .layout_for_type(type_code)
            .or_else(|| kb.layouts.first())
            .ok_or_else(|| CoreError::Other("no layout range".into()))?;
        let modmap = kb
            .modifier_map(&layout.modifiers)
            .ok_or_else(|| CoreError::Other("no modifier map".into()))?;
        Ok(modmap
            .selects
            .iter()
            .map(|s| ModifierSelectView {
                map_index: s.map_index,
                specs: s
                    .modifiers
                    .iter()
                    .map(keylayout_core::modifiers::spec_to_keys)
                    .collect(),
            })
            .collect())
    }

    /// Snapshot of the dead-key state machine for the editor.
    pub fn actions_view(&self, id: u32, kb_index: usize) -> Result<ActionsView> {
        let kb = self.entry(id)?.keyboard(kb_index)?;
        Ok(ActionsView {
            actions: kb.actions.clone(),
            terminators: kb.terminators.clone(),
            states: kb.states().into_iter().collect(),
        })
    }

    /// Set (or create) the terminator output for a state.
    pub fn set_terminator(
        &mut self,
        id: u32,
        kb_index: usize,
        state: &str,
        output: String,
    ) -> Result<()> {
        let entry = self.entry_mut(id)?;
        entry.push_undo("Set terminator");
        let kb = entry.keyboard_mut(kb_index)?;
        match kb.terminators.iter_mut().find(|w| w.state == state) {
            Some(w) => w.output = Some(output),
            None => kb.terminators.push(keylayout_core::When {
                state: state.to_string(),
                output: Some(output),
                next: None,
                through: None,
                multiplier: None,
            }),
        }
        Ok(())
    }

    /// Remove states unreachable from `none`. Returns removed count.
    pub fn remove_unused_states(&mut self, id: u32, kb_index: usize) -> Result<usize> {
        let entry = self.entry_mut(id)?;
        let before = entry.document.clone();
        let n = keylayout_core::validate::remove_unused_states(entry.keyboard_mut(kb_index)?);
        if n > 0 {
            entry.commit_undo(before, "Remove unused states");
        }
        Ok(n)
    }

    /// Remove actions not referenced by any key. Returns removed count.
    pub fn remove_unused_actions(&mut self, id: u32, kb_index: usize) -> Result<usize> {
        let entry = self.entry_mut(id)?;
        let before = entry.document.clone();
        let n = keylayout_core::validate::remove_unused_actions(entry.keyboard_mut(kb_index)?);
        if n > 0 {
            entry.commit_undo(before, "Remove unused actions");
        }
        Ok(n)
    }

    /// Inject default special-key control-char output into the lowest-index
    /// absolute map of each set (mirrors `validate::repair`'s targeting).
    pub fn add_special_keys(&mut self, id: u32, kb_index: usize) -> Result<usize> {
        let entry = self.entry_mut(id)?;
        let before = entry.document.clone();
        let kb = entry.keyboard_mut(kb_index)?;
        let mut added = 0;
        for set in &mut kb.keymap_sets {
            if let Some(map) = set
                .maps
                .iter_mut()
                .filter(|m| m.base.is_none())
                .min_by_key(|m| m.index)
            {
                added += keylayout_core::special_keys::add_special_key_output(map);
            }
        }
        if added > 0 {
            entry.commit_undo(before, "Add special key output");
        }
        Ok(added)
    }

    pub fn undo(&mut self, id: u32) -> Result<()> {
        let entry = self.entry_mut(id)?;
        if let Some(prev) = entry.undo.pop() {
            let cur = std::mem::replace(&mut entry.document, prev);
            entry.redo.push(cur);
            entry.recompute_dirty();
        }
        Ok(())
    }

    pub fn redo(&mut self, id: u32) -> Result<()> {
        let entry = self.entry_mut(id)?;
        if let Some(next) = entry.redo.pop() {
            let cur = std::mem::replace(&mut entry.document, next);
            entry.undo.push(cur);
            entry.recompute_dirty();
        }
        Ok(())
    }

    // ---- save (returns serialized content; shell writes the file) ----

    pub fn keylayout_string(&self, id: u32, kb_index: usize) -> Result<String> {
        let kb = self.entry(id)?.keyboard(kb_index)?;
        Ok(serialize_keylayout(kb, &self.encode_opts))
    }

    pub fn save_bundle_to(&mut self, id: u32, dir: PathBuf) -> Result<()> {
        let opts = self.encode_opts;
        let entry = self.entry_mut(id)?;
        let bundle = match &entry.document {
            Document::Bundle(b) => b.clone(),
            Document::Standalone(kb) => KeyboardBundle::from_keyboard(kb.clone()),
        };
        write_bundle(&bundle, &dir, &opts)?;
        entry.path = Some(dir);
        entry.saved_doc = Some(entry.document.clone());
        entry.dirty = false;
        Ok(())
    }

    /// Compose the doc's bundle as a list of `(relative path, bytes)` plus the
    /// bundle's display name. Pure — no I/O. Desktop writes the layout to disk
    /// via [`save_bundle_to`]; the browser build pipes this through
    /// `keymano-wasm` to download a `.bundle.zip`. A Standalone doc is wrapped
    /// into a one-layout bundle (same path the desktop save takes).
    pub fn bundle_files(&self, id: u32) -> Result<(String, Vec<BundleFile>)> {
        let entry = self.entry(id)?;
        let bundle = match &entry.document {
            Document::Bundle(b) => b.clone(),
            Document::Standalone(kb) => KeyboardBundle::from_keyboard(kb.clone()),
        };
        let files = bundle_to_files(&bundle, &self.encode_opts)?;
        Ok((bundle.name.clone(), files))
    }

    pub fn mark_saved(&mut self, id: u32, path: PathBuf) -> Result<()> {
        let entry = self.entry_mut(id)?;
        entry.path = Some(path);
        entry.saved_doc = Some(entry.document.clone());
        entry.dirty = false;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_doc_and_snapshot() {
        let mut state = AppState::new();
        let summary = state.new_document(Template::Standard, "Test");
        assert!(!summary.is_bundle);
        let snap = state.get_snapshot(summary.id, 0, 0, 0, "none").unwrap();
        assert_eq!(snap.keys[0].output.as_deref(), Some("a"));
    }

    #[test]
    fn exposes_validation_repair_layers_dead_graph_and_direct_map_edit() {
        let mut state = AppState::new();
        let summary = state.new_document(Template::Standard, "Test");

        let report = state.validation_report(summary.id, 0).unwrap();
        assert_eq!(report.error_count, 0);

        state
            .set_key_output_in_map(summary.id, 0, "ANSI", 0, 200, "Ω".into())
            .unwrap();
        let snap = state
            .get_snapshot_with_options(
                summary.id,
                0,
                0,
                0,
                "none",
                SnapshotOptions {
                    include_existing_high_codes: true,
                },
            )
            .unwrap();
        assert_eq!(
            snap.keys
                .iter()
                .find(|key| key.code == 200)
                .and_then(|key| key.output.as_deref()),
            Some("Ω")
        );

        let matrix = state.layer_matrix(summary.id, 0, 0, true).unwrap();
        assert!(matrix.key_codes.contains(&200));

        state
            .make_key_dead(summary.id, 0, 0, 0, 2, "acute", "´")
            .unwrap();
        let graph = state.dead_key_graph(summary.id, 0).unwrap();
        assert!(graph.states.contains(&"acute".to_string()));

        let plan = state.repair_plan(summary.id, 0).unwrap();
        let fixed = state.apply_repair_plan(summary.id, 0, plan).unwrap();
        assert!(fixed.iter().all(|code| !code.is_empty()));
    }

    #[test]
    fn exposes_bundle_metadata_and_comments() {
        let mut state = AppState::new();
        let summary = state.new_document(Template::Standard, "BundleMe");
        let (_name, files) = state.bundle_files(summary.id).unwrap();
        let bundle = state.open_bundle_files(files, None).unwrap();

        let metadata = state.bundle_metadata(bundle.id).unwrap().unwrap();
        assert_eq!(metadata.layout_count, 1);
        let updated = state
            .set_bundle_metadata(
                bundle.id,
                BundleMetadataPatch {
                    identifier: Some("app.keymano.test.bundle".into()),
                    name: Some("Renamed Bundle".into()),
                    version: None,
                    build_version: None,
                    project_name: None,
                    source_version: None,
                },
            )
            .unwrap()
            .unwrap();
        assert_eq!(updated.identifier, "app.keymano.test.bundle");

        let mut comments = state.comments(bundle.id, 0).unwrap();
        comments
            .before
            .insert("header".into(), vec![" preserved ".into()]);
        state.set_comments(bundle.id, 0, comments.clone()).unwrap();
        assert_eq!(state.comments(bundle.id, 0).unwrap(), comments);
    }

    #[test]
    fn edit_key_and_undo_redo() {
        let mut state = AppState::new();
        let s = state.new_document(Template::Standard, "T");
        state
            .set_key_output(s.id, 0, 0, 0, "none", 0, "ä".into())
            .unwrap();
        let snap = state.get_snapshot(s.id, 0, 0, 0, "none").unwrap();
        assert_eq!(snap.keys[0].output.as_deref(), Some("ä"));
        assert_eq!(
            state.undo_label(s.id).unwrap().as_deref(),
            Some("Change output")
        );

        state.undo(s.id).unwrap();
        let snap = state.get_snapshot(s.id, 0, 0, 0, "none").unwrap();
        assert_eq!(snap.keys[0].output.as_deref(), Some("a"));

        state.redo(s.id).unwrap();
        let snap = state.get_snapshot(s.id, 0, 0, 0, "none").unwrap();
        assert_eq!(snap.keys[0].output.as_deref(), Some("ä"));
    }

    #[test]
    fn dirty_tracks_saved_state_across_undo_redo() {
        let mut state = AppState::new();
        let s = state.new_document(Template::Standard, "T");
        assert!(!state.summary(s.id).unwrap().dirty);

        state
            .set_key_output(s.id, 0, 0, 0, "none", 0, "z".into())
            .unwrap();
        assert!(state.summary(s.id).unwrap().dirty);

        // undo back to the opened content → clean (the headline fix: was
        // spuriously dirty because dirty only tracked "has undo history")
        state.undo(s.id).unwrap();
        assert!(!state.summary(s.id).unwrap().dirty);

        // redo away again → dirty
        state.redo(s.id).unwrap();
        assert!(state.summary(s.id).unwrap().dirty);

        // save pins a new baseline; undo away from it is dirty, redo back is clean
        state.mark_saved(s.id, "/tmp/t.keylayout".into()).unwrap();
        assert!(!state.summary(s.id).unwrap().dirty);
        state.undo(s.id).unwrap();
        assert!(state.summary(s.id).unwrap().dirty);
        state.redo(s.id).unwrap();
        assert!(!state.summary(s.id).unwrap().dirty);
    }

    #[test]
    fn shift_layer_edit_targets_correct_map() {
        let mut state = AppState::new();
        let s = state.new_document(Template::Standard, "T");
        // edit shift layer (mask = SHIFT_L = 1) → modifier index 1
        state
            .set_key_output(s.id, 0, 0, 1, "none", 0, "Z".into())
            .unwrap();
        let snap = state.get_snapshot(s.id, 0, 0, 1, "none").unwrap();
        assert_eq!(snap.keys[0].output.as_deref(), Some("Z"));
        // base (no modifier) unchanged
        let base = state.get_snapshot(s.id, 0, 0, 0, "none").unwrap();
        assert_eq!(base.keys[0].output.as_deref(), Some("a"));
    }

    #[test]
    fn make_dead_key_creates_action() {
        let mut state = AppState::new();
        let s = state.new_document(Template::Standard, "T");
        state.make_key_dead(s.id, 0, 0, 0, 2, "acute", "´").unwrap();
        let snap = state.get_snapshot(s.id, 0, 0, 0, "none").unwrap();
        assert!(snap.keys[2].is_dead);
        assert!(snap.dead_states.contains(&"acute".to_string()));
    }

    #[test]
    fn unlink_key_makes_absolute() {
        let mut state = AppState::new();
        let s = state.new_document(Template::Standard, "T");
        // JIS type 18 inherits 'a' from ANSI; unlink should copy it absolute
        let snap = state.unlink_key(s.id, 0, 18, 0, "none", 0).unwrap();
        assert_eq!(snap.keys[0].output.as_deref(), Some("a"));
        assert!(!snap.keys[0].inherited);
    }

    #[test]
    fn relink_key_restores_inheritance() {
        let mut state = AppState::new();
        let s = state.new_document(Template::Standard, "T");
        // unlink makes the JIS 'a' absolute, relink should hand it back to base
        state.unlink_key(s.id, 0, 18, 0, "none", 0).unwrap();
        let snap = state.relink_key(s.id, 0, 18, 0, "none", 0).unwrap();
        assert_eq!(snap.keys[0].output.as_deref(), Some("a"));
        assert!(snap.keys[0].inherited);
    }

    #[test]
    fn rename_and_duplicate() {
        let mut state = AppState::new();
        let s = state.new_document(Template::Standard, "Orig");
        let renamed = state.rename(s.id, 0, "Renamed".into()).unwrap();
        assert_eq!(renamed.name, "Renamed");

        let dup = state.duplicate(s.id).unwrap();
        assert_ne!(dup.id, s.id);
        assert_eq!(dup.name, "Renamed copy");
        // duplicate is editable independently + still typeable
        let snap = state.get_snapshot(dup.id, 0, 0, 0, "none").unwrap();
        assert_eq!(snap.keys[0].output.as_deref(), Some("a"));
    }

    #[test]
    fn modifier_map_view_reflects_template() {
        let mut state = AppState::new();
        let s = state.new_document(Template::Standard, "T");
        let rows = state.modifier_map_view(s.id, 0, 0).unwrap();
        assert_eq!(rows.len(), 6);
        assert_eq!(rows[0].specs, vec![""]);
        assert_eq!(rows[1].specs, vec!["anyShift caps?"]);
        assert_eq!(rows[5].specs, vec!["command"]);
    }

    #[test]
    fn dead_key_editing_and_housekeeping() {
        let mut state = AppState::new();
        let s = state.new_document(Template::Standard, "T");
        state.make_key_dead(s.id, 0, 0, 0, 2, "acute", "´").unwrap();

        let view = state.actions_view(s.id, 0).unwrap();
        assert!(view.actions.iter().any(|a| a.id == "dead-acute"));
        assert!(view.states.contains(&"acute".to_string()));
        assert_eq!(
            view.terminators
                .iter()
                .find(|w| w.state == "acute")
                .and_then(|w| w.output.as_deref()),
            Some("´"),
        );

        state.set_terminator(s.id, 0, "acute", "¨".into()).unwrap();
        let view = state.actions_view(s.id, 0).unwrap();
        assert_eq!(
            view.terminators
                .iter()
                .find(|w| w.state == "acute")
                .and_then(|w| w.output.as_deref()),
            Some("¨"),
        );

        // referenced action is kept
        assert_eq!(state.remove_unused_actions(s.id, 0).unwrap(), 0);
        // standard template already has special keys → 0 added
        assert_eq!(state.add_special_keys(s.id, 0).unwrap(), 0);
    }

    #[test]
    fn noop_housekeeping_does_not_dirty_or_record_undo() {
        let mut state = AppState::new();
        let s = state.new_document(Template::Standard, "T");
        assert!(!state.summary(s.id).unwrap().dirty);
        // Standard template: nothing unused, specials already present → all 0,
        // and a 0-result op must not dirty the doc or push an undo step.
        assert_eq!(state.remove_unused_states(s.id, 0).unwrap(), 0);
        assert_eq!(state.remove_unused_actions(s.id, 0).unwrap(), 0);
        assert_eq!(state.add_special_keys(s.id, 0).unwrap(), 0);
        assert_eq!(state.repair(s.id, 0).unwrap().len(), 0);
        assert!(!state.summary(s.id).unwrap().dirty);
        assert!(state.undo_label(s.id).unwrap().is_none());
    }

    #[test]
    fn validate_and_repair() {
        let mut state = AppState::new();
        let xml = include_str!("../../keylayout-core/tests/fixtures/sample_dead.keylayout");
        let s = state.open_keylayout_str(xml, None).unwrap();
        let issues = state.validate(s.id, 0).unwrap();
        assert!(!issues.is_empty());
        let fixed = state.repair(s.id, 0).unwrap();
        assert!(fixed.contains(&"MissingSpecialKeyOutput".to_string()));
    }

    /// Exercise the exact code path the Tauri `open_file` → `get_snapshot` →
    /// `set_key_output` → `save` commands run on a complex real-world fixture.
    #[test]
    fn opens_and_edits_real_russian_layout() {
        let mut state = AppState::new();
        let xml = include_str!("../../keylayout-core/tests/fixtures/russian_pc_fixture.keylayout");
        let s = state.open_keylayout_str(xml, None).unwrap();
        assert_eq!(s.name, "Russian - PC 2026");

        // type code 0 → its single layout → default modifier index resolves
        let snap = state.get_snapshot(s.id, 0, 0, 0, "none").unwrap();
        assert!(snap.keys.iter().any(|k| k
            .output
            .as_deref()
            .map(|o| o.chars().any(|c| ('\u{0400}'..='\u{04FF}').contains(&c)))
            .unwrap_or(false)));

        // validation is clean (no false positives on a real file)
        assert!(state.validate(s.id, 0).unwrap().is_empty());

        // edit a key and serialize back to valid XML
        state
            .set_key_output(s.id, 0, 0, 0, "none", 0, "Ω".into())
            .unwrap();
        let out = state.keylayout_string(s.id, 0).unwrap();
        assert!(out.contains("Russian - PC 2026"));
        assert!(keylayout_core::parse_keylayout(&out).is_ok());
    }
}
