//! Tauri command error type.
//!
//! Display strings are surfaced to the user as toast text (see
//! `apps/desktop/src/App.tsx:320`, where the renderer shows
//! `error.message` verbatim). Korean prefixes here keep the v0.1.0 user
//! test (변호사 4 + 부친 1) free of ad-hoc English error fragments. The
//! inner system message (`std::io::Error` / `serde_json::Error` /
//! `csv::Error`) is preserved so debugging detail is not lost.

use serde::{Serialize, Serializer};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
    #[error("파일 입출력 오류: {0}")]
    Io(#[from] std::io::Error),

    #[error("데이터 형식 오류: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("CSV 처리 오류: {0}")]
    Csv(#[from] csv::Error),

    #[error("지원하지 않는 .lcalc 형식: {0}")]
    InvalidSchema(String),

    #[error("잘못된 파일 경로: {0}")]
    InvalidPath(String),

    #[error("{0}")]
    Other(String),
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::Error;

    #[test]
    fn user_facing_prefixes_are_korean() {
        assert!(Error::InvalidPath("/x/y".into())
            .to_string()
            .starts_with("잘못된 파일 경로"));
        assert!(Error::InvalidSchema("v9".into())
            .to_string()
            .starts_with("지원하지 않는 .lcalc 형식"));
        assert_eq!(
            Error::Other("끝수처리 실패".into()).to_string(),
            "끝수처리 실패"
        );
    }

    #[test]
    fn io_prefix_keeps_inner_message() {
        let io: std::io::Error =
            std::io::Error::new(std::io::ErrorKind::PermissionDenied, "denied");
        let msg = Error::from(io).to_string();
        assert!(msg.starts_with("파일 입출력 오류"));
        assert!(msg.contains("denied"));
    }
}
