//! keylayout-core — pure Rust core for macOS `.keylayout` / `.bundle` editing.
//!
//! Owns ALL format/resolution/validation logic (. No Tauri,
//! no UI, no I/O beyond bundle directory read/write. Fully unit-tested.
//!
//! Pipeline: [`parse`] XML → [`model`] → mutate → [`serialize`] back.
//! [`resolve::build_snapshot`] produces the render-ready view for the UI.

pub mod bundle;
pub mod dead_keys;
pub mod encoding;
pub mod error;
pub mod ids;
pub mod layers;
pub mod model;
pub mod modifiers;
pub mod parse;
#[path = "repair.rs"]
mod repair_plan;
pub mod resolve;
pub mod serialize;
pub mod special_keys;
pub mod templates;
pub mod validate;

// Convenient top-level re-exports.
pub use bundle::{bundle_from_files, BundledLayout, KeyboardBundle, Localization};
pub use dead_keys::{
    accent_recipe_action, apply_accent_recipe, dead_key_graph, AccentRecipe, DeadKeyEdge,
    DeadKeyGraph, DeadKeyTerminator,
};
pub use encoding::{decode_output, encode_output, is_valid_unicode, EncodeOpts};
pub use error::{CoreError, Result};
pub use ids::{id_is_valid, random_keyboard_id, Script};
pub use layers::{layer_matrix, LayerCell, LayerCellSource, LayerMatrix, LayerRow};
pub use model::{
    Action, BaseRef, CommentAnchor, Comments, Document, Key, KeyAddress, KeyMap, KeyMapSelect,
    KeyMapSet, KeyValue, Keyboard, KeyboardAddress, LayerAddress, LayoutRange, Modifier,
    ModifierMap, ModifierSpec, ModifierToken, When,
};
pub use modifiers::ModMask;
pub use parse::parse_keylayout;
pub use repair_plan::{apply_repair_plan, plan_repairs, RepairApplyReport, RepairOp, RepairPlan};
pub use resolve::{
    build_snapshot, build_snapshot_with_options, KeyView, KeyboardSnapshot, SnapshotOptions,
};
pub use serialize::serialize_keylayout;
pub use templates::{new_keyboard, Template};
pub use validate::{
    repair, validate, validate_document, validation_report, Issue, IssueCategory, IssueLocation,
    RepairReport, Severity, ValidationReport,
};

/// Parse a standalone `.keylayout` string into a [`Document`].
pub fn open_keylayout(xml: &str) -> Result<Document> {
    Ok(Document::Standalone(parse_keylayout(xml)?))
}
