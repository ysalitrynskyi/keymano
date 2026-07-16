//! Thin Tauri command layer (. Locks the session and calls core.
//! No business logic here — all of it lives in `keymano-session` / core.

use std::io::{Cursor, Read};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

use keylayout_core::bundle::BundleFile;
use keylayout_core::{
    Comments, DeadKeyGraph, Issue, KeyboardSnapshot, LayerMatrix, RepairPlan, SnapshotOptions,
    Template, ValidationReport,
};
use keymano_session::{
    ActionsView, AppState, BundleMetadataPatch, BundleMetadataView, DocSummary, ModifierSelectView,
    SaveFormat,
};
use tauri::State;

pub struct Session(pub Mutex<AppState>);

type CmdResult<T> = std::result::Result<T, String>;

fn map_err<T>(r: keylayout_core::Result<T>) -> CmdResult<T> {
    r.map_err(|e| e.to_string())
}

fn is_allowed_external_url(url: &str) -> bool {
    let Some((scheme, _)) = url.split_once(':') else {
        return false;
    };
    match scheme {
        "http" => url.starts_with("http://"),
        "https" => url.starts_with("https://"),
        "mailto" => true,
        _ => false,
    }
}

fn allocate_install_path<F>(dir: &Path, stem: &str, exists: F) -> PathBuf
where
    F: Fn(&Path) -> bool,
{
    let mut path = dir.join(format!("{stem}.keylayout"));
    let mut n = 2;
    while exists(&path) {
        path = dir.join(format!("{stem} {n}.keylayout"));
        n += 1;
    }
    path
}

fn allocate_bundle_install_path<F>(dir: &Path, stem: &str, exists: F) -> PathBuf
where
    F: Fn(&Path) -> bool,
{
    let mut path = dir.join(format!("{stem}.bundle"));
    let mut n = 2;
    while exists(&path) {
        path = dir.join(format!("{stem} {n}.bundle"));
        n += 1;
    }
    path
}

fn is_direct_child(base: &Path, target: &Path) -> bool {
    target.parent() == Some(base)
}

fn is_bundle_zip(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.to_lowercase().ends_with(".bundle.zip"))
        .unwrap_or(false)
}

fn zip_to_bundle_files(bytes: &[u8]) -> CmdResult<Vec<BundleFile>> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|e| e.to_string())?;
    let mut files = Vec::new();
    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(|e| e.to_string())?;
        if file.is_dir() {
            continue;
        }
        let mut body = Vec::new();
        file.read_to_end(&mut body).map_err(|e| e.to_string())?;
        files.push((file.name().to_string(), body));
    }
    Ok(files)
}

fn safe_bundle_target(dir: &Path, rel: &str) -> CmdResult<PathBuf> {
    let rel_path = Path::new(rel);
    if rel_path.components().any(|component| {
        matches!(
            component,
            Component::Prefix(_) | Component::RootDir | Component::ParentDir
        )
    }) {
        return Err(format!("unsafe bundle path: {rel}"));
    }
    Ok(dir.join(rel_path))
}

