//! Thin Tauri command layer (. Locks the session and calls core.
//! No business logic here — all of it lives in `keymano-session` / core.

use std::path::PathBuf;
use std::sync::Mutex;

use keylayout_core::{Issue, KeyboardSnapshot, Template};
use keymano_session::{ActionsView, AppState, DocSummary, ModifierSelectView, SaveFormat};
use tauri::State;

pub struct Session(pub Mutex<AppState>);

type CmdResult<T> = std::result::Result<T, String>;

fn map_err<T>(r: keylayout_core::Result<T>) -> CmdResult<T> {
    r.map_err(|e| e.to_string())
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
    let ok =
        url.starts_with("https://") || url.starts_with("http://") || url.starts_with("mailto:");
    if !ok {
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

#[derive(serde::Serialize)]
pub struct InstalledLayout {
    pub name: String,
    pub path: String,
    pub is_bundle: bool,
    pub scope: String, // "user" | "system"
}

#[derive(serde::Serialize)]
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

        // index installed files by lowercased stem for matching
        let installed = list_installed_layouts();
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
        return out;
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
    if p.extension().map(|e| e == "bundle").unwrap_or(false) || p.is_dir() {
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
        let xml = map_err(s.keylayout_string(id, kb_index))?;
        let name = map_err(s.summary(id))?.name;
        drop(s);
        // Single sanitizer (in the tested core): keeps non-ASCII letters but
        // maps path separators, control chars, and bidi/format controls to '-'
        // — so a Cyrillic name doesn't collide on "Keyboard.keylayout" and a
        // name can't be spoofed to render reversed in Finder (review P1-08).
        let stem = keylayout_core::bundle::sanitize_stem(&name);
        let home = std::env::var("HOME").map_err(|e| e.to_string())?;
        let dir = format!("{home}/Library/Keyboard Layouts");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        // Never clobber an existing on-disk layout with the same name — pick a
        // free " N" suffix instead (review P1-09).
        let mut path = std::path::PathBuf::from(&dir).join(format!("{stem}.keylayout"));
        let mut n = 2;
        while path.exists() {
            path = std::path::PathBuf::from(&dir).join(format!("{stem} {n}.keylayout"));
            n += 1;
        }
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
        if target.parent() != Some(base.as_path()) {
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
