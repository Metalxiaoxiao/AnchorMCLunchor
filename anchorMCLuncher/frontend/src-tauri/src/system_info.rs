#[derive(serde::Serialize)]
pub struct MemoryInfo {
    pub total_mb: u64,
    pub available_mb: u64,
}

#[tauri::command]
pub fn get_memory_info() -> Result<MemoryInfo, String> {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();

    let total_raw = sys.total_memory();
    let available_raw = sys.available_memory();
    let divisor = if total_raw > 1_000_000_000 { 1024 * 1024 } else { 1024 };
    let total_mb = total_raw / divisor;
    let available_mb = available_raw / divisor;

    Ok(MemoryInfo {
        total_mb,
        available_mb,
    })
}
