//! `.bundle` keyboard package read/write (.
//!
//! A bundle is a plain directory tree, portable across OSes. Pure helpers for
//! Info.plist + `.strings` (de)serialization plus directory read/write.

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::encoding::EncodeOpts;
use crate::error::{CoreError, Result};
use crate::model::Keyboard;
use crate::parse::parse_keylayout;
use crate::serialize::serialize_keylayout;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct KeyboardBundle {
    pub identifier: String,
    pub name: String,
    pub version: String,
    pub build_version: Option<String>,
    pub project_name: Option<String>,
    pub source_version: Option<String>,
    pub layouts: Vec<BundledLayout>,
    pub localizations: Vec<Localization>,
    /// Preserved unknown Info.plist keys, with their original value type
    /// (string / array / dict / …) so real Apple keyboard bundles round-trip.
    #[serde(default)]
    pub extra_plist: BTreeMap<String, plist::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BundledLayout {
    pub file_stem: String,
    pub keyboard: Keyboard,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<Vec<u8>>,
    pub intended_language: Option<String>,
    #[serde(default)]
    pub does_caps_lock_switching: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Localization {
    pub locale: String,
    pub names: BTreeMap<String, String>,
}

impl KeyboardBundle {
    /// Wrap a single keyboard into a one-layout bundle.
    pub fn from_keyboard(kb: Keyboard) -> Self {
        let name = kb.name.clone();
        let stem = sanitize_stem(&kb.name);
        // CFBundleIdentifier must be an ASCII reverse-DNS label — slug to
        // [A-Za-z0-9-]. Use our own namespace, not Apple's reserved com.apple.*
        // (collision / notarization risk) — review P1-12.
        let id_slug: String = kb
            .name
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || c == '-' {
                    c
                } else {
                    '-'
                }
            })
            .collect();
        let id_slug = id_slug.trim_matches('-').to_string();
        let id_slug = if id_slug.is_empty() {
            "layout".to_string()
        } else {
            id_slug
        };
        KeyboardBundle {
            identifier: format!("app.keymano.layouts.{}", id_slug),
            name: name.clone(),
            version: "1.0".to_string(),
            build_version: None,
            project_name: None,
            source_version: None,
            layouts: vec![BundledLayout {
                file_stem: stem,
                keyboard: kb,
                icon: None,
                intended_language: None,
                does_caps_lock_switching: false,
            }],
            localizations: vec![Localization {
                locale: "en".to_string(),
                names: {
                    let mut m = BTreeMap::new();
                    m.insert(sanitize_stem(&name), name);
                    m
                },
            }],
            extra_plist: BTreeMap::new(),
        }
    }

    /// Bundle → standalone keyboard. Only valid with exactly one layout.
    pub fn into_single(self) -> Result<Keyboard> {
        if self.layouts.len() != 1 {
            return Err(CoreError::Bundle(format!(
                "expected exactly 1 layout, found {}",
                self.layouts.len()
            )));
        }
        Ok(self.layouts.into_iter().next().unwrap().keyboard)
    }
}

/// Unicode bidi / format-control characters. These can visually reorder a file
/// name in Finder (e.g. RLO reversing it) to spoof the extension — strip them
/// from any on-disk stem (review P1-08).
pub fn is_bidi_control(c: char) -> bool {
    matches!(c,
        '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}'
        | '\u{200E}' | '\u{200F}' | '\u{061C}')
}

/// Sanitize a layout name into a safe on-disk file stem. Preserves Unicode
/// letters (a Cyrillic name must not collapse to "Keyboard" and collide with
/// other layouts on disk, P3-08); maps path separators, control chars, and
/// bidi/format controls to '-'; falls back to "Keyboard Layout" when nothing
/// usable remains. The single sanitizer for both `.bundle` stems and the
/// install path (review P1-08).
pub fn sanitize_stem(name: &str) -> String {
    let s: String = name
        .chars()
        .map(|c| {
            if c == '/' || c == '\\' || c == ':' || c.is_control() || is_bidi_control(c) {
                '-'
            } else {
                c
            }
        })
        .collect();
    // Strip leading/trailing dots and dashes so a name made only of separators
    // or controls (now all '-') collapses to the fallback rather than "--".
    let s = s
        .trim()
        .trim_matches(|c: char| c == '.' || c == '-')
        .to_string();
    if s.is_empty() {
        "Keyboard Layout".to_string()
    } else {
        s
    }
}

