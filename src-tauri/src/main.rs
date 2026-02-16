#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod tray;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::secret_get,
            commands::secret_set,
            commands::slack_api_call,
            commands::db_has_processed_key,
            commands::db_log_delivery,
            commands::db_log_suppression,
            commands::db_list_deliveries,
            commands::db_list_suppressions,
            commands::open_external_url,
            commands::set_tray_state
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            db::init_db(app).map_err(std::io::Error::other)?;
            tray::setup_tray(app)?;
            Ok(())
        })
        .on_tray_icon_event(|app, event| {
            tray::handle_tray_event(app, event);
        })
        .on_menu_event(|app, event| {
            tray::handle_menu_event(app, event);
        })
        .run(tauri::generate_context!())
        .expect("error while running kiki");
}
