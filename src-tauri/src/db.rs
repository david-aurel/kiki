use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{fs, sync::Mutex};
use tauri::{App, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbLogEntry {
    pub key: String,
    pub user_id: String,
    pub notification_id: String,
    pub reason: String,
    pub created_at: String,
}

pub struct AppDb {
    conn: Mutex<Connection>,
}

impl AppDb {
    fn new(conn: Connection) -> Self {
        Self {
            conn: Mutex::new(conn),
        }
    }

    pub fn has_processed_key(&self, key: &str) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT 1 FROM processed_keys WHERE key = ?1 LIMIT 1")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query(params![key]).map_err(|e| e.to_string())?;
        Ok(rows.next().map_err(|e| e.to_string())?.is_some())
    }

    pub fn log_delivery(&self, entry: &DbLogEntry) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR IGNORE INTO processed_keys (key, created_at) VALUES (?1, ?2)",
            params![entry.key, entry.created_at],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT INTO deliveries (key, user_id, notification_id, reason, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![entry.key, entry.user_id, entry.notification_id, entry.reason, entry.created_at],
        )
        .map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn log_suppression(&self, entry: &DbLogEntry) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR IGNORE INTO processed_keys (key, created_at) VALUES (?1, ?2)",
            params![entry.key, entry.created_at],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT INTO suppressions (key, user_id, notification_id, reason, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![entry.key, entry.user_id, entry.notification_id, entry.reason, entry.created_at],
        )
        .map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn list_deliveries(&self) -> Result<Vec<DbLogEntry>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT key, user_id, notification_id, reason, created_at FROM deliveries ORDER BY rowid ASC")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok(DbLogEntry {
                    key: row.get(0)?,
                    user_id: row.get(1)?,
                    notification_id: row.get(2)?,
                    reason: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row.map_err(|e| e.to_string())?);
        }

        Ok(result)
    }

    pub fn list_suppressions(&self) -> Result<Vec<DbLogEntry>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT key, user_id, notification_id, reason, created_at FROM suppressions ORDER BY rowid ASC")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok(DbLogEntry {
                    key: row.get(0)?,
                    user_id: row.get(1)?,
                    notification_id: row.get(2)?,
                    reason: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row.map_err(|e| e.to_string())?);
        }

        Ok(result)
    }
}

pub fn init_db(app: &mut App) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&app_data_dir).map_err(|e| e.to_string())?;

    let db_path = app_data_dir.join("kiki.db");
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS processed_keys (
          key TEXT PRIMARY KEY,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS deliveries (
          key TEXT NOT NULL,
          user_id TEXT NOT NULL,
          notification_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS suppressions (
          key TEXT NOT NULL,
          user_id TEXT NOT NULL,
          notification_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_deliveries_created_at ON deliveries(created_at);
        CREATE INDEX IF NOT EXISTS idx_suppressions_created_at ON suppressions(created_at);
        ",
    )
    .map_err(|e| e.to_string())?;

    app.manage(AppDb::new(conn));
    Ok(())
}
