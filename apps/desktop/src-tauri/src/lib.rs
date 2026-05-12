// M1: Tauri shell that spawns `lattice-api` as a sidecar on launch,
// shuts it down on quit, and exposes a `pick_vault_folder` invoke.
// The Next.js UI in apps/web is the WebView content.

use std::sync::Mutex;
use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

#[derive(Default)]
struct SidecarState {
    child: Mutex<Option<CommandChild>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SidecarState::default())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {
            // Spawn `lattice-api` (PyInstaller-packed sidecar named with the
            // target triple suffix, e.g. lattice-api-x86_64-unknown-linux-gnu).
            // `--port 8787` matches the default the web app expects.
            let shell = app.shell();
            let (mut rx, child) = shell
                .sidecar("lattice-api")
                .expect("missing sidecar: build with PyInstaller first")
                .args(["--mode=local", "--port", "8787"])
                .spawn()
                .expect("failed to spawn lattice-api sidecar");
            let state = app.state::<SidecarState>();
            *state.child.lock().unwrap() = Some(child);

            // Pipe sidecar stdout/stderr to the host's stderr so the user can
            // see what the api is doing when they run `tauri dev`.
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                            eprintln!("[api] {}", String::from_utf8_lossy(&line));
                        }
                        tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                            eprintln!("[api] {}", String::from_utf8_lossy(&line));
                        }
                        tauri_plugin_shell::process::CommandEvent::Terminated(payload) => {
                            eprintln!("[api] terminated: {:?}", payload);
                            break;
                        }
                        _ => {}
                    }
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            // Make sure the sidecar dies with us, otherwise the next launch
            // hits "address already in use" on port 8787.
            if let Some(state) = app_handle.try_state::<SidecarState>() {
                if let Some(child) = state.child.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        }
    });
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Lattice M1.", name)
}
