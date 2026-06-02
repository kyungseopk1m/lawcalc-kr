mod commands;
mod error;

pub use error::Error;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            commands::pdf::export_pdf,
            commands::pdf::export_inheritance_pdf,
            commands::pdf::export_litigation_cost_pdf,
            commands::pdf::export_compensation_pdf,
            commands::pdf::export_compensation_death_pdf,
            commands::csv::export_csv,
            commands::csv::export_inheritance_csv,
            commands::csv::export_litigation_cost_csv,
            commands::csv::export_compensation_csv,
            commands::csv::export_compensation_death_csv,
            commands::lcalc::save_lcalc,
            commands::lcalc::load_lcalc,
            commands::clipboard::copy_to_clipboard,
        ])
        .run(tauri::generate_context!())
        .expect("error while running lawcalc-kr application");
}
