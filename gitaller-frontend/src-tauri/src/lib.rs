use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

// Estado global: guarda una referencia al proceso backend actual (si existe),
// para poder matarlo antes de lanzar uno nuevo. Esto evita que dos procesos
// gitaller-server terminen compitiendo por el mismo puerto (EADDRINUSE), que
// era la causa de que el watchdog no pudiera "revivir" el backend.
struct ServerState(Mutex<Option<CommandChild>>);

#[tauri::command]
async fn start_server(
    app: tauri::AppHandle,
    state: tauri::State<'_, ServerState>,
) -> Result<(), String> {
    // 1. Si ya había un proceso backend registrado (esté colgado, respondiendo
    //    mal, o lo que sea), lo matamos primero. Así garantizamos que nunca
    //    haya dos instancias peleando por el mismo puerto.
    {
        let mut guard = state.0.lock().unwrap();
        if let Some(old_child) = guard.take() {
            println!("♻️ Matando proceso backend anterior antes de reiniciar...");
            let _ = old_child.kill();
        }
    }

    // Pequeña espera para darle tiempo a Windows a liberar el puerto TCP
    // tras matar el proceso anterior. No siempre es instantáneo.
    // (requiere agregar `tokio = { version = "1", features = ["time"] }`
    // a Cargo.toml — ver README_PARCHES.md)
    tokio::time::sleep(std::time::Duration::from_millis(400)).await;

    println!("Recibida orden del Frontend: Levantando Backend...");

    let sidecar_command = app
        .shell()
        .sidecar("gitaller-server")
        .map_err(|e| e.to_string())?;
    let (mut rx, child) = sidecar_command.spawn().map_err(|e| e.to_string())?;

    // 2. Guardamos la referencia del proceso nuevo en el estado global.
    *state.0.lock().unwrap() = Some(child);

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    println!("Backend: {}", String::from_utf8_lossy(&line))
                }
                CommandEvent::Stderr(line) => {
                    eprintln!("Backend Error: {}", String::from_utf8_lossy(&line))
                }
                CommandEvent::Terminated(payload) => {
                    println!("⚠️ Backend cerrado con código: {:?}", payload.code);
                    // Limpiamos el estado: si el proceso ya murió por su cuenta,
                    // no queremos que un futuro start_server intente matar un
                    // proceso que ya no existe.
                    let state: tauri::State<ServerState> = app_handle.state();
                    *state.0.lock().unwrap() = None;
                }
                CommandEvent::Error(err) => eprintln!("❌ Error del proceso: {}", err),
                _ => {}
            }
        }
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(ServerState(Mutex::new(None)))
        // 3. Registramos el comando para que Vue tenga permiso de usarlo
        .invoke_handler(tauri::generate_handler![start_server])
        .run(tauri::generate_context!())
        .expect("Error al ejecutar la aplicación Tauri");
}
