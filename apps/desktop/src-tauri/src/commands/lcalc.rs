use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tauri::{async_runtime, AppHandle};
use tauri_plugin_dialog::DialogExt;

use crate::error::Error;

use super::result_view::DISCLAIMER_KO;

/// Current `.lcalc` schema version. Bumped only on a breaking shape change.
/// Map of `for-claude/personal/lawcalc-kr/docs/plans/project-design.md` §5.4.
pub const SCHEMA_VERSION: &str = "2";
const SUPPORTED_SCHEMA_VERSIONS: &[&str] = &["1", SCHEMA_VERSION];

/// Wire-compatible representation of an `.lcalc` document.
///
/// The Rust shell only extracts `schemaVersion`; all domain-specific payload
/// validation and migrations are renderer responsibilities.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LcalcFile {
    pub schema_version: String,
    #[serde(flatten)]
    pub body: Map<String, Value>,
}

/// dialog blocking 변형 + 파일 IO 는 main thread deadlock 회피 위해
/// `async_runtime::spawn_blocking` 안에서 실행한다 (Tauri 2.x).
#[tauri::command]
pub async fn save_lcalc(app: AppHandle, payload: LcalcFile) -> Result<Option<String>, Error> {
    let app2 = app.clone();
    async_runtime::spawn_blocking(move || -> Result<Option<String>, Error> {
        let mut payload = payload;
        enforce_disclaimer(&mut payload);

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
    if !SUPPORTED_SCHEMA_VERSIONS.contains(&schema_version) {
        return Err(Error::InvalidSchema(format!(
            "지원하지 않는 .lcalc 버전입니다: {schema_version}"
        )));
    }

    Ok(())
}

fn enforce_disclaimer(payload: &mut LcalcFile) {
    if payload.schema_version == "1" {
        payload.body.insert(
            "disclaimer".to_string(),
            Value::String(DISCLAIMER_KO.to_string()),
        );
        return;
    }

    let Some(Value::String(kind)) = payload.body.get("kind") else {
        return;
    };
    if kind != "interest" {
        return;
    }

    let Some(Value::Object(interest_payload)) = payload.body.get_mut("payload") else {
        return;
    };
    interest_payload.insert(
        "disclaimer".to_string(),
        Value::String(DISCLAIMER_KO.to_string()),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample() -> LcalcFile {
        let mut body = Map::new();
        body.insert("kind".to_string(), Value::String("interest".to_string()));
        body.insert(
            "payload".to_string(),
            json!({
                "appVersion": "0.1.2",
                "dataVersion": "legal-rates/v1.0.0",
                "createdAt": "2026-05-09T12:34:56+09:00",
                "input": { "principal": 1000000 },
                "options": { "mode": "period", "leapYear": "fixed365", "includeFirstDay": true },
                "result": { "totalInterest": 0 },
                "note": "note",
                "disclaimer": DISCLAIMER_KO,
            }),
        );

        LcalcFile {
            schema_version: SCHEMA_VERSION.to_string(),
            body,
        }
    }

    #[test]
    fn round_trips_camel_case_json() {
        let file = sample();
        let s = serde_json::to_string(&file).unwrap();
        // camelCase on the wire
        assert!(s.contains("\"schemaVersion\""));
        assert!(s.contains("\"kind\""));
        assert!(s.contains("\"payload\""));
        assert!(!s.contains("\"schema_version\""));
        let back: LcalcFile = serde_json::from_str(&s).unwrap();
        assert_eq!(back.schema_version, SCHEMA_VERSION);
        assert_eq!(
            back.body.get("kind").and_then(Value::as_str),
            Some("interest")
        );
    }

    #[test]
    fn accepts_legacy_v1_and_current_v2_schema_versions() {
        validate_schema_version("1").unwrap();
        validate_schema_version("2").unwrap();
    }

    #[test]
    fn unsupported_schema_version_uses_korean_message() {
        let message = validate_schema_version("9").unwrap_err().to_string();
        assert!(message.contains("지원하지 않는 .lcalc 버전입니다: 9"));
    }

    #[test]
    fn enforce_disclaimer_updates_interest_payload() {
        let mut file = sample();
        if let Some(Value::Object(payload)) = file.body.get_mut("payload") {
            payload.insert("disclaimer".to_string(), Value::String("stale".to_string()));
        }

        enforce_disclaimer(&mut file);

        let disclaimer = file
            .body
            .get("payload")
            .and_then(Value::as_object)
            .and_then(|payload| payload.get("disclaimer"))
            .and_then(Value::as_str);
        assert_eq!(disclaimer, Some(DISCLAIMER_KO));
    }
}
