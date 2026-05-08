use crate::error::Error;

#[tauri::command]
pub fn copy_to_clipboard(text: String) -> Result<(), Error> {
    let _ = text;
    Err(Error::NotImplemented("copy_to_clipboard (W4)"))
}
