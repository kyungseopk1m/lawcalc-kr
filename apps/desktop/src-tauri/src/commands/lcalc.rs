use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{async_runtime, AppHandle};
use tauri_plugin_dialog::DialogExt;

use crate::error::Error;

use super::result_view::DISCLAIMER_KO;

/// Current `.lcalc` schema version. Bumped only on a breaking shape change.
/// Map of `for-claude/personal/lawcalc-kr/docs/plans/project-design.md` §5.4.
pub const SCHEMA_VERSION: &str = "1";

/// Wire-compatible representation of an `.lcalc` document.
///
/// `input` / `options` / `result` are kept as `serde_json::Value` so the Rust
/// shell does not need to mirror the TypeScript `@lawcalc-kr/core-engine`
/// surface; the renderer is responsible for shape correctness on save and the
/// renderer (or a future migration step) is responsible for shape validation
/// on load. Only `schemaVersion` is enforced here.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LcalcFile {
    pub schema_version: String,
    pub app_version: String,
    pub data_version: String,
    pub created_at: String,
    pub input: Value,
    pub options: Value,
    pub result: Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    pub disclaimer: String,
}

/// dialog blocking 변형 + 파일 IO 는 main thread deadlock 회피 위해
/// `async_runtime::spawn_blocking` 안에서 실행한다 (Tauri 2.x).
#[tauri::command]
pub async fn save_lcalc(app: AppHandle, payload: LcalcFile) -> Result<Option<String>, Error> {
    let app2 = app.clone();
    async_runtime::spawn_blocking(move || -> Result<Option<String>, Error> {
        let mut payload = payload;
        payload.disclaimer = DISCLAIMER_KO.to_string();

        let picked = app2
            .dialog()
            .file()
            .add_filter("LawCalc Document", &["lcalc"])
            .set_file_name("calculation.lcalc")
            .blocking_save_file();

        let Some(file_path) = picked else {
            return Ok(None);
        };

        let path: PathBuf = file_path
            .into_path()
            .map_err(|e| Error::InvalidPath(e.to_string()))?;

        let json = serde_json::to_string_pretty(&payload)?;
        std::fs::write(&path, json)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| Error::Other(format!("dialog task: {e}")))?
}

#[tauri::command]
pub async fn load_lcalc(app: AppHandle) -> Result<Option<LcalcFile>, Error> {
    let app2 = app.clone();
    async_runtime::spawn_blocking(move || -> Result<Option<LcalcFile>, Error> {
        let picked = app2
            .dialog()
            .file()
            .add_filter("LawCalc Document", &["lcalc"])
            .blocking_pick_file();

        let Some(file_path) = picked else {
            return Ok(None);
        };

        let path: PathBuf = file_path
            .into_path()
            .map_err(|e| Error::InvalidPath(e.to_string()))?;

        let bytes = std::fs::read(&path)?;
        let parsed: LcalcFile = serde_json::from_slice(&bytes)?;

        validate_schema_version(&parsed.schema_version)?;

        Ok(Some(parsed))
    })
    .await
    .map_err(|e| Error::Other(format!("dialog task: {e}")))?
}

fn validate_schema_version(schema_version: &str) -> Result<(), Error> {
    if schema_version != SCHEMA_VERSION {
        return Err(Error::InvalidSchema(format!(
            "지원하지 않는 .lcalc 버전입니다: {schema_version}"
        )));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample() -> LcalcFile {
        LcalcFile {
            schema_version: SCHEMA_VERSION.to_string(),
            app_version: "0.1.0".to_string(),
            data_version: "legal-rates/v1.0.0".to_string(),
            created_at: "2026-05-09T12:34:56+09:00".to_string(),
            input: json!({ "principal": 1000000 }),
            options: json!({ "mode": "period", "leapYear": "fixed365", "includeFirstDay": true }),
            result: json!({ "totalInterest": 0 }),
            note: Some("note".to_string()),
            disclaimer: DISCLAIMER_KO.to_string(),
        }
    }

    #[test]
    fn round_trips_camel_case_json() {
        let file = sample();
        let s = serde_json::to_string(&file).unwrap();
        // camelCase on the wire
        assert!(s.contains("\"schemaVersion\""));
        assert!(s.contains("\"appVersion\""));
        assert!(s.contains("\"dataVersion\""));
        assert!(s.contains("\"createdAt\""));
        assert!(!s.contains("\"schema_version\""));
        let back: LcalcFile = serde_json::from_str(&s).unwrap();
        assert_eq!(back.schema_version, SCHEMA_VERSION);
        assert_eq!(back.app_version, "0.1.0");
        assert_eq!(back.note.as_deref(), Some("note"));
    }

    #[test]
    fn note_is_optional_on_disk() {
        let mut file = sample();
        file.note = None;
        let s = serde_json::to_string(&file).unwrap();
        assert!(!s.contains("\"note\""));
        let back: LcalcFile = serde_json::from_str(&s).unwrap();
        assert!(back.note.is_none());
    }

    #[test]
    fn unsupported_schema_version_uses_korean_message() {
        let message = validate_schema_version("9").unwrap_err().to_string();
        assert!(message.contains("지원하지 않는 .lcalc 버전입니다: 9"));
    }
}
