use std::path::PathBuf;

use serde_json::Value;

use crate::error::Error;

#[tauri::command]
pub fn export_csv(input: Value, path: PathBuf) -> Result<(), Error> {
    let _ = (input, path);
    Err(Error::NotImplemented("export_csv (W4)"))
}
