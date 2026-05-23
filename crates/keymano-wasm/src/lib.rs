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

use std::io::{Cursor, Write};
use std::path::PathBuf;

use keylayout_core::bundle::sanitize_stem;
use keylayout_core::Template;
use keymano_session::AppState;
use wasm_bindgen::prelude::*;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

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

    // ---- bundle export ----

    /// Pack the doc's `.bundle` as a single zip archive the browser can
    /// download. The zip has a `<Name>.bundle/` top-level directory so the
    /// unpacked result is a real macOS keyboard bundle (drop into
    /// `~/Library/Keyboard Layouts/`). Standalone docs are wrapped into a
    /// one-layout bundle, matching what the desktop's *Export as Bundle* does.
    pub fn export_bundle_zip(&self, id: u32) -> Result<Vec<u8>, JsValue> {
        let (name, files) = self.0.bundle_files(id).map_err(js_err)?;
        let stem = sanitize_stem(&name);
        let prefix = format!("{}.bundle", stem);
        let mut buf = Cursor::new(Vec::<u8>::new());
        let mut zip = ZipWriter::new(&mut buf);
        // Store-only — these are small text/plist files; skipping deflate keeps
        // the wasm payload small and the per-file CPU cost zero.
        let opts: SimpleFileOptions = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Stored)
            .unix_permissions(0o644);
        for (rel, bytes) in files {
            zip.start_file(format!("{}/{}", prefix, rel), opts)
                .map_err(js_err)?;
            zip.write_all(&bytes).map_err(js_err)?;
        }
        zip.finish().map_err(js_err)?;
        Ok(buf.into_inner())
    }

    /// Suggested filename for the downloaded bundle archive (`<Name>.bundle.zip`).
    /// Lives next to `export_bundle_zip` so the UI doesn't have to re-derive
    /// the slug rules.
    pub fn bundle_zip_filename(&self, id: u32) -> Result<String, JsValue> {
        let (name, _) = self.0.bundle_files(id).map_err(js_err)?;
        Ok(format!("{}.bundle.zip", sanitize_stem(&name)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    fn new_doc_id(s: &mut Session, name: &str) -> u32 {
        let summary_json = s.new_document("standard", name).unwrap();
        let v: serde_json::Value = serde_json::from_str(&summary_json).unwrap();
        v["id"].as_u64().unwrap() as u32
    }

    /// The wasm bundle export must produce a real zip with the expected
    /// `<Name>.bundle/Contents/...` layout — this is what the browser
    /// downloads and what the user double-clicks to unzip back into a usable
    /// macOS keyboard bundle. The v0.2.1 download bug was that the web build
    /// silently shipped a `.keylayout` instead.
    #[test]
    fn export_bundle_zip_round_trips_through_a_real_zip_archive() {
        let mut s = Session::new();
        let id = new_doc_id(&mut s, "MyLayout");

        let bytes = s.export_bundle_zip(id).unwrap();
        assert!(!bytes.is_empty(), "zip bytes empty");

        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(&bytes)).unwrap();
        let names: Vec<String> = (0..archive.len())
            .map(|i| archive.by_index(i).unwrap().name().to_string())
            .collect();

        // Top-level dir = `<Name>.bundle/` so unzipping gives a usable bundle.
        for n in &names {
            assert!(
                n.starts_with("MyLayout.bundle/"),
                "missing top-level prefix: {n}"
            );
        }
        assert!(
            names
                .iter()
                .any(|n| n == "MyLayout.bundle/Contents/Info.plist"),
            "Info.plist missing: {names:?}"
        );
        assert!(
            names.iter().any(|n| n.ends_with(".keylayout")),
            ".keylayout missing: {names:?}"
        );

        // Info.plist must use *our* namespace, not Apple's reserved com.apple.*
        // (review P1-12) — and must include the bundle name.
        let mut info_bytes = Vec::new();
        archive
            .by_name("MyLayout.bundle/Contents/Info.plist")
            .unwrap()
            .read_to_end(&mut info_bytes)
            .unwrap();
        let info = String::from_utf8(info_bytes).unwrap();
        assert!(
            info.contains("app.keymano.layouts."),
            "wrong identifier namespace: {info}"
        );
        assert!(
            !info.contains("com.apple."),
            "leaked Apple namespace: {info}"
        );
    }

    #[test]
    fn bundle_zip_filename_uses_the_bundle_name() {
        let mut s = Session::new();
        let id = new_doc_id(&mut s, "MyLayout");
        let name = s.bundle_zip_filename(id).unwrap();
        assert!(name.ends_with(".bundle.zip"), "{name}");
        assert!(name.contains("MyLayout"), "{name}");
    }

    /// Two consecutive exports of the same doc must produce byte-identical
    /// archives. Proves no real-time leaks from the zip writer (we pin the
    /// time feature off so timestamps stay at the zip epoch). A regression
    /// here would break caching, content-hash deployment, and reproducible
    /// builds.
    #[test]
    fn export_bundle_zip_is_deterministic() {
        let mut s = Session::new();
        let id = new_doc_id(&mut s, "MyLayout");
        let a = s.export_bundle_zip(id).unwrap();
        let b = s.export_bundle_zip(id).unwrap();
        assert_eq!(
            a,
            b,
            "non-deterministic zip output ({} vs {} bytes)",
            a.len(),
            b.len()
        );
    }

    /// Unicode bundle names must survive into the archive — the v0.2.2 UI port
    /// of `sanitize_stem` had a bug where the strict ASCII identifier slug was
    /// used for filenames too, collapsing Cyrillic / Japanese names to dashes.
    /// The wasm side must keep the real letters in `<Name>.bundle/` and in the
    /// .keylayout filename.
    #[test]
    fn export_bundle_zip_keeps_unicode_letters_in_filenames() {
        let mut s = Session::new();
        let id = new_doc_id(&mut s, "Українська");

        let bytes = s.export_bundle_zip(id).unwrap();
        let archive = zip::ZipArchive::new(std::io::Cursor::new(&bytes)).unwrap();
        let names: Vec<String> = (0..archive.len())
            .map(|i| archive.file_names().nth(i).unwrap().to_string())
            .collect();

        assert!(
            names.iter().all(|n| n.starts_with("Українська.bundle/")),
            "top-level dir lost Cyrillic letters: {names:?}"
        );
        assert!(
            names
                .iter()
                .any(|n| n == "Українська.bundle/Contents/Resources/Українська.keylayout"),
            ".keylayout stem lost Cyrillic letters: {names:?}"
        );
    }
}