// ---- Info.plist (pure bytes) ----

/// Build the Info.plist XML for a bundle.
pub fn build_info_plist(bundle: &KeyboardBundle) -> Result<Vec<u8>> {
    let mut dict = plist::Dictionary::new();
    dict.insert(
        "CFBundleIdentifier".into(),
        plist::Value::String(bundle.identifier.clone()),
    );
    dict.insert(
        "CFBundleName".into(),
        plist::Value::String(bundle.name.clone()),
    );
    dict.insert(
        "CFBundleVersion".into(),
        plist::Value::String(bundle.version.clone()),
    );
    if let Some(v) = &bundle.build_version {
        dict.insert("BuildVersion".into(), plist::Value::String(v.clone()));
    }
    if let Some(v) = &bundle.project_name {
        dict.insert("ProjectName".into(), plist::Value::String(v.clone()));
    }
    if let Some(v) = &bundle.source_version {
        dict.insert("SourceVersion".into(), plist::Value::String(v.clone()));
    }
    for (k, v) in &bundle.extra_plist {
        if !dict.contains_key(k) {
            dict.insert(k.clone(), v.clone());
        }
    }
    let mut buf = Vec::new();
    plist::to_writer_xml(&mut buf, &plist::Value::Dictionary(dict))?;
    Ok(buf)
}

/// Parse an Info.plist into the known fields + preserved extras.
pub fn parse_info_plist(bytes: &[u8]) -> Result<ParsedInfo> {
    let val: plist::Value = plist::from_bytes(bytes)?;
    let dict = val
        .into_dictionary()
        .ok_or_else(|| CoreError::Plist("Info.plist root is not a dict".into()))?;
    let get = |k: &str| dict.get(k).and_then(|v| v.as_string()).map(str::to_string);
    let known = [
        "CFBundleIdentifier",
        "CFBundleName",
        "CFBundleVersion",
        "BuildVersion",
        "ProjectName",
        "SourceVersion",
    ];
    let mut extra = BTreeMap::new();
    for (k, v) in &dict {
        if !known.contains(&k.as_str()) {
            // Preserve the raw value (array/dict/string/…), not just strings.
            extra.insert(k.clone(), v.clone());
        }
    }
    Ok(ParsedInfo {
        identifier: get("CFBundleIdentifier").unwrap_or_default(),
        name: get("CFBundleName").unwrap_or_default(),
        version: get("CFBundleVersion").unwrap_or_else(|| "1.0".into()),
        build_version: get("BuildVersion"),
        project_name: get("ProjectName"),
        source_version: get("SourceVersion"),
        extra_plist: extra,
    })
}

#[derive(Debug, Clone, PartialEq)]
pub struct ParsedInfo {
    pub identifier: String,
    pub name: String,
    pub version: String,
    pub build_version: Option<String>,
    pub project_name: Option<String>,
    pub source_version: Option<String>,
    pub extra_plist: BTreeMap<String, plist::Value>,
}

// ---- .strings (pure string) ----

/// Emit an `InfoPlist.strings` file body (UTF-8, no BOM).
pub fn build_strings(names: &BTreeMap<String, String>) -> String {
    let mut s = String::new();
    for (k, v) in names {
        s.push_str(&format!(
            "\"{}\" = \"{}\";\n",
            strings_escape(k),
            strings_escape(v)
        ));
    }
    s
}

/// Decode `.strings` bytes by BOM sniff: UTF-16 LE/BE (Apple's usual encoding)
/// or UTF-8, falling back to lossy UTF-8 when there's no BOM.
fn decode_strings_bytes(b: &[u8]) -> String {
    fn utf16(body: &[u8], le: bool) -> String {
        let units: Vec<u16> = body
            .chunks_exact(2)
            .map(|c| {
                if le {
                    u16::from_le_bytes([c[0], c[1]])
                } else {
                    u16::from_be_bytes([c[0], c[1]])
                }
            })
            .collect();
        let mut s = String::from_utf16_lossy(&units);
        // An odd trailing byte is a truncated UTF-16 unit — surface it as the
        // replacement char rather than dropping it silently (chunks_exact would).
        if !body.len().is_multiple_of(2) {
            s.push('\u{FFFD}');
        }
        s
    }
    if b.len() >= 2 && b[0] == 0xFF && b[1] == 0xFE {
        utf16(&b[2..], true)
    } else if b.len() >= 2 && b[0] == 0xFE && b[1] == 0xFF {
        utf16(&b[2..], false)
    } else if b.starts_with(&[0xEF, 0xBB, 0xBF]) {
        String::from_utf8_lossy(&b[3..]).into_owned()
    } else {
        String::from_utf8_lossy(b).into_owned()
    }
}

