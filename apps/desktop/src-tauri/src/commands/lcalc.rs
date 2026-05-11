use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tauri::{async_runtime, AppHandle};
use tauri_plugin_dialog::DialogExt;

use crate::error::Error;

use super::result_view::DISCLAIMER_KO;

/// Current `.lcalc` schema version. Bumped only on a breaking shape change.
pub const SCHEMA_VERSION: &str = "3";
const SUPPORTED_SCHEMA_VERSIONS: &[&str] = &["1", "2", SCHEMA_VERSION];

/// Maximum accepted `.lcalc` file size at load time (bytes).
///
/// 1 MiB 는 정상 사용 한도(긴 segments + 비고 포함)를 충분히 덮으면서, 사용자가
/// 신뢰할 수 없는 출처에서 받은 비대 JSON 을 파싱하기 전에 거부할 수 있는
/// 가드. 한도 초과 시 메모리/렌더 비용을 막기 위해 한국어 메시지로 reject.
pub const MAX_LCALC_BYTES: u64 = 1_048_576;

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
    .map_err(|e| Error::Other(format!("파일 대화 상자 작업 실패: {e}")))?
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

        validate_file_size(std::fs::metadata(&path)?.len())?;

        let bytes = std::fs::read(&path)?;
        let parsed: LcalcFile = serde_json::from_slice(&bytes)?;

        validate_schema_version(&parsed.schema_version)?;

        Ok(Some(parsed))
    })
    .await
    .map_err(|e| Error::Other(format!("파일 대화 상자 작업 실패: {e}")))?
}

fn validate_file_size(bytes_len: u64) -> Result<(), Error> {
    if bytes_len > MAX_LCALC_BYTES {
        return Err(Error::Other(format!(
            ".lcalc 파일이 너무 큽니다. 최대 {} bytes 까지 허용되며 현재 파일은 {} bytes 입니다.",
            MAX_LCALC_BYTES, bytes_len
        )));
    }

    Ok(())
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
    if kind != "interest" && kind != "inheritance" {
        return;
    }

    let Some(Value::Object(interest_payload)) = payload.body.get_mut("payload") else {
        return;
    };
    interest_payload.insert(
        "disclaimer".to_string(),
        Value::String(DISCLAIMER_KO.to_string()),
    );
    if let Some(Value::Object(result)) = interest_payload.get_mut("result") {
        result.insert(
            "disclaimer".to_string(),
            Value::String(DISCLAIMER_KO.to_string()),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample() -> LcalcFile {
        let mut body = Map::new();
        body.insert("kind".to_string(), Value::String("interest".to_string()));
        body.insert(
            "envelopeFeatures".to_string(),
            json!(["interest@1"]),
        );
        body.insert(
            "dataVersions".to_string(),
            json!({ "interest": "legal-rates/v1.0.0" }),
        );
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
        assert!(s.contains("\"envelopeFeatures\""));
        assert!(s.contains("\"dataVersions\""));
        assert!(s.contains("\"payload\""));
        assert!(!s.contains("\"schema_version\""));
        let back: LcalcFile = serde_json::from_str(&s).unwrap();
        assert_eq!(back.schema_version, SCHEMA_VERSION);
        assert_eq!(
            back.body.get("kind").and_then(Value::as_str),
            Some("interest")
        );
        // v3 envelope-level capability + dataset 메타가 wire format 에서 보존되는지 확인.
        let features = back
            .body
            .get("envelopeFeatures")
            .and_then(Value::as_array)
            .expect("envelopeFeatures present");
        assert_eq!(features.len(), 1);
        assert_eq!(features[0].as_str(), Some("interest@1"));
        assert_eq!(
            back.body
                .get("dataVersions")
                .and_then(Value::as_object)
                .and_then(|m| m.get("interest"))
                .and_then(Value::as_str),
            Some("legal-rates/v1.0.0"),
        );
    }

    #[test]
    fn accepts_legacy_v1_v2_and_current_v3_schema_versions() {
        validate_schema_version("1").unwrap();
        validate_schema_version("2").unwrap();
        validate_schema_version("3").unwrap();
    }

    #[test]
    fn unsupported_schema_version_uses_korean_message() {
        let message = validate_schema_version("9").unwrap_err().to_string();
        assert!(message.contains("지원하지 않는 .lcalc 버전입니다: 9"));
    }

    #[test]
    fn validate_file_size_accepts_under_cap() {
        validate_file_size(0).unwrap();
        validate_file_size(MAX_LCALC_BYTES).unwrap();
    }

    #[test]
    fn validate_file_size_rejects_over_cap_with_korean_message() {
        let message = validate_file_size(MAX_LCALC_BYTES + 1)
            .unwrap_err()
            .to_string();
        assert!(message.contains(".lcalc 파일이 너무 큽니다"));
        assert!(message.contains(&MAX_LCALC_BYTES.to_string()));
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

    #[test]
    fn enforce_disclaimer_updates_inheritance_payload() {
        let mut file = sample();
        file.body
            .insert("kind".to_string(), Value::String("inheritance".to_string()));
        if let Some(Value::Object(payload)) = file.body.get_mut("payload") {
            payload.insert("disclaimer".to_string(), Value::String("stale".to_string()));
            payload.insert(
                "result".to_string(),
                json!({ "disclaimer": "stale result" }),
            );
        }

        enforce_disclaimer(&mut file);

        let disclaimer = file
            .body
            .get("payload")
            .and_then(Value::as_object)
            .and_then(|payload| payload.get("disclaimer"))
            .and_then(Value::as_str);
        assert_eq!(disclaimer, Some(DISCLAIMER_KO));
        let result_disclaimer = file
            .body
            .get("payload")
            .and_then(Value::as_object)
            .and_then(|payload| payload.get("result"))
            .and_then(Value::as_object)
            .and_then(|result| result.get("disclaimer"))
            .and_then(Value::as_str);
        assert_eq!(result_disclaimer, Some(DISCLAIMER_KO));
    }
}
