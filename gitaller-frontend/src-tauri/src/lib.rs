use std::sync::Mutex;
use tauri::{AppHandle, Manager, RunEvent};
use tauri_plugin_shell::{ShellExt, process::CommandChild, process::CommandEvent};

// 1. ESTRUCTURA DE ESTADO:
// Esto crea el "cajón" en la memoria RAM donde vamos a guardar
// el ID del proceso de tu backend en Node.js.
struct ServerProcess(Mutex<Option<CommandChild>>);

// 2. COMANDO START_SERVER:
// Esta es la función que llamas desde Vue con invoke('start_server')
#[tauri::command]
fn start_server(app: AppHandle) -> Result<(), String> {
    // Abrimos el "cajón" de la memoria
    let state = app.state::<ServerProcess>();
    let mut process_guard = state
        .0
        .lock()
        .map_err(|e| format!("Error al tomar el lock del estado: {e}"))?;

    // Si ya hay un servidor guardado ahí adentro, no hacemos nada (evita duplicados)
    if process_guard.is_some() {
        return Ok(());
    }

    // Iniciamos tu ejecutable compilado (el sidecar)
    let (mut rx, child) = app
        .shell()
        .sidecar("gitaller-server")
        .map_err(|e| e.to_string())?
        .spawn()
        .map_err(|e| e.to_string())?;

    // Escuchamos stdout/stderr/exit del sidecar para poder debuggear
    // si el server Node.js falla al arrancar o loguea algo.
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    println!("[gitaller-server] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    eprintln!("[gitaller-server:ERR] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Error(err) => {
                    eprintln!("[gitaller-server:SPAWN-ERROR] {err}");
                }
                CommandEvent::Terminated(payload) => {
                    println!(
                        "[gitaller-server] Proceso terminado. Código: {:?}, Señal: {:?}",
                        payload.code, payload.signal
                    );
                }
                _ => {}
            }
        }
    });

    // Guardamos la referencia exacta de ese proceso en el "cajón"
    *process_guard = Some(child);
    Ok(())
}

// 3. COMANDO STOP_SERVER (opcional pero útil):
// Permite matar el server manualmente desde Vue, ej. para reiniciarlo.
#[tauri::command]
fn stop_server(app: AppHandle) -> Result<(), String> {
    let state = app.state::<ServerProcess>();
    let mut process_guard = state
        .0
        .lock()
        .map_err(|e| format!("Error al tomar el lock del estado: {e}"))?;

    if let Some(child) = process_guard.take() {
        child.kill().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// 4. FUNCIÓN RUN:
// El motor principal de la aplicación Tauri
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Inicializamos el plugin de shell (obligatorio para los sidecars)
        .plugin(tauri_plugin_shell::init())
        // Le pasamos a Tauri nuestra estructura de estado (el cajón vacío) al arrancar
        .manage(ServerProcess(Mutex::new(None)))
        // Registramos los comandos para que Vue los pueda llamar
        .invoke_handler(tauri::generate_handler![start_server, stop_server])
        .build(tauri::generate_context!())
        .expect("Error al construir la aplicación Tauri")
        // El ciclo de vida de la app. Acá es donde "enganchamos" el cierre
        .run(|app_handle, event| {
            // Si el evento es "Exit" (la app se está cerrando por completo)...
            if let RunEvent::Exit = event {
                // Buscamos nuestra referencia en memoria...
                let state = app_handle.state::<ServerProcess>();

                // Usamos if let en vez de unwrap() para no panickear
                // si el mutex quedó envenenado por algún panic previo.
                if let Ok(mut process_guard) = state.0.lock() {
                    // Si el servidor Node.js estaba corriendo, le disparamos el kill()
                    if let Some(child) = process_guard.take() {
                        if let Err(e) = child.kill() {
                            eprintln!("[gitaller-server] Error al matar el proceso: {e}");
                        } else {
                            println!("[gitaller-server] Proceso finalizado correctamente al cerrar la app.");
                        }
                    }
                }
            }
        });
}