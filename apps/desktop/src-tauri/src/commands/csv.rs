use std::path::PathBuf;

use serde_json::Value;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::error::Error;

use super::result_view::{
    format_currency, format_rate_percent, options_summary, ResultView, DISCLAIMER_KO,
};

/// Export a calculation result as a UTF-8 BOM CSV at a path chosen by the user.
///
/// The on-wire `result` payload is the JSON shape of `InterestResult`. We
/// deserialize into [`ResultView`] so a malformed payload fails before the
/// dialog opens. Returns `Ok(None)` when the user cancels.
#[tauri::command]
pub fn export_csv(app: AppHandle, result: Value) -> Result<Option<String>, Error> {
    let view: ResultView = serde_json::from_value(result)?;

    let picked = app
        .dialog()
        .file()
        .add_filter("CSV", &["csv"])
        .set_file_name("calculation.csv")
        .blocking_save_file();

    let Some(file_path) = picked else {
        return Ok(None);
    };

    let path: PathBuf = file_path
        .into_path()
        .map_err(|e| Error::InvalidPath(e.to_string()))?;

    let bytes = render_csv_bytes(&view)?;
    std::fs::write(&path, bytes)?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Build the CSV bytes (BOM + header + segments + total + summary footer).
/// Public to the crate for unit tests.
pub fn render_csv_bytes(view: &ResultView) -> Result<Vec<u8>, Error> {
    let mut wtr = csv::WriterBuilder::new()
        .delimiter(b',')
        .flexible(true)
        .from_writer(vec![]);

    wtr.write_record(["시작일", "종료일", "일수", "이율", "공식", "이자(원)"])?;

    for seg in &view.segments {
        wtr.write_record([
            seg.from.as_str(),
            seg.to.as_str(),
            &seg.days.to_string(),
            &format_rate_percent(seg.rate),
            seg.formula.as_str(),
            &format_currency(seg.interest),
        ])?;
    }

    wtr.write_record([
        "합계",
        "",
        "",
        "",
        "",
        &format_currency(view.total_interest),
    ])?;

    // summary footer rows (key,value pairs, padded so reader still aligns)
    let summary_rows: [(&str, String); 5] = [
        ("원금(원)", format_currency(view.principal)),
        ("이자 합계(원)", format_currency(view.total_interest)),
        ("최종 합계(원)", format_currency(view.grand_total)),
        ("데이터 버전", view.data_version.clone()),
        ("옵션", options_summary(&view.options)),
    ];
    for (key, value) in &summary_rows {
        wtr.write_record([*key, value.as_str()])?;
    }
    wtr.write_record(["계산 시각", view.computed_at.as_str()])?;
    wtr.write_record(["면책 고지", DISCLAIMER_KO])?;

    let inner = wtr
        .into_inner()
        .map_err(|e| Error::Other(format!("csv finalize: {e}")))?;

    let mut out = Vec::with_capacity(inner.len() + 3);
    // UTF-8 BOM so Excel auto-detects encoding for Korean.
    out.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    out.extend_from_slice(&inner);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::result_view::{OptionsView, SegmentView};

    fn sample() -> ResultView {
        ResultView {
            principal: 10_000_000.0,
            segments: vec![
                SegmentView {
                    from: "2024-01-01".into(),
                    to: "2024-12-31".into(),
                    days: 366,
                    rate: 0.05,
                    formula: "10,000,000 × 0.05 × 366 / 366".into(),
                    interest: 500_000.0,
                },
                SegmentView {
                    from: "2025-01-01".into(),
                    to: "2025-06-30".into(),
                    days: 181,
                    rate: 0.12,
                    formula: "10,000,000 × 0.12 × 181 / 365".into(),
                    interest: 595_068.0,
                },
            ],
            total_interest: 1_095_068.0,
            grand_total: 11_095_068.0,
            options: OptionsView {
                mode: "period".into(),
                leap_year: "actual".into(),
                include_first_day: false,
            },
            data_version: "legal-rates/v1.0.0".into(),
            computed_at: "2026-05-09T12:00:00+09:00".into(),
        }
    }

    #[test]
    fn writes_utf8_bom_then_header() {
        let bytes = render_csv_bytes(&sample()).unwrap();
        assert_eq!(&bytes[..3], &[0xEF, 0xBB, 0xBF]);
        let body = std::str::from_utf8(&bytes[3..]).unwrap();
        let first_line = body.lines().next().unwrap();
        assert!(first_line.contains("시작일"));
        assert!(first_line.contains("이자(원)"));
    }

    #[test]
    fn includes_segment_rows_and_total() {
        let bytes = render_csv_bytes(&sample()).unwrap();
        let body = std::str::from_utf8(&bytes[3..]).unwrap();
        assert!(body.contains("2024-01-01,2024-12-31,366,5%"));
        // Total row: "합계" + 4 empty + quoted total (contains commas).
        assert!(body.contains("합계,,,,,\"1,095,068\""));
    }

    #[test]
    fn formula_with_comma_is_quoted() {
        let bytes = render_csv_bytes(&sample()).unwrap();
        let body = std::str::from_utf8(&bytes[3..]).unwrap();
        assert!(body.contains("\"10,000,000 × 0.05 × 366 / 366\""));
    }

    /// Manual visual check: writes a sample CSV to `/tmp/lawcalc-sample.csv`.
    /// Run with `cargo test -- --ignored dump_sample_csv`.
    #[test]
    #[ignore]
    fn dump_sample_csv() {
        let bytes = render_csv_bytes(&sample()).unwrap();
        std::fs::write("/tmp/lawcalc-sample.csv", &bytes).expect("write sample csv");
        eprintln!("wrote /tmp/lawcalc-sample.csv ({} bytes)", bytes.len());
    }

    #[test]
    fn footer_has_disclaimer_and_data_version() {
        let bytes = render_csv_bytes(&sample()).unwrap();
        let body = std::str::from_utf8(&bytes[3..]).unwrap();
        assert!(body.contains("legal-rates/v1.0.0"));
        assert!(body.contains("면책 고지"));
        assert!(body.contains("검토용 계산"));
    }
}
