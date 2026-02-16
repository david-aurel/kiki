use keyring::Entry;
use serde_json::Value;
use tauri::{AppHandle, State};

use crate::{db::{AppDb, DbLogEntry}, tray};

const SERVICE_NAME: &str = "kiki";

#[tauri::command]
pub fn secret_get(name: String) -> Option<String> {
    let entry = Entry::new(SERVICE_NAME, &name).ok()?;
    entry.get_password().ok()
}

#[tauri::command]
pub fn secret_set(name: String, value: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, &name).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn slack_api_call(token: String, method: String, body: Value) -> Result<Value, String> {
    let client = reqwest::blocking::Client::new();
    let response = client
        .post(format!("https://slack.com/api/{method}"))
        .bearer_auth(token)
        .json(&body)
        .send()
        .map_err(|e| e.to_string())?;

    let status = response.status();
    let payload = response.json::<Value>().map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!("Slack HTTP error: {status} payload={payload}"));
    }

    Ok(payload)
}

#[tauri::command]
pub fn db_has_processed_key(db: State<'_, AppDb>, key: String) -> Result<bool, String> {
    db.has_processed_key(&key)
}

#[tauri::command]
pub fn db_log_delivery(db: State<'_, AppDb>, entry: DbLogEntry) -> Result<(), String> {
    db.log_delivery(&entry)
}

#[tauri::command]
pub fn db_log_suppression(db: State<'_, AppDb>, entry: DbLogEntry) -> Result<(), String> {
    db.log_suppression(&entry)
}

#[tauri::command]
pub fn db_list_deliveries(db: State<'_, AppDb>) -> Result<Vec<DbLogEntry>, String> {
    db.list_deliveries()
}

#[tauri::command]
pub fn db_list_suppressions(db: State<'_, AppDb>) -> Result<Vec<DbLogEntry>, String> {
    db.list_suppressions()
}

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("Unsupported platform".to_string())
}

#[tauri::command]
pub fn set_tray_state(
    app: AppHandle,
    theme: String,
    focus_mode: String,
    animating: bool,
) -> Result<(), String> {
    tray::set_tray_state(&app, &theme, &focus_mode, animating)
}
