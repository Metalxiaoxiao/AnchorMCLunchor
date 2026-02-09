mod auth;
mod config;
mod downloader;
mod launcher;
mod modrinth;
mod server_ping;
mod version_path;
use tauri::Manager;
#[cfg(target_os = "windows")]
use window_vibrancy::apply_acrylic;
#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn login(auth_server: String, username: String, password: String) -> Result<auth::AuthResponse, String> {
    match auth::authenticate(&auth_server, &username, &password).await {
        Ok(response) => Ok(response),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn focus_window(app: tauri::AppHandle, label: String) {
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
async fn ping_server(host: String, port: u16) -> Result<server_ping::ServerStatus, String> {
    match server_ping::ping_server(&host, port).await {
        Ok(status) => Ok(status),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(downloader::DownloadState::new());
            let window = app.get_webview_window("main").unwrap();

            #[cfg(target_os = "macos")]
            apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None)
                .expect("Unsupported platform! 'apply_vibrancy' is only supported on macOS");

            #[cfg(target_os = "windows")]
            let _ = apply_acrylic(&window, Some((0, 0, 0, 10)));

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet, 
            login,
            downloader::fetch_manifest,
            downloader::fetch_loaders,
            downloader::install_version,
            downloader::download_custom_files,
            downloader::download_single_file,
            launcher::launch_game,
            launcher::list_installed_versions,
            launcher::package_local_version,
            launcher::export_modpack,
            launcher::package_and_upload_local_version,
            launcher::import_modpack,
            launcher::open_folder,
            launcher::get_version_details,
            launcher::find_client_for_server,
            launcher::set_client_server_id,
            launcher::open_mods_folder,
            modrinth::search_modrinth,
            modrinth::get_modrinth_versions,
            modrinth::get_game_versions,
            modrinth::get_modrinth_project,
            modrinth::install_mod,
            config::get_app_config,
            config::set_isolation_mode,
            focus_window,
            ping_server
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
