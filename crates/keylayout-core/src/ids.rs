//! Keyboard `id` / `group` script ranges + random id generation (.
//!
//! `group` = Mac script code. `id` must fall in a script-specific range or
//! macOS may reject/clash. New keyboards pick a random id within range.

use serde::{Deserialize, Serialize};

/// Mac script families with their valid `id` ranges. `group` is the XML
/// `group` attribute value.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Script {
    /// Default for modern custom layouts: Unicode group, negative ids.
    MacUnicode,
    MacRoman,
    MacJapanese,
    MacChineseTrad,
    MacKorean,
    MacCyrillic,
    MacChineseSimp,
    MacCentralEurRoman,
}

impl Script {
    /// The XML `group` attribute value.
    ///
    /// All listed scripts use group 0 (; the distinguishing factor
    /// is the id range. Modern custom layouts use Unicode group 0 with negative
    /// ids.
    pub fn group(self) -> i32 {
        0
    }

    /// Inclusive `[min, max]` valid id range for this script.
    pub fn id_range(self) -> (i32, i32) {
        match self {
            Script::MacUnicode => (-32768, -2),
            Script::MacRoman => (2, 16383),
            Script::MacJapanese => (16384, 16895),
            Script::MacChineseTrad => (16896, 17407),
            Script::MacKorean => (17408, 17919),
            Script::MacCyrillic => (19456, 19967),
            Script::MacChineseSimp => (28672, 29183),
            Script::MacCentralEurRoman => (30720, 31231),
        }
    }

    /// Stable identifier string (for UI / serde-friendly use).
    pub fn name(self) -> &'static str {
        match self {
            Script::MacUnicode => "Unicode",
            Script::MacRoman => "Roman",
            Script::MacJapanese => "Japanese",
            Script::MacChineseTrad => "ChineseTraditional",
            Script::MacKorean => "Korean",
            Script::MacCyrillic => "Cyrillic",
            Script::MacChineseSimp => "ChineseSimplified",
            Script::MacCentralEurRoman => "CentralEuropeanRoman",
        }
    }

    pub fn all() -> &'static [Script] {
        &[
            Script::MacUnicode,
            Script::MacRoman,
            Script::MacJapanese,
            Script::MacChineseTrad,
            Script::MacKorean,
            Script::MacCyrillic,
            Script::MacChineseSimp,
            Script::MacCentralEurRoman,
        ]
    }
}

/// Is `(group, id)` valid for some known script range? Strict — used when
/// generating NEW keyboards so they land in a clean Unicode range.
pub fn id_is_valid(group: i32, id: i32) -> bool {
    Script::all().iter().any(|s| {
        let (lo, hi) = s.id_range();
        s.group() == group && id >= lo && id <= hi
    })
}

/// Lenient check for VALIDATING existing files. real-world Apple layouts use
/// many script groups (e.g. group 126 Cyrillic) and ids across the signed
/// 16-bit range; we only reject a missing/zero id or out-of-i16 range.
pub fn id_plausible(_group: i32, id: i32) -> bool {
    id != 0 && (-32768..=32767).contains(&id)
}

/// Deterministically map an arbitrary u64 into a script's id range.
pub fn id_in_range(script: Script, n: u64) -> i32 {
    let (lo, hi) = script.id_range();
    let span = (hi - lo + 1) as u64;
    lo + (n % span) as i32
}

/// Generate a pseudo-random id within a script's valid range.
/// Uses a time-seeded LCG; collision risk is negligible for authoring.
pub fn random_keyboard_id(script: Script) -> i32 {
    let seed = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0x9E3779B97F4A7C15);
    // splitmix64 step for good dispersion
    let mut z = seed.wrapping_add(0x9E3779B97F4A7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
    z ^= z >> 31;
    id_in_range(script, z)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unicode_range_negative() {
        let (lo, hi) = Script::MacUnicode.id_range();
        assert_eq!((lo, hi), (-32768, -2));
        assert!(id_is_valid(0, -15000));
        assert!(!id_is_valid(0, -1));
        assert!(!id_is_valid(0, 0));
    }

    #[test]
    fn roman_boundaries() {
        assert!(id_is_valid(0, 2));
        assert!(id_is_valid(0, 16383));
        assert!(!id_is_valid(0, 1));
    }

    #[test]
    fn random_in_range() {
        for s in Script::all() {
            let id = random_keyboard_id(*s);
            let (lo, hi) = s.id_range();
            assert!(id >= lo && id <= hi, "{:?} -> {}", s, id);
            assert!(id_is_valid(s.group(), id));
        }
    }

    #[test]
    fn id_in_range_deterministic() {
        assert_eq!(id_in_range(Script::MacUnicode, 0), -32768);
        let (lo, hi) = Script::MacUnicode.id_range();
        for n in [0u64, 1, 99, 12345, u64::MAX] {
            let id = id_in_range(Script::MacUnicode, n);
            assert!(id >= lo && id <= hi);
        }
    }
}
