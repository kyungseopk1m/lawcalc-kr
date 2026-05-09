use std::path::PathBuf;

use serde_json::Value;
use tauri::{async_runtime, AppHandle};
use tauri_plugin_dialog::DialogExt;

use crate::error::Error;

use super::result_view::{
    disclaimer_text, format_currency, format_rate_percent, options_summary, InheritanceResultView,
    ResultView,
};

/// Export a calculation result as a UTF-8 BOM CSV at a path chosen by the user.
///
/// The on-wire `result` payload is the JSON shape of `InterestResult`. We
/// deserialize into [`ResultView`] so a malformed payload fails before the
/// dialog opens. Returns `Ok(None)` when the user cancels.
///
/// dialog blocking 변형 + 파일 IO 는 main thread deadlock 회피 위해
/// `async_runtime::spawn_blocking` 안에서 실행한다 (Tauri 2.x).
#[tauri::command]
pub async fn export_csv(app: AppHandle, result: Value) -> Result<Option<String>, Error> {
    let view: ResultView = serde_json::from_value(result)?;

    let app2 = app.clone();
    async_runtime::spawn_blocking(move || -> Result<Option<String>, Error> {
        let picked = app2
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
    })
    .await
    .map_err(|e| Error::Other(format!("dialog task: {e}")))?
}

#[tauri::command]
pub async fn export_inheritance_csv(
    app: AppHandle,
    result: Value,
) -> Result<Option<String>, Error> {
    let view: InheritanceResultView = serde_json::from_value(result)?;

    let app2 = app.clone();
    async_runtime::spawn_blocking(move || -> Result<Option<String>, Error> {
        let picked = app2
            .dialog()
            .file()
            .add_filter("CSV", &["csv"])
            .set_file_name("inheritance-calculation.csv")
            .blocking_save_file();

        let Some(file_path) = picked else {
            return Ok(None);
        };

        let path: PathBuf = file_path
            .into_path()
            .map_err(|e| Error::InvalidPath(e.to_string()))?;

        let bytes = render_inheritance_csv_bytes(&view)?;
        std::fs::write(&path, bytes)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| Error::Other(format!("dialog task: {e}")))?
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
    wtr.write_record(["면책 고지", disclaimer_text(view.disclaimer.as_deref())])?;

    let inner = wtr
        .into_inner()
        .map_err(|e| Error::Other(format!("CSV 마무리 실패: {e}")))?;

    let mut out = Vec::with_capacity(inner.len() + 3);
    // UTF-8 BOM so Excel auto-detects encoding for Korean.
    out.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    out.extend_from_slice(&inner);
    Ok(out)
}

pub fn render_inheritance_csv_bytes(view: &InheritanceResultView) -> Result<Vec<u8>, Error> {
    let mut wtr = csv::WriterBuilder::new()
        .delimiter(b',')
        .flexible(true)
        .from_writer(vec![]);

    wtr.write_record(["상속인", "지분(약분)", "약분 전", "백분율(참고)"])?;

    for share in &view.shares {
        wtr.write_record([
            share.name.as_str(),
            &format!("{}/{}", share.numerator, share.denominator),
            &format!("{}/{}", share.raw_numerator, share.raw_denominator),
            &format_inheritance_percent(share.numerator, share.denominator),
        ])?;
    }

    wtr.write_record(["피상속인", view.decedent.name.as_deref().unwrap_or("-")])?;
    wtr.write_record(["사망일", view.decedent.deceased_at.as_str()])?;
    wtr.write_record(["데이터 버전", view.data_version.as_str()])?;
    wtr.write_record(["계산 시각", view.computed_at.as_str()])?;
    wtr.write_record(["면책 고지", disclaimer_text(Some(&view.disclaimer))])?;

    let inner = wtr
        .into_inner()
        .map_err(|e| Error::Other(format!("CSV 마무리 실패: {e}")))?;

    let mut out = Vec::with_capacity(inner.len() + 3);
    out.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    out.extend_from_slice(&inner);
    Ok(out)
}

fn format_inheritance_percent(numerator: i64, denominator: i64) -> String {
    if denominator == 0 {
        return "-".to_string();
    }
    format!("{:.2}%", (numerator as f64 / denominator as f64) * 100.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::result_view::{OptionsView, SegmentView, DISCLAIMER_KO};

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
                rounding: None,
            },
            data_version: "legal-rates/v1.0.0".into(),
            computed_at: "2026-05-09T12:00:00+09:00".into(),
            disclaimer: Some(DISCLAIMER_KO.into()),
        }
    }

    fn inheritance_sample() -> InheritanceResultView {
        InheritanceResultView {
            decedent: crate::commands::result_view::InheritanceDecedentView {
                name: Some("피상속인".into()),
                deceased_at: "2025-01-01".into(),
            },
            shares: vec![
                crate::commands::result_view::InheritanceShareView {
                    name: "배우자".into(),
                    numerator: 3,
                    denominator: 7,
                    raw_numerator: 3,
                    raw_denominator: 7,
                },
                crate::commands::result_view::InheritanceShareView {
                    name: "자녀1".into(),
                    numerator: 2,
                    denominator: 7,
                    raw_numerator: 2,
                    raw_denominator: 7,
                },
            ],
            disclaimer: DISCLAIMER_KO.into(),
            data_version: "inheritance/v1.0.0".into(),
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

    /// Empty segments must still produce a valid file (header + 0 합계 +
    /// summary footer). 0원 입력은 사용자 테스트에서 발생할 수 있는 시작 상태.
    #[test]
    fn empty_segments_renders_header_and_zero_total() {
        let mut view = sample();
        view.segments.clear();
        view.total_interest = 0.0;
        view.grand_total = view.principal;
        let bytes = render_csv_bytes(&view).unwrap();
        let body = std::str::from_utf8(&bytes[3..]).unwrap();
        assert!(body.contains("시작일"));
        assert!(body.contains("합계,,,,,0"));
        assert!(body.contains("이자 합계(원),0"));
        assert!(body.contains("면책 고지"));
    }

    #[test]
    fn inheritance_csv_includes_shares_and_disclaimer() {
        let bytes = render_inheritance_csv_bytes(&inheritance_sample()).unwrap();
        assert_eq!(&bytes[..3], &[0xEF, 0xBB, 0xBF]);
        let body = std::str::from_utf8(&bytes[3..]).unwrap();
        assert!(body.contains("상속인"));
        assert!(body.contains("배우자,3/7,3/7,42.86%"));
        assert!(body.contains("inheritance/v1.0.0"));
        assert!(body.contains("면책 고지"));
    }
}
