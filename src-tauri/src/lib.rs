//! Keymano Tauri shell entry point. Registers commands + session state, builds
//! the native application menu, and forwards menu actions to the frontend.

mod commands;

use std::sync::Mutex;

use commands::Session;
use keymano_session::AppState;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::Emitter;

const GITHUB_URL: &str = "https://github.com/ysalitrynskyi/keymano";

/// Watch the macOS Keyboard Layouts folders and notify the frontend when their
/// contents change (install/uninstall from anywhere, incl. Finder), so the
/// Organiser list stays live. No-op when the directories don't exist.
fn watch_installed_layouts(app: tauri::AppHandle) {
    use notify::{RecommendedWatcher, RecursiveMode, Watcher};
    use std::sync::mpsc::channel;
    use std::time::Duration;

    let home = match std::env::var("HOME") {
        Ok(h) => h,
        Err(_) => return,
    };
    let dirs = [
        format!("{home}/Library/Keyboard Layouts"),
        "/Library/Keyboard Layouts".to_string(),
    ];

    std::thread::spawn(move || {
        let (tx, rx) = channel();
        let mut watcher = match RecommendedWatcher::new(tx, notify::Config::default()) {
            Ok(w) => w,
            Err(_) => return,
        };
        let mut watching = false;
        for dir in &dirs {
            if std::path::Path::new(dir).is_dir()
                && watcher
                    .watch(std::path::Path::new(dir), RecursiveMode::NonRecursive)
                    .is_ok()
            {
                watching = true;
            }
        }
        if !watching {
            return;
        }
        // Coalesce bursts: wait for the first event, then drain a short window
        // before emitting a single refresh signal.
        while rx.recv().is_ok() {
            while rx.recv_timeout(Duration::from_millis(250)).is_ok() {}
            let _ = app.emit("installed-changed", ());
        }
    });
}

fn build_menu(app: &tauri::App) -> tauri::Result<()> {
    let about = MenuItemBuilder::with_id("about", "About Keymano").build(app)?;
    let prefs = MenuItemBuilder::with_id("preferences", "Preferences…")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    let app_menu = SubmenuBuilder::new(app, "Keymano")
        .item(&about)
        .separator()
        .item(&prefs)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .item(
            &MenuItemBuilder::with_id("quit", "Quit Keymano")
                .accelerator("CmdOrCtrl+Q")
                .build(app)?,
        )
        .build()?;

    let new = MenuItemBuilder::with_id("new", "New Layout")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let open = MenuItemBuilder::with_id("open", "Open…")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let from_system = MenuItemBuilder::with_id("from_system", "Import from System…").build(app)?;
    let save = MenuItemBuilder::with_id("save", "Save")
        .accelerator("CmdOrCtrl+S")
        .build(app)?;
    let save_as = MenuItemBuilder::with_id("save_as", "Save As…")
        .accelerator("CmdOrCtrl+Shift+S")
        .build(app)?;
    let close_tab = MenuItemBuilder::with_id("close_tab", "Close Layout")
        .accelerator("CmdOrCtrl+W")
        .build(app)?;
    let file = SubmenuBuilder::new(app, "File")
        .items(&[&new, &open, &from_system])
        .separator()
        .items(&[&save, &save_as])
        .separator()
        .item(&close_tab)
        .build()?;

    let undo = MenuItemBuilder::with_id("undo", "Undo")
        .accelerator("CmdOrCtrl+Z")
        .build(app)?;
    let redo = MenuItemBuilder::with_id("redo", "Redo")
        .accelerator("CmdOrCtrl+Shift+Z")
        .build(app)?;
    let edit = SubmenuBuilder::new(app, "Edit")
        .item(&undo)
        .item(&redo)
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let zoom_in = MenuItemBuilder::with_id("zoom_in", "Zoom In")
        .accelerator("CmdOrCtrl+=")
        .build(app)?;
    let zoom_out = MenuItemBuilder::with_id("zoom_out", "Zoom Out")
        .accelerator("CmdOrCtrl+-")
        .build(app)?;
    let zoom_reset = MenuItemBuilder::with_id("zoom_reset", "Actual Size")
        .accelerator("CmdOrCtrl+0")
        .build(app)?;
    let view = SubmenuBuilder::new(app, "View")
        .items(&[&zoom_in, &zoom_out, &zoom_reset])
        .build()?;

    let github = MenuItemBuilder::with_id("github", "Keymano on GitHub").build(app)?;
    let help = SubmenuBuilder::new(app, "Help").item(&github).build()?;

    let menu = MenuBuilder::new(app)
        .items(&[&app_menu, &file, &edit, &view, &help])
        .build()?;
    app.set_menu(menu)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Session(Mutex::new(AppState::new())))
        .setup(|app| {
            build_menu(app)?;
            watch_installed_layouts(app.handle().clone());
            app.on_menu_event(move |app, event| {
                let id = event.id().as_ref().to_string();
                if id == "github" {
                    let _ = commands::open_external(GITHUB_URL.to_string());
                } else {
                    let _ = app.emit("menu", id);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::quit_app,
            commands::open_external,
            commands::reveal_path,
            commands::list_installed_layouts,
            commands::list_input_sources,
            commands::new_document,
            commands::open_file,
            commands::open_content,
            commands::list_documents,
            commands::close_document,
            commands::rename_document,
            commands::duplicate_document,
            commands::get_snapshot,
            commands::get_xml,
            commands::validate,
            commands::repair,
            commands::actions_view,
            commands::modifier_map_view,
            commands::set_terminator,
            commands::remove_unused_states,
            commands::remove_unused_actions,
            commands::add_special_keys,
            commands::set_key_output,
            commands::clear_key,
            commands::make_key_dead,
            commands::swap_keys,
            commands::unlink_key,
            commands::relink_key,
            commands::undo,
            commands::redo,
            commands::undo_label,
            commands::save_file,
            commands::install_layout,
            commands::uninstall_layout,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Keymano");
}
