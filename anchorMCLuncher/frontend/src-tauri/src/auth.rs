use serde::{Deserialize, Serialize};
use std::error::Error;

#[derive(Serialize, Deserialize, Debug)]
pub struct Agent {
    pub name: String,
    pub version: u8,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AuthRequest {
    pub agent: Agent,
    pub username: String,
    pub password: String,
    #[serde(rename = "clientToken")]
    pub client_token: Option<String>,
    #[serde(rename = "requestUser")]
    pub request_user: bool,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Profile {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AuthResponse {
    #[serde(rename = "accessToken")]
    pub access_token: String,
    #[serde(rename = "clientToken")]
    pub client_token: Option<String>,
    #[serde(rename = "selectedProfile")]
    pub selected_profile: Option<Profile>,
    #[serde(rename = "availableProfiles")]
    pub available_profiles: Option<Vec<Profile>>,
}

pub async fn authenticate(
    auth_server_url: &str,
    username: &str,
    password: &str,
) -> Result<AuthResponse, Box<dyn Error>> {
    let client = reqwest::Client::new();
    let url = format!("{}/authserver/authenticate", auth_server_url.trim_end_matches('/'));

    let payload = AuthRequest {
        agent: Agent {
            name: "Minecraft".to_string(),
            version: 1,
        },
        username: username.to_string(),
        password: password.to_string(),
        client_token: None, // You might want to generate a UUID here
        request_user: true,
    };

    let resp = client.post(&url)
        .json(&payload)
        .send()
        .await?;

    if resp.status().is_success() {
        let response_text = resp.text().await?;
        println!("Raw Auth Response: {}", response_text);
        let auth_response: AuthResponse = serde_json::from_str(&response_text)?;
        Ok(auth_response)
    } else {
        let status = resp.status();
        let error_text = resp.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        Err(format!("Authentication failed (Status {}): {}", status, error_text).into())
    }
}
