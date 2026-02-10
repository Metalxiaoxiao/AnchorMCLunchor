use tauri::{AppHandle, Manager, Emitter};
use std::process::{Command, Stdio};
use std::path::PathBuf;
use std::time::SystemTime;
use std::io::{Read, BufRead, BufReader, Write};
use std::thread;
use walkdir::WalkDir;
use serde_json::json;

#[derive(Debug, serde::Deserialize)]
pub struct MinecraftAccount {
    pub username: String,
    pub uuid: String,
    pub access_token: String,
    pub user_type: String,
}

#[derive(serde::Serialize)]
pub struct VersionDetails {
    pub is_modded: bool,
    pub version_type: String,
    pub version_path: String,
    pub mc_path: String,
}

#[derive(serde::Serialize)]
pub struct VersionRuntimeInfo {
    pub mc_version: Option<String>,
    pub loader_type: Option<String>,
    pub loader_version: Option<String>,
}

#[tauri::command]
pub fn open_folder(path: String) {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(path)
            .spawn()
            .unwrap();
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .spawn()
            .unwrap();
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(path)
            .spawn()
            .unwrap();
    }
}

#[tauri::command]
pub fn open_mods_folder(app: AppHandle, version_id: String, game_path: Option<String>) -> Result<(), String> {
    let details = get_version_details(app.clone(), version_id.clone(), game_path.clone())?;
    let config = crate::config::load_config();
    let isolated = crate::config::should_isolate(&config.isolation_mode, details.is_modded, &details.version_type);
    
    let path = if isolated {
        PathBuf::from(&details.version_path).join("mods")
    } else {
        PathBuf::from(&details.mc_path).join("mods")
    };
    
    if !path.exists() {
        std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    
    open_folder(path.to_string_lossy().to_string());
    Ok(())
}

#[tauri::command]
pub fn get_version_details(app: AppHandle, version_id: String, game_path: Option<String>) -> Result<VersionDetails, String> {
    let mc_dir = crate::version_path::get_game_root(&app, game_path.clone())?;
    let version_dir = crate::version_path::get_version_dir(&app, &version_id, game_path.clone())?;
    let json_path = version_dir.join(format!("{}.json", version_id));
    
    if !json_path.exists() {
        return Err(format!("Version {} not found", version_id));
    }

    let file = std::fs::File::open(&json_path).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_reader(file).map_err(|e| e.to_string())?;
    
    let version_type = json["type"].as_str().unwrap_or("release").to_string();
    let mut main_class = json["mainClass"].as_str().unwrap_or("").to_string();

    if main_class.is_empty() {
        if let Some(parent_id) = json.get("inheritsFrom").and_then(|v| v.as_str()) {
            let parent_dir = mc_dir.join("versions").join(parent_id);
            let parent_json_path = parent_dir.join(format!("{}.json", parent_id));
            if parent_json_path.exists() {
                if let Ok(file) = std::fs::File::open(&parent_json_path) {
                    if let Ok(p_json) = serde_json::from_reader::<_, serde_json::Value>(file) {
                        if let Some(p_main) = p_json.get("mainClass").and_then(|v| v.as_str()) {
                            main_class = p_main.to_string();
                        } else if let Some(gp_id) = p_json.get("inheritsFrom").and_then(|v| v.as_str()) {
                            let gp_dir = mc_dir.join("versions").join(gp_id);
                            let gp_json_path = gp_dir.join(format!("{}.json", gp_id));
                            if gp_json_path.exists() {
                                if let Ok(gp_file) = std::fs::File::open(&gp_json_path) {
                                    if let Ok(gp_json) = serde_json::from_reader::<_, serde_json::Value>(gp_file) {
                                        if let Some(gp_main) = gp_json.get("mainClass").and_then(|v| v.as_str()) {
                                            main_class = gp_main.to_string();
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let is_modded = version_type == "modpack" || (!main_class.is_empty() && main_class != "net.minecraft.client.main.Main");

    Ok(VersionDetails {
        is_modded,
        version_type,
        version_path: version_dir.to_string_lossy().to_string(),
        mc_path: mc_dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn get_version_runtime_info(app: AppHandle, version_id: String, game_path: Option<String>) -> Result<VersionRuntimeInfo, String> {
    let mc_dir = crate::version_path::get_game_root(&app, game_path.clone())?;
    let version_dir = crate::version_path::get_version_dir(&app, &version_id, game_path.clone())?;
    let json_path = version_dir.join(format!("{}.json", version_id));

    if !json_path.exists() {
        return Err(format!("Version {} not found", version_id));
    }

    let file = std::fs::File::open(&json_path).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_reader(file).map_err(|e| e.to_string())?;

    let mut candidate_ids: Vec<String> = Vec::new();
    if let Some(inherits) = json.get("inheritsFrom").and_then(|v| v.as_str()) {
        candidate_ids.push(inherits.to_string());
    }
    if let Some(id) = json.get("id").and_then(|v| v.as_str()) {
        candidate_ids.push(id.to_string());
    }

    let mut loader_type: Option<String> = None;
    let mut loader_version: Option<String> = None;
    let mut mc_version: Option<String> = None;

    for id in candidate_ids.iter() {
        if id.starts_with("fabric-loader-") {
            loader_type = Some("fabric".to_string());
            let tail = id.trim_start_matches("fabric-loader-");
            if let Some((lv, mv)) = tail.split_once('-') {
                loader_version = Some(lv.to_string());
                mc_version = Some(mv.to_string());
            }
            break;
        }
        if id.starts_with("forge-") {
            loader_type = Some("forge".to_string());
            let tail = id.trim_start_matches("forge-");
            if let Some((mv, lv)) = tail.split_once('-') {
                mc_version = Some(mv.to_string());
                loader_version = Some(lv.to_string());
            }
            break;
        }
        if id.starts_with("neoforge-") {
            loader_type = Some("neoforge".to_string());
            let tail = id.trim_start_matches("neoforge-");
            if let Some((mv, lv)) = tail.split_once('-') {
                mc_version = Some(mv.to_string());
                loader_version = Some(lv.to_string());
            }
            break;
        }
        if id.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
            mc_version = Some(id.to_string());
            loader_type = Some("vanilla".to_string());
            break;
        }
    }

    if mc_version.is_none() {
        if let Some(parent_id) = json.get("inheritsFrom").and_then(|v| v.as_str()) {
            let parent_dir = mc_dir.join("versions").join(parent_id);
            let parent_json_path = parent_dir.join(format!("{}.json", parent_id));
            if parent_json_path.exists() {
                let parent_file = std::fs::File::open(&parent_json_path).map_err(|e| e.to_string())?;
                let parent_json: serde_json::Value = serde_json::from_reader(parent_file).map_err(|e| e.to_string())?;
                if let Some(gp_id) = parent_json.get("inheritsFrom").and_then(|v| v.as_str()) {
                    mc_version = Some(gp_id.to_string());
                }
            }
        }
    }

    Ok(VersionRuntimeInfo {
        mc_version,
        loader_type,
        loader_version,
    })
}

fn extract_natives(zip_path: &PathBuf, target_dir: &PathBuf) -> Result<(), String> {
    println!("Extracting natives from {:?}", zip_path);
    let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let path = file.mangled_name();
        
        if path.to_string_lossy().contains("META-INF") {
            continue;
        }
        
        let out_path = target_dir.join(path);
        
        if file.is_dir() {
            std::fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = out_path.parent() {
                if !p.exists() {
                    std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
                }
            }
            let mut outfile = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn apply_override_folders(game_dir: &PathBuf) -> Result<(), String> {
    let override_roots = ["overrides", "client-overrides"];

    for root in override_roots {
        let src_root = game_dir.join(root);
        if !src_root.exists() {
            continue;
        }

        for entry in WalkDir::new(&src_root).into_iter().flatten() {
            let path = entry.path();
            let rel = match path.strip_prefix(&src_root) {
                Ok(r) => r,
                Err(_) => continue,
            };

            if rel.as_os_str().is_empty() {
                continue;
            }

            if rel.components().next().map(|c| c.as_os_str().to_string_lossy()) == Some("server-overrides".into()) {
                continue;
            }

            let dest = game_dir.join(rel);
            if entry.file_type().is_dir() {
                if !dest.exists() {
                    std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
                }
            } else if entry.file_type().is_file() {
                if let Some(parent) = dest.parent() {
                    if !parent.exists() {
                        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                    }
                }
                std::fs::copy(path, &dest).map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(())
}

fn should_use_library(lib: &serde_json::Value) -> bool {
    if let Some(rules) = lib["rules"].as_array() {
        let mut allowed = false;
        for rule in rules {
            let action = rule["action"].as_str().unwrap_or("disallow");
            let mut os_match = true;

            if let Some(os) = rule["os"].as_object() {
                if let Some(name) = os["name"].as_str() {
                    let current_os = std::env::consts::OS;
                    let target_os = match current_os {
                        "macos" => "osx",
                        other => other,
                    };
                    
                    if name != target_os {
                        os_match = false;
                    }
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

fn get_java_version(java_path: &str) -> Option<u32> {
    let output = Command::new(java_path).arg("-version").output().ok()?;
    let stderr = String::from_utf8_lossy(&output.stderr);
    
    // Look for version string in stderr (java -version prints to stderr)
    // Format: "openjdk version \"21.0.1\"" or "java version \"1.8.0_...\""
    for line in stderr.lines() {
        if line.contains("version") {
            let parts: Vec<&str> = line.split('"').collect();
            if parts.len() >= 2 {
                let ver_str = parts[1];
                let ver_parts: Vec<&str> = ver_str.split('.').collect();
                if let Some(first) = ver_parts.first() {
                    if let Ok(v) = first.parse::<u32>() {
                        if v == 1 {
                            // 1.8.0 -> 8
                            if let Some(second) = ver_parts.get(1) {
                                return second.parse::<u32>().ok();
                            }
                        } else {
                            return Some(v);
                        }
                    }
                }
            }
        }
    }
    None
}

async fn ensure_java(app: &AppHandle, required_version: u32) -> Result<String, String> {
    let runtimes_dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("runtimes");
    let java_dir_name = format!("java-{}", required_version);
    let java_home = runtimes_dir.join(&java_dir_name);
    let java_bin = java_home.join("bin").join("java.exe");

    if java_bin.exists() {
        return Ok(java_bin.to_string_lossy().to_string());
    }

    // Download
    let _ = app.emit("launch-status", format!("Downloading Java {} Runtime...", required_version));
    
    // URL for Windows x64
    let url = if required_version == 21 {
        "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse"
    } else if required_version == 17 {
        "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse"
    } else if required_version == 8 {
        "https://api.adoptium.net/v3/binary/latest/8/ga/windows/x64/jdk/hotspot/normal/eclipse"
    } else {
        return Err(format!("Auto-download for Java {} not supported yet", required_version));
    };

    let client = reqwest::Client::new();
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    
    if !resp.status().is_success() {
        return Err(format!("Failed to download Java: {}", resp.status()));
    }

    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    
    let _ = app.emit("launch-status", "Extracting Java Runtime...");
    
    // Extract to temp then move or extract directly
    // We need to handle the top-level directory in the zip
    let reader = std::io::Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(reader).map_err(|e| e.to_string())?;

    // Find the root folder name in zip
    let root_name = {
        let file = archive.by_index(0).map_err(|e| e.to_string())?;
        let path = file.mangled_name();
        path.iter().next().unwrap().to_string_lossy().to_string()
    };

    // Extract
    archive.extract(&runtimes_dir).map_err(|e| e.to_string())?;

    // Rename extracted folder to java-{version}
    let extracted_path = runtimes_dir.join(root_name);
    if extracted_path != java_home {
        if java_home.exists() {
            std::fs::remove_dir_all(&java_home).map_err(|e| e.to_string())?;
        }
        std::fs::rename(&extracted_path, &java_home).map_err(|e| e.to_string())?;
    }

    Ok(java_bin.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn launch_game(
    app: AppHandle, 
    version_id: String, 
    game_path: Option<String>,
    java_path: Option<String>,
    account: Option<MinecraftAccount>,
    auth_server: Option<String>,
    jvm_args: Option<Vec<String>>,
    min_memory: Option<u32>,
    max_memory: Option<u32>,
    width: Option<u32>,
    height: Option<u32>,
    _enable_isolation: Option<bool>,
    server_ip: Option<String>,
    server_port: Option<u16>
) -> Result<(), String> {
    let _ = app.emit("launch-status", "Checking Java environment...");

    // Determine isolation from config
    let details = get_version_details(app.clone(), version_id.clone(), game_path.clone())?;
    let config = crate::config::load_config();
    let isolated = crate::config::should_isolate(&config.isolation_mode, details.is_modded, &details.version_type);
    
    // Determine required Java version
    let required_java = if version_id.starts_with("1.21") || version_id.starts_with("1.20.5") || version_id.starts_with("1.20.6") {
        21
    } else if version_id.starts_with("1.18") || version_id.starts_with("1.19") || version_id.starts_with("1.20") {
        17
    } else if version_id.starts_with("1.17") {
        16
    } else {
        8
    };

    let mut final_java_path = "java".to_string();
    let mut java_ok = false;

    // 1. Check User Provided Path
    if let Some(path) = &java_path {
        if !path.is_empty() {
            if let Some(ver) = get_java_version(path) {
                if ver >= required_java {
                    final_java_path = path.clone();
                    java_ok = true;
                } else {
                    let _ = app.emit("launch-status", format!("Warning: User Java version {} is lower than required {}.", ver, required_java));
                }
            }
        }
    }

    // 2. Check Managed Runtime (Preferred over system java for exact match)
    if !java_ok {
        let runtimes_dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("runtimes");
        let java_dir_name = format!("java-{}", required_java);
        let java_bin = runtimes_dir.join(&java_dir_name).join("bin").join("java.exe");
        
        if java_bin.exists() {
            final_java_path = java_bin.to_string_lossy().to_string();
            java_ok = true;
        }
    }

    // 3. Check System Java (if user path invalid or not provided)
    if !java_ok {
        if let Some(ver) = get_java_version("java") {
            if ver >= required_java {
                final_java_path = "java".to_string();
                java_ok = true;
            }
        }
    }

    // 4. Auto-download if needed (Only for 8, 17 and 21)
    if !java_ok && (required_java == 21 || required_java == 17 || required_java == 8) {
        let _ = app.emit("launch-status", format!("Java {} not found. Attempting to download...", required_java));
        match ensure_java(&app, required_java).await {
            Ok(path) => {
                final_java_path = path;
                java_ok = true;
            },
            Err(e) => {
                return Err(format!("Failed to download Java: {}", e));
            }
        }
    }

    if !java_ok {
        // Final check
        if Command::new(&final_java_path).arg("-version").output().is_err() {
             return Err(format!("Java environment not found. Please install Java {} (JRE/JDK).", required_java));
        }
        // If it exists but version is wrong, we might still try to launch but warn?
        // For now, let it proceed, maybe it works.
    }

    let java_bin = final_java_path;

    let mc_dir = crate::version_path::get_game_root(&app, game_path.clone())?;
    let version_dir = crate::version_path::get_version_dir(&app, &version_id, game_path.clone())?;
    let json_path = version_dir.join(format!("{}.json", version_id));
    
    if !json_path.exists() {
        return Err(format!("Version {} not installed (missing json)", version_id));
    }

    let _ = app.emit("launch-status", "Preparing natives...");
    // Natives Directory
    let natives_dir = version_dir.join("natives");
    // Clean natives directory to ensure fresh extraction
    if natives_dir.exists() {
        let _ = std::fs::remove_dir_all(&natives_dir);
    }
    std::fs::create_dir_all(&natives_dir).map_err(|e| e.to_string())?;

    // Read JSON
    let file = std::fs::File::open(&json_path).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_reader(file).map_err(|e| e.to_string())?;
    
    // Inheritance Handling
    let mut jar_path = version_dir.join(format!("{}.jar", version_id));
    let mut all_libraries = Vec::new();
    let mut parent_json: Option<serde_json::Value> = None;
    let mut grandparent_json: Option<serde_json::Value> = None;

    if let Some(libs) = json.get("libraries").and_then(|l| l.as_array()) {
        all_libraries.extend(libs.clone());
    }

    if let Some(parent_id) = json.get("inheritsFrom").and_then(|v| v.as_str()) {
        let parent_dir = mc_dir.join("versions").join(parent_id);
        let parent_json_path = parent_dir.join(format!("{}.json", parent_id));
        jar_path = parent_dir.join(format!("{}.jar", parent_id));
        
        if !parent_json_path.exists() {
             // Try to find parent in the same directory if it's not in its own folder?
             // No, versions are always in their own folder.
             // Maybe parent_id is not exactly the folder name?
             // Fabric loader ID: "fabric-loader-0.14.25-1.20.1"
             // Folder name: "fabric-loader-0.14.25-1.20.1"
             // It should match.
             
             // Check if parent is vanilla version (e.g. "1.20.1")
             // Vanilla jar is at versions/1.20.1/1.20.1.jar
             
             return Err(format!("Parent version {} not installed (checked {:?})", parent_id, parent_json_path));
        }
        
        // Check jar existence only if it's not a loader that inherits from another version (chain inheritance)
        // But for now, let's assume 1 level inheritance or check jar if it exists.
        // Actually, Fabric versions often don't have a jar in their folder if they inherit from vanilla?
        // No, Fabric creates a version json that inherits from vanilla.
        // So: Modpack -> Fabric -> Vanilla.
        // Modpack inherits Fabric. Fabric inherits Vanilla.
        // Fabric version folder has json, but usually NO jar. The jar is the vanilla jar.
        // Wait, Fabric loader has a dummy jar or uses libraries?
        // Fabric loader uses libraries. The "client jar" is the vanilla jar.
        
        // So if parent (Fabric) inherits from something else, we shouldn't check for parent's jar.
        // We should read parent json and see if IT inherits.
        
        let parent_file = std::fs::File::open(&parent_json_path).map_err(|e| e.to_string())?;
        let p_json: serde_json::Value = serde_json::from_reader(parent_file).map_err(|e| e.to_string())?;
        
        if let Some(grandparent_id) = p_json.get("inheritsFrom").and_then(|v| v.as_str()) {
            // Parent inherits from Grandparent (e.g. Fabric -> Vanilla)
            // So we use Grandparent's jar
            let gp_dir = mc_dir.join("versions").join(grandparent_id);
            jar_path = gp_dir.join(format!("{}.jar", grandparent_id));
            
            if !jar_path.exists() {
                 return Err(format!("Grandparent version {} not installed (missing jar at {:?})", grandparent_id, jar_path));
            }
            
            // Also merge grandparent libraries? Usually vanilla libs are in version json or handled by inheriting?
            // Vanilla json has libraries.
            let gp_json_path = gp_dir.join(format!("{}.json", grandparent_id));
            if gp_json_path.exists() {
                let gp_file = std::fs::File::open(&gp_json_path).map_err(|e| e.to_string())?;
                let gp_json: serde_json::Value = serde_json::from_reader(gp_file).map_err(|e| e.to_string())?;
                if let Some(libs) = gp_json.get("libraries").and_then(|l| l.as_array()) {
                    all_libraries.extend(libs.clone());
                }
                grandparent_json = Some(gp_json);
            }
        } else {
            // Parent is base version (e.g. Vanilla), so it must have a jar
            if !jar_path.exists() {
                 return Err(format!("Parent version {} not installed (missing jar at {:?})", parent_id, jar_path));
            }
        }
        
        if let Some(libs) = p_json.get("libraries").and_then(|l| l.as_array()) {
            all_libraries.extend(libs.clone());
        }
        parent_json = Some(p_json);
    } else {
        if !jar_path.exists() {
            return Err(format!("Version {} not installed (missing jar)", version_id));
        }
    }

    let main_class = json["mainClass"].as_str()
        .or_else(|| parent_json.as_ref().and_then(|p| p["mainClass"].as_str()))
        .or_else(|| grandparent_json.as_ref().and_then(|g| g["mainClass"].as_str()))
        .ok_or("No mainClass found")?;

    // Libraries
    let mut classpath = Vec::new();
    let lib_dir = mc_dir.join("libraries");
    
    for lib in all_libraries {
        if !should_use_library(&lib) {
            }

            // 1. Add to Classpath
            if let Some(name) = lib["name"].as_str() {
                // println!("Processing library: {}", name);
                let parts: Vec<&str> = name.split(':').collect();
                if parts.len() >= 3 {
                    let group = parts[0].replace('.', "/");
                    let name = parts[1];
                    let version = parts[2];
                    let classifier = if parts.len() > 3 { Some(parts[3]) } else { None };
                    
                    let filename = if let Some(c) = classifier {
                        format!("{}-{}-{}.jar", name, version, c)
                    } else {
                        format!("{}-{}.jar", name, version)
                    };
                    
                    let lib_path = lib_dir.join(&group).join(name).join(version).join(&filename);
                    if lib_path.exists() {
                        classpath.push(lib_path.to_string_lossy().to_string());
                    } else {
                        // If main jar is missing, check if it's a native-only lib (no artifact in downloads)
                        // But we can't easily know without checking 'downloads.artifact'.
                        // For now, if it's missing, we log but maybe don't fail immediately if we find natives?
                        // But usually we need the jar on classpath too.
                        // Let's check if 'downloads.artifact' exists.
                        let has_artifact = if let Some(dl) = lib["downloads"].as_object() {
                            dl.contains_key("artifact")
                        } else {
                            true // Assume yes if downloads missing (legacy)
                        };

                        if has_artifact {
                             // return Err(format!("Missing library: {}. Please reinstall the version.", filename));
                             println!("Warning: Missing library jar: {}", filename);
                        }
                    }
                }
            }

            // 2. Extract Natives
            let mut extracted = false;
            let os_key = if cfg!(target_os = "windows") { "windows" } else if cfg!(target_os = "macos") { "osx" } else { "linux" };
            
            // Method A: Use 'natives' map if available
            if let Some(natives) = lib["natives"].as_object() {
                if let Some(classifier_val) = natives.get(os_key) {
                    if let Some(classifier) = classifier_val.as_str() {
                         let arch = if cfg!(target_arch = "x86") { "x86" } else { "64" };
                         let key = classifier.replace("${arch}", arch);
                         
                         if let Some(downloads) = lib["downloads"].as_object() {
                             if let Some(classifiers) = downloads["classifiers"].as_object() {
                                 if let Some(artifact) = classifiers.get(&key) {
                                     if let Some(path) = artifact["path"].as_str() {
                                         let lib_path = lib_dir.join(path);
                                         if lib_path.exists() {
                                             println!("Extracting natives (A) from {:?}", lib_path);
                                             let _ = app.emit("launch-status", format!("Extracting natives from {:?}", lib_path.file_name().unwrap_or_default()));
                                             if let Err(e) = extract_natives(&lib_path, &natives_dir) {
                                                 println!("Failed to extract natives: {}", e);
                                             }
                                             extracted = true;
                                         }
                                     }
                                 }
                             }
                         }
                         
                         // Fallback for Method A if not found in classifiers but natives key exists
                         if !extracted {
                             if let Some(name) = lib["name"].as_str() {
                                let parts: Vec<&str> = name.split(':').collect();
                                if parts.len() >= 3 {
                                    let group = parts[0].replace('.', "/");
                                    let name = parts[1];
                                    let version = parts[2];
                                    let filename = format!("{}-{}-{}.jar", name, version, key);
                                    let lib_path = lib_dir.join(&group).join(name).join(version).join(&filename);
                                    
                                    if lib_path.exists() {
                                         println!("Extracting natives (A-fallback) from {:?}", lib_path);
                                         let _ = app.emit("launch-status", format!("Extracting natives from {:?}", lib_path.file_name().unwrap_or_default()));
                                         if let Err(e) = extract_natives(&lib_path, &natives_dir) {
                                             println!("Failed to extract natives: {}", e);
                                         }
                                         extracted = true;
                                    }
                                }
                             }
                         }
                    }
                }
            }

            // Method B: Scan classifiers if Method A didn't run
            if !extracted {
                 if let Some(downloads) = lib["downloads"].as_object() {
                    if let Some(classifiers) = downloads.get("classifiers").and_then(|c| c.as_object()) {
                        for (key, artifact) in classifiers {
                            let is_os_match = if cfg!(target_os = "windows") {
                                key.contains("natives-windows")
                            } else if cfg!(target_os = "macos") {
                                key.contains("natives-macos") || key.contains("natives-osx")
                            } else {
                                key.contains("natives-linux")
                            };

                            if is_os_match {
                                // Filter by arch if possible
                                let skip = if cfg!(target_arch = "x86_64") {
                                    key.contains("x86") && !key.contains("x86_64")
                                } else {
                                    false
                                };

                                if !skip {
                                     if let Some(path) = artifact["path"].as_str() {
                                         let lib_path = lib_dir.join(path);
                                         if lib_path.exists() {
                                             println!("Extracting natives (B) from {:?}", lib_path);
                                             let _ = app.emit("launch-status", format!("Extracting natives from {:?}", lib_path.file_name().unwrap_or_default()));
                                             let _ = extract_natives(&lib_path, &natives_dir);
                                         }
                                     }
                                }
                            }
                        }
                    }
                 }
            }
        }
    
    // Debug: List natives
    println!("Natives directory: {:?}", natives_dir);
    let mut has_lwjgl = false;
    if let Ok(entries) = std::fs::read_dir(&natives_dir) {
        println!("Natives directory content:");
        for entry in entries {
            if let Ok(entry) = entry {
                let name = entry.file_name();
                println!(" - {:?}", name);
                if name.to_string_lossy().contains("lwjgl") && name.to_string_lossy().contains(".dll") {
                    has_lwjgl = true;
                }
            }
        }
    }

    // Fallback: If LWJGL natives are missing, try to find and extract them aggressively
    if !has_lwjgl {
        println!("WARNING: LWJGL natives missing! Attempting aggressive search...");
        // Common LWJGL modules that need natives
        let lwjgl_modules = ["lwjgl", "lwjgl-glfw", "lwjgl-opengl", "lwjgl-openal", "lwjgl-stb", "lwjgl-tinyfd", "lwjgl-freetype", "lwjgl-jemalloc"];
        
        for module in lwjgl_modules {
            // Try to find the jar in the library directory structure
            // We assume standard structure: org/lwjgl/module/version/module-version-natives-windows.jar
            // We need to find the version. We can guess from the main jar in classpath?
            // Or just scan the org/lwjgl/module directory.
            
            let module_base = lib_dir.join("org").join("lwjgl").join(module);
            if module_base.exists() {
                if let Ok(versions) = std::fs::read_dir(&module_base) {
                    for ver_entry in versions {
                        if let Ok(ver_entry) = ver_entry {
                            if ver_entry.path().is_dir() {
                                if let Ok(files) = std::fs::read_dir(ver_entry.path()) {
                                    for file in files {
                                        if let Ok(file) = file {
                                            let name = file.file_name().to_string_lossy().to_string();
                                            if name.contains("natives-windows") && name.ends_with(".jar") {
                                                println!("Found fallback native jar: {:?}", file.path());
                                                if let Err(e) = extract_natives(&file.path(), &natives_dir) {
                                                    println!("Failed to extract fallback native: {}", e);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    classpath.push(jar_path.to_string_lossy().to_string());

    // Arguments
    let mut args = Vec::new();
    
    // Authlib Injector
    if let Some(server_url) = auth_server {
        let injector_path = mc_dir.join("authlib-injector.jar");
        if !injector_path.exists() {
            let _ = app.emit("launch-status", format!("Downloading authlib-injector to {:?}...", injector_path));
            
            // Ensure parent directory exists
            if let Some(parent) = injector_path.parent() {
                if !parent.exists() {
                     let _ = std::fs::create_dir_all(parent);
                }
            }

            let mirrors = vec![
                "https://bmclapi2.bangbang93.com/mirrors/authlib-injector/artifact/latest.json",
                "https://openbmclapi.bangbang93.com/mirrors/authlib-injector/artifact/latest.json",
                "https://authlib-injector.yushi.moe/artifact/latest.json",
            ];
            
            let client = reqwest::Client::new();
            let mut downloaded = false;
            let mut last_error = String::new();

            for mirror_url in mirrors {
                let _ = app.emit("launch-status", format!("Checking mirror metadata: {}...", mirror_url));
                
                // 1. Fetch Metadata
                match client.get(mirror_url).send().await {
                    Ok(resp) => {
                        if resp.status().is_success() {
                            match resp.json::<serde_json::Value>().await {
                                Ok(json) => {
                                    if let Some(download_url) = json.get("download_url").and_then(|v| v.as_str()) {
                                        let _ = app.emit("launch-status", format!("Found download URL: {}", download_url));
                                        
                                        // 2. Download File
                                        match client.get(download_url).send().await {
                                            Ok(file_resp) => {
                                                if file_resp.status().is_success() {
                                                    match file_resp.bytes().await {
                                                        Ok(bytes) => {
                                                            if let Err(e) = tokio::fs::write(&injector_path, bytes).await {
                                                                last_error = format!("Write error: {}", e);
                                                                let _ = app.emit("launch-status", format!("Failed to write file: {}", e));
                                                            } else {
                                                                downloaded = true;
                                                                let _ = app.emit("launch-status", "Download successful.");
                                                                break;
                                                            }
                                                        }
                                                        Err(e) => {
                                                            last_error = format!("Bytes error: {}", e);
                                                            let _ = app.emit("launch-status", format!("Failed to read bytes: {}", e));
                                                        }
                                                    }
                                                } else {
                                                    last_error = format!("File download HTTP error: {}", file_resp.status());
                                                    let _ = app.emit("launch-status", format!("File download HTTP error: {}", file_resp.status()));
                                                }
                                            }
                                            Err(e) => {
                                                last_error = format!("File request error: {}", e);
                                                let _ = app.emit("launch-status", format!("File request error: {}", e));
                                            }
                                        }
                                    } else {
                                        last_error = "Invalid JSON: missing download_url".to_string();
                                        let _ = app.emit("launch-status", "Invalid JSON: missing download_url");
                                    }
                                }
                                Err(e) => {
                                    last_error = format!("JSON parse error: {}", e);
                                    let _ = app.emit("launch-status", format!("JSON parse error: {}", e));
                                }
                            }
                        } else {
                            last_error = format!("Metadata HTTP error: {}", resp.status());
                            let _ = app.emit("launch-status", format!("Metadata HTTP error: {}", resp.status()));
                        }
                    }
                    Err(e) => {
                        last_error = format!("Metadata request error: {}", e);
                        let _ = app.emit("launch-status", format!("Metadata request error: {}", e));
                    }
                }
                
                if downloaded {
                    break;
                }
            }

            if !downloaded {
                return Err(format!("Failed to download authlib-injector from any mirror. Last error: {}", last_error));
            }
        }
        args.push(format!("-javaagent:{}={}", injector_path.to_string_lossy(), server_url));
    }

    // Memory
    if let Some(min) = min_memory {
        args.push(format!("-Xms{}M", min));
    }
    if let Some(max) = max_memory {
        args.push(format!("-Xmx{}M", max));
    }

    // Custom JVM Args
    if let Some(custom_args) = jvm_args {
        args.extend(custom_args);
    }

    // Parse JVM Arguments from JSON (Critical for Forge/NeoForge 1.17+)
    let mut json_jvm_args = Vec::new();
    
    let parse_jvm_args = |json_obj: &serde_json::Value, args_vec: &mut Vec<String>| {
        if let Some(args_node) = json_obj.get("arguments") {
            if let Some(jvm_node) = args_node.get("jvm") {
                 if let Some(list) = jvm_node.as_array() {
                     for item in list {
                         if let Some(s) = item.as_str() {
                             args_vec.push(s.to_string());
                         } else if let Some(obj) = item.as_object() {
                             // Check rules
                             let mut allowed = false; // Default to false if rules exist
                             if let Some(rules) = obj.get("rules").and_then(|r| r.as_array()) {
                                 for rule in rules {
                                     let action = rule["action"].as_str().unwrap_or("disallow");
                                     let mut os_match = true;
                                     if let Some(os) = rule.get("os").and_then(|v| v.as_object()) {
                                         if let Some(name) = os.get("name").and_then(|v| v.as_str()) {
                                             let current_os = if cfg!(target_os = "windows") { "windows" } else if cfg!(target_os = "macos") { "osx" } else { "linux" };
                                             if name != current_os {
                                                 os_match = false;
                                             }
                                         }
                                         if let Some(arch) = os.get("arch").and_then(|v| v.as_str()) {
                                             let current_arch = if cfg!(target_arch = "x86") { "x86" } else { "x64" }; // Simplified
                                             if arch != current_arch {
                                                 os_match = false;
                                             }
                                         }
                                     }
                                     if os_match {
                                         allowed = action == "allow";
                                     }
                                 }
                             } else {
                                 allowed = true; // No rules = allow
                             }

                             if allowed {
                                 if let Some(val) = obj.get("value") {
                                     if let Some(s) = val.as_str() {
                                         args_vec.push(s.to_string());
                                     } else if let Some(arr) = val.as_array() {
                                         for v in arr {
                                             if let Some(s) = v.as_str() {
                                                 args_vec.push(s.to_string());
                                             }
                                         }
                                     }
                                 }
                             }
                         }
                     }
                 }
            }
        }
    };

    // Process grandparent JVM args first
    if let Some(gp_json) = &grandparent_json {
        parse_jvm_args(gp_json, &mut json_jvm_args);
    }
    // Process parent JVM args
    if let Some(p_json) = &parent_json {
        parse_jvm_args(p_json, &mut json_jvm_args);
    }
    // Process current JVM args
    parse_jvm_args(&json, &mut json_jvm_args);

    let cp_separator = if cfg!(target_os = "windows") { ";" } else { ":" };
    let jar_path_str = jar_path.to_string_lossy().to_string();
    let is_module_launch = json_jvm_args.iter().any(|arg| arg == "-p" || arg == "--module-path" || arg == "--add-modules");
    let classpath_entries: Vec<String> = if is_module_launch {
        classpath.iter().filter(|p| *p != &jar_path_str).cloned().collect()
    } else {
        classpath.clone()
    };
    let classpath_str = classpath_entries.join(cp_separator);
    let module_path_str = classpath_entries.join(cp_separator);

    // If no JVM args found in JSON, use defaults (Old versions or Vanilla 1.13+ without explicit JVM args)
    if json_jvm_args.is_empty() {
        args.push(format!("-Djava.library.path={}", natives_dir.to_string_lossy()));
        args.push("-cp".to_string());
        args.push(classpath_str);
    } else {
        // Process placeholders in JSON JVM args
        let mut replaced_jvm_args: Vec<String> = Vec::new();
        for arg in json_jvm_args {
            let use_module_path = matches!(replaced_jvm_args.last().map(|s| s.as_str()), Some("-p") | Some("--module-path"));
            let classpath_value = if use_module_path { &module_path_str } else { &classpath_str };

            let replaced = arg
                .replace("${natives_directory}", &natives_dir.to_string_lossy())
                .replace("${library_directory}", &lib_dir.to_string_lossy())
                .replace("${launcher_name}", "AnchorMCLuncher")
                .replace("${launcher_version}", "1.0")
                .replace("${classpath}", classpath_value)
                .replace("${classpath_separator}", cp_separator)
                .replace("${version_name}", &version_id)
                .replace("${version_type}", "release");
            
            // Fix for FabricMcEmu argument having spaces
            // Some versions of Fabric/Loader might have a malformed argument in their json or it's parsed incorrectly
            // Specifically: "-DFabricMcEmu= net.minecraft.client.main.Main "
            // We should trim the value part if it looks like a property
            if replaced.starts_with("-D") && replaced.contains('=') {
                let parts: Vec<&str> = replaced.splitn(2, '=').collect();
                if parts.len() == 2 {
                    let key = parts[0];
                    let val = parts[1].trim();
                    replaced_jvm_args.push(format!("{}={}", key, val));
                    continue;
                }
            }

            replaced_jvm_args.push(replaced);
        }

        args.extend(replaced_jvm_args);
    }

    args.push(main_class.to_string());
    
    // Game Arguments Parsing
    let mut game_args = Vec::new();
    
    let has_custom_resolution = width.is_some() || height.is_some();
    let feature_flags: std::collections::HashMap<&str, bool> = [
        ("is_demo_user", false),
        ("has_custom_resolution", has_custom_resolution),
        ("quickPlayPath", false),
        ("quickPlaySingleplayer", false),
        ("quickPlayMultiplayer", false),
        ("quickPlayRealms", false)
    ]
    .into_iter()
    .collect();

    let parse_args = |json_obj: &serde_json::Value, args_vec: &mut Vec<String>| {
        if let Some(args_node) = json_obj.get("arguments") {
            // New format (1.13+)
            if let Some(game_node) = args_node.get("game") {
                 if let Some(list) = game_node.as_array() {
                     for item in list {
                         if let Some(s) = item.as_str() {
                             args_vec.push(s.to_string());
                         } else if let Some(obj) = item.as_object() {
                             let mut allowed = true;
                             if let Some(rules) = obj.get("rules").and_then(|r| r.as_array()) {
                                 allowed = false;
                                 for rule in rules {
                                     let action = rule["action"].as_str().unwrap_or("disallow");
                                     let mut os_match = true;
                                     let mut features_match = true;
                                     if let Some(os) = rule.get("os").and_then(|v| v.as_object()) {
                                         if let Some(name) = os.get("name").and_then(|v| v.as_str()) {
                                             let current_os = if cfg!(target_os = "windows") { "windows" } else if cfg!(target_os = "macos") { "osx" } else { "linux" };
                                             if name != current_os {
                                                 os_match = false;
                                             }
                                         }
                                         if let Some(arch) = os.get("arch").and_then(|v| v.as_str()) {
                                             let current_arch = if cfg!(target_arch = "x86") { "x86" } else { "x64" };
                                             if arch != current_arch {
                                                 os_match = false;
                                             }
                                         }
                                     }
                                     if let Some(features) = rule.get("features").and_then(|v| v.as_object()) {
                                         for (key, value) in features {
                                             if let Some(expected) = value.as_bool() {
                                                 let actual = *feature_flags.get(key.as_str()).unwrap_or(&false);
                                                 if actual != expected {
                                                     features_match = false;
                                                     break;
                                                 }
                                             }
                                         }
                                     }
                                     if os_match && features_match {
                                         allowed = action == "allow";
                                     }
                                 }
                             }

                             if allowed {
                                 if let Some(val) = obj.get("value") {
                                     if let Some(s) = val.as_str() {
                                         args_vec.push(s.to_string());
                                     } else if let Some(arr) = val.as_array() {
                                         for v in arr {
                                             if let Some(s) = v.as_str() {
                                                 args_vec.push(s.to_string());
                                             }
                                         }
                                     }
                                 }
                             }
                         }
                     }
                 }
            }
        } else if let Some(mc_args) = json_obj.get("minecraftArguments").and_then(|v| v.as_str()) {
            // Old format
            for arg in mc_args.split_whitespace() {
                args_vec.push(arg.to_string());
            }
        }
    };

    // Process grandparent args first (if any)
    if let Some(gp_json) = &grandparent_json {
        parse_args(gp_json, &mut game_args);
    }
    // Process parent args
    if let Some(p_json) = &parent_json {
        parse_args(p_json, &mut game_args);
    }
    // Process current args
    parse_args(&json, &mut game_args);

    // Resolution (only add if not already provided by version args)
    let has_width_arg = game_args.iter().any(|arg| arg == "--width");
    let has_height_arg = game_args.iter().any(|arg| arg == "--height");
    if let Some(w) = width {
        if !has_width_arg {
            game_args.push("--width".to_string());
            game_args.push(w.to_string());
        }
    }
    if let Some(h) = height {
        if !has_height_arg {
            game_args.push("--height".to_string());
            game_args.push(h.to_string());
        }
    }

    // Server Auto-Connect
    if let Some(ip) = server_ip {
        game_args.push("--server".to_string());
        game_args.push(ip);
    }
    if let Some(port) = server_port {
        game_args.push("--port".to_string());
        game_args.push(port.to_string());
    }

    // Fallback if no args found (should not happen for valid JSON, but just in case)
    if game_args.is_empty() {
        game_args.push("--version".to_string());
        game_args.push("${version_name}".to_string());
        game_args.push("--gameDir".to_string());
        game_args.push("${game_directory}".to_string());
        game_args.push("--assetsDir".to_string());
        game_args.push("${assets_root}".to_string());
        game_args.push("--assetIndex".to_string());
        game_args.push("${assets_index_name}".to_string());
        game_args.push("--username".to_string());
        game_args.push("${auth_player_name}".to_string());
        game_args.push("--accessToken".to_string());
        game_args.push("${auth_access_token}".to_string());
        game_args.push("--uuid".to_string());
        game_args.push("${auth_uuid}".to_string());
        game_args.push("--userType".to_string());
        game_args.push("${user_type}".to_string());
    }

    // Replacements
    let mut asset_index_id = json.get("assetIndex").and_then(|ai| ai.get("id")).and_then(|i| i.as_str()).unwrap_or("").to_string();
    if asset_index_id.is_empty() {
        if let Some(p_json) = &parent_json {
             asset_index_id = p_json.get("assetIndex").and_then(|ai| ai.get("id")).and_then(|i| i.as_str()).unwrap_or("").to_string();
        }
    }
    if asset_index_id.is_empty() {
        if let Some(gp_json) = &grandparent_json {
            asset_index_id = gp_json.get("assetIndex").and_then(|ai| ai.get("id")).and_then(|i| i.as_str()).unwrap_or("").to_string();
        }
    }
    
    let (username, uuid, access_token, user_type) = if let Some(acc) = account {
        (acc.username, acc.uuid, acc.access_token, acc.user_type)
    } else {
        ("Player".to_string(), "00000000-0000-0000-0000-000000000000".to_string(), "00000000-0000-0000-0000-000000000000".to_string(), "mojang".to_string())
    };

    let client_id = "0".to_string();
    let auth_xuid = "0".to_string();

    // Determine Game Directory (Isolation)
    let final_game_dir = crate::version_path::get_game_working_dir(&app, &version_id, game_path.clone(), isolated)?;
    if !final_game_dir.exists() {
        std::fs::create_dir_all(&final_game_dir).map_err(|e| e.to_string())?;
    }

    if let Err(e) = apply_override_folders(&final_game_dir) {
        println!("Warning: Failed to apply override folders: {}", e);
    }

    let resolution_width = width.map(|w| w.to_string());
    let resolution_height = height.map(|h| h.to_string());

    for arg in game_args {
        let replaced = arg
            .replace("${auth_player_name}", &username)
            .replace("${version_name}", &version_id)
            .replace("${game_directory}", &final_game_dir.to_string_lossy())
            .replace("${assets_root}", &mc_dir.join("assets").to_string_lossy())
            .replace("${assets_index_name}", &asset_index_id)
            .replace("${auth_uuid}", &uuid)
            .replace("${auth_access_token}", &access_token)
            .replace("${user_type}", &user_type)
            .replace("${version_type}", "release")
            .replace("${user_properties}", "{}")
            .replace("${clientid}", &client_id)
            .replace("${auth_xuid}", &auth_xuid);

        let replaced = match (&resolution_width, &resolution_height) {
            (Some(w), Some(h)) => replaced
                .replace("${resolution_width}", w)
                .replace("${resolution_height}", h),
            (Some(w), None) => replaced.replace("${resolution_width}", w),
            (None, Some(h)) => replaced.replace("${resolution_height}", h),
            (None, None) => replaced,
        };

        if replaced.contains("${resolution_width}") || replaced.contains("${resolution_height}") {
            continue;
        }
        
        args.push(replaced);
    }
    
    for arg in args.iter_mut() {
        if arg.contains("${classpath_separator}") {
            *arg = arg.replace("${classpath_separator}", cp_separator);
        }
        if arg.contains("${version_name}") {
            *arg = arg.replace("${version_name}", &version_id);
        }
        if arg.contains("${version_type}") {
            *arg = arg.replace("${version_type}", "release");
        }
    }

    let _ = app.emit("launch-status", "Launching game process...");

    println!("Launch args: {:?}", args);

    // Spawn process
    // Assuming 'java' is in PATH
    let mut child = Command::new(&java_bin)
        .args(&args)
        .current_dir(&final_game_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let app_handle = app.clone();
    if let Some(stdout) = child.stdout.take() {
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(l) = line {
                    println!("[GAME] {}", l);
                    let _ = app_handle.emit("game-output", l);
                }
            }
        });
    }

    let app_handle = app.clone();
    if let Some(stderr) = child.stderr.take() {
        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(l) = line {
                    eprintln!("[GAME ERR] {}", l);
                    let _ = app_handle.emit("game-output", format!("[ERR] {}", l));
                }
            }
        });
    }

    // Monitor exit in a separate thread to not block the command return
    let app_handle = app.clone();
    thread::spawn(move || {
        match child.wait() {
            Ok(status) => {
                if !status.success() {
                    let _ = app_handle.emit("game-exit", format!("Game exited with error code: {:?}", status.code()));
                } else {
                    let _ = app_handle.emit("game-exit", "Game exited successfully".to_string());
                }
            }
            Err(e) => {
                let _ = app_handle.emit("game-exit", format!("Failed to wait for game process: {}", e));
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn list_installed_versions(app: AppHandle, game_path: Option<String>) -> Result<Vec<String>, String> {
    let mc_dir = crate::version_path::get_game_root(&app, game_path.clone())?;

    let versions_dir = mc_dir.join("versions");
    if !versions_dir.exists() {
        return Ok(Vec::new());
    }

    let mut versions = Vec::new();
    let entries = std::fs::read_dir(versions_dir).map_err(|e| e.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            if let Some(name) = path.file_name() {
                if let Some(name_str) = name.to_str() {
                    // Check if json exists to confirm it's a valid version
                    if path.join(format!("{}.json", name_str)).exists() {
                        versions.push(name_str.to_string());
                    }
                }
            }
        }
    }

    Ok(versions)
}

#[tauri::command]
pub fn delete_version(app: AppHandle, version_id: String, game_path: Option<String>) -> Result<(), String> {
    let version_dir = crate::version_path::get_version_dir(&app, &version_id, game_path)?;
    if !version_dir.exists() {
        return Err(format!("Version {} not found", version_id));
    }

    std::fs::remove_dir_all(&version_dir).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn package_local_version(app: AppHandle, version_id: String, game_path: Option<String>, _enable_isolation: Option<bool>) -> Result<Vec<u8>, String> {
    // Determine isolation from config
    let details = get_version_details(app.clone(), version_id.clone(), game_path.clone())?;
    let config = crate::config::load_config();
    let isolated = crate::config::should_isolate(&config.isolation_mode, details.is_modded, &details.version_type);
    let version_dir = crate::version_path::get_version_dir(&app, &version_id, game_path.clone())?;

    if !version_dir.exists() {
        return Err(format!("Version {} not found", version_id));
    }

    // Create a temporary zip file in memory
    let mut buffer = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buffer));
        let options = zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        // 1. Add version directory content (json, jar)
        // We only need the json and jar for the version itself, libraries are usually global but for a modpack we might want to include them?
        // The requirement says "package local version into modpack format".
        // Usually this means: mods, config, and the version json.
        // Let's include:
        // - versions/{id}/{id}.json
        // - versions/{id}/{id}.jar (if exists)
        // - mods/ (if exists)
        // - config/ (if exists)
        
        // Add version files
        for entry in std::fs::read_dir(&version_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_file() {
                let name = path.file_name().unwrap().to_string_lossy();
                zip.start_file(format!("versions/{}/{}", version_id, name), options).map_err(|e| e.to_string())?;
                let mut f = std::fs::File::open(&path).map_err(|e| e.to_string())?;
                std::io::copy(&mut f, &mut zip).map_err(|e| e.to_string())?;
            }
        }

        // Add mods folder
        let mods_dir = crate::version_path::get_mods_dir(&app, &version_id, game_path.clone(), isolated)?;
        if mods_dir.exists() {
            for entry in std::fs::read_dir(&mods_dir).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                let path = entry.path();
                if path.is_file() {
                    let name = path.file_name().unwrap().to_string_lossy();
                    zip.start_file(format!("mods/{}", name), options).map_err(|e| e.to_string())?;
                    let mut f = std::fs::File::open(&path).map_err(|e| e.to_string())?;
                    std::io::copy(&mut f, &mut zip).map_err(|e| e.to_string())?;
                }
            }
        }

        // Add config folder
        let config_dir = crate::version_path::get_config_dir(&app, &version_id, game_path.clone(), isolated)?;
        if config_dir.exists() {
             // Recursive add? For simplicity just top level files for now or use a walker
             // Let's use a simple walker for config as it can be nested
             let walk = walkdir::WalkDir::new(&config_dir);
             for entry in walk {
                 let entry = entry.map_err(|e| e.to_string())?;
                 let path = entry.path();
                 if path.is_file() {
                     let relative = path.strip_prefix(&config_dir).map_err(|e| e.to_string())?;
                     let relative_str = format!("config/{}", relative.to_string_lossy().replace('\\', "/"));
                     zip.start_file(relative_str, options).map_err(|e| e.to_string())?;
                     let mut f = std::fs::File::open(path).map_err(|e| e.to_string())?;
                     std::io::copy(&mut f, &mut zip).map_err(|e| e.to_string())?;
                 }
             }
        }

        zip.finish().map_err(|e| e.to_string())?;
    }

    Ok(buffer)
}

#[derive(Clone, Copy)]
enum PackFormat {
    Modrinth,
    Curseforge,
}

fn parse_pack_format(value: Option<String>) -> PackFormat {
    let normalized = value.unwrap_or_else(|| "curseforge".to_string()).to_lowercase();
    match normalized.as_str() {
        "modrinth" | "mrpack" => PackFormat::Modrinth,
        "curseforge" | "curse" | "cf" => PackFormat::Curseforge,
        _ => PackFormat::Curseforge,
    }
}

fn add_dir_to_zip(zip: &mut zip::ZipWriter<std::fs::File>, dir: &PathBuf, prefix: &str) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }

    let options = zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for entry in WalkDir::new(dir).into_iter().flatten() {
        let path = entry.path();
        if !entry.file_type().is_file() {
            continue;
        }

        let rel = path.strip_prefix(dir).map_err(|e| e.to_string())?;
        let rel_str = rel.to_string_lossy().replace('\\', "/");
        let zip_path = format!("{}/{}", prefix.trim_end_matches('/'), rel_str);
        zip.start_file(zip_path, options).map_err(|e| e.to_string())?;
        let mut f = std::fs::File::open(path).map_err(|e| e.to_string())?;
        std::io::copy(&mut f, zip).map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn build_modpack_archive(
    app: AppHandle,
    version_id: String,
    game_path: Option<String>,
    enable_isolation: Option<bool>,
    dest_path: &PathBuf,
    format: PackFormat,
) -> Result<(), String> {
    let details = get_version_details(app.clone(), version_id.clone(), game_path.clone())?;
    let config = crate::config::load_config();
    let isolated = enable_isolation.unwrap_or_else(|| crate::config::should_isolate(&config.isolation_mode, details.is_modded, &details.version_type));

    let mods_dir = crate::version_path::get_mods_dir(&app, &version_id, game_path.clone(), isolated)?;
    let config_dir = crate::version_path::get_config_dir(&app, &version_id, game_path.clone(), isolated)?;

    let file = std::fs::File::create(dest_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let runtime = get_version_runtime_info(app.clone(), version_id.clone(), game_path.clone()).unwrap_or(VersionRuntimeInfo {
        mc_version: None,
        loader_type: None,
        loader_version: None,
    });

    if matches!(format, PackFormat::Modrinth) {
        let mut deps = serde_json::Map::new();
        if let Some(mc) = runtime.mc_version.clone() {
            deps.insert("minecraft".to_string(), json!(mc));
        }
        if let Some(loader) = runtime.loader_type.clone() {
            let key = match loader.as_str() {
                "fabric" => "fabric-loader",
                "quilt" => "quilt-loader",
                "forge" => "forge",
                "neoforge" => "neoforge",
                _ => "",
            };
            if !key.is_empty() {
                let value = runtime.loader_version.clone().unwrap_or_else(|| "".to_string());
                deps.insert(key.to_string(), json!(value));
            }
        }

        let index = json!({
            "formatVersion": 1,
            "game": "minecraft",
            "versionId": version_id,
            "name": version_id,
            "summary": "",
            "files": [],
            "dependencies": deps
        });

        zip.start_file("modrinth.index.json", options).map_err(|e| e.to_string())?;
        let data = serde_json::to_vec_pretty(&index).map_err(|e| e.to_string())?;
        zip.write_all(&data).map_err(|e| e.to_string())?;
    } else {
        let mut mod_loaders = Vec::new();
        if let Some(loader) = runtime.loader_type.clone() {
            if let Some(ver) = runtime.loader_version.clone() {
                let id = match loader.as_str() {
                    "fabric" => format!("fabric-{}", ver),
                    "quilt" => format!("quilt-{}", ver),
                    "forge" => format!("forge-{}", ver),
                    "neoforge" => format!("neoforge-{}", ver),
                    _ => "".to_string(),
                };
                if !id.is_empty() {
                    mod_loaders.push(json!({ "id": id, "primary": true }));
                }
            }
        }

        let manifest = json!({
            "manifestType": "minecraftModpack",
            "manifestVersion": 1,
            "name": version_id,
            "version": "1.0.0",
            "author": "AMCLauncher",
            "files": [],
            "overrides": "overrides",
            "minecraft": {
                "version": runtime.mc_version.unwrap_or_else(|| "".to_string()),
                "modLoaders": mod_loaders
            }
        });

        zip.start_file("manifest.json", options).map_err(|e| e.to_string())?;
        let data = serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?;
        zip.write_all(&data).map_err(|e| e.to_string())?;
    }

    add_dir_to_zip(&mut zip, &mods_dir, "overrides/mods")?;
    add_dir_to_zip(&mut zip, &config_dir, "overrides/config")?;

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn export_modpack(
    app: AppHandle,
    version_id: String,
    game_path: Option<String>,
    dest_path: String,
    pack_format: Option<String>,
    enable_isolation: Option<bool>
) -> Result<(), String> {
    let format = parse_pack_format(pack_format);
    let dest = PathBuf::from(dest_path);
    build_modpack_archive(app, version_id, game_path, enable_isolation, &dest, format)
}

#[derive(serde::Deserialize)]
struct UploadResponse {
    filename: String,
}

#[tauri::command]
pub async fn package_and_upload_local_version(
    app: AppHandle,
    version_id: String,
    game_path: Option<String>,
    upload_url: String,
    token: Option<String>,
    pack_format: Option<String>,
    enable_isolation: Option<bool>
) -> Result<String, String> {
    let format = parse_pack_format(pack_format);
    let ext = if matches!(format, PackFormat::Modrinth) { "mrpack" } else { "zip" };

    // 1. Create a temporary file
    let temp_dir = std::env::temp_dir();
    let temp_file_path = temp_dir.join(format!("{}-modpack.{}", version_id, ext));
    build_modpack_archive(app.clone(), version_id.clone(), game_path.clone(), enable_isolation, &temp_file_path, format)?;

    // 2. Upload the file
    let client = reqwest::Client::new();
    
    // Read file content
    let file_content = std::fs::read(&temp_file_path).map_err(|e| e.to_string())?;
    let part = reqwest::multipart::Part::bytes(file_content)
        .file_name(format!("{}-modpack.{}", version_id, ext))
        .mime_str("application/zip")
        .map_err(|e| e.to_string())?;

    let form = reqwest::multipart::Form::new()
        .text("type", "modpack")
        .part("file", part);

    let mut request = client.post(&upload_url)
        .multipart(form);

    if let Some(t) = token {
        request = request.header("Authorization", format!("Bearer {}", t));
    }

    let response = request.send().await.map_err(|e| e.to_string())?;
    let status = response.status();

    if !status.is_success() {
        let detail = response.text().await.unwrap_or_default();
        if detail.trim().is_empty() {
            return Err(format!("Upload failed with status: {}", status));
        }
        return Err(format!("Upload failed with status: {}: {}", status, detail));
    }

    let result: UploadResponse = response.json().await.map_err(|e| e.to_string())?;

    // Clean up temp file
    let _ = std::fs::remove_file(temp_file_path);

    Ok(result.filename)
}

#[derive(serde::Deserialize)]
struct ModrinthIndex {
    name: String,
    files: Vec<ModrinthFile>,
    dependencies: std::collections::HashMap<String, String>,
}
#[derive(serde::Deserialize)]
struct ModrinthFile {
    path: String,
    downloads: Vec<String>,
}

fn find_installed_loader_version(
    mc_dir: &PathBuf,
    loader_type: &str,
    mc_ver: &str,
    loader_ver: &str
) -> Option<String> {
    let versions_dir = mc_dir.join("versions");
    if !versions_dir.exists() {
        return None;
    }

    let mut best: Option<(SystemTime, String)> = None;

    if let Ok(entries) = std::fs::read_dir(versions_dir) {
        for entry in entries.flatten() {
            let dir_path = entry.path();
            if !dir_path.is_dir() {
                continue;
            }
            let dir_name = entry.file_name().to_string_lossy().to_string();
            let json_path = dir_path.join(format!("{}.json", dir_name));
            if !json_path.exists() {
                continue;
            }

            let Ok(file) = std::fs::File::open(&json_path) else { continue; };
            let Ok(json): Result<serde_json::Value, _> = serde_json::from_reader(file) else { continue; };
            let Some(id) = json.get("id").and_then(|v| v.as_str()) else { continue; };

            let type_match = match loader_type {
                "forge" => id.contains("forge"),
                "neoforge" => id.contains("neoforge"),
                _ => false
            };

            if !type_match {
                continue;
            }

            if !id.contains(mc_ver) || !id.contains(loader_ver) {
                continue;
            }

            let modified = entry.metadata().and_then(|m| m.modified()).unwrap_or(SystemTime::UNIX_EPOCH);
            if best.as_ref().map(|(t, _)| modified > *t).unwrap_or(true) {
                best = Some((modified, id.to_string()));
            }
        }
    }

    best.map(|(_, id)| id)
}

#[tauri::command]
pub async fn import_modpack(
    app: AppHandle,
    path: String,
    token: Option<String>,
    _enable_isolation: Option<bool>,
    custom_name: Option<String>,
    task_id: Option<String>,
    game_path: Option<String>
) -> Result<(), String> {
    // Determine isolation from config (Assume modpack is modded)
    let config = crate::config::load_config();
    let isolated = crate::config::should_isolate(&config.isolation_mode, true, "release");

    let mut zip_path = PathBuf::from(&path);
    let temp_dir = std::env::temp_dir();
    let mut temp_file_path = None;

    if path.starts_with("http") {
        let _ = app.emit("download-progress", crate::downloader::DownloadProgress {
            task_id: task_id.clone(),
            version_id: "Modpack".to_string(),
            total_files: 1,
            downloaded_files: 0,
            current_file: "Downloading modpack...".to_string(),
            percent: 0.0,
            current_file_progress: None,
            current_file_downloaded: None,
            current_file_total: None,
        });

        let client = reqwest::Client::new();
        let mut req = client.get(&path);
        if let Some(t) = token {
            req = req.header("Authorization", format!("Bearer {}", t));
        }
        let resp = req.send().await.map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("Failed to download modpack: {}", resp.status()));
        }
        let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
        
        let file_name = path.split('/').last().unwrap_or("modpack.zip");
        let p = temp_dir.join(file_name);
        std::fs::write(&p, bytes).map_err(|e| e.to_string())?;
        zip_path = p.clone();
        temp_file_path = Some(p);
    }

    let mc_dir = crate::version_path::get_game_root(&app, game_path)?;
    let file = std::fs::File::open(&zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    // Check for modrinth.index.json
    let is_mrpack = archive.by_name("modrinth.index.json").is_ok();

    if is_mrpack {
        let _ = app.emit("download-progress", crate::downloader::DownloadProgress {
            task_id: task_id.clone(),
            version_id: "Modpack".to_string(),
            total_files: 100,
            downloaded_files: 0,
            current_file: "Reading Modrinth Index...".to_string(),
            percent: 0.0,
            current_file_progress: None,
            current_file_downloaded: None,
            current_file_total: None,
        });

        let index_content = {
            let mut file = archive.by_name("modrinth.index.json").map_err(|e| e.to_string())?;
            let mut content = String::new();
            file.read_to_string(&mut content).map_err(|e| e.to_string())?;
            content
        };
        let index: ModrinthIndex = serde_json::from_str(&index_content).map_err(|e| e.to_string())?;
        let version_id = custom_name.clone().unwrap_or(index.name.clone());
        
        // Determine target root for modpack files (mods, config, etc.)
        let target_root = if isolated {
            mc_dir.join("versions").join(&version_id)
        } else {
            mc_dir.clone()
        };

        // 1. Download files from index
        let mut queue = Vec::new();
        for file in index.files {
            if let Some(url) = file.downloads.first() {
                // file.path is like "mods/fabric-api.jar"
                let path = target_root.join(&file.path);
                queue.push((url.clone(), path, None));
            }
        }

        // 2. Extract overrides
        let total_files = archive.len();
        for i in 0..total_files {
            if i % 10 == 0 {
                 let _ = app.emit("download-progress", crate::downloader::DownloadProgress {
                    task_id: task_id.clone(),
                    version_id: "Modpack".to_string(),
                    total_files: total_files,
                    downloaded_files: i,
                    current_file: "Extracting overrides...".to_string(),
                    percent: (i as f64 / total_files as f64) * 100.0,
                    current_file_progress: None,
                    current_file_downloaded: None,
                    current_file_total: None,
                });
            }

            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            let path = file.mangled_name();
            let path_str = path.to_string_lossy();
            
            if path_str.starts_with("overrides/") {
                let relative_path = path_str.strip_prefix("overrides/").unwrap();
                if relative_path.is_empty() { continue; }
                
                let out_path = target_root.join(relative_path);
                if file.is_dir() {
                    std::fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
                } else {
                    if let Some(p) = out_path.parent() {
                        std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
                    }
                    let mut outfile = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
                    std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
                }
            }
        }

        // 3. Install Loader (Fabric/Forge)
        // Dependencies: {"minecraft": "1.20.1", "fabric-loader": "0.14.21"}
        let client = reqwest::Client::new();
        let mut parent_version_id = None;
        let mut loader_install: Option<(String, String)> = None;
        let mut mc_version: Option<String> = None;
        let mut loader_kind: Option<String> = None;

        if let Some(mc_ver) = index.dependencies.get("minecraft") {
            mc_version = Some(mc_ver.to_string());
            // Download vanilla
            if let Ok((vanilla_queue, _)) = crate::downloader::prepare_vanilla_downloads(&client, mc_ver, &mc_dir).await {
                queue.extend(vanilla_queue);
            }

            if let Some(fabric_ver) = index.dependencies.get("fabric-loader") {
                 if let Ok((loader_queue, loader_id)) = crate::downloader::prepare_fabric_downloads(&client, mc_ver, fabric_ver, &mc_dir).await {
                     queue.extend(loader_queue);
                     parent_version_id = Some(loader_id);
                     loader_kind = Some("fabric".to_string());
                 }
            } else if let Some(neoforge_ver) = index.dependencies.get("neoforge") {
                loader_install = Some(("neoforge".to_string(), neoforge_ver.to_string()));
                loader_kind = Some("neoforge".to_string());
            } else if let Some(forge_ver) = index.dependencies.get("forge") {
                loader_install = Some(("forge".to_string(), forge_ver.to_string()));
                loader_kind = Some("forge".to_string());
            }
        }

        crate::downloader::download_files(&app, "Modpack", queue, task_id.clone()).await?;

        if let (Some(mc_ver), Some((loader_type, loader_ver))) = (mc_version.as_deref(), loader_install) {
            crate::downloader::install_forge_or_neoforge(
                &app,
                &client,
                mc_ver,
                &loader_type,
                &loader_ver,
                &mc_dir,
                None,
                task_id.clone(),
            )
            .await?;

            let detected = find_installed_loader_version(&mc_dir, &loader_type, mc_ver, &loader_ver);
            parent_version_id = detected;
            if parent_version_id.is_none() {
                return Err(format!(
                    "{} installer finished but no version json found (mc={}, loader={})",
                    loader_type,
                    mc_ver,
                    loader_ver
                ));
            }
        }

        // 4. Create Modpack Version JSON
        // If we have a parent version (loader), we create a JSON that inherits from it.
        // This allows the launcher to see "ModpackName" as a version and launch it using the loader.
        if let Some(parent_id) = parent_version_id {
            let modpack_json_path = target_root.join(format!("{}.json", version_id));
            
            // If isolated, target_root is versions/ModpackName.
            // If not isolated, target_root is .minecraft. But we still need a version json in versions/ModpackName?
            // Actually, if not isolated, we just dumped mods into .minecraft/mods.
            // But usually modpacks are isolated.
            
            if isolated {
                let mut json_content = serde_json::json!({
                    "id": version_id,
                    "inheritsFrom": parent_id,
                    "type": "modpack",
                    "libraries": []
                });

                if loader_kind.as_deref() == Some("fabric") {
                    json_content["mainClass"] = serde_json::Value::String("net.fabricmc.loader.impl.launch.knot.KnotClient".to_string());
                }
                // Note: mainClass might be redundant if inheritsFrom works correctly, but good to have.
                // Actually, fabric loader json has the mainClass.
                
                let _ = std::fs::write(&modpack_json_path, serde_json::to_string_pretty(&json_content).unwrap());
            }
        } else {
            // If no loader was installed (e.g. vanilla modpack?), we still need a version json if isolated
             if isolated {
                 // Try to find vanilla version
                 if let Some(mc_ver) = index.dependencies.get("minecraft") {
                     let json_content = serde_json::json!({
                        "id": version_id,
                        "inheritsFrom": mc_ver,
                        "type": "modpack",
                        "libraries": []
                    });
                    let modpack_json_path = target_root.join(format!("{}.json", version_id));
                    let _ = std::fs::write(&modpack_json_path, serde_json::to_string_pretty(&json_content).unwrap());
                 }
             }
        }

    } else {
        // Legacy Zip Import (Existing Logic)
        let _ = app.emit("download-progress", crate::downloader::DownloadProgress {
            task_id: task_id.clone(),
            version_id: "Modpack".to_string(),
            total_files: archive.len(),
            downloaded_files: 0,
            current_file: "Scanning...".to_string(),
            percent: 0.0,
            current_file_progress: None,
            current_file_downloaded: None,
            current_file_total: None,
        });

        // 1. Scan for version ID
        let mut imported_version_id = None;
        let mut version_json_path_in_zip = None;

        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            let path = file.mangled_name();
            let path_str = path.to_string_lossy().to_string();

            if path_str.ends_with(".json") {
                // Skip client_config.json
                if path_str.contains("client_config.json") { continue; }

                let mut content = String::new();
                if file.read_to_string(&mut content).is_ok() {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                        if let Some(id) = json.get("id").and_then(|v| v.as_str()) {
                            // Basic check if it's a version json
                            if json.get("libraries").is_some() || json.get("inheritsFrom").is_some() || json.get("type").is_some() || json.get("mainClass").is_some() {
                                imported_version_id = Some(id.to_string());
                                version_json_path_in_zip = Some(path_str);
                                break;
                            }
                        }
                    }
                }
            }
        }
        
        let version_id = custom_name.clone().or(imported_version_id.clone()).unwrap_or("unknown".to_string());
        
        // Determine target root for mods/config
        let target_root = if isolated && !version_id.is_empty() && version_id != "unknown" {
            mc_dir.join("versions").join(&version_id)
        } else {
            mc_dir.clone()
        };

        // 2. Extract files
        let _ = app.emit("download-progress", crate::downloader::DownloadProgress {
            task_id: task_id.clone(),
            version_id: "Modpack".to_string(),
            total_files: archive.len(),
            downloaded_files: 0,
            current_file: "Extracting...".to_string(),
            percent: 0.0,
            current_file_progress: None,
            current_file_downloaded: None,
            current_file_total: None,
        });

        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            let path = file.mangled_name();
            let path_str = path.to_string_lossy().to_string();
            let mut override_relative: Option<String> = None;

            if let Some(rel) = path_str.strip_prefix("overrides/") {
                if !rel.is_empty() {
                    override_relative = Some(rel.to_string());
                }
            } else if let Some(rel) = path_str.strip_prefix("client-overrides/") {
                if !rel.is_empty() {
                    override_relative = Some(rel.to_string());
                }
            } else if path_str.starts_with("server-overrides/") {
                continue;
            }

            let effective_path = if let Some(rel) = &override_relative {
                PathBuf::from(rel)
            } else {
                path.clone()
            };
            
            // Determine output path
            let out_path = if override_relative.is_none() && !version_id.is_empty() && version_id != "unknown" && Some(path_str.clone()) == version_json_path_in_zip {
                 mc_dir.join("versions").join(&version_id).join(format!("{}.json", version_id))
            } else if override_relative.is_none() && !version_id.is_empty() && version_id != "unknown" && custom_name.is_some() && path_str.ends_with(".jar") && version_json_path_in_zip.as_ref().map(|p| p.replace(".json", ".jar")) == Some(path_str.clone()) {
                 // Rename jar if it matches the json name
                 mc_dir.join("versions").join(&version_id).join(format!("{}.jar", version_id))
            } else if isolated && !version_id.is_empty() && version_id != "unknown" {
                if path_str.starts_with("assets/") || path_str.starts_with("libraries/") {
                    mc_dir.join(&effective_path)
                } else {
                    target_root.join(&effective_path)
                }
            } else {
                mc_dir.join(&effective_path)
            };
            
            if file.is_dir() {
                std::fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
            } else {
                if let Some(p) = out_path.parent() {
                    std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
                }

                // Special handling for version.json if we are renaming
                if !version_id.is_empty() && version_id != "unknown" && Some(path_str.clone()) == version_json_path_in_zip && custom_name.is_some() {
                     let mut content = String::new();
                     file.read_to_string(&mut content).map_err(|e| e.to_string())?;
                     if let Ok(mut json) = serde_json::from_str::<serde_json::Value>(&content) {
                         if let Some(obj) = json.as_object_mut() {
                             obj.insert("id".to_string(), serde_json::Value::String(version_id.clone()));
                         }
                         std::fs::write(&out_path, serde_json::to_string_pretty(&json).unwrap()).map_err(|e| e.to_string())?;
                     } else {
                         // Fallback if parse fails
                         std::fs::write(&out_path, content).map_err(|e| e.to_string())?;
                     }
                } else {
                    let mut outfile = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
                    std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
                }
            }
        }

        // 3. Resolve dependencies
        // Use the NEW version_id if renamed
        let final_version_id = version_id.clone();
        
        if !final_version_id.is_empty() && final_version_id != "unknown" {
            let _ = app.emit("download-progress", crate::downloader::DownloadProgress {
                task_id: task_id.clone(),
                version_id: final_version_id.clone(),
                total_files: 100,
                downloaded_files: 0,
                current_file: "Resolving dependencies...".to_string(),
                percent: 0.0,
                current_file_progress: None,
                current_file_downloaded: None,
                current_file_total: None,
            });

            let version_json_path = mc_dir.join("versions").join(&final_version_id).join(format!("{}.json", final_version_id));
            let file = std::fs::File::open(&version_json_path).map_err(|e| e.to_string())?;
            let json: serde_json::Value = serde_json::from_reader(file).map_err(|e| e.to_string())?;

            let client = reqwest::Client::new();
            let mut queue = Vec::new();

            // A. If it inherits from vanilla, download vanilla stuff
            if let Some(inherits_from) = json.get("inheritsFrom").and_then(|v| v.as_str()) {
                 if let Ok((vanilla_queue, _)) = crate::downloader::prepare_vanilla_downloads(&client, inherits_from, &mc_dir).await {
                     queue.extend(vanilla_queue);
                 }
            } else {
                 // Try to treat as vanilla
                 // If we renamed it, we can't use the new ID to fetch vanilla metadata unless it happens to match a vanilla version.
                 // But usually custom versions don't match vanilla IDs.
                 // If it has no inheritsFrom, it's likely a custom version that provides its own jar (which we hopefully renamed).
                 // But it might need assets.
                 // We should try to guess the assets index from the json.
                 
                 if let Some(assets) = json.get("assets").and_then(|v| v.as_str()) {
                      // Download assets index
                      // We need to know where to get it. Usually from version manifest.
                      // But we don't have the original version ID easily if we renamed it and it's not in json.
                      // Actually, if it's a custom version, it should have "assets" and "assetIndex".
                 }
                 
                 // If we can't determine vanilla version, we might skip vanilla downloads.
                 // But if it was originally "1.20.1" and we renamed to "MyServer", we lose the link to 1.20.1 metadata.
                 // Unless the json still contains "assets": "1.20.1".
                 
                 if let Some(assets_version) = json.get("assets").and_then(|v| v.as_str()) {
                      if let Ok((vanilla_queue, _)) = crate::downloader::prepare_vanilla_downloads(&client, assets_version, &mc_dir).await {
                          queue.extend(vanilla_queue);
                      }
                 }
            }

            // C. Check for client jar download in JSON (if missing from zip)
            if let Some(downloads) = json.get("downloads").and_then(|d| d.as_object()) {
                if let Some(client_artifact) = downloads.get("client") {
                    if let Some(url) = client_artifact.get("url").and_then(|u| u.as_str()) {
                        let jar_path = mc_dir.join("versions").join(&final_version_id).join(format!("{}.jar", final_version_id));
                        if !jar_path.exists() {
                            queue.push((url.to_string(), jar_path, None));
                        }
                    }
                }
            }

            // B. Download libraries from the imported JSON
            if let Some(libraries) = json.get("libraries").and_then(|l| l.as_array()) {
                for lib in libraries {
                    if should_use_library(lib) {
                         if let Some(downloads) = lib.get("downloads") {
                             if let Some(artifact) = downloads.get("artifact") {
                                 if let (Some(url), Some(path)) = (artifact.get("url").and_then(|u| u.as_str()), artifact.get("path").and_then(|p| p.as_str())) {
                                     let full_path = mc_dir.join("libraries").join(path);
                                     queue.push((url.to_string(), full_path, None));
                                 }
                             }
                         } else {
                             // Legacy
                             if let Some(name) = lib.get("name").and_then(|n| n.as_str()) {
                                 let parts: Vec<&str> = name.split(':').collect();
                                 if parts.len() >= 3 {
                                     let group = parts[0].replace('.', "/");
                                     let artifact = parts[1];
                                     let version = parts[2];
                                     let path = format!("{}/{}/{}/{}-{}.jar", group, artifact, version, artifact, version);
                                     let full_path = mc_dir.join("libraries").join(&path);
                                     let base_url = lib.get("url").and_then(|u| u.as_str()).unwrap_or("https://libraries.minecraft.net/");
                                     let url = format!("{}{}", base_url, path);
                                     queue.push((url, full_path, None));
                                 }
                             }
                         }
                    }
                }
            }

            // 3. Download everything
            crate::downloader::download_files(&app, &version_id, queue, task_id.clone()).await?;
        }
    }

    if let Some(p) = temp_file_path {
        let _ = std::fs::remove_file(p);
    }

    let _ = app.emit("download-progress", crate::downloader::DownloadProgress {
        task_id: task_id.clone(),
        version_id: "Modpack".to_string(),
        total_files: 100,
        downloaded_files: 100,
        current_file: "Import Complete".to_string(),
        percent: 100.0,
        current_file_progress: None,
        current_file_downloaded: None,
        current_file_total: None,
    });

    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize)]
struct ClientConfig {
    server_id: Option<i32>,
}

#[tauri::command]
pub fn find_client_for_server(app: AppHandle, server_id: i32, server_name: Option<String>, game_path: Option<String>) -> Option<String> {
    let mc_dir = if let Some(path) = game_path {
        PathBuf::from(path)
    } else {
        app.path().app_data_dir().ok()?.join(".minecraft")
    };

    let versions_dir = mc_dir.join("versions");
    if !versions_dir.exists() {
        return None;
    }

    // 1. Check for client_config.json (Legacy / Custom Clients)
    if let Ok(entries) = std::fs::read_dir(&versions_dir) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_dir() {
                    let version_name = entry.file_name().to_string_lossy().to_string();
                    let config_path = entry.path().join("client_config.json");
                    
                    if config_path.exists() {
                        if let Ok(file) = std::fs::File::open(config_path) {
                            if let Ok(config) = serde_json::from_reader::<_, ClientConfig>(file) {
                                if config.server_id == Some(server_id) {
                                    return Some(version_name);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Check for folder name matching server name (Modpacks)
    if let Some(name) = server_name {
        // Sanitize name if needed? The deployment uses the name directly.
        // We should check if a version with this ID exists.
        let version_dir = versions_dir.join(&name);
        let json_path = version_dir.join(format!("{}.json", name));
        
        if version_dir.exists() && version_dir.is_dir() && json_path.exists() {
            return Some(name);
        }
    }

    None
}

#[tauri::command]
pub fn set_client_server_id(app: AppHandle, version_id: String, server_id: i32, game_path: Option<String>) -> Result<(), String> {
    let mc_dir = if let Some(path) = game_path {
        PathBuf::from(path)
    } else {
        app.path().app_data_dir().map_err(|e| e.to_string())?.join(".minecraft")
    };

    let version_dir = mc_dir.join("versions").join(&version_id);
    if !version_dir.exists() {
        return Err(format!("Version {} not found", version_id));
    }

    let config_path = version_dir.join("client_config.json");
    
    let mut config = if config_path.exists() {
        let file = std::fs::File::open(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_reader(file).unwrap_or(ClientConfig { server_id: None })
    } else {
        ClientConfig { server_id: None }
    };

    config.server_id = Some(server_id);

    let file = std::fs::File::create(&config_path).map_err(|e| e.to_string())?;
    serde_json::to_writer_pretty(file, &config).map_err(|e| e.to_string())?;

    Ok(())
}