/// Parse an `InfoPlist.strings` body into a name map. Tolerates comments.
pub fn parse_strings(body: &str) -> BTreeMap<String, String> {
    let mut map = BTreeMap::new();
    for line in body.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with("//") || line.starts_with("/*") {
            continue;
        }
        if let Some((k, v)) = parse_strings_line(line) {
            map.insert(k, v);
        }
    }
    map
}

fn parse_strings_line(line: &str) -> Option<(String, String)> {
    // "key" = "value";
    let line = line.trim_end_matches(';').trim();
    let eq = line.find('=')?;
    let (lhs, rhs) = line.split_at(eq);
    let key = unquote(lhs.trim())?;
    let val = unquote(rhs[1..].trim())?;
    Some((key, val))
}

fn unquote(s: &str) -> Option<String> {
    let s = s.strip_prefix('"')?.strip_suffix('"')?;
    Some(s.replace("\\\"", "\"").replace("\\\\", "\\"))
}

fn strings_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

// ---- Directory read/write (fs) ----

/// Read a `.bundle` directory into a [`KeyboardBundle`].
pub fn read_bundle(dir: &Path) -> Result<KeyboardBundle> {
    let contents = dir.join("Contents");
    let resources = contents.join("Resources");

    let info_bytes = std::fs::read(contents.join("Info.plist"))?;
    let info = parse_info_plist(&info_bytes)?;

    let mut layouts = Vec::new();
    let mut localizations = Vec::new();

    if resources.is_dir() {
        let mut entries: Vec<_> = std::fs::read_dir(&resources)?
            .filter_map(|e| e.ok())
            .collect();
        entries.sort_by_key(|e| e.path());
        for entry in entries {
            let path = entry.path();
            if path.extension().map(|e| e == "keylayout").unwrap_or(false) {
                let xml = std::fs::read_to_string(&path)?;
                let kb = parse_keylayout(&xml)?;
                let stem = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Keyboard")
                    .to_string();
                let icns = resources.join(format!("{stem}.icns"));
                let icon = std::fs::read(&icns).ok();
                layouts.push(BundledLayout {
                    file_stem: stem,
                    keyboard: kb,
                    icon,
                    intended_language: None,
                    does_caps_lock_switching: false,
                });
            } else if path.is_dir() && path.extension().map(|e| e == "lproj").unwrap_or(false) {
                let locale = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("en")
                    .to_string();
                let strings_path = path.join("InfoPlist.strings");
                if let Ok(raw) = std::fs::read(&strings_path) {
                    // Apple usually emits UTF-16 (often LE with BOM); decode by
                    // BOM sniff so localized names aren't silently lost (P1-01).
                    let body = decode_strings_bytes(&raw);
                    localizations.push(Localization {
                        locale,
                        names: parse_strings(&body),
                    });
                }
            }
        }
    }

    Ok(KeyboardBundle {
        identifier: info.identifier,
        name: info.name,
        version: info.version,
        build_version: info.build_version,
        project_name: info.project_name,
        source_version: info.source_version,
        layouts,
        localizations,
        extra_plist: info.extra_plist,
    })
}

