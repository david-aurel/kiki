use tauri::{
    include_image,
    image::Image,
    menu::{Menu, MenuEvent, MenuItem},
    ActivationPolicy,
    App, AppHandle, Manager,
    Runtime,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

pub fn setup_tray(app: &mut App) -> tauri::Result<()> {
    let open = MenuItem::with_id(&*app, "open", "Open Kiki", true, None::<&str>)?;
    let quit = MenuItem::with_id(&*app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(&*app, &[&open, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main-tray");
    builder = builder.icon(tray_icon_for_state("light", "calm"));

    builder
        .menu(&menu)
        .show_menu_on_left_click(false)
        .icon_as_template(false)
        .tooltip("Kiki")
        .build(app)?;

    Ok(())
}

pub fn set_tray_state(app: &AppHandle, theme: &str, focus_mode: &str, animating: bool) -> Result<(), String> {
    let tray = app
        .tray_by_id("main-tray")
        .ok_or_else(|| "Tray not found".to_string())?;
    let focus = match focus_mode {
        "all" => "All",
        "calm" => "Calm",
        "focused" => "Personal",
        "zen" => "Zen",
        _ => "Kiki",
    };
    let mode_hint = if animating { "animating" } else { "static" };
    let tooltip = format!("Kiki • {theme} • {focus} • {mode_hint}");
    tray.set_icon(Some(tray_icon_for_state(theme, focus_mode)))
        .map_err(|e| e.to_string())?;
    tray.set_tooltip(Some(&tooltip)).map_err(|e| e.to_string())
}

fn tray_icon_for_state(theme: &str, focus_mode: &str) -> Image<'static> {
    let dark = theme == "dark";
    match (dark, focus_mode) {
        (true, "all") => include_image!("icons/tray-all-dark.png"),
        (true, "zen") => include_image!("icons/tray-zen-dark.png"),
        (true, "calm" | "focused" | "personal") => include_image!("icons/tray-focus-dark.png"),
        (true, _) => include_image!("icons/tray-focus-dark.png"),
        (false, "all") => include_image!("icons/tray-all-light.png"),
        (false, "zen") => include_image!("icons/tray-zen-light.png"),
        (false, "calm" | "focused" | "personal") => include_image!("icons/tray-focus-light.png"),
        (false, _) => include_image!("icons/tray-focus-light.png"),
    }
}

pub fn handle_tray_event<R: Runtime>(app: &AppHandle<R>, event: TrayIconEvent) {
    if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
    } = event
    {
        #[cfg(target_os = "macos")]
        app.set_activation_policy(ActivationPolicy::Regular).ok();

        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

pub fn handle_menu_event(app: &AppHandle, event: MenuEvent) {
    match event.id().as_ref() {
        "quit" => app.exit(0),
        "open" => {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(ActivationPolicy::Regular).ok();

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        _ => {}
    }
}
