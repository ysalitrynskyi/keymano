//! End-to-end real-file roundtrips: open a real `.keylayout`, edit it, serialize
//! to an actual file on disk, read it back, and confirm the content survived.
//! Also exercises the `.bundle` save/open path. These guard the "load and save
//! to real files and load them back" promise.

use std::path::PathBuf;

use keymano_session::{AppState, SaveFormat};

fn fixtures() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../keylayout-core/tests/fixtures")
}

fn tmp(name: &str) -> PathBuf {
    let mut p = std::env::temp_dir();
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    p.push(format!("keymano-test-{nanos}-{name}"));
    p
}

/// Open the real Russian layout, verify its Cyrillic base map, edit a key, write
/// the serialized XML to a real file, reopen it, and confirm the edit persisted
/// and the rest of the layout is intact.
#[test]
fn russian_keylayout_open_edit_save_reopen() {
    let xml = std::fs::read_to_string(fixtures().join("russian_pc_ukelele.keylayout")).unwrap();
    let mut st = AppState::new();
    let doc = st.open_keylayout_str(&xml, None).unwrap();

    // base view (no modifiers) resolves through defaultIndex=4 → Cyrillic
    let base = st.get_snapshot(doc.id, 0, 0, 0, "none").unwrap();
    assert_eq!(base.modifier_index, 4);
    assert_eq!(out(&base, 0).as_deref(), Some("ф"));
    assert_eq!(out(&base, 1).as_deref(), Some("ы"));

    // edit code 5 in the base layer
    st.set_key_output(doc.id, 0, 0, 0, "none", 5, "Я".into())
        .unwrap();
    let edited = st.get_snapshot(doc.id, 0, 0, 0, "none").unwrap();
    assert_eq!(out(&edited, 5).as_deref(), Some("Я"));

    // serialize → write to a real file → read back → reopen
    let serialized = st.keylayout_string(doc.id, 0).unwrap();
    let path = tmp("ru.keylayout");
    std::fs::write(&path, &serialized).unwrap();
    let reread = std::fs::read_to_string(&path).unwrap();
    let mut st2 = AppState::new();
    let doc2 = st2.open_keylayout_str(&reread, Some(path.clone())).unwrap();

    let r = st2.get_snapshot(doc2.id, 0, 0, 0, "none").unwrap();
    assert_eq!(
        out(&r, 5).as_deref(),
        Some("Я"),
        "edit must survive the file roundtrip"
    );
    assert_eq!(
        out(&r, 0).as_deref(),
        Some("ф"),
        "untouched Cyrillic key must survive"
    );
    assert_eq!(out(&r, 1).as_deref(), Some("ы"));

    let _ = std::fs::remove_file(&path);
}

/// Save a layout as a real `.bundle` directory and reopen it from disk.
#[test]
fn bundle_save_to_disk_and_reopen() {
    let xml = std::fs::read_to_string(fixtures().join("russian_pc_ukelele.keylayout")).unwrap();
    let mut st = AppState::new();
    let doc = st.open_keylayout_str(&xml, None).unwrap();

    let dir = tmp("ru.bundle");
    st.save_bundle_to(doc.id, dir.clone()).unwrap();
    assert!(dir.is_dir(), "bundle dir must be written to disk");
    assert!(
        dir.join("Contents/Info.plist").exists(),
        "Info.plist must exist"
    );

    let mut st2 = AppState::new();
    let doc2 = st2.open_bundle_dir(dir.clone()).unwrap();
    let snap = st2.get_snapshot(doc2.id, 0, 0, 0, "none").unwrap();
    assert_eq!(
        out(&snap, 0).as_deref(),
        Some("ф"),
        "bundle roundtrip preserves content"
    );

    let _ = std::fs::remove_dir_all(&dir);
}

/// Astral (multi-codepoint) and dead-key fixtures must survive a file roundtrip.
#[test]
fn astral_and_dead_fixtures_roundtrip() {
    for name in [
        "sample_astral.keylayout",
        "sample_dead.keylayout",
        "sample_iso.keylayout",
    ] {
        let xml = std::fs::read_to_string(fixtures().join(name)).unwrap();
        let mut st = AppState::new();
        let doc = st.open_keylayout_str(&xml, None).unwrap();
        let serialized = st.keylayout_string(doc.id, 0).unwrap();

        let path = tmp(name);
        std::fs::write(&path, &serialized).unwrap();
        let reread = std::fs::read_to_string(&path).unwrap();
        let mut st2 = AppState::new();
        // reopening the serialized output must succeed and validate without errors
        let doc2 = st2.open_keylayout_str(&reread, None).unwrap();
        let issues = st2.validate(doc2.id, 0).unwrap();
        let errors: Vec<_> = issues
            .iter()
            .filter(|i| matches!(i.severity, keylayout_core::Severity::Error))
            .collect();
        assert!(
            errors.is_empty(),
            "{name}: reopened file has errors: {errors:?}"
        );
        let _ = std::fs::remove_file(&path);
    }
}

/// An astral output (emoji) must report maxout in UTF-16 code units (2), not
/// Unicode scalars (1), or macOS may truncate it.
#[test]
fn maxout_counts_utf16_units_for_astral_output() {
    let mut st = AppState::new();
    let s = st.new_document(keylayout_core::Template::Standard, "Emoji");
    st.set_key_output(s.id, 0, 0, 0, "none", 0, "😀".into())
        .unwrap();
    let xml = st.keylayout_string(s.id, 0).unwrap();
    assert!(
        xml.contains("maxout=\"2\""),
        "maxout must be 2 (UTF-16 units) for 😀; got:\n{}",
        &xml[..xml.find('>').unwrap_or(80).min(xml.len())]
    );
}

fn out(snap: &keylayout_core::KeyboardSnapshot, code: u16) -> Option<String> {
    snap.keys
        .iter()
        .find(|k| k.code == code)
        .and_then(|k| k.output.clone())
}

// keep SaveFormat referenced (re-exported API surface used by the shell)
#[allow(dead_code)]
fn _format_marker() -> SaveFormat {
    SaveFormat::Keylayout
}
