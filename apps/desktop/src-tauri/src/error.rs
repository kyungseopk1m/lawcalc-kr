use serde::{Serialize, Serializer};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("csv error: {0}")]
    Csv(#[from] csv::Error),

    #[error("not implemented: {0}")]
    NotImplemented(&'static str),

    #[error("invalid lcalc schema: {0}")]
    InvalidSchema(String),

    #[error("invalid path: {0}")]
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
