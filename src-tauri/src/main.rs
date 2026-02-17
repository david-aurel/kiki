#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod tray;

use tauri::{include_image, Manager};

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
            commands::set_tray_state,
            commands::quit_app
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_icon(include_image!("icons/icon.png"));
                    if window.is_visible().unwrap_or(false) {
                        app.set_activation_policy(tauri::ActivationPolicy::Regular);
                    }
                }
            }

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
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = window.hide();
                    #[cfg(target_os = "macos")]
                    window
                        .app_handle()
                        .set_activation_policy(tauri::ActivationPolicy::Accessory)
                        .ok();
                }
                tauri::WindowEvent::Focused(true) => {
                    #[cfg(target_os = "macos")]
                    window
                        .app_handle()
                        .set_activation_policy(tauri::ActivationPolicy::Regular)
                        .ok();
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running kiki");
}
