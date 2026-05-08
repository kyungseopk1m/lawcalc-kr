use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::Error;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PdfOptions {
    pub path: PathBuf,
    #[serde(default)]
    pub note: Option<String>,
}

#[tauri::command]
pub fn export_pdf(input: Value, options: PdfOptions) -> Result<PathBuf, Error> {
    let _ = (input, &options);
    Err(Error::NotImplemented("export_pdf (W4)"))
}