/// Write a [`KeyboardBundle`] to a `.bundle` directory.
pub fn write_bundle(bundle: &KeyboardBundle, dir: &Path, opts: &EncodeOpts) -> Result<()> {
    let contents = dir.join("Contents");
    let resources = contents.join("Resources");
    std::fs::create_dir_all(&resources)?;

    std::fs::write(contents.join("Info.plist"), build_info_plist(bundle)?)?;

    for layout in &bundle.layouts {
        let xml = serialize_keylayout(&layout.keyboard, opts);
        std::fs::write(
            resources.join(format!("{}.keylayout", layout.file_stem)),
            xml,
        )?;
        if let Some(icon) = &layout.icon {
            std::fs::write(resources.join(format!("{}.icns", layout.file_stem)), icon)?;
        }
    }

    for loc in &bundle.localizations {
        let lproj = resources.join(format!("{}.lproj", loc.locale));
        std::fs::create_dir_all(&lproj)?;
        std::fs::write(lproj.join("InfoPlist.strings"), build_strings(&loc.names))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::templates::{new_keyboard, Template};

    #[test]
    fn standalone_to_bundle_and_back() {
        let kb = new_keyboard(Template::Standard, "My Layout");
        let bundle = KeyboardBundle::from_keyboard(kb.clone());
        assert_eq!(bundle.identifier, "app.keymano.layouts.My-Layout");
        assert_eq!(bundle.layouts.len(), 1);
        let back = bundle.into_single().unwrap();
        assert_eq!(back, kb);
    }

    #[test]
    fn info_plist_round_trip() {
        let mut bundle = KeyboardBundle::from_keyboard(new_keyboard(Template::Basic, "X"));
        bundle.build_version = Some("42".into());
        bundle
            .extra_plist
            .insert("CustomKey".into(), plist::Value::String("val".into()));
        // a non-string value (array) must survive too (P0-04)
        bundle.extra_plist.insert(
            "TISIntendedLanguage".into(),
            plist::Value::Array(vec![plist::Value::String("ru".into())]),
        );
        let bytes = build_info_plist(&bundle).unwrap();
        let parsed = parse_info_plist(&bytes).unwrap();
        assert_eq!(parsed.identifier, bundle.identifier);
        assert_eq!(parsed.build_version.as_deref(), Some("42"));
        assert_eq!(
            parsed
                .extra_plist
                .get("CustomKey")
                .and_then(|v| v.as_string()),
            Some("val")
        );
        assert_eq!(
            parsed.extra_plist.get("TISIntendedLanguage").cloned(),
            Some(plist::Value::Array(vec![plist::Value::String("ru".into())]))
        );
    }

    #[test]
    fn decodes_utf16_le_strings() {
        // "x" = "ф"; as UTF-16 LE with BOM
        let body = "\"x\" = \"ф\";\n";
        let mut bytes = vec![0xFF, 0xFE];
        for u in body.encode_utf16() {
            bytes.extend_from_slice(&u.to_le_bytes());
        }
        let decoded = decode_strings_bytes(&bytes);
        assert_eq!(
            parse_strings(&decoded).get("x").map(String::as_str),
            Some("ф")
        );
    }

    #[test]
    fn strings_round_trip() {
        let mut names = BTreeMap::new();
        names.insert("MyKeyboard".to_string(), "My Keyboard".to_string());
        names.insert("Another".to_string(), "Another Layout".to_string());
        let body = build_strings(&names);
        let parsed = parse_strings(&body);
        assert_eq!(parsed, names);
    }

    #[test]
    fn strings_tolerates_comments_and_quotes() {
        let body = "// a comment\n\"k\" = \"a \\\"quote\\\"\";\n";
        let parsed = parse_strings(body);
        assert_eq!(parsed.get("k").map(|s| s.as_str()), Some("a \"quote\""));
    }

    #[test]
    fn bundle_dir_round_trip() {
        let kb = new_keyboard(Template::Standard, "RoundTrip");
        let bundle = KeyboardBundle::from_keyboard(kb);
        let tmp = std::env::temp_dir().join(format!("keymano_test_{}.bundle", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        write_bundle(&bundle, &tmp, &EncodeOpts::default()).unwrap();
        let read = read_bundle(&tmp).unwrap();
        assert_eq!(read.identifier, bundle.identifier);
        assert_eq!(read.layouts.len(), 1);
        assert_eq!(read.layouts[0].keyboard.name, "RoundTrip");
        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn decodes_utf16_be_strings() {
        let body = "\"x\" = \"é\";\n";
        let mut bytes = vec![0xFE, 0xFF]; // BE BOM
        for u in body.encode_utf16() {
            bytes.extend_from_slice(&u.to_be_bytes());
        }
        assert_eq!(
            parse_strings(&decode_strings_bytes(&bytes))
                .get("x")
                .map(String::as_str),
            Some("é")
        );
    }

    #[test]
    fn decodes_utf8_bom_strings() {
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice("\"k\" = \"v\";\n".as_bytes());
        assert_eq!(
            parse_strings(&decode_strings_bytes(&bytes))
                .get("k")
                .map(String::as_str),
            Some("v")
        );
    }

    #[test]
    fn decode_odd_trailing_byte_surfaces_replacement_char() {
        // UTF-16 LE BOM + one full unit ('A') + a dangling odd byte (0x42).
        let bytes = vec![0xFF, 0xFE, 0x41, 0x00, 0x42];
        let decoded = decode_strings_bytes(&bytes);
        assert!(decoded.starts_with('A'));
        assert!(
            decoded.ends_with('\u{FFFD}'),
            "dangling odd byte must not vanish silently: {decoded:?}"
        );
    }

    #[test]
    fn sanitize_stem_edges() {
        assert_eq!(sanitize_stem("a/b:c\\d"), "a-b-c-d");
        assert_eq!(sanitize_stem("   "), "Keyboard Layout");
        assert_eq!(sanitize_stem("..."), "Keyboard Layout");
        // Unicode letters preserved (no collapse → no on-disk collision, P3-08)
        assert_eq!(sanitize_stem("Українська"), "Українська");
    }

    #[test]
    fn sanitize_stem_strips_bidi_and_control_spoofing() {
        // RLO (U+202E) can reverse how a name renders in Finder to fake the
        // extension — it (and other bidi/format controls) must be neutralized.
        for c in [
            '\u{202E}', '\u{202A}', '\u{2066}', '\u{2069}', '\u{200E}', '\u{200F}', '\u{061C}',
            '\u{0000}', '\n',
        ] {
            assert!(
                is_bidi_control(c) || c.is_control(),
                "{c:?} should be unsafe"
            );
            let stem = sanitize_stem(&format!("ab{c}cd"));
            assert!(!stem.contains(c), "unsafe char {c:?} leaked into {stem:?}");
        }
        // a name made entirely of controls falls back, never empty
        assert_eq!(sanitize_stem("\u{202E}\u{200F}"), "Keyboard Layout");
    }

    #[test]
    fn non_ascii_name_gets_safe_identifier_but_keeps_unicode_stem() {
        let bundle = KeyboardBundle::from_keyboard(new_keyboard(Template::Basic, "Русский"));
        // an all-non-ASCII name slugs to empty → fallback "layout"
        assert_eq!(bundle.identifier, "app.keymano.layouts.layout");
        // the on-disk stem keeps the Unicode name
        assert_eq!(bundle.layouts[0].file_stem, "Русский");
    }

    #[test]
    fn into_single_rejects_multi_layout() {
        let mut bundle = KeyboardBundle::from_keyboard(new_keyboard(Template::Basic, "A"));
        bundle.layouts.push(BundledLayout {
            file_stem: "B".into(),
            keyboard: new_keyboard(Template::Basic, "B"),
            icon: None,
            intended_language: None,
            does_caps_lock_switching: false,
        });
        assert!(bundle.into_single().is_err());
    }

    #[test]
    fn multi_layout_bundle_dir_round_trips() {
        let mut bundle = KeyboardBundle::from_keyboard(new_keyboard(Template::Standard, "First"));
        bundle.layouts.push(BundledLayout {
            file_stem: "Second".into(),
            keyboard: new_keyboard(Template::Basic, "Second"),
            icon: None,
            intended_language: None,
            does_caps_lock_switching: false,
        });
        bundle.localizations.push(Localization {
            locale: "ru".into(),
            names: {
                let mut m = BTreeMap::new();
                m.insert("First".into(), "Первый".into());
                m
            },
        });
        let tmp = std::env::temp_dir().join(format!("keymano_multi_{}.bundle", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        write_bundle(&bundle, &tmp, &EncodeOpts::default()).unwrap();
        let read = read_bundle(&tmp).unwrap();
        assert_eq!(read.layouts.len(), 2);
        let stems: Vec<_> = read.layouts.iter().map(|l| l.file_stem.as_str()).collect();
        assert!(stems.contains(&"First") && stems.contains(&"Second"));
        // localized name survives the ru.lproj round trip
        let ru = read.localizations.iter().find(|l| l.locale == "ru");
        assert_eq!(
            ru.and_then(|l| l.names.get("First")).map(String::as_str),
            Some("Первый")
        );
        std::fs::remove_dir_all(&tmp).unwrap();
    }
}
