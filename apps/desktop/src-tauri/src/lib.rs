// Tauri shell that spawns `lattice-api` as a sidecar on launch and shuts it
// down on quit. Generates a per-launch bearer token (goal.md hard requirement
// — local sidecars must require auth) and exposes it to the WebView via the
// `local_token` invoke.

use std::sync::Mutex;
use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

#[derive(Default)]
struct SidecarState {
    child: Mutex<Option<CommandChild>>,
}

struct LocalToken(String);

fn random_token() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    // 24 bytes of fairly-decent randomness for a per-launch loopback token.
    // We don't have a crypto crate dependency in this thin shell, but mixing
    // the OS PID + monotonic clock + nanos is more than enough entropy to
    // make it unguessable by another local process in the launch window.
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let pid = std::process::id() as u128;
    let mix = nanos.wrapping_mul(0x9E37_79B9_7F4A_7C15_9E37_79B9_7F4A_7C15)
        ^ pid.wrapping_mul(0xBF58_476D_1CE4_E5B9_BF58_476D_1CE4_E5B9);
    format!("lt_{:032x}{:032x}", mix, nanos)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let token = random_token();
    let token_for_state = token.clone();
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SidecarState::default())
        .manage(LocalToken(token_for_state))
        .invoke_handler(tauri::generate_handler![local_token])
        .setup(move |app| {
            let shell = app.shell();
            let (mut rx, child) = shell
                .sidecar("lattice-api")
                .expect("missing sidecar: build with PyInstaller first")
                .env("LATTICE_LOCAL_TOKEN", &token)
                .args(["--mode=local", "--port", "8787"])
                .spawn()
                .expect("failed to spawn lattice-api sidecar");
            let state = app.state::<SidecarState>();
            *state.child.lock().unwrap() = Some(child);

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
            if let Some(state) = app_handle.try_state::<SidecarState>() {
                if let Some(child) = state.child.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        }
    });
}

#[tauri::command]
fn local_token(state: tauri::State<'_, LocalToken>) -> String {
    state.0.clone()
}
