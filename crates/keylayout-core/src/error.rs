//! Error types for keylayout-core. Pure library errors via `thiserror`.

use thiserror::Error;

/// Errors raised while parsing, serializing, or resolving a layout.
#[derive(Error, Debug)]
pub enum CoreError {
    #[error("XML error: {0}")]
    Xml(String),

    #[error("invalid attribute {attr} on <{element}>: {value}")]
    InvalidAttr {
        element: String,
        attr: String,
        value: String,
    },

    #[error("missing required attribute {attr} on <{element}>")]
    MissingAttr { element: String, attr: String },

    #[error("invalid Unicode code point: U+{0:04X}")]
    InvalidUnicode(u32),

    #[error("malformed character reference: {0}")]
    BadCharRef(String),

    #[error("plist error: {0}")]
    Plist(String),

    #[error("bundle error: {0}")]
    Bundle(String),

    #[error("io error: {0}")]
    Io(String),

    #[error("{0}")]
    Other(String),
}

impl From<quick_xml::Error> for CoreError {
    fn from(e: quick_xml::Error) -> Self {
        CoreError::Xml(e.to_string())
    }
}

impl From<std::io::Error> for CoreError {
    fn from(e: std::io::Error) -> Self {
        CoreError::Io(e.to_string())
    }
}

impl From<plist::Error> for CoreError {
    fn from(e: plist::Error) -> Self {
        CoreError::Plist(e.to_string())
    }
}

/// Convenience result alias for core operations.
pub type Result<T> = std::result::Result<T, CoreError>;
