//! WebAssembly binding for the Keymano core.
//!
//! Wraps [`keymano_session::AppState`] — the same Tauri-free document session
//! the desktop command layer drives — and exposes it to the browser. The web
//! build therefore runs the **real** `keylayout-core` parser / serializer /
//! validator, not a JavaScript stand-in: one engine on every platform.
//!
//! Each method mirrors one IPC command. Structured results are returned as JSON
//! strings (the structs already derive `Serialize` and their field names match
//! the hand-written TS types); scalars are returned directly. Errors surface as
//! a `JsValue` string so the TS layer can treat them like any thrown `Error`.

use std::path::PathBuf;

use keylayout_core::Template;
use keymano_session::AppState;
use wasm_bindgen::prelude::*;

fn js_err<E: std::fmt::Display>(e: E) -> JsValue {
    JsValue::from_str(&e.to_string())
}

fn to_json<T: serde::Serialize>(value: &T) -> Result<String, JsValue> {
    serde_json::to_string(value).map_err(js_err)
}

/// One in-memory editing session: all open documents + undo/redo.
#[wasm_bindgen]
pub struct Session(AppState);

impl Default for Session {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
impl Session {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Session {
        // Surface Rust panics as readable JS console errors instead of an
        // opaque "unreachable executed" trap.
        console_error_panic_hook::set_once();
        Session(AppState::new())
    }

    // ---- document lifecycle ----

    pub fn new_document(&mut self, template: &str, name: &str) -> Result<String, JsValue> {
        let tpl = match template {
            "basic" => Template::Basic,
            _ => Template::Standard,
        };
        to_json(&self.0.new_document(tpl, name))
    }

    /// Open a standalone `.keylayout` from its XML text (the only form a browser
    /// can hand us — there is no filesystem path).
    pub fn open_keylayout(&mut self, xml: &str) -> Result<String, JsValue> {
        to_json(&self.0.open_keylayout_str(xml, None).map_err(js_err)?)
    }

    pub fn list_documents(&self) -> Result<String, JsValue> {
        to_json(&self.0.list_documents())
    }

    pub fn close_document(&mut self, id: u32) {
        self.0.close_document(id);
    }

    pub fn rename(&mut self, id: u32, kb_index: usize, name: String) -> Result<String, JsValue> {
        to_json(&self.0.rename(id, kb_index, name).map_err(js_err)?)
    }

    pub fn duplicate(&mut self, id: u32) -> Result<String, JsValue> {
        to_json(&self.0.duplicate(id).map_err(js_err)?)
    }

    /// Mark a document saved (web "save" downloads the file in JS; this just
    /// pins the clean baseline so the dirty dot clears).
    pub fn mark_saved(&mut self, id: u32, path: String) -> Result<(), JsValue> {
        self.0.mark_saved(id, PathBuf::from(path)).map_err(js_err)
    }

    // ---- queries ----

    pub fn get_snapshot(
        &self,
        id: u32,
        kb_index: usize,
        type_code: u32,
        mask: u16,
        dead_state: &str,
    ) -> Result<String, JsValue> {
        to_json(
            &self
                .0
                .get_snapshot(id, kb_index, type_code, mask, dead_state)
                .map_err(js_err)?,
        )
    }

    pub fn get_xml(
        &self,
        id: u32,
        kb_index: usize,
        code_non_ascii: bool,
    ) -> Result<String, JsValue> {
        self.0.get_xml(id, kb_index, code_non_ascii).map_err(js_err)
    }

    pub fn validate(&self, id: u32, kb_index: usize) -> Result<String, JsValue> {
        to_json(&self.0.validate(id, kb_index).map_err(js_err)?)
    }

    pub fn undo_label(&self, id: u32) -> Result<Option<String>, JsValue> {
        self.0.undo_label(id).map_err(js_err)
    }

    pub fn actions_view(&self, id: u32, kb_index: usize) -> Result<String, JsValue> {
        to_json(&self.0.actions_view(id, kb_index).map_err(js_err)?)
    }

