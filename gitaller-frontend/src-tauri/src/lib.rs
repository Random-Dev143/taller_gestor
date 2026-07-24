use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

// 1. Creamos un comando que el Frontend puede invocar
#[tauri::command]
async fn start_server(app: tauri::AppHandle) -> Result<(), String> {
    println!("Recibida orden del Frontend: Levantando Backend...");
    
    let sidecar_command = app.shell().sidecar("gitaller-server").map_err(|e| e.to_string())?;
    let (mut rx, child) = sidecar_command.spawn().map_err(|e| e.to_string())?;

    tauri::async_runtime::spawn(async move {
        // Mantenemos el proceso vivo
        let _mantener_vivo = child; 
        
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => println!("Backend: {}", String::from_utf8_lossy(&line)),
                CommandEvent::Stderr(line) => eprintln!("Backend Error: {}", String::from_utf8_lossy(&line)),
                CommandEvent::Terminated(payload) => println!("⚠️ Backend cerrado con código: {:?}", payload.code),
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
        // 2. Registramos el comando para que Vue tenga permiso de usarlo
        .invoke_handler(tauri::generate_handler![start_server])
        .run(tauri::generate_context!())
        .expect("Error al ejecutar la aplicación Tauri");
}