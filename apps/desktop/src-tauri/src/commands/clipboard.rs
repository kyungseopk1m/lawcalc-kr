use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::error::Error;

/// 결과를 클립보드에 쓴다. `html` 이 있으면 HTML 표 형식도 함께 싣는다
/// (한글·Word 에 붙이면 표가 유지된다). 일반 텍스트는 어느 경우든 `text` 그대로다.
#[tauri::command]
pub fn copy_to_clipboard(app: AppHandle, text: String, html: Option<String>) -> Result<(), Error> {
    let clipboard = app.clipboard();
    match html {
        Some(html) => clipboard.write_html(html, Some(text)),
        None => clipboard.write_text(text),
    }
    .map_err(|e| Error::Other(format!("클립보드 쓰기 실패: {e}")))
}
