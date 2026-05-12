// M0: minimal Tauri app that loads the Next.js dev server.
// M1 adds: spawn lattice-api as a sidecar, manage its lifecycle,
// expose `invoke('open_vault_picker')` and `invoke('reveal_in_finder')`.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Lattice M0.", name)
}
