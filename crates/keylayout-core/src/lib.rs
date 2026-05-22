//! keylayout-core — pure Rust core for macOS `.keylayout` / `.bundle` editing.
//!
//! Owns ALL format/resolution/validation logic (docs/05, docs/11). No Tauri,
//! no UI, no I/O beyond bundle directory read/write. Fully unit-tested.
//!
//! Pipeline: [`parse`] XML → [`model`] → mutate → [`serialize`] back.
//! [`resolve::build_snapshot`] produces the render-ready view for the UI.

pub mod bundle;
pub mod encoding;
pub mod error;
pub mod ids;
pub mod model;
pub mod modifiers;
pub mod parse;
pub mod resolve;
pub mod serialize;
pub mod special_keys;
pub mod templates;
pub mod validate;

// Convenient top-level re-exports.
pub use bundle::{BundledLayout, KeyboardBundle, Localization};
pub use encoding::{decode_output, encode_output, is_valid_unicode, EncodeOpts};
pub use error::{CoreError, Result};
pub use ids::{id_is_valid, random_keyboard_id, Script};
pub use model::{
    Action, BaseRef, Comments, Document, Key, KeyMap, KeyMapSelect, KeyMapSet, KeyValue, Keyboard,
    LayoutRange, Modifier, ModifierMap, ModifierSpec, ModifierToken, When,
};
pub use modifiers::ModMask;
pub use parse::parse_keylayout;
pub use resolve::{build_snapshot, KeyView, KeyboardSnapshot};
pub use serialize::serialize_keylayout;
pub use templates::{new_keyboard, Template};
pub use validate::{repair, validate, Issue, RepairReport, Severity};

/// Parse a standalone `.keylayout` string into a [`Document`].
pub fn open_keylayout(xml: &str) -> Result<Document> {
    Ok(Document::Standalone(parse_keylayout(xml)?))
}
