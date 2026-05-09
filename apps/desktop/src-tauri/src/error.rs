//! Tauri command error type.
//!
//! Display strings are surfaced to the user as toast text (see
//! `apps/desktop/src/App.tsx:312`, where `runAction` shows
//! `error.message` verbatim). Korean prefixes here keep the v0.1.0 user
//! test free of ad-hoc English error fragments. The inner system message
//! (`std::io::Error` / `serde_json::Error` / `csv::Error`) is preserved
//! so debugging detail is not lost.
//!
//! C18 hardening: absolute file-system paths and panic stack frames are
//! stripped from any inner that flows into a toast via [`sanitize_for_user`].
//! The user already saw the path in the dialog picker, so re-emitting it in
//! a toast adds no useful information but does expose the OS account name
//! (e.g. `/Users/<account>/Desktop/...`). Multi-line panic backtraces are
//! collapsed to the first line.

use serde::{Serialize, Serializer};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
    #[error("파일 입출력 오류: {}", sanitize_for_user(&_0.to_string()))]
    Io(#[from] std::io::Error),

    #[error("데이터 형식 오류: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("CSV 처리 오류: {0}")]
    Csv(#[from] csv::Error),

    #[error("{0}")]
    InvalidSchema(String),

    #[error("잘못된 파일 경로: {}", sanitize_for_user(_0))]
    InvalidPath(String),

    #[error("{}", sanitize_for_user(_0))]
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

/// Strip OS path leaks and panic stack frames from an inner error message
/// before it reaches the toast surface.
///
/// - Keeps only the first line so multi-line panic backtraces are dropped.
/// - Replaces absolute-path tokens (`/Users/...`, `/private/...`, `C:\...`,
///   `\\?\C:\...`) with `<경로>` so the user's home directory and account
///   name don't appear in a UI string the user already saw via the picker.
pub(crate) fn sanitize_for_user(message: &str) -> String {
    let head = message.lines().next().unwrap_or("");
    redact_paths(head)
}

/// Characters that terminate a path token. Whitespace is intentionally
/// included — paths with embedded spaces are partially redacted (the leading
/// `/Users/<account>/` segment is the high-value secret to remove).
const PATH_BREAK_CHARS: &[char] = &[' ', '\t', '"', '\'', '(', ')', ',', ';'];

fn redact_paths(input: &str) -> String {
    let chars: Vec<char> = input.chars().collect();
    let mut out = String::with_capacity(input.len());
    let mut i = 0usize;
    while i < chars.len() {
        if let Some(end) = scan_unix_path(&chars, i).or_else(|| scan_windows_path(&chars, i)) {
            out.push_str("<경로>");
            i = end;
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    out
}

/// Match `/<alpha>...<alpha>/...` style absolute Unix paths. Requires the
/// token to start with `/<alpha>` and contain at least one more `/` so that
/// dates (`2024/01/01`) and rate fractions (`5/365`, `× 100일 / 365`) are
/// not treated as paths.
fn scan_unix_path(chars: &[char], start: usize) -> Option<usize> {
    if chars.get(start) != Some(&'/') {
        return None;
    }
    let next = chars.get(start + 1).copied()?;
    if !next.is_ascii_alphabetic() {
        return None;
    }
    let mut i = start + 1;
    let mut slash_count = 0usize;
    while i < chars.len() && !PATH_BREAK_CHARS.contains(&chars[i]) {
        if chars[i] == '/' {
            slash_count += 1;
        }
        i += 1;
    }
    if slash_count >= 1 {
        Some(i)
    } else {
        None
    }
}

/// Match Windows-style absolute paths: drive-letter (`C:\...`, `D:/...`),
/// UNC (`\\?\C:\...`, `\\share\...`).
fn scan_windows_path(chars: &[char], start: usize) -> Option<usize> {
    let c0 = *chars.get(start)?;
    if c0.is_ascii_alphabetic()
        && chars.get(start + 1) == Some(&':')
        && matches!(chars.get(start + 2), Some('\\') | Some('/'))
    {
        let mut i = start + 3;
        while i < chars.len() && !PATH_BREAK_CHARS.contains(&chars[i]) {
            i += 1;
        }
        return Some(i);
    }
    if c0 == '\\' && chars.get(start + 1) == Some(&'\\') {
        let mut i = start + 2;
        while i < chars.len() && !PATH_BREAK_CHARS.contains(&chars[i]) {
            i += 1;
        }
        return Some(i);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::{sanitize_for_user, Error};

    #[test]
    fn user_facing_prefixes_are_korean() {
        assert!(Error::InvalidPath("/x/y".into())
            .to_string()
            .starts_with("잘못된 파일 경로"));
        assert_eq!(
            Error::InvalidSchema("지원하지 않는 .lcalc 버전입니다: 9".into()).to_string(),
            "지원하지 않는 .lcalc 버전입니다: 9"
        );
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

    // C18 — sanitize_for_user.

    #[test]
    fn sanitize_redacts_macos_home_path() {
        assert_eq!(
            sanitize_for_user("Permission denied: /Users/sup/Desktop/calc.lcalc"),
            "Permission denied: <경로>"
        );
    }

    #[test]
    fn sanitize_redacts_private_var_path() {
        assert_eq!(
            sanitize_for_user("metadata: /private/var/folders/abc/xyz/T/foo.lcalc"),
            "metadata: <경로>"
        );
    }

    #[test]
    fn sanitize_redacts_linux_home_path() {
        assert_eq!(
            sanitize_for_user("write: /home/alice/data/case.lcalc"),
            "write: <경로>"
        );
    }

    #[test]
    fn sanitize_redacts_tmp_and_etc_paths() {
        assert_eq!(
            sanitize_for_user("write: /tmp/lawcalc.pdf"),
            "write: <경로>"
        );
        assert_eq!(sanitize_for_user("read: /etc/hosts.allow"), "read: <경로>");
    }

    #[test]
    fn sanitize_redacts_windows_path_with_backslashes() {
        assert_eq!(
            sanitize_for_user(r"open: C:\Users\alice\Desktop\case.lcalc"),
            "open: <경로>"
        );
    }

    #[test]
    fn sanitize_redacts_windows_path_with_forward_slashes() {
        assert_eq!(
            sanitize_for_user("open: D:/Users/alice/case.lcalc"),
            "open: <경로>"
        );
    }

    #[test]
    fn sanitize_redacts_windows_unc_path() {
        assert_eq!(
            sanitize_for_user(r"open: \\?\C:\Users\alice\file.lcalc"),
            "open: <경로>"
        );
    }

    #[test]
    fn sanitize_keeps_only_first_line_to_drop_stack_frames() {
        let panic = "thread 'main' panicked at src/main.rs:42\nstack backtrace:\n   0: rust_begin_unwind\n   1: core::panicking::panic_fmt\n   2: lawcalc_kr_lib::commands::lcalc::save_lcalc";
        assert_eq!(
            sanitize_for_user(panic),
            "thread 'main' panicked at src/main.rs:42"
        );
    }

    #[test]
    fn sanitize_passes_through_korean_prefix_and_inner() {
        assert_eq!(
            sanitize_for_user("끝수처리 실패: invalid rounding"),
            "끝수처리 실패: invalid rounding"
        );
        assert_eq!(
            sanitize_for_user("PDF 한글 폰트 임베딩 실패: subsetting glyph 0xAC00"),
            "PDF 한글 폰트 임베딩 실패: subsetting glyph 0xAC00"
        );
    }

    #[test]
    fn sanitize_does_not_redact_dates_or_fractions_or_versions() {
        for input in [
            "2024/01/01",
            "1년 × 5% × 100일 / 365",
            "5/365",
            "version 2.1.0",
            "schema v2 vs v1",
        ] {
            assert_eq!(sanitize_for_user(input), input);
        }
    }

    /// 사용자 toast 시뮬레이션 — Tauri dialog `into_path()` 가 실패해 inner
    /// 가 사용자 절대 경로를 박은 채 `Error::InvalidPath` 로 들어오는 경로.
    /// `App.tsx:312` `runAction` 의 catch 가 노출하는 `error.message` 는
    /// 이미 redact 된 한국어 prefix 만 보여야 한다.
    #[test]
    fn invalid_path_display_redacts_absolute_path_in_toast() {
        let leak = "could not convert /Users/sup/Library/Containers/x/Data/calc.lcalc";
        let toast = Error::InvalidPath(leak.into()).to_string();
        assert!(toast.starts_with("잘못된 파일 경로:"));
        assert!(toast.contains("<경로>"));
        assert!(!toast.contains("/Users/"));
        assert!(!toast.contains("Containers"));
    }

    /// 사용자 toast 시뮬레이션 — `Error::Other` 는 PDF/CSV/클립보드/dialog
    /// task 등 다양한 한국어 prefix 가 이미 박힌 형태로 들어온다. inner 에
    /// 절대 경로 또는 stack frame 이 섞여도 toast 에는 redact 결과만 보여야.
    #[test]
    fn other_display_redacts_absolute_path_in_toast() {
        let leak = "PDF 저장 실패: failed to write /private/var/folders/x/y/T/lawcalc.pdf";
        let toast = Error::Other(leak.into()).to_string();
        assert!(toast.starts_with("PDF 저장 실패"));
        assert!(toast.contains("<경로>"));
        assert!(!toast.contains("/private/"));
    }

    #[test]
    fn other_display_drops_panic_stack_frames_in_toast() {
        let leak = "파일 대화 상자 작업 실패: panic at lcalc.rs:42\nstack backtrace:\n   0: ...";
        let toast = Error::Other(leak.into()).to_string();
        assert!(toast.starts_with("파일 대화 상자 작업 실패"));
        assert!(!toast.contains("stack backtrace"));
        assert!(!toast.contains("0:"));
    }

    #[test]
    fn io_display_drops_panic_stack_frames_in_toast() {
        let io = std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "first line\nsecond line\n   stack frame",
        );
        let toast = Error::from(io).to_string();
        assert!(toast.starts_with("파일 입출력 오류:"));
        assert!(toast.contains("first line"));
        assert!(!toast.contains("second line"));
        assert!(!toast.contains("stack frame"));
    }
}
