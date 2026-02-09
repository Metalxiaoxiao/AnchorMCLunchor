use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use std::time::Duration;
use anyhow::Result;

#[derive(Debug, Serialize, Deserialize)]
pub struct ServerStatus {
    pub description: String,
    pub players: Players,
    pub version: Version,
    pub favicon: Option<String>,
    pub latency: u128,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Players {
    pub max: i32,
    pub online: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Version {
    pub name: String,
    pub protocol: i32,
}

pub async fn ping_server(host: &str, port: u16) -> Result<ServerStatus> {
    let start = std::time::Instant::now();
    let mut stream = tokio::time::timeout(Duration::from_secs(5), TcpStream::connect((host, port))).await??;

    // Handshake
    let mut handshake = Vec::new();
    write_var_int(&mut handshake, 0x00); // Packet ID
    write_var_int(&mut handshake, 47); // Protocol version (1.8)
    write_string(&mut handshake, host);
    handshake.extend_from_slice(&port.to_be_bytes());
    write_var_int(&mut handshake, 1); // Next state: 1 (status)

    write_packet(&mut stream, handshake).await?;

    // Request
    let request = vec![0x00]; // Packet ID
    write_packet(&mut stream, request).await?;

    // Response
    let packet_len = read_var_int(&mut stream).await?;
    let packet_id = read_var_int(&mut stream).await?;

    if packet_id != 0x00 {
        return Err(anyhow::anyhow!("Invalid packet ID"));
    }

    let json_len = read_var_int(&mut stream).await?;
    let mut json_buf = vec![0; json_len as usize];
    stream.read_exact(&mut json_buf).await?;

    let json_str = String::from_utf8(json_buf)?;
    let latency = start.elapsed().as_millis();

    let json_val: serde_json::Value = serde_json::from_str(&json_str)?;
    
    let description = if let Some(d) = json_val.get("description") {
        parse_description(d)
    } else {
        "No description".to_string()
    };
    
    let players = serde_json::from_value(json_val.get("players").cloned().unwrap_or(serde_json::json!({"max":0,"online":0})))?;
    let version = serde_json::from_value(json_val.get("version").cloned().unwrap_or(serde_json::json!({"name":"?","protocol":0})))?;
    let favicon = json_val.get("favicon").and_then(|f| f.as_str()).map(|s| s.to_string());

    Ok(ServerStatus {
        description,
        players,
        version,
        favicon,
        latency,
    })
}

fn parse_description(v: &serde_json::Value) -> String {
    if let Some(s) = v.as_str() {
        return s.to_string();
    }
    if let Some(obj) = v.as_object() {
        let mut result = String::new();
        if let Some(text) = obj.get("text").and_then(|t| t.as_str()) {
            result.push_str(text);
        }
        if let Some(extra) = obj.get("extra").and_then(|e| e.as_array()) {
            for item in extra {
                result.push_str(&parse_description(item));
            }
        }
        return result;
    }
    String::new()
}

async fn write_packet(stream: &mut TcpStream, data: Vec<u8>) -> Result<()> {
    let mut len_buf = Vec::new();
    write_var_int(&mut len_buf, data.len() as i32);
    stream.write_all(&len_buf).await?;
    stream.write_all(&data).await?;
    Ok(())
}

fn write_var_int(buf: &mut Vec<u8>, mut value: i32) {
    loop {
        let mut temp = (value & 0x7F) as u8;
        value >>= 7;
        if value != 0 {
            temp |= 0x80;
        }
        buf.push(temp);
        if value == 0 {
            break;
        }
    }
}

fn write_string(buf: &mut Vec<u8>, s: &str) {
    write_var_int(buf, s.len() as i32);
    buf.extend_from_slice(s.as_bytes());
}

async fn read_var_int(stream: &mut TcpStream) -> Result<i32> {
    let mut num_read = 0;
    let mut result = 0;
    loop {
        let mut buf = [0; 1];
        stream.read_exact(&mut buf).await?;
        let read = buf[0];
        let value = (read & 0x7F) as i32;
        result |= value << (7 * num_read);

        num_read += 1;
        if num_read > 5 {
            return Err(anyhow::anyhow!("VarInt too big"));
        }

        if (read & 0x80) == 0 {
            break;
        }
    }
    Ok(result)
}
