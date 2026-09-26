use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_window_state::StateFlags;

// ─── ウィンドウ操作 ───
fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn hide_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
}

fn open_config_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(w) = app.get_webview_window("config") {
        w.show()?;
        w.unminimize()?;
        w.set_focus()?;
        return Ok(());
    }
    WebviewWindowBuilder::new(app, "config", WebviewUrl::App("settings.html".into()))
        .title("Lain Clock — System Configuration")
        .inner_size(400.0, 600.0)
        .resizable(false)
        .always_on_top(true)
        .build()?;
    Ok(())
}

// ─── フロントから呼ぶコマンド ───
// Windows では同期コマンド内でウィンドウを作るとデッドロックするので async にする
#[tauri::command]
async fn open_config(app: AppHandle) -> Result<(), String> {
    open_config_window(&app).map_err(|e| e.to_string())
}

#[tauri::command]
fn hide_clock(app: AppHandle) {
    hide_main(&app);
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// 設定JSONをダウンロードフォルダに保存して、保存先パスを返す
#[tauri::command]
fn export_config(app: AppHandle, contents: String) -> Result<String, String> {
    // ダウンロードフォルダが取れない環境（XDG未設定のLinux等）はホームに逃がす
    let p = app.path();
    let dir = p
        .download_dir()
        .or_else(|_| p.document_dir())
        .or_else(|_| p.home_dir())
        .map_err(|e| e.to_string())?;
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let path = dir.join(format!("clock_config_{ts}.json"));
    std::fs::write(&path, contents).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // 時計の位置だけ記憶する（表示状態やサイズは設定側で管理）
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::POSITION)
                .with_denylist(&["config"])
                .build(),
        )
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Show Clock", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "Hide Clock", true, None::<&str>)?;
            let config = MenuItem::with_id(app, "config", "System Config…", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &hide, &config, &sep, &quit])?;

            TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().cloned().expect("no app icon"))
                .tooltip("Lain Clock")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main(app),
                    "hide" => hide_main(app),
                    "config" => {
                        let app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = open_config_window(&app);
                        });
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_config,
            hide_clock,
            quit_app,
            export_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
