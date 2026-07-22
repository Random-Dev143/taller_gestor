use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init()) // 1. Inicializar el plugin
        .setup(|app| {
            // 2. Apuntar al nombre base declarado en tauri.conf.json (sin la extensión ni el target)
            let sidecar_command = app.shell().sidecar("bin/gitaller-server").unwrap();
            let (mut rx, mut _child) = sidecar_command.spawn().expect("Fallo al iniciar el backend Node.js");

            // 3. (Opcional) Derivar los logs del backend a la consola de Rust para depurar
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    if let CommandEvent::Stdout(line) = event {
                        println!("Backend: {}", String::from_utf8_lossy(&line));
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Error al ejecutar la aplicación Tauri");
}