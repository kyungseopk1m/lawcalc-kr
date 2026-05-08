use std::path::PathBuf;

use serde_json::Value;

use crate::error::Error;

#[tauri::command]
pub fn save_lcalc(payload: Value, path: PathBuf) -> Result<(), Error> {
    let _ = (payload, path);
    Err(Error::NotImplemented("save_lcalc (W4)"))
}

#[tauri::command]
pub fn load_lcalc(path: PathBuf) -> Result<Value, Error> {
    let _ = path;
    Err(Error::NotImplemented("load_lcalc (W4)"))
}