    pub fn modifier_map_view(
        &self,
        id: u32,
        kb_index: usize,
        type_code: u32,
    ) -> Result<String, JsValue> {
        to_json(
            &self
                .0
                .modifier_map_view(id, kb_index, type_code)
                .map_err(js_err)?,
        )
    }

    // ---- mutations (return a fresh snapshot) ----

    #[allow(clippy::too_many_arguments)]
    pub fn set_key_output(
        &mut self,
        id: u32,
        kb_index: usize,
        type_code: u32,
        mask: u16,
        dead_state: &str,
        code: u16,
        output: String,
    ) -> Result<String, JsValue> {
        to_json(
            &self
                .0
                .set_key_output(id, kb_index, type_code, mask, dead_state, code, output)
                .map_err(js_err)?,
        )
    }

    pub fn clear_key(
        &mut self,
        id: u32,
        kb_index: usize,
        type_code: u32,
        mask: u16,
        dead_state: &str,
        code: u16,
    ) -> Result<String, JsValue> {
        to_json(
            &self
                .0
                .clear_key(id, kb_index, type_code, mask, dead_state, code)
                .map_err(js_err)?,
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn make_key_dead(
        &mut self,
        id: u32,
        kb_index: usize,
        type_code: u32,
        mask: u16,
        code: u16,
        next_state: &str,
        terminator: &str,
    ) -> Result<String, JsValue> {
        to_json(
            &self
                .0
                .make_key_dead(id, kb_index, type_code, mask, code, next_state, terminator)
                .map_err(js_err)?,
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn swap_keys(
        &mut self,
        id: u32,
        kb_index: usize,
        type_code: u32,
        mask: u16,
        dead_state: &str,
        code_a: u16,
        code_b: u16,
    ) -> Result<String, JsValue> {
        to_json(
            &self
                .0
                .swap_keys(id, kb_index, type_code, mask, dead_state, code_a, code_b)
                .map_err(js_err)?,
        )
    }

    pub fn unlink_key(
        &mut self,
        id: u32,
        kb_index: usize,
        type_code: u32,
        mask: u16,
        dead_state: &str,
        code: u16,
    ) -> Result<String, JsValue> {
        to_json(
            &self
                .0
                .unlink_key(id, kb_index, type_code, mask, dead_state, code)
                .map_err(js_err)?,
        )
    }

    pub fn relink_key(
        &mut self,
        id: u32,
        kb_index: usize,
        type_code: u32,
        mask: u16,
        dead_state: &str,
        code: u16,
    ) -> Result<String, JsValue> {
        to_json(
            &self
                .0
                .relink_key(id, kb_index, type_code, mask, dead_state, code)
                .map_err(js_err)?,
        )
    }

    // ---- dead-key / action editing ----

    pub fn set_terminator(
        &mut self,
        id: u32,
        kb_index: usize,
        state: &str,
        output: String,
    ) -> Result<(), JsValue> {
        self.0
            .set_terminator(id, kb_index, state, output)
            .map_err(js_err)
    }

    pub fn remove_unused_states(&mut self, id: u32, kb_index: usize) -> Result<usize, JsValue> {
        self.0.remove_unused_states(id, kb_index).map_err(js_err)
    }

    pub fn remove_unused_actions(&mut self, id: u32, kb_index: usize) -> Result<usize, JsValue> {
        self.0.remove_unused_actions(id, kb_index).map_err(js_err)
    }

    pub fn add_special_keys(&mut self, id: u32, kb_index: usize) -> Result<usize, JsValue> {
        self.0.add_special_keys(id, kb_index).map_err(js_err)
    }

    pub fn repair(&mut self, id: u32, kb_index: usize) -> Result<String, JsValue> {
        to_json(&self.0.repair(id, kb_index).map_err(js_err)?)
    }

    // ---- undo / redo ----

    pub fn undo(&mut self, id: u32) -> Result<(), JsValue> {
        self.0.undo(id).map_err(js_err)
    }

    pub fn redo(&mut self, id: u32) -> Result<(), JsValue> {
        self.0.redo(id).map_err(js_err)
    }
}
