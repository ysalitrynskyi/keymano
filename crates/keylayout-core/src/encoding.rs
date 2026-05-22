//! Output-string encoding/decoding for `.keylayout` XML (docs/02, docs/07).
//!
//! Output may contain literal chars OR numeric character references
//! (`&#DDDD;` decimal, `&#xHHHH;` hex). We always encode XML-reserved chars,
//! C0 controls, DEL, and C1; optionally encode all non-ASCII.

use crate::error::{CoreError, Result};

/// Options controlling how output strings are encoded to XML.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct EncodeOpts {
    /// Encode every non-ASCII (> 0x7F) char as a numeric reference.
    pub code_non_ascii: bool,
}

/// True for code points that must never appear in a layout output string.
/// Rejects U+0000, > U+10FFFF, surrogates, and noncharacters.
pub fn is_valid_unicode(cp: u32) -> bool {
    if cp == 0 || cp > 0x10FFFF {
        return false;
    }
    if (0xD800..=0xDFFF).contains(&cp) {
        return false; // surrogate
    }
    if (cp & 0xFFFE) == 0xFFFE {
        return false; // U+xxFFFE / U+xxFFFF noncharacters
    }
    if (0xFDD0..=0xFDEF).contains(&cp) {
        return false; // Arabic-block noncharacters
    }
    true
}

/// Must this code point always be encoded as a numeric reference?
fn must_encode(cp: u32) -> bool {
    matches!(cp,
        0x26 /* & */ | 0x3C /* < */ | 0x3E /* > */ | 0x22 /* " */ | 0x27 /* ' */)
        || cp <= 0x1F            // C0 controls
        || cp == 0x7F            // DEL
        || (0x80..=0x9F).contains(&cp) // C1
}

/// Encode a string into an XML-attribute-safe form using numeric refs as needed.
pub fn encode_output(s: &str, opts: &EncodeOpts) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        let cp = ch as u32;
        if must_encode(cp) || (opts.code_non_ascii && cp > 0x7F) {
            out.push_str(&format!("&#x{cp:04X};"));
        } else {
            out.push(ch);
        }
    }
    out
}

/// Decode a raw attribute value: resolve decimal/hex numeric refs and the five
/// named XML entities. Reconstructs astral chars from surrogate-pair refs.
pub fn decode_output(raw: &str) -> Result<String> {
    let bytes: Vec<char> = raw.chars().collect();
    let mut out = String::with_capacity(raw.len());
    let mut i = 0;
    let mut pending_high: Option<u32> = None;

    while i < bytes.len() {
        if bytes[i] == '&' {
            // find ';'
            let mut j = i + 1;
            while j < bytes.len() && bytes[j] != ';' {
                j += 1;
            }
            if j >= bytes.len() {
                return Err(CoreError::BadCharRef(raw.to_string()));
            }
            let ent: String = bytes[i + 1..j].iter().collect();
            let cp = parse_entity(&ent, raw)?;
            // Handle surrogate pairs that may appear as separate refs.
            if (0xD800..=0xDBFF).contains(&cp) {
                pending_high = Some(cp);
            } else if (0xDC00..=0xDFFF).contains(&cp) {
                let high = pending_high
                    .take()
                    .ok_or_else(|| CoreError::BadCharRef(raw.to_string()))?;
                let combined = 0x10000 + ((high - 0xD800) << 10) + (cp - 0xDC00);
                push_cp(&mut out, combined)?;
            } else {
                if pending_high.is_some() {
                    return Err(CoreError::BadCharRef(raw.to_string()));
                }
                push_cp(&mut out, cp)?;
            }
            i = j + 1;
        } else {
            if pending_high.is_some() {
                return Err(CoreError::BadCharRef(raw.to_string()));
            }
            out.push(bytes[i]);
            i += 1;
        }
    }
    if pending_high.is_some() {
        return Err(CoreError::BadCharRef(raw.to_string()));
    }
    Ok(out)
}

fn parse_entity(ent: &str, raw: &str) -> Result<u32> {
    match ent {
        "amp" => Ok(0x26),
        "lt" => Ok(0x3C),
        "gt" => Ok(0x3E),
        "quot" => Ok(0x22),
        "apos" => Ok(0x27),
        _ => {
            if let Some(hex) = ent.strip_prefix("#x").or_else(|| ent.strip_prefix("#X")) {
                u32::from_str_radix(hex, 16).map_err(|_| CoreError::BadCharRef(raw.to_string()))
            } else if let Some(dec) = ent.strip_prefix('#') {
                dec.parse::<u32>()
                    .map_err(|_| CoreError::BadCharRef(raw.to_string()))
            } else {
                Err(CoreError::BadCharRef(raw.to_string()))
            }
        }
    }
}

fn push_cp(out: &mut String, cp: u32) -> Result<()> {
    let ch = char::from_u32(cp).ok_or(CoreError::InvalidUnicode(cp))?;
    out.push(ch);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_unicode_rejects_bad() {
        assert!(!is_valid_unicode(0));
        assert!(!is_valid_unicode(0x110000));
        assert!(!is_valid_unicode(0xD800));
        assert!(!is_valid_unicode(0xDFFF));
        assert!(!is_valid_unicode(0xFFFE));
        assert!(!is_valid_unicode(0x1FFFF));
        assert!(!is_valid_unicode(0xFDD0));
        assert!(is_valid_unicode(0x41));
        assert!(is_valid_unicode(0x1F600));
        assert!(is_valid_unicode(0xE1));
    }

    #[test]
    fn encode_reserved_and_controls() {
        let opts = EncodeOpts::default();
        assert_eq!(encode_output("a&b", &opts), "a&#x0026;b");
        assert_eq!(encode_output("x<y>z", &opts), "x&#x003C;y&#x003E;z");
        assert_eq!(encode_output("\t", &opts), "&#x0009;");
        // non-ascii kept literal when option off
        assert_eq!(encode_output("á", &opts), "á");
    }

    #[test]
    fn encode_non_ascii_when_opted() {
        let opts = EncodeOpts {
            code_non_ascii: true,
        };
        assert_eq!(encode_output("á", &opts), "&#x00E1;");
        assert_eq!(encode_output("a", &opts), "a");
    }

    #[test]
    fn decode_decimal_hex_named() {
        assert_eq!(decode_output("&#x00E1;").unwrap(), "á");
        assert_eq!(decode_output("&#225;").unwrap(), "á");
        assert_eq!(decode_output("a&amp;b").unwrap(), "a&b");
        assert_eq!(decode_output("&lt;&gt;").unwrap(), "<>");
        assert_eq!(decode_output("plain").unwrap(), "plain");
    }

    #[test]
    fn decode_astral_direct_and_surrogates() {
        assert_eq!(decode_output("&#x1F600;").unwrap(), "😀");
        // surrogate-pair refs
        assert_eq!(decode_output("&#xD83D;&#xDE00;").unwrap(), "😀");
    }

    #[test]
    fn decode_round_trips_with_encode() {
        let opts = EncodeOpts {
            code_non_ascii: true,
        };
        let s = "áé😀<&>";
        let enc = encode_output(s, &opts);
        assert_eq!(decode_output(&enc).unwrap(), s);
    }

    #[test]
    fn decode_bad_ref_errors() {
        assert!(decode_output("&#xZZ;").is_err());
        assert!(decode_output("&nope;").is_err());
        assert!(decode_output("&unterminated").is_err());
        // lone low surrogate
        assert!(decode_output("&#xDE00;").is_err());
    }
}
