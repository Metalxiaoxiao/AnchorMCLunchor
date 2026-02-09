use serde::{Deserialize, Serialize};
use tauri::{command, AppHandle, Manager};
use reqwest::Client;
use std::path::PathBuf;
use std::fs;

const MODRINTH_API_BASE: &str = "https://api.modrinth.com/v2";

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub hits: Vec<ProjectHit>,
    pub offset: u32,
    pub limit: u32,
    pub total_hits: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectHit {
    pub project_id: String,
    pub project_type: String,
    pub title: String,
    pub description: String,
    pub icon_url: Option<String>,
    pub author: String,
    pub follows: u32,
    pub downloads: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectVersion {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub version_number: String,
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    pub files: Vec<VersionFile>,
    pub dependencies: Option<Vec<VersionDependency>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VersionDependency {
    pub version_id: Option<String>,
    pub project_id: Option<String>,
    pub file_name: Option<String>,
    pub dependency_type: String, // required, optional, incompatible, embedded
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VersionFile {
    pub url: String,
    pub filename: String,
    pub primary: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub slug: String,
    pub project_type: String,
    pub team: String,
    pub title: String,
    pub description: String,
    pub body: String,
    pub body_url: Option<String>,
    pub published: String,
    pub updated: String,
    pub approved: Option<String>,
    pub status: String,
    pub client_side: String,
    pub server_side: String,
    pub downloads: u32,
    pub followers: u32,
    pub categories: Vec<String>,
    pub versions: Vec<String>,
    pub icon_url: Option<String>,
    pub issues_url: Option<String>,
    pub source_url: Option<String>,
    pub wiki_url: Option<String>,
    pub discord_url: Option<String>,
    pub donation_urls: Option<Vec<DonationUrl>>,
    pub gallery: Option<Vec<GalleryImage>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DonationUrl {
    pub id: String,
    pub platform: String,
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GalleryImage {
    pub url: String,
    pub featured: bool,
    pub title: Option<String>,
    pub description: Option<String>,
    pub created: String,
}

#[command]
pub async fn get_modrinth_project(project_id: String) -> Result<Project, String> {
    let client = Client::new();
    let url = format!("{}/project/{}", MODRINTH_API_BASE, project_id);
    
    let response = client.get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Modrinth API error: {}", response.status()));
    }

    let project: Project = response.json().await.map_err(|e| e.to_string())?;
    Ok(project)
}


#[command]
pub async fn search_modrinth(
    query: String, 
    project_type: String, 
    offset: u32, 
    limit: u32, 
    index: Option<String>,
    game_version: Option<String>,
    loader: Option<String>
) -> Result<SearchResult, String> {
    let client = Client::new();
    
    let mut facets_list = Vec::new();
    facets_list.push(format!("[\"project_type:{}\"]", project_type));
    
    if let Some(ver) = game_version {
        if !ver.is_empty() {
            facets_list.push(format!("[\"versions:{}\"]", ver));
        }
    }
    
    if let Some(ldr) = loader {
        if !ldr.is_empty() {
            facets_list.push(format!("[\"categories:{}\"]", ldr));
        }
    }
    
    let facets = format!("[{}]", facets_list.join(","));
    let sort_index = index.unwrap_or_else(|| "relevance".to_string());
    
    let url = format!("{}/search", MODRINTH_API_BASE);
    
    let response = client.get(&url)
        .query(&[
            ("query", &query),
            ("facets", &facets),
            ("index", &sort_index),
            ("offset", &offset.to_string()),
            ("limit", &limit.to_string())
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Modrinth API error: {}", response.status()));
    }

    let result: SearchResult = response.json().await.map_err(|e| e.to_string())?;
    Ok(result)
}

#[command]
pub async fn get_modrinth_versions(
    project_id: String, 
    loaders: Option<Vec<String>>, 
    game_versions: Option<Vec<String>>
) -> Result<Vec<ProjectVersion>, String> {
    let client = Client::new();
    let url = format!("{}/project/{}/version", MODRINTH_API_BASE, project_id);
    
    let mut query_params = Vec::new();
    
    if let Some(l) = loaders {
        if !l.is_empty() {
            let loaders_json = serde_json::to_string(&l).map_err(|e| e.to_string())?;
            query_params.push(("loaders", loaders_json));
        }
    }
    
    if let Some(gv) = game_versions {
        if !gv.is_empty() {
            let gv_json = serde_json::to_string(&gv).map_err(|e| e.to_string())?;
            query_params.push(("game_versions", gv_json));
        }
    }
    
    let response = client.get(&url)
        .query(&query_params)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Modrinth API error: {}", response.status()));
    }

    let versions: Vec<ProjectVersion> = response.json().await.map_err(|e| e.to_string())?;
    Ok(versions)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GameVersionTag {
    pub version: String,
    pub version_type: String,
    pub date: String,
    pub major: bool,
}

#[command]
pub async fn get_game_versions() -> Result<Vec<String>, String> {
    let client = Client::new();
    let url = format!("{}/tag/game_version", MODRINTH_API_BASE);
    
    let response = client.get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Modrinth API error: {}", response.status()));
    }

    let tags: Vec<GameVersionTag> = response.json().await.map_err(|e| e.to_string())?;
    
    // Filter for release versions
    let versions: Vec<String> = tags.into_iter()
        .filter(|t| t.version_type == "release")
        .map(|t| t.version)
        .collect();
    
    Ok(versions)
}

#[command]
pub async fn install_mod(
    app: AppHandle,
    url: String,
    filename: String,
    version_id: String,
    game_path: Option<String>,
    enable_isolation: bool
) -> Result<String, String> {
    let mc_dir = if let Some(path) = game_path {
        PathBuf::from(path)
    } else {
        app.path().app_data_dir().map_err(|e| e.to_string())?.join(".minecraft")
    };

    let mods_dir = if enable_isolation {
        mc_dir.join("versions").join(&version_id).join("mods")
    } else {
        mc_dir.join("mods")
    };

    if !mods_dir.exists() {
        fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;
    }

    let target_path = mods_dir.join(&filename);
    
    // Download
    let client = Client::new();
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    
    if !resp.status().is_success() {
        return Err(format!("Download failed: {}", resp.status()));
    }
    
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    tokio::fs::write(&target_path, bytes).await.map_err(|e| e.to_string())?;

    Ok(target_path.to_string_lossy().to_string())
}
