mod commands;
mod error;

pub use error::Error;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            commands::pdf::export_pdf,
            commands::csv::export_csv,
            commands::lcalc::save_lcalc,
            commands::lcalc::load_lcalc,
            commands::clipboard::copy_to_clipboard,
        ])
        .run(tauri::generate_context!())
        .expect("error while running lawcalc-kr application");
}
