use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::sync::Semaphore;
use tauri::{AppHandle, Emitter, Manager, State};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use futures::stream::StreamExt;

#[derive(Debug, Serialize, Deserialize)]
struct FabricLoaderVersion {
    loader: FabricLoader,
}
#[derive(Debug, Serialize, Deserialize)]
struct FabricLoader {
    version: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ForgeVersion {
    version: String,
}

pub struct DownloadState {
    pub active_downloads: Mutex<HashSet<String>>,
}

impl DownloadState {
    pub fn new() -> Self {
        Self {
            active_downloads: Mutex::new(HashSet::new()),
        }
    }
}

struct DownloadGuard<'a> {
    state: &'a DownloadState,
    version_id: String,
}

impl<'a> Drop for DownloadGuard<'a> {
    fn drop(&mut self) {
        if let Ok(mut active) = self.state.active_downloads.lock() {
            active.remove(&self.version_id);
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VersionManifest {
    pub latest: LatestVersions,
    pub versions: Vec<VersionEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LatestVersions {
    pub release: String,
    pub snapshot: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VersionEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub version_type: String,
    pub url: String,
    pub time: String,
    #[serde(rename = "releaseTime")]
    pub release_time: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VersionDetails {
    pub downloads: VersionDownloads,
    pub libraries: Vec<Library>,
    #[serde(rename = "assetIndex")]
    pub asset_index: AssetIndex,
    pub id: String,
    #[serde(rename = "mainClass")]
    pub main_class: String,
    #[serde(rename = "minecraftArguments")]
    pub minecraft_arguments: Option<String>,
    pub arguments: Option<Arguments>,
    #[serde(rename = "type")]
    pub version_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Arguments {
    pub game: Option<Vec<serde_json::Value>>,
    pub jvm: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VersionDownloads {
    pub client: DownloadInfo,
    pub server: Option<DownloadInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CustomFile {
    pub url: String,
    pub path: String,
    pub size: u64,
    pub hash: String,
    pub token: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DownloadInfo {
    pub sha1: Option<String>,
    pub size: Option<u64>,
    pub url: String,
    pub path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Library {
    pub downloads: Option<LibraryDownloads>,
    pub name: String,
    pub natives: Option<HashMap<String, String>>,
    pub rules: Option<Vec<Rule>>,
    pub url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Rule {
    pub action: String,
    pub os: Option<Os>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Os {
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LibraryDownloads {
    pub artifact: Option<DownloadInfo>,
    pub classifiers: Option<HashMap<String, DownloadInfo>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AssetIndex {
    pub id: String,
    pub sha1: String,
    pub size: u64,
    #[serde(rename = "totalSize")]
    pub total_size: u64,
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AssetObject {
    pub hash: String,
    pub size: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Assets {
    pub objects: std::collections::HashMap<String, AssetObject>,
}

#[derive(Clone, Serialize)]
pub struct DownloadProgress {
    pub task_id: Option<String>,
    pub version_id: String,
    pub total_files: usize,
    pub downloaded_files: usize,
    pub current_file: String,
    pub percent: f64,
}

#[derive(Clone, Serialize)]
pub struct DownloadLog {
    pub task_id: Option<String>,
    pub message: String,
    pub level: String,
}

const MANIFEST_URL: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

#[tauri::command]
pub async fn fetch_manifest() -> Result<Vec<VersionEntry>, String> {
    let client = reqwest::Client::new();
    let manifest: VersionManifest = client
        .get(MANIFEST_URL)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(manifest.versions)
}

#[derive(Debug, Serialize, Deserialize)]
struct NeoForgeVersion {
    version: String,
    #[serde(rename = "installerPath")]
    installer_path: Option<String>,
}

#[tauri::command]
pub async fn fetch_loaders(game_version: String, loader_type: String) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    match loader_type.as_str() {
        "fabric" => {
            let url = format!("https://bmclapi2.bangbang93.com/fabric-meta/v2/versions/loader/{}", game_version);
            let resp: Vec<FabricLoaderVersion> = client.get(&url).send().await.map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;
            Ok(resp.into_iter().map(|v| v.loader.version).collect())
        },
        "forge" => {
             let url = format!("https://bmclapi2.bangbang93.com/forge/minecraft/{}", game_version);
             let resp: Vec<ForgeVersion> = client.get(&url).send().await.map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;
             Ok(resp.into_iter().map(|v| v.version).collect())
        },
        "neoforge" => {
             let url = format!("https://bmclapi2.bangbang93.com/neoforge/list/{}", game_version);
             let resp: Vec<NeoForgeVersion> = client.get(&url).send().await.map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;
             Ok(resp.into_iter().map(|v| v.version).collect())
        },
        _ => Ok(Vec::new())
    }
}

fn check_rules(rules: &Option<Vec<Rule>>) -> bool {
    if let Some(rules) = rules {
        let mut allowed = false;
        for rule in rules {
            let action = &rule.action;
            let mut os_match = true;

            if let Some(os) = &rule.os {
                let current_os = if cfg!(target_os = "windows") {
                    "windows"
                } else if cfg!(target_os = "macos") {
                    "osx"
                } else {
                    "linux"
                };
                
                if os.name != current_os {
                    os_match = false;
                }
            }

            if os_match {
                allowed = action == "allow";
            }
        }
        return allowed;
    }
    true
}

#[tauri::command]
pub async fn install_version(
    app: AppHandle, 
    state: State<'_, DownloadState>, 
    version_id: String, 
    loader_type: String,
    loader_version: Option<String>,
    game_path: Option<String>,
    java_path: Option<String>,
    task_id: Option<String>
) -> Result<(), String> {
    {
        let mut active = state.active_downloads.lock().map_err(|e| e.to_string())?;
        if active.contains(&version_id) {
            return Err("Download already in progress".to_string());
        }
        active.insert(version_id.clone());
    }
    let _guard = DownloadGuard { state: &state, version_id: version_id.clone() };

    let client = reqwest::Client::new();
    let mc_dir = game_path.map(PathBuf::from).unwrap_or_else(|| {
        app.path().app_data_dir().unwrap().join(".minecraft")
    });

    // 1. Prepare Vanilla Downloads
    let (mut download_queue, _version_details) = prepare_vanilla_downloads(&client, &version_id, &mc_dir).await?;

    // 2. Prepare Loader Downloads (if applicable)
    if loader_type == "fabric" {
        if let Some(l_ver) = &loader_version {
            let (loader_queue, _) = prepare_fabric_downloads(&client, &version_id, l_ver, &mc_dir).await?;
            download_queue.extend(loader_queue);
        }
    } else if loader_type == "forge" || loader_type == "neoforge" {
        // For Forge/NeoForge, we download the installer and run it.
        // We do this AFTER downloading vanilla files to ensure assets are present.
    } else if loader_type != "vanilla" {
        return Err(format!("Loader type '{}' is not yet supported for installation.", loader_type));
    }

    // 3. Download Files
    download_files(&app, &version_id, download_queue, task_id.clone()).await?;

    // 4. Run Installer for Forge/NeoForge
    if loader_type == "forge" || loader_type == "neoforge" {
        if let Some(l_ver) = &loader_version {
            install_forge_or_neoforge(&app, &client, &version_id, &loader_type, l_ver, &mc_dir, java_path, task_id).await?;
        }
    }

    Ok(())
}

async fn install_forge_or_neoforge(
    app: &AppHandle,
    client: &reqwest::Client,
    game_version: &str,
    loader_type: &str,
    loader_version: &str,
    mc_dir: &PathBuf,
    java_path: Option<String>,
    task_id: Option<String>
) -> Result<(), String> {
    let _ = app.emit("download-progress", DownloadProgress {
        task_id: task_id.clone(),
        version_id: game_version.to_string(),
        total_files: 1,
        downloaded_files: 0,
        current_file: format!("Preparing {} installer...", loader_type),
        percent: 0.0,
    });

    let installer_url = if loader_type == "forge" {
        format!("https://bmclapi2.bangbang93.com/forge/download?mcversion={}&version={}&category=installer&format=jar", game_version, loader_version)
    } else {
        // NeoForge
        let url = format!("https://bmclapi2.bangbang93.com/neoforge/list/{}", game_version);
        let resp: Vec<NeoForgeVersion> = client.get(&url).send().await.map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;
        let entry = resp.into_iter().find(|v| v.version == loader_version).ok_or("NeoForge version not found")?;
        
        if let Some(path) = entry.installer_path {
            format!("https://bmclapi2.bangbang93.com/neoforge{}", path)
        } else {
            return Err("NeoForge installer path not found".to_string());
        }
    };

    let temp_dir = std::env::temp_dir();
    let installer_path = temp_dir.join(format!("{}-{}-installer.jar", loader_type, loader_version));

    let _ = app.emit("download-progress", DownloadProgress {
        task_id: task_id.clone(),
        version_id: game_version.to_string(),
        total_files: 1,
        downloaded_files: 0,
        current_file: "Downloading installer...".to_string(),
        percent: 0.0,
    });

    let resp = client.get(&installer_url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Failed to download installer: {}", resp.status()));
    }
    let content = resp.bytes().await.map_err(|e| e.to_string())?;
    fs::write(&installer_path, content).map_err(|e| e.to_string())?;

    let _ = app.emit("download-progress", DownloadProgress {
        task_id: task_id.clone(),
        version_id: game_version.to_string(),
        total_files: 1,
        downloaded_files: 0,
        current_file: "Running installer...".to_string(),
        percent: 50.0,
    });

    // Ensure launcher_profiles.json exists (required by Forge/NeoForge installer)
    let profiles_path = mc_dir.join("launcher_profiles.json");
    if !profiles_path.exists() {
        let _ = app.emit("download-log", DownloadLog {
            task_id: task_id.clone(),
            message: "Creating dummy launcher_profiles.json...".to_string(),
            level: "info".to_string(),
        });
        let content = r#"{"profiles":{}}"#;
        fs::write(&profiles_path, content).map_err(|e| e.to_string())?;
    }

    let java = java_path.unwrap_or("java".to_string());
    
    // Run installer
    let mc_dir_str = mc_dir.to_string_lossy().to_string();
    
    let _ = app.emit("download-log", DownloadLog {
        task_id: task_id.clone(),
        message: format!("Executing installer: {} -jar {} --installClient {}", java, installer_path.display(), mc_dir_str),
        level: "info".to_string(),
    });

    let mut child = Command::new(&java)
        .arg("-jar")
        .arg(&installer_path)
        .arg("--installClient")
        .arg(&mc_dir_str)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start installer: {}", e))?;

    if let Some(stdout) = child.stdout.take() {
        let app_handle = app.clone();
        let task_id = task_id.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(line) = line {
                    let _ = app_handle.emit("download-log", DownloadLog { task_id: task_id.clone(), message: line, level: "info".to_string() });
                }
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let app_handle = app.clone();
        let task_id = task_id.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(line) = line {
                    let _ = app_handle.emit("download-log", DownloadLog { task_id: task_id.clone(), message: line, level: "error".to_string() });
                }
            }
        });
    }

    let status = child.wait().map_err(|e| format!("Failed to wait for installer: {}", e))?;

    if !status.success() {
        return Err(format!("Installer failed with status: {}", status));
    }

    let _ = std::fs::remove_file(installer_path);

    let _ = app.emit("download-progress", DownloadProgress {
        task_id: task_id.clone(),
        version_id: game_version.to_string(),
        total_files: 1,
        downloaded_files: 1,
        current_file: "Installation Complete".to_string(),
        percent: 100.0,
    });

    Ok(())
}

#[tauri::command]
pub async fn download_single_file(app: AppHandle, url: String, path: String, task_id: Option<String>) -> Result<(), String> {
    let client = reqwest::Client::new();
    let path_buf = PathBuf::from(&path);
    
    if let Some(parent) = path_buf.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let _ = app.emit("download-progress", DownloadProgress {
        task_id: task_id.clone(),
        version_id: "SingleFile".to_string(),
        total_files: 1,
        downloaded_files: 0,
        current_file: format!("Downloading {}...", path_buf.file_name().unwrap_or_default().to_string_lossy()),
        percent: 0.0,
    });

    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Failed to download: {}", resp.status()));
    }
    let content = resp.bytes().await.map_err(|e| e.to_string())?;
    fs::write(&path_buf, content).map_err(|e| e.to_string())?;

    let _ = app.emit("download-progress", DownloadProgress {
        task_id: task_id.clone(),
        version_id: "SingleFile".to_string(),
        total_files: 1,
        downloaded_files: 1,
        current_file: "Done".to_string(),
        percent: 100.0,
    });

    Ok(())
}

#[tauri::command]
pub async fn download_custom_files(
    app: AppHandle,
    state: State<'_, DownloadState>,
    version_id: String,
    files: Vec<CustomFile>,
    game_path: Option<String>,
    task_id: Option<String>
) -> Result<(), String> {
    {
        let mut active = state.active_downloads.lock().map_err(|e| e.to_string())?;
        if active.contains(&version_id) {
            return Err("Download already in progress".to_string());
        }
        active.insert(version_id.clone());
    }
    let _guard = DownloadGuard { state: &state, version_id: version_id.clone() };

    let mc_dir = game_path.map(PathBuf::from).unwrap_or_else(|| {
        app.path().app_data_dir().unwrap().join(".minecraft")
    });

    let mut queue = Vec::new();
    for file in files {
        let path_str = file.path.replace("\\", "/");
        let path = if path_str == "client_config.json" {
             mc_dir.join("versions").join(&version_id).join("client_config.json")
        } else if path_str.ends_with(".json") && !path_str.contains('/') {
             mc_dir.join("versions").join(&version_id).join(format!("{}.json", version_id))
        } else {
             mc_dir.join(&file.path)
        };
        queue.push((file.url, path, file.token));
    }

    download_files(&app, &version_id, queue, task_id).await?;

    Ok(())
}

pub async fn prepare_vanilla_downloads(client: &reqwest::Client, version_id: &str, mc_dir: &PathBuf) -> Result<(Vec<(String, PathBuf, Option<String>)>, VersionDetails), String> {
    let manifest: VersionManifest = client
        .get(MANIFEST_URL)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let version_entry = manifest.versions.iter().find(|v| v.id == version_id)
        .ok_or("Version not found")?;

    let details: VersionDetails = client
        .get(&version_entry.url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    // Save version json
    let version_json_path = mc_dir.join("versions").join(version_id).join(format!("{}.json", version_id));
    if let Some(parent) = version_json_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json_content = serde_json::to_string_pretty(&details).map_err(|e| e.to_string())?;
    fs::write(&version_json_path, json_content).map_err(|e| e.to_string())?;

    let mut queue = Vec::new();

    // Client Jar
    let client_jar_path = mc_dir.join("versions").join(version_id).join(format!("{}.jar", version_id));
    queue.push((details.downloads.client.url.clone(), client_jar_path, None));

    // Libraries
    for lib in &details.libraries {
        if check_rules(&lib.rules) {
            if let Some(downloads) = &lib.downloads {
                if let Some(artifact) = &downloads.artifact {
                    let path = artifact.path.as_ref().ok_or("Library path missing")?;
                    let full_path = mc_dir.join("libraries").join(path);
                    queue.push((artifact.url.clone(), full_path, None));
                }
                // Natives
                if let Some(classifiers) = &downloads.classifiers {
                     let os_key = if cfg!(target_os = "windows") {
                        "natives-windows"
                    } else if cfg!(target_os = "macos") {
                        "natives-osx"
                    } else {
                        "natives-linux"
                    };
                    if let Some(native_info) = classifiers.get(os_key) {
                         let path = native_info.path.as_ref().ok_or("Native path missing")?;
                         let full_path = mc_dir.join("libraries").join(path);
                         queue.push((native_info.url.clone(), full_path, None));
                    }
                }
            } else {
                // Legacy library format (no downloads struct, just url + name)
                // Name format: group:artifact:version
                let parts: Vec<&str> = lib.name.split(':').collect();
                if parts.len() >= 3 {
                    let group = parts[0].replace('.', "/");
                    let artifact = parts[1];
                    let version = parts[2];
                    let path = format!("{}/{}/{}/{}-{}.jar", group, artifact, version, artifact, version);
                    let full_path = mc_dir.join("libraries").join(path);
                    
                    // Use BMCLAPI or official repo? Default to official if url not present
                    let base_url = lib.url.as_deref().unwrap_or("https://libraries.minecraft.net/");
                    let url = format!("{}{}/{}/{}/{}-{}.jar", base_url, group, artifact, version, artifact, version);
                    queue.push((url, full_path, None));
                }
            }
        }
    }

    // Assets
    let asset_index_path = mc_dir.join("assets").join("indexes").join(format!("{}.json", details.asset_index.id));
    if let Some(parent) = asset_index_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // Download asset index
    let asset_index_content = client.get(&details.asset_index.url).send().await.map_err(|e| e.to_string())?.text().await.map_err(|e| e.to_string())?;
    fs::write(&asset_index_path, &asset_index_content).map_err(|e| e.to_string())?;

    let assets: Assets = serde_json::from_str(&asset_index_content).map_err(|e| e.to_string())?;
    for (_, object) in assets.objects {
        let hash_head = &object.hash[0..2];
        let path = mc_dir.join("assets").join("objects").join(hash_head).join(&object.hash);
        let url = format!("https://resources.download.minecraft.net/{}/{}", hash_head, object.hash);
        queue.push((url, path, None));
    }

    Ok((queue, details))
}

pub async fn prepare_fabric_downloads(client: &reqwest::Client, game_version: &str, loader_version: &str, mc_dir: &PathBuf) -> Result<(Vec<(String, PathBuf, Option<String>)>, String), String> {
    let url = format!("https://meta.fabricmc.net/v2/versions/loader/{}/{}/profile/json", game_version, loader_version);
    let profile_json: serde_json::Value = client.get(&url).send().await.map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;

    // Save fabric profile json
    // The ID usually looks like "fabric-loader-0.14.21-1.20.1"
    let version_id = profile_json["id"].as_str().ok_or("Invalid profile json")?;
    let version_json_path = mc_dir.join("versions").join(version_id).join(format!("{}.json", version_id));
    if let Some(parent) = version_json_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json_content = serde_json::to_string_pretty(&profile_json).map_err(|e| e.to_string())?;
    fs::write(&version_json_path, json_content).map_err(|e| e.to_string())?;

    let mut queue = Vec::new();
    
    if let Some(libraries) = profile_json["libraries"].as_array() {
        for lib in libraries {
            let name = lib["name"].as_str().ok_or("Library name missing")?;
            let parts: Vec<&str> = name.split(':').collect();
            if parts.len() >= 3 {
                let group = parts[0].replace('.', "/");
                let artifact = parts[1];
                let version = parts[2];
                let path = format!("{}/{}/{}/{}-{}.jar", group, artifact, version, artifact, version);
                let full_path = mc_dir.join("libraries").join(path);
                
                let base_url = lib["url"].as_str().unwrap_or("https://maven.fabricmc.net/");
                let url = format!("{}{}/{}/{}/{}-{}.jar", base_url, group, artifact, version, artifact, version);
                queue.push((url, full_path, None));
            }
        }
    }

    Ok((queue, version_id.to_string()))
}

pub async fn download_files(app: &AppHandle, version_id: &str, queue: Vec<(String, PathBuf, Option<String>)>, task_id: Option<String>) -> Result<(), String> {
    let total_files = queue.len();
    let semaphore = Arc::new(Semaphore::new(10)); // Concurrency limit
    let client = reqwest::Client::new();
    let mut downloaded = 0;

    let mut stream = futures::stream::iter(queue)
        .map(|(url, path, token)| {
            let client = client.clone();
            let semaphore = semaphore.clone();
            let app = app.clone();
            let task_id = task_id.clone();
            async move {
                let _permit = semaphore.acquire().await.unwrap();
                if path.exists() {
                    return Ok(());
                }
                if let Some(parent) = path.parent() {
                    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                }
                
                let filename = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                let _ = app.emit("download-log", DownloadLog { task_id: task_id.clone(), message: format!("Downloading {}", filename), level: "info".to_string() });

                let mut req = client.get(&url);
                if let Some(t) = token {
                    req = req.header("Authorization", format!("Bearer {}", t));
                }

                let resp = req.send().await.map_err(|e| e.to_string())?;
                if !resp.status().is_success() {
                    return Err(format!("Failed to download {}: {}", url, resp.status()));
                }
                let content = resp.bytes().await.map_err(|e| e.to_string())?;
                fs::write(&path, content).map_err(|e| e.to_string())?;
                Ok::<(), String>(())
            }
        })
        .buffer_unordered(10);

    while let Some(result) = stream.next().await {
        if let Err(e) = result {
            println!("Download error: {}", e);
            let _ = app.emit("download-log", DownloadLog { task_id: task_id.clone(), message: format!("Download error: {}", e), level: "error".to_string() });
            // Continue or fail? For now, log and continue, but maybe should fail?
            // Ideally we retry.
        }
        downloaded += 1;
        let _ = app.emit("download-progress", DownloadProgress {
            task_id: task_id.clone(),
            version_id: version_id.to_string(),
            total_files,
            downloaded_files: downloaded,
            current_file: format!("{}/{}", downloaded, total_files),
            percent: (downloaded as f64 / total_files as f64) * 100.0,
        });
    }
    Ok(())
}
