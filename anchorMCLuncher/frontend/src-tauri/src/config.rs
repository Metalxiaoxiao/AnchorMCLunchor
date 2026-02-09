use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum IsolationMode {
    #[serde(rename = "all")]
    All,
    #[serde(rename = "modded")]
    Modded,
    #[serde(rename = "snapshot")]
    Snapshot,
    #[serde(rename = "modded_and_snapshot")]
    ModdedAndSnapshot,
    #[serde(rename = "none")]
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub isolation_mode: IsolationMode,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            isolation_mode: IsolationMode::Modded,
        }
    }
}

fn get_config_path() -> PathBuf {
    // Try to get the executable directory
    if let Ok(mut path) = std::env::current_exe() {
        path.pop();
        path.push("AMCLConfig.json");
        return path;
    }
    // Fallback to current directory
    PathBuf::from("AMCLConfig.json")
}

pub fn load_config() -> AppConfig {
    let path = get_config_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(config) = serde_json::from_str(&content) {
                return config;
            }
        }
    }
    AppConfig::default()
}

pub fn save_config(config: &AppConfig) -> Result<(), String> {
    let path = get_config_path();
    let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn should_isolate(mode: &IsolationMode, is_modded: bool, version_type: &str) -> bool {
    match mode {
        IsolationMode::All => true,
        IsolationMode::Modded => is_modded,
        IsolationMode::Snapshot => version_type != "release",
        IsolationMode::ModdedAndSnapshot => is_modded || version_type != "release",
        IsolationMode::None => false,
    }
}

#[tauri::command]
pub fn get_app_config() -> AppConfig {
    load_config()
}

#[tauri::command]
pub fn set_isolation_mode(mode: IsolationMode) -> Result<(), String> {
    let mut config = load_config();
    config.isolation_mode = mode;
    save_config(&config)
}
