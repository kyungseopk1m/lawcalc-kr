use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::error::Error;

#[tauri::command]
pub fn copy_to_clipboard(app: AppHandle, text: String) -> Result<(), Error> {
    app.clipboard()
        .write_text(text)
        .map_err(|e| Error::Other(e.to_string()))
}
