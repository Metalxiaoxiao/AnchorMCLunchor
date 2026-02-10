use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub fn get_game_root(app: &AppHandle, custom_path: Option<String>) -> Result<PathBuf, String> {
    if let Some(path) = custom_path {
        let mut root = PathBuf::from(path);
        if let Some(name) = root.file_name().and_then(|s| s.to_str()) {
            if name != "versions" {
                if let Some(parent) = root.parent().and_then(|p| p.file_name()).and_then(|s| s.to_str()) {
                    if parent == "versions" {
                        if let Some(grandparent) = root.parent().and_then(|p| p.parent()) {
                            root = grandparent.to_path_buf();
                        }
                    }
                }
            } else if let Some(parent) = root.parent() {
                root = parent.to_path_buf();
            }
        }
        Ok(root)
    } else {
        Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join(".minecraft"))
    }
}

pub fn get_version_dir(app: &AppHandle, version_id: &str, custom_path: Option<String>) -> Result<PathBuf, String> {
    let root = get_game_root(app, custom_path)?;
    Ok(root.join("versions").join(version_id))
}

pub fn get_game_working_dir(app: &AppHandle, version_id: &str, custom_path: Option<String>, isolated: bool) -> Result<PathBuf, String> {
    let root = get_game_root(app, custom_path.clone())?;
    if isolated {
        Ok(root.join("versions").join(version_id))
    } else {
        Ok(root)
    }
}

pub fn get_mods_dir(app: &AppHandle, version_id: &str, custom_path: Option<String>, isolated: bool) -> Result<PathBuf, String> {
    let working_dir = get_game_working_dir(app, version_id, custom_path, isolated)?;
    Ok(working_dir.join("mods"))
}

pub fn get_config_dir(app: &AppHandle, version_id: &str, custom_path: Option<String>, isolated: bool) -> Result<PathBuf, String> {
    let working_dir = get_game_working_dir(app, version_id, custom_path, isolated)?;
    Ok(working_dir.join("config"))
}

pub fn get_saves_dir(app: &AppHandle, version_id: &str, custom_path: Option<String>, isolated: bool) -> Result<PathBuf, String> {
    let working_dir = get_game_working_dir(app, version_id, custom_path, isolated)?;
    Ok(working_dir.join("saves"))
}

pub fn get_resourcepacks_dir(app: &AppHandle, version_id: &str, custom_path: Option<String>, isolated: bool) -> Result<PathBuf, String> {
    let working_dir = get_game_working_dir(app, version_id, custom_path, isolated)?;
    Ok(working_dir.join("resourcepacks"))
}

pub fn get_shaderpacks_dir(app: &AppHandle, version_id: &str, custom_path: Option<String>, isolated: bool) -> Result<PathBuf, String> {
    let working_dir = get_game_working_dir(app, version_id, custom_path, isolated)?;
    Ok(working_dir.join("shaderpacks"))
}