fn write_bundle_files_to_dir(dir: &Path, files: Vec<BundleFile>) -> CmdResult<()> {
    for (rel, bytes) in files {
        let path = safe_bundle_target(dir, &rel)?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(path, bytes).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn input_sources_from_hitoolbox_json(
    json: &serde_json::Value,
    installed: &[InstalledLayout],
) -> Vec<InputSource> {
    let find_file = |name: &str| -> Option<String> {
        let n = name.to_lowercase();
        installed
            .iter()
            .find(|l| l.name.to_lowercase() == n)
            .map(|l| l.path.clone())
    };

    let mut seen = std::collections::BTreeSet::new();
    let mut out = Vec::new();
    for key in ["AppleEnabledInputSources", "AppleSelectedInputSources"] {
        if let Some(arr) = json.get(key).and_then(|v| v.as_array()) {
            for item in arr {
                let kind = item.get("InputSourceKind").and_then(|v| v.as_str());
                if kind != Some("Keyboard Layout") {
                    continue;
                }
                if let Some(name) = item.get("KeyboardLayout Name").and_then(|v| v.as_str()) {
                    if seen.insert(name.to_string()) {
                        out.push(InputSource {
                            name: name.to_string(),
                            file: find_file(name),
                        });
                    }
                }
            }
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

#[tauri::command]
pub fn ping() -> String {
    "pong".to_string()
}

#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// Open an external URL in the user's default handler. Only http(s) and mailto
/// are allowed (no file:// or arbitrary schemes), so a malicious link can't
/// launch a local handler. Cross-platform.
#[tauri::command]
pub fn open_external(url: String) -> CmdResult<()> {
    if !is_allowed_external_url(&url) {
        return Err("Only http(s) and mailto links can be opened".to_string());
    }
    open_with_os(&url)
}

/// Reveal a file in the OS file manager (Finder / Explorer / default), selecting
/// it where the platform supports it.
#[tauri::command]
pub fn reveal_path(path: String) -> CmdResult<()> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err("File no longer exists".to_string());
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        // Quote the path so a literal comma in it doesn't make explorer open
        // the wrong folder (review P2-05).
        std::process::Command::new("explorer")
            .arg(format!("/select,\"{path}\""))
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        // No portable "select" on Linux; reveal the containing directory.
        let dir = p
            .parent()
            .map(|d| d.to_path_buf())
            .unwrap_or_else(|| p.to_path_buf());
        std::process::Command::new("xdg-open")
            .arg(dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[allow(unused_variables)]
fn open_with_os(target: &str) -> CmdResult<()> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(target)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", target])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(target)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
pub struct InstalledLayout {
    pub name: String,
    pub path: String,
    pub is_bundle: bool,
    pub scope: String, // "user" | "system"
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
pub struct InputSource {
    pub name: String,
    /// File path if this layout is backed by an editable `.keylayout`/`.bundle`
    /// in the Keyboard Layouts dirs; `None` for sealed macOS built-ins.
    pub file: Option<String>,
}

/// List the keyboard input sources the user has enabled (macOS), including the
/// built-in system layouts, read from the HIToolbox preferences. Built-ins
/// have no editable source file; we still surface them so the user can fork a
/// fresh layout named after one. Other OSes return an empty list.
#[tauri::command]
pub fn list_input_sources() -> Vec<InputSource> {
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        let plist = format!("{home}/Library/Preferences/com.apple.HIToolbox.plist");
        let Ok(output) = std::process::Command::new("plutil")
            .args(["-convert", "json", "-o", "-", &plist])
            .output()
        else {
            return Vec::new();
        };
        let Ok(json) = serde_json::from_slice::<serde_json::Value>(&output.stdout) else {
            return Vec::new();
        };

        let installed = list_installed_layouts();
        return input_sources_from_hitoolbox_json(&json, &installed);
    }
    #[allow(unreachable_code)]
    Vec::new()
}

/// List keyboard layouts installed on this machine (macOS: the standard
/// Keyboard Layouts directories). Other OSes return an empty list.
#[tauri::command]
pub fn list_installed_layouts() -> Vec<InstalledLayout> {
    // `out` is only pushed to under the macOS cfg below; on other targets it
    // stays empty, so the `mut` is unused there.
    #[allow(unused_mut)]
    let mut out: Vec<InstalledLayout> = Vec::new();
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        let dirs = [
            (format!("{home}/Library/Keyboard Layouts"), "user"),
            ("/Library/Keyboard Layouts".to_string(), "system"),
        ];
        for (dir, scope) in dirs {
            let Ok(entries) = std::fs::read_dir(&dir) else {
                continue;
            };
            let mut items: Vec<_> = entries.filter_map(|e| e.ok()).collect();
            items.sort_by_key(|e| e.path());
            for entry in items {
                let path = entry.path();
                let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
                let is_bundle = ext == "bundle";
                if ext == "keylayout" || is_bundle {
                    if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                        out.push(InstalledLayout {
                            name: name.to_string(),
                            path: path.display().to_string(),
                            is_bundle,
                            scope: scope.to_string(),
                        });
                    }
                }
            }
        }
    }
    out
}

#[tauri::command]
pub fn new_document(
    state: State<Session>,
    template: String,
    name: String,
) -> CmdResult<DocSummary> {
    let tpl = match template.as_str() {
        "basic" => Template::Basic,
        "standard" => Template::Standard,
        _ => Template::Standard,
    };
    Ok(state.0.lock().unwrap().new_document(tpl, &name))
}

#[tauri::command]
pub fn open_file(state: State<Session>, path: String) -> CmdResult<DocSummary> {
    let p = PathBuf::from(&path);
    let mut s = state.0.lock().unwrap();
    if is_bundle_zip(&p) {
        let bytes = std::fs::read(&p).map_err(|e| e.to_string())?;
        let files = zip_to_bundle_files(&bytes)?;
        map_err(s.open_bundle_files(files, Some(p)))
    } else if p.extension().map(|e| e == "bundle").unwrap_or(false) || p.is_dir() {
        map_err(s.open_bundle_dir(p))
    } else {
        let xml = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
        map_err(s.open_keylayout_str(&xml, Some(p)))
    }
}

#[tauri::command]
pub fn open_content(state: State<Session>, xml: String) -> CmdResult<DocSummary> {
    map_err(state.0.lock().unwrap().open_keylayout_str(&xml, None))
}

#[tauri::command]
pub fn list_documents(state: State<Session>) -> Vec<DocSummary> {
    state.0.lock().unwrap().list_documents()
}

#[tauri::command]
pub fn close_document(state: State<Session>, id: u32) {
    state.0.lock().unwrap().close_document(id);
}

#[tauri::command]
pub fn rename_document(
    state: State<Session>,
    id: u32,
    kb_index: usize,
    name: String,
) -> CmdResult<DocSummary> {
    map_err(state.0.lock().unwrap().rename(id, kb_index, name))
}

#[tauri::command]
pub fn duplicate_document(state: State<Session>, id: u32) -> CmdResult<DocSummary> {
    map_err(state.0.lock().unwrap().duplicate(id))
}

#[tauri::command]
pub fn get_snapshot(
    state: State<Session>,
    id: u32,
    kb_index: usize,
    type_code: u32,
    mask: u16,
    dead_state: String,
) -> CmdResult<KeyboardSnapshot> {
    map_err(
        state
            .0
            .lock()
            .unwrap()
            .get_snapshot(id, kb_index, type_code, mask, &dead_state),
    )
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn get_snapshot_with_options(
    state: State<Session>,
    id: u32,
    kb_index: usize,
    type_code: u32,
    mask: u16,
    dead_state: String,
    include_existing_high_codes: bool,
) -> CmdResult<KeyboardSnapshot> {
    map_err(state.0.lock().unwrap().get_snapshot_with_options(
        id,
        kb_index,
        type_code,
        mask,
        &dead_state,
        SnapshotOptions {
            include_existing_high_codes,
        },
    ))
}

#[tauri::command]
pub fn get_xml(
    state: State<Session>,
    id: u32,
    kb_index: usize,
    code_non_ascii: bool,
) -> CmdResult<String> {
    map_err(
        state
            .0
            .lock()
            .unwrap()
            .get_xml(id, kb_index, code_non_ascii),
    )
}

#[tauri::command]
pub fn validate(state: State<Session>, id: u32, kb_index: usize) -> CmdResult<Vec<Issue>> {
    map_err(state.0.lock().unwrap().validate(id, kb_index))
}

#[tauri::command]
pub fn validation_report(
    state: State<Session>,
    id: u32,
    kb_index: usize,
) -> CmdResult<ValidationReport> {
    map_err(state.0.lock().unwrap().validation_report(id, kb_index))
}

#[tauri::command]
pub fn repair_plan(state: State<Session>, id: u32, kb_index: usize) -> CmdResult<RepairPlan> {
    map_err(state.0.lock().unwrap().repair_plan(id, kb_index))
}

#[tauri::command]
pub fn apply_repair_plan(
    state: State<Session>,
    id: u32,
    kb_index: usize,
    plan: RepairPlan,
) -> CmdResult<Vec<String>> {
    map_err(
        state
            .0
            .lock()
            .unwrap()
            .apply_repair_plan(id, kb_index, plan),
    )
}

#[tauri::command]
pub fn layer_matrix(
    state: State<Session>,
    id: u32,
    kb_index: usize,
    type_code: u32,
    include_high_codes: bool,
) -> CmdResult<LayerMatrix> {
    map_err(
        state
            .0
            .lock()
            .unwrap()
            .layer_matrix(id, kb_index, type_code, include_high_codes),
    )
}

#[tauri::command]
pub fn dead_key_graph(state: State<Session>, id: u32, kb_index: usize) -> CmdResult<DeadKeyGraph> {
    map_err(state.0.lock().unwrap().dead_key_graph(id, kb_index))
}

#[tauri::command]
pub fn comments(state: State<Session>, id: u32, kb_index: usize) -> CmdResult<Comments> {
    map_err(state.0.lock().unwrap().comments(id, kb_index))
}

#[tauri::command]
pub fn set_comments(
    state: State<Session>,
    id: u32,
    kb_index: usize,
    comments: Comments,
) -> CmdResult<()> {
    map_err(state.0.lock().unwrap().set_comments(id, kb_index, comments))
}

#[tauri::command]
pub fn bundle_metadata(state: State<Session>, id: u32) -> CmdResult<Option<BundleMetadataView>> {
    map_err(state.0.lock().unwrap().bundle_metadata(id))
}

#[tauri::command]
pub fn set_bundle_metadata(
    state: State<Session>,
    id: u32,
    patch: BundleMetadataPatch,
) -> CmdResult<Option<BundleMetadataView>> {
    map_err(state.0.lock().unwrap().set_bundle_metadata(id, patch))
}

#[tauri::command]
pub fn repair(state: State<Session>, id: u32, kb_index: usize) -> CmdResult<Vec<String>> {
    map_err(state.0.lock().unwrap().repair(id, kb_index))
}

#[tauri::command]
pub fn actions_view(state: State<Session>, id: u32, kb_index: usize) -> CmdResult<ActionsView> {
    map_err(state.0.lock().unwrap().actions_view(id, kb_index))
}

#[tauri::command]
pub fn modifier_map_view(
    state: State<Session>,
    id: u32,
    kb_index: usize,
    type_code: u32,
) -> CmdResult<Vec<ModifierSelectView>> {
    map_err(
        state
            .0
            .lock()
            .unwrap()
            .modifier_map_view(id, kb_index, type_code),
    )
}

#[tauri::command]
pub fn set_terminator(
    state: State<Session>,
    id: u32,
    kb_index: usize,
    layout_state: String,
    output: String,
) -> CmdResult<()> {
    map_err(
        state
            .0
            .lock()
            .unwrap()
            .set_terminator(id, kb_index, &layout_state, output),
    )
}

#[tauri::command]
pub fn remove_unused_states(state: State<Session>, id: u32, kb_index: usize) -> CmdResult<usize> {
    map_err(state.0.lock().unwrap().remove_unused_states(id, kb_index))
}

#[tauri::command]
pub fn remove_unused_actions(state: State<Session>, id: u32, kb_index: usize) -> CmdResult<usize> {
    map_err(state.0.lock().unwrap().remove_unused_actions(id, kb_index))
}

#[tauri::command]
pub fn add_special_keys(state: State<Session>, id: u32, kb_index: usize) -> CmdResult<usize> {
    map_err(state.0.lock().unwrap().add_special_keys(id, kb_index))
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn set_key_output(
    state: State<Session>,
    id: u32,
    kb_index: usize,
    type_code: u32,
    mask: u16,
    dead_state: String,
    code: u16,
    output: String,
) -> CmdResult<KeyboardSnapshot> {
    map_err(state.0.lock().unwrap().set_key_output(
        id,
        kb_index,
        type_code,
        mask,
        &dead_state,
        code,
        output,
    ))
}

#[tauri::command]
pub fn set_key_output_in_map(
    state: State<Session>,
    id: u32,
    kb_index: usize,
    set_id: String,
    map_index: u32,
    code: u16,
    output: String,
) -> CmdResult<()> {
    map_err(
        state
            .0
            .lock()
            .unwrap()
            .set_key_output_in_map(id, kb_index, &set_id, map_index, code, output),
    )
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn clear_key(
    state: State<Session>,
    id: u32,
    kb_index: usize,
    type_code: u32,
    mask: u16,
    dead_state: String,
    code: u16,
) -> CmdResult<KeyboardSnapshot> {
    map_err(
        state
            .0
            .lock()
            .unwrap()
            .clear_key(id, kb_index, type_code, mask, &dead_state, code),
    )
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn make_key_dead(
    state: State<Session>,
    id: u32,
    kb_index: usize,
    type_code: u32,
    mask: u16,
    code: u16,
    next_state: String,
    terminator: String,
) -> CmdResult<KeyboardSnapshot> {
    map_err(state.0.lock().unwrap().make_key_dead(
        id,
        kb_index,
        type_code,
        mask,
        code,
        &next_state,
        &terminator,
    ))
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn swap_keys(
    state: State<Session>,
    id: u32,
    kb_index: usize,
    type_code: u32,
    mask: u16,
    dead_state: String,
    code_a: u16,
    code_b: u16,
) -> CmdResult<KeyboardSnapshot> {
    map_err(state.0.lock().unwrap().swap_keys(
        id,
        kb_index,
        type_code,
        mask,
        &dead_state,
        code_a,
        code_b,
    ))
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn unlink_key(
    state: State<Session>,
    id: u32,
    kb_index: usize,
    type_code: u32,
    mask: u16,
    dead_state: String,
    code: u16,
) -> CmdResult<KeyboardSnapshot> {
    map_err(
        state
            .0
            .lock()
            .unwrap()
            .unlink_key(id, kb_index, type_code, mask, &dead_state, code),
    )
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn relink_key(
    state: State<Session>,
    id: u32,
    kb_index: usize,
    type_code: u32,
    mask: u16,
    dead_state: String,
    code: u16,
) -> CmdResult<KeyboardSnapshot> {
    map_err(
        state
            .0
            .lock()
            .unwrap()
            .relink_key(id, kb_index, type_code, mask, &dead_state, code),
    )
}

#[tauri::command]
pub fn undo(state: State<Session>, id: u32) -> CmdResult<()> {
    map_err(state.0.lock().unwrap().undo(id))
}

#[tauri::command]
pub fn redo(state: State<Session>, id: u32) -> CmdResult<()> {
    map_err(state.0.lock().unwrap().redo(id))
}

#[tauri::command]
pub fn undo_label(state: State<Session>, id: u32) -> CmdResult<Option<String>> {
    map_err(state.0.lock().unwrap().undo_label(id))
}

/// Install the active layout into the user's macOS Keyboard Layouts folder.
/// Returns the written path. macOS only.
#[tauri::command]
pub fn install_layout(state: State<Session>, id: u32, kb_index: usize) -> CmdResult<String> {
    #[cfg(target_os = "macos")]
    {
        let s = state.0.lock().unwrap();
        let name = map_err(s.summary(id))?.name;
        let summary = map_err(s.summary(id))?;
        // Single sanitizer (in the tested core): keeps non-ASCII letters but
        // maps path separators, control chars, and bidi/format controls to '-'
        // — so a Cyrillic name doesn't collide on "Keyboard.keylayout" and a
        // name can't be spoofed to render reversed in Finder (review P1-08).
        let stem = keylayout_core::bundle::sanitize_stem(&name);
        let home = std::env::var("HOME").map_err(|e| e.to_string())?;
        let dir = format!("{home}/Library/Keyboard Layouts");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let base = Path::new(&dir);
        if summary.is_bundle {
            let (_bundle_name, files) = map_err(s.bundle_files(id))?;
            drop(s);
            // Install bundle docs as real `.bundle` packages, not just the
            // active `.keylayout`, and still never clobber an existing layout.
            let path = allocate_bundle_install_path(base, &stem, |p| p.exists());
            write_bundle_files_to_dir(&path, files)?;
            return Ok(path.display().to_string());
        }

        let xml = map_err(s.keylayout_string(id, kb_index))?;
        drop(s);
        // Never clobber an existing on-disk layout with the same name — pick a
        // free " N" suffix instead (review P1-09).
        let path = allocate_install_path(base, &stem, |p| p.exists());
        std::fs::write(&path, xml).map_err(|e| e.to_string())?;
        Ok(path.display().to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (state, id, kb_index);
        Err("Installing layouts is only supported on macOS".to_string())
    }
}

/// Uninstall a user-scope installed layout by moving it to the Trash
/// (reversible). Refuses anything not directly inside the user's Keyboard
/// Layouts folder (system scope, symlink escapes, traversal). macOS only.
/// Returns the Trash path the item was moved to.
#[tauri::command]
pub fn uninstall_layout(path: String) -> CmdResult<String> {
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").map_err(|e| e.to_string())?;
        let base = std::fs::canonicalize(format!("{home}/Library/Keyboard Layouts"))
            .map_err(|e| e.to_string())?;
        let target = std::fs::canonicalize(&path).map_err(|e| e.to_string())?;
        // Must live *directly* in the user-scope Keyboard Layouts folder.
        if !is_direct_child(&base, &target) {
            return Err("Only user-installed layouts can be removed".to_string());
        }
        let file_name = target
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| "Invalid path".to_string())?;

        let trash = format!("{home}/.Trash");
        std::fs::create_dir_all(&trash).map_err(|e| e.to_string())?;
        let mut dest = PathBuf::from(&trash).join(file_name);
        if dest.exists() {
            // disambiguate on collision so we never clobber an existing trashed item
            let ts = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let stem = target
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("layout");
            let ext = target.extension().and_then(|s| s.to_str());
            let renamed = match ext {
                Some(e) => format!("{stem} {ts}.{e}"),
                None => format!("{stem} {ts}"),
            };
            dest = PathBuf::from(&trash).join(renamed);
        }
        std::fs::rename(&target, &dest).map_err(|e| e.to_string())?;
        Ok(dest.display().to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Err("Uninstalling layouts is only supported on macOS".to_string())
    }
}

#[tauri::command]
pub fn save_file(
    state: State<Session>,
    id: u32,
    kb_index: usize,
    path: String,
    format: SaveFormat,
) -> CmdResult<()> {
    let p = PathBuf::from(&path);
    let mut s = state.0.lock().unwrap();
    match format {
        SaveFormat::Keylayout => {
            let xml = map_err(s.keylayout_string(id, kb_index))?;
            std::fs::write(&p, xml).map_err(|e| e.to_string())?;
            map_err(s.mark_saved(id, p))
        }
        SaveFormat::Bundle => map_err(s.save_bundle_to(id, p)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn external_url_policy_allows_only_safe_schemes() {
        assert!(is_allowed_external_url("https://keymano.ys.contact"));
        assert!(is_allowed_external_url("http://localhost:1420"));
        assert!(is_allowed_external_url("mailto:support@example.com"));
        assert!(!is_allowed_external_url("file:///etc/passwd"));
        assert!(!is_allowed_external_url("ssh://example.com"));
        assert!(!is_allowed_external_url("javascript:alert(1)"));
    }

    #[test]
    fn install_path_allocator_uses_first_free_suffix() {
        let dir = Path::new("/Users/me/Library/Keyboard Layouts");
        let occupied = [dir.join("Daily.keylayout"), dir.join("Daily 2.keylayout")];

        let path = allocate_install_path(dir, "Daily", |p| occupied.iter().any(|x| x == p));

        assert_eq!(path, dir.join("Daily 3.keylayout"));
    }

    #[test]
    fn uninstall_boundary_requires_direct_child_of_user_layouts_dir() {
        let base = Path::new("/Users/me/Library/Keyboard Layouts");

        assert!(is_direct_child(
            base,
            Path::new("/Users/me/Library/Keyboard Layouts/Daily.keylayout")
        ));
        assert!(!is_direct_child(
            base,
            Path::new("/Library/Keyboard Layouts/Daily.keylayout")
        ));
        assert!(!is_direct_child(
            base,
            Path::new("/Users/me/Library/Keyboard Layouts/Nested/Daily.keylayout")
        ));
    }

    #[test]
    fn input_source_parser_dedupes_and_matches_installed_files() {
        let json: serde_json::Value = serde_json::json!({
            "AppleEnabledInputSources": [
                { "InputSourceKind": "Keyboard Layout", "KeyboardLayout Name": "Daily" },
                { "InputSourceKind": "Keyboard Layout", "KeyboardLayout Name": "U.S." },
                { "InputSourceKind": "Keyboard Layout", "KeyboardLayout Name": "Daily" }
            ],
            "AppleSelectedInputSources": [
                { "InputSourceKind": "Keyboard Layout", "KeyboardLayout Name": "Emoji" },
                { "InputSourceKind": "Input Mode", "KeyboardLayout Name": "Ignored" }
            ]
        });
        let installed = vec![InstalledLayout {
            name: "Daily".to_string(),
            path: "/Users/me/Library/Keyboard Layouts/Daily.keylayout".to_string(),
            is_bundle: false,
            scope: "user".to_string(),
        }];

        let parsed = input_sources_from_hitoolbox_json(&json, &installed);

        assert_eq!(
            parsed,
            vec![
                InputSource {
                    name: "Daily".to_string(),
                    file: Some("/Users/me/Library/Keyboard Layouts/Daily.keylayout".to_string())
                },
                InputSource {
                    name: "Emoji".to_string(),
                    file: None
                },
                InputSource {
                    name: "U.S.".to_string(),
                    file: None
                },
            ],
        );
    }
}
