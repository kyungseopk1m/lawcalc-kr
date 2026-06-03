use std::borrow::Cow;
use std::path::PathBuf;

use serde_json::Value;
use tauri::{async_runtime, AppHandle};
use tauri_plugin_dialog::DialogExt;

use crate::error::Error;

use super::result_view::{
    disclaimer_text, format_currency, format_rate_percent, options_summary,
    CompensationDeathResultView, CompensationResultView, InheritanceResultView,
    LitigationCostResultView, ResultView,
};

/// CSV formula injection defense.
///
/// Excel / Numbers / LibreOffice 가 셀 값이 `=`, `+`, `-`, `@`, 탭, CR 로
/// 시작하면 수식으로 해석한다. 사용자 입력(상속인/피상속인 이름) 또는 음수
/// 금액(`format_currency(-1234.0) = "-1,234"`)이 그대로 셀에 들어가면 외부
/// 사용자가 받은 CSV 가 표 도구에서 의도치 않은 수식으로 평가될 수 있다.
/// 위험 prefix 가 있으면 작은따옴표(`'`)를 붙여 텍스트로 강제한다.
fn escape_csv_cell(cell: &str) -> Cow<'_, str> {
    match cell.as_bytes().first() {
        Some(b'=' | b'+' | b'-' | b'@' | b'\t' | b'\r') => Cow::Owned(format!("'{cell}")),
        _ => Cow::Borrowed(cell),
    }
}

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
    .map_err(|e| Error::Other(format!("파일 대화 상자 작업 실패: {e}")))?
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
    .map_err(|e| Error::Other(format!("파일 대화 상자 작업 실패: {e}")))?
}

#[tauri::command]
pub async fn export_litigation_cost_csv(
    app: AppHandle,
    result: Value,
) -> Result<Option<String>, Error> {
    let view: LitigationCostResultView = serde_json::from_value(result)?;

    let app2 = app.clone();
    async_runtime::spawn_blocking(move || -> Result<Option<String>, Error> {
        let picked = app2
            .dialog()
            .file()
            .add_filter("CSV", &["csv"])
            .set_file_name("litigation-cost-calculation.csv")
            .blocking_save_file();

        let Some(file_path) = picked else {
            return Ok(None);
        };

        let path: PathBuf = file_path
            .into_path()
            .map_err(|e| Error::InvalidPath(e.to_string()))?;

        let bytes = render_litigation_cost_csv_bytes(&view)?;
        std::fs::write(&path, bytes)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| Error::Other(format!("파일 대화 상자 작업 실패: {e}")))?
}

#[tauri::command]
pub async fn export_compensation_csv(
    app: AppHandle,
    result: Value,
) -> Result<Option<String>, Error> {
    let view: CompensationResultView = serde_json::from_value(result)?;

    let app2 = app.clone();
    async_runtime::spawn_blocking(move || -> Result<Option<String>, Error> {
        let picked = app2
            .dialog()
            .file()
            .add_filter("CSV", &["csv"])
            .set_file_name("compensation-calculation.csv")
            .blocking_save_file();

        let Some(file_path) = picked else {
            return Ok(None);
        };

        let path: PathBuf = file_path
            .into_path()
            .map_err(|e| Error::InvalidPath(e.to_string()))?;

        let bytes = render_compensation_csv_bytes(&view)?;
        std::fs::write(&path, bytes)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| Error::Other(format!("파일 대화 상자 작업 실패: {e}")))?
}

#[tauri::command]
pub async fn export_compensation_death_csv(
    app: AppHandle,
    result: Value,
) -> Result<Option<String>, Error> {
    let view: CompensationDeathResultView = serde_json::from_value(result)?;

    let app2 = app.clone();
    async_runtime::spawn_blocking(move || -> Result<Option<String>, Error> {
        let picked = app2
            .dialog()
            .file()
            .add_filter("CSV", &["csv"])
            .set_file_name("compensation-death-calculation.csv")
            .blocking_save_file();

        let Some(file_path) = picked else {
            return Ok(None);
        };

        let path: PathBuf = file_path
            .into_path()
            .map_err(|e| Error::InvalidPath(e.to_string()))?;

        let bytes = render_compensation_death_csv_bytes(&view)?;
        std::fs::write(&path, bytes)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| Error::Other(format!("파일 대화 상자 작업 실패: {e}")))?
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
        let row: [String; 6] = [
            escape_csv_cell(seg.from.as_str()).into_owned(),
            escape_csv_cell(seg.to.as_str()).into_owned(),
            escape_csv_cell(&seg.days.to_string()).into_owned(),
            escape_csv_cell(&format_rate_percent(seg.rate)).into_owned(),
            escape_csv_cell(seg.formula.as_str()).into_owned(),
            escape_csv_cell(&format_currency(seg.interest)).into_owned(),
        ];
        wtr.write_record(&row)?;
    }

    let total_cell = escape_csv_cell(&format_currency(view.total_interest)).into_owned();
    wtr.write_record(["합계", "", "", "", "", total_cell.as_str()])?;

    // summary footer rows (key,value pairs, padded so reader still aligns)
    let summary_rows: [(&str, String); 5] = [
        ("원금(원)", format_currency(view.principal)),
        ("이자 합계(원)", format_currency(view.total_interest)),
        ("최종 합계(원)", format_currency(view.grand_total)),
        ("데이터 버전", view.data_version.clone()),
        ("옵션", options_summary(&view.options)),
    ];
    for (key, value) in &summary_rows {
        let escaped = escape_csv_cell(value).into_owned();
        wtr.write_record([*key, escaped.as_str()])?;
    }
    let computed_cell = escape_csv_cell(view.computed_at.as_str()).into_owned();
    wtr.write_record(["계산 시각", computed_cell.as_str()])?;
    let disclaimer_cell = escape_csv_cell(disclaimer_text(view.disclaimer.as_deref())).into_owned();
    wtr.write_record(["면책 고지", disclaimer_cell.as_str()])?;

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
        let row: [String; 4] = [
            escape_csv_cell(share.name.as_str()).into_owned(),
            escape_csv_cell(&format!("{}/{}", share.numerator, share.denominator)).into_owned(),
            escape_csv_cell(&format!(
                "{}/{}",
                share.raw_numerator, share.raw_denominator
            ))
            .into_owned(),
            escape_csv_cell(&format_inheritance_percent(
                share.numerator,
                share.denominator,
            ))
            .into_owned(),
        ];
        wtr.write_record(&row)?;
    }

    let decedent_cell = escape_csv_cell(view.decedent.name.as_deref().unwrap_or("-")).into_owned();
    wtr.write_record(["피상속인", decedent_cell.as_str()])?;
    let deceased_cell = escape_csv_cell(view.decedent.deceased_at.as_str()).into_owned();
    wtr.write_record(["사망일", deceased_cell.as_str()])?;
    let data_version_cell = escape_csv_cell(view.data_version.as_str()).into_owned();
    wtr.write_record(["데이터 버전", data_version_cell.as_str()])?;
    let computed_cell = escape_csv_cell(view.computed_at.as_str()).into_owned();
    wtr.write_record(["계산 시각", computed_cell.as_str()])?;
    let disclaimer_cell = escape_csv_cell(disclaimer_text(Some(&view.disclaimer))).into_owned();
    wtr.write_record(["면책 고지", disclaimer_cell.as_str()])?;

    let inner = wtr
        .into_inner()
        .map_err(|e| Error::Other(format!("CSV 마무리 실패: {e}")))?;

    let mut out = Vec::with_capacity(inner.len() + 3);
    out.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    out.extend_from_slice(&inner);
    Ok(out)
}

pub fn render_litigation_cost_csv_bytes(view: &LitigationCostResultView) -> Result<Vec<u8>, Error> {
    let mut wtr = csv::WriterBuilder::new()
        .delimiter(b',')
        .flexible(true)
        .from_writer(vec![]);

    wtr.write_record(["항목", "금액(원)", "산식", "데이터 버전"])?;
    let rows = [
        ("인지대", &view.stamp_duty),
        ("송달료", &view.delivery_fee),
        ("변호사보수", &view.lawyer_fee),
    ];
    for (label, component) in rows {
        let amount_cell = escape_csv_cell(&format_currency(component.amount)).into_owned();
        let formula_cell = escape_csv_cell(component.formula_text.as_str()).into_owned();
        let version_cell = escape_csv_cell(component.data_version.as_str()).into_owned();
        wtr.write_record([
            label,
            amount_cell.as_str(),
            formula_cell.as_str(),
            version_cell.as_str(),
        ])?;
    }
    let total_cell = escape_csv_cell(&format_currency(view.total_amount)).into_owned();
    wtr.write_record(["합계", total_cell.as_str(), "", ""])?;

    if let Some(distribution) = &view.distribution {
        wtr.write_record([""])?;
        wtr.write_record(["분배 방식", distribution.mode.as_str()])?;
        wtr.write_record([
            "분배 대상 합계",
            &format_currency(distribution.total_won as f64),
        ])?;
        wtr.write_record(["당사자", "분배액(원)"])?;
        for (index, amount) in distribution.per_party.iter().enumerate() {
            let label = format!("당사자 {}", index + 1);
            let amount_cell = escape_csv_cell(&format_currency(*amount as f64)).into_owned();
            wtr.write_record([label.as_str(), amount_cell.as_str()])?;
        }
        wtr.write_record(["잔여원", &distribution.remainder.to_string()])?;
    }

    let versions = view
        .data_versions
        .iter()
        .map(|(key, value)| format!("{key}: {value}"))
        .collect::<Vec<_>>()
        .join(" / ");
    let versions_cell = escape_csv_cell(&versions).into_owned();
    wtr.write_record(["데이터 버전", versions_cell.as_str()])?;
    let computed_cell = escape_csv_cell(view.computed_at.as_str()).into_owned();
    wtr.write_record(["계산 시각", computed_cell.as_str()])?;
    let disclaimer_cell = escape_csv_cell(disclaimer_text(Some(&view.disclaimer))).into_owned();
    wtr.write_record(["면책 고지", disclaimer_cell.as_str()])?;

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

pub fn render_compensation_csv_bytes(view: &CompensationResultView) -> Result<Vec<u8>, Error> {
    let mut wtr = csv::WriterBuilder::new()
        .delimiter(b',')
        .flexible(true)
        .from_writer(vec![]);

    wtr.write_record([
        "기간(개월)",
        "상실률",
        "단가(원/일)",
        "호프만(적용)",
        "금액(원)",
    ])?;
    for (i, segment) in view.segments.iter().enumerate() {
        let cap_marker = if view.hoffman240_cap.capped_at_index == Some(i as i64) {
            " (한도)"
        } else {
            ""
        };
        let row: [String; 5] = [
            escape_csv_cell(&format!("{} ~ {}", segment.start_month, segment.end_month))
                .into_owned(),
            escape_csv_cell(&format!("{:.2}%", segment.loss_rate * 100.0)).into_owned(),
            escape_csv_cell(&format_currency(segment.daily_wage_won)).into_owned(),
            escape_csv_cell(&format!("{:.6}{}", segment.applied_hoffman, cap_marker)).into_owned(),
            escape_csv_cell(&format_currency(segment.amount_floor_won)).into_owned(),
        ];
        wtr.write_record(&row)?;
    }
    let lost_income_cell =
        escape_csv_cell(&format_currency(view.lost_income_subtotal_won)).into_owned();
    wtr.write_record(["일실수입 소계", "", "", "", lost_income_cell.as_str()])?;

    let summary_rows: [(&str, String); 9] = [
        (
            "중복 노동력상실률",
            format!("{:.2}%", view.combined_loss_rate * 100.0),
        ),
        ("위자료(원)", format_currency(view.solatium_won)),
        (
            "재산상 손해 소계(원)",
            format_currency(view.pecuniary_damages_subtotal_won),
        ),
        (
            "과실비율",
            format!("{:.2}%", view.fault_offset.ratio * 100.0),
        ),
        (
            "과실상계 후(원)",
            format_currency(view.fault_offset.after_won),
        ),
        (
            "비율공제 소계(원)",
            format_currency(view.deductions.ratio_subtotal_won),
        ),
        (
            "전액공제 소계(원)",
            format_currency(view.deductions.absolute_subtotal_won),
        ),
        // 산재(장해급여) 공제 — 자동차 결과는 빈 key 로 skip (회귀 0).
        match view.deductions.industrial_benefit_won {
            Some(benefit) => ("산재보험급여 공제(장해급여)(원)", format_currency(benefit)),
            None => ("", String::new()),
        },
        ("최종 합계(원)", format_currency(view.final_won)),
    ];
    for (key, value) in &summary_rows {
        if key.is_empty() {
            continue;
        }
        let escaped = escape_csv_cell(value).into_owned();
        wtr.write_record([*key, escaped.as_str()])?;
    }

    let versions = format!(
        "laborRates {} / lifeExpectancy {} / hoffman {} / leibniz {}",
        view.data_versions.labor_rates,
        view.data_versions.life_expectancy,
        view.data_versions.hoffman,
        view.data_versions.leibniz
    );
    let versions_cell = escape_csv_cell(&versions).into_owned();
    wtr.write_record(["데이터 버전", versions_cell.as_str()])?;
    let computed_cell = escape_csv_cell(view.computed_at.as_str()).into_owned();
    wtr.write_record(["계산 시각", computed_cell.as_str()])?;
    let disclaimer_cell = escape_csv_cell(disclaimer_text(Some(&view.disclaimer))).into_owned();
    wtr.write_record(["면책 고지", disclaimer_cell.as_str()])?;

    let inner = wtr
        .into_inner()
        .map_err(|e| Error::Other(format!("CSV 마무리 실패: {e}")))?;

    let mut out = Vec::with_capacity(inner.len() + 3);
    out.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    out.extend_from_slice(&inner);
    Ok(out)
}

pub fn render_compensation_death_csv_bytes(
    view: &CompensationDeathResultView,
) -> Result<Vec<u8>, Error> {
    let mut wtr = csv::WriterBuilder::new()
        .delimiter(b',')
        .flexible(true)
        .from_writer(vec![]);

    wtr.write_record(["기간(개월)", "단가(원/일)", "호프만(적용)", "금액(원)"])?;
    for (i, segment) in view.segments.iter().enumerate() {
        let cap_marker = if view.hoffman240_cap.capped_at_index == Some(i as i64) {
            " (한도)"
        } else {
            ""
        };
        let row: [String; 4] = [
            escape_csv_cell(&format!("{} ~ {}", segment.start_month, segment.end_month))
                .into_owned(),
            escape_csv_cell(&format_currency(segment.daily_wage_won)).into_owned(),
            escape_csv_cell(&format!("{:.6}{}", segment.applied_hoffman, cap_marker)).into_owned(),
            escape_csv_cell(&format_currency(segment.amount_floor_won)).into_owned(),
        ];
        wtr.write_record(&row)?;
    }
    let lost_income_cell =
        escape_csv_cell(&format_currency(view.lost_income_subtotal_won)).into_owned();
    wtr.write_record([
        "일실수입 소계 (생계비 공제 후)",
        "",
        "",
        lost_income_cell.as_str(),
    ])?;

    let summary_rows: [(&str, String); 9] = [
        (
            "생계비 공제 비율",
            format!("{:.2}%", view.living_cost_deduction_ratio * 100.0),
        ),
        ("위자료(원)", format_currency(view.solatium_won)),
        (
            "재산상 손해 소계(원)",
            format_currency(view.pecuniary_damages_subtotal_won),
        ),
        (
            "과실비율",
            format!("{:.2}%", view.fault_offset.ratio * 100.0),
        ),
        (
            "과실상계 후(원)",
            format_currency(view.fault_offset.after_won),
        ),
        ("장례비(원)", format_currency(view.funeral_expense_won)),
        // 산재(유족급여) 공제 — 자동차 결과는 빈 key 로 skip (회귀 0).
        match view.deductions.industrial_benefit_won {
            Some(benefit) => ("산재보험급여 공제(유족급여)(원)", format_currency(benefit)),
            None => ("", String::new()),
        },
        ("최종 합계(원)", format_currency(view.final_won)),
        ("", String::new()),
    ];
    for (key, value) in &summary_rows {
        if key.is_empty() {
            continue;
        }
        let escaped = escape_csv_cell(value).into_owned();
        wtr.write_record([*key, escaped.as_str()])?;
    }

    if let Some(shares) = view.inheritance_shares.as_ref() {
        if !shares.is_empty() {
            wtr.write_record(["상속인", "지분(약분)", "", "배정 금액(원)"])?;
            for share in shares {
                let row: [String; 4] = [
                    escape_csv_cell(&share.name).into_owned(),
                    escape_csv_cell(&format!("{}/{}", share.numerator, share.denominator))
                        .into_owned(),
                    String::new(),
                    escape_csv_cell(&format_currency(share.amount_won)).into_owned(),
                ];
                wtr.write_record(&row)?;
            }
        }
    }

    let versions = format!(
        "laborRates {} / lifeExpectancy {} / hoffman {} / leibniz {}",
        view.data_versions.labor_rates,
        view.data_versions.life_expectancy,
        view.data_versions.hoffman,
        view.data_versions.leibniz
    );
    let versions_cell = escape_csv_cell(&versions).into_owned();
    wtr.write_record(["데이터 버전", versions_cell.as_str()])?;
    let computed_cell = escape_csv_cell(view.computed_at.as_str()).into_owned();
    wtr.write_record(["계산 시각", computed_cell.as_str()])?;
    let disclaimer_cell = escape_csv_cell(disclaimer_text(Some(&view.disclaimer))).into_owned();
    wtr.write_record(["면책 고지", disclaimer_cell.as_str()])?;

    let inner = wtr
        .into_inner()
        .map_err(|e| Error::Other(format!("CSV 마무리 실패: {e}")))?;

    let mut out = Vec::with_capacity(inner.len() + 3);
    out.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    out.extend_from_slice(&inner);
    Ok(out)
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

    #[test]
    fn escape_csv_cell_neutralizes_formula_prefixes() {
        for prefix in ["=", "+", "-", "@", "\t", "\r"] {
            let payload = format!("{prefix}HYPERLINK(\"x\")");
            let escaped = escape_csv_cell(&payload);
            assert_eq!(
                escaped.chars().next(),
                Some('\''),
                "prefix {prefix:?} must be neutralized"
            );
            assert!(escaped.ends_with(payload.as_str()));
        }
    }

    #[test]
    fn escape_csv_cell_passes_safe_text_through() {
        let cases = ["1,000,000원", "5%", "2024-01-01", "본 결과는 검토용", ""];
        for cell in cases {
            assert_eq!(escape_csv_cell(cell).as_ref(), cell);
        }
    }

    /// Negative currency (e.g. interest cap reductions in future domains)
    /// already starts with `-`; without escape Excel would read `-1,234`
    /// as a formula yielding `-1234`.
    #[test]
    fn negative_currency_is_quoted_in_csv_output() {
        let mut view = sample();
        view.total_interest = -1234.0;
        view.grand_total = view.principal - 1234.0;
        let bytes = render_csv_bytes(&view).unwrap();
        let body = std::str::from_utf8(&bytes[3..]).unwrap();
        assert!(
            body.contains("'-1,234"),
            "body did not escape negative: {body}"
        );
    }

    fn compensation_sample() -> CompensationResultView {
        use crate::commands::result_view::{
            CompensationDataVersionsView, CompensationDeductionsView, CompensationFaultOffsetView,
            CompensationHoffman240CapView, CompensationSegmentView, DISCLAIMER_KO,
        };
        CompensationResultView {
            combined_loss_rate: 0.3,
            segments: vec![CompensationSegmentView {
                start_month: 0,
                end_month: 360,
                loss_rate: 0.3,
                daily_wage_won: 172_068.0,
                monthly_wage_won: 3_785_496.0,
                raw_hoffman: 219.610067,
                applied_hoffman: 219.610067,
                amount_floor_won: 249_399_909.0,
            }],
            lost_income_subtotal_won: 249_399_909.0,
            solatium_won: 0.0,
            pecuniary_damages_subtotal_won: 249_399_909.0,
            fault_offset: CompensationFaultOffsetView {
                ratio: 0.0,
                before_won: 249_399_909.0,
                after_won: 249_399_909.0,
            },
            deductions: CompensationDeductionsView {
                ratio_subtotal_won: 0.0,
                absolute_subtotal_won: 0.0,
                industrial_benefit_won: None,
                after_won: 249_399_909.0,
            },
            final_won: 249_399_900.0,
            hoffman240_cap: CompensationHoffman240CapView {
                applied_hoffman: vec![219.610067],
                capped_at_index: None,
            },
            data_versions: CompensationDataVersionsView {
                labor_rates: "labor-rates/v1.0.0".into(),
                life_expectancy: "life-expectancy/v1.0.0".into(),
                hoffman: "hoffman/v1.0.0".into(),
                leibniz: "leibniz/v1.0.0".into(),
            },
            disclaimer: DISCLAIMER_KO.into(),
            computed_at: "2026-05-18T12:00:00+09:00".into(),
        }
    }

    #[test]
    fn compensation_csv_includes_segments_summary_and_disclaimer() {
        let bytes = render_compensation_csv_bytes(&compensation_sample()).unwrap();
        assert_eq!(&bytes[..3], &[0xEF, 0xBB, 0xBF]);
        let body = std::str::from_utf8(&bytes[3..]).unwrap();
        assert!(body.contains("기간(개월)"));
        assert!(body.contains("0 ~ 360"));
        assert!(body.contains("\"249,399,909\""));
        assert!(body.contains("일실수입 소계"));
        assert!(body.contains("\"249,399,900\""));
        assert!(body.contains("labor-rates/v1.0.0"));
        assert!(body.contains("life-expectancy/v1.0.0"));
        assert!(body.contains("hoffman/v1.0.0"));
        assert!(body.contains("leibniz/v1.0.0"));
        assert!(body.contains("면책 고지"));
        assert!(body.contains("검토용 계산"));
    }

    #[test]
    fn compensation_csv_marks_240_cap_segment() {
        let mut view = compensation_sample();
        view.hoffman240_cap.capped_at_index = Some(0);
        view.segments[0].applied_hoffman = 240.0;
        let bytes = render_compensation_csv_bytes(&view).unwrap();
        let body = std::str::from_utf8(&bytes[3..]).unwrap();
        assert!(body.contains("(한도)"));
    }

    #[test]
    fn compensation_csv_includes_industrial_disability_benefit_line() {
        let mut view = compensation_sample();
        view.deductions.industrial_benefit_won = Some(50_000_000.0);
        let bytes = render_compensation_csv_bytes(&view).unwrap();
        let body = std::str::from_utf8(&bytes[3..]).unwrap();
        assert!(body.contains("산재보험급여 공제(장해급여)(원)"));
        assert!(body.contains("\"50,000,000\""));
    }

    #[test]
    fn compensation_csv_omits_industrial_line_for_auto() {
        let bytes = render_compensation_csv_bytes(&compensation_sample()).unwrap();
        let body = std::str::from_utf8(&bytes[3..]).unwrap();
        assert!(!body.contains("산재보험급여"));
    }

    fn compensation_death_sample() -> CompensationDeathResultView {
        use crate::commands::result_view::{
            CompensationDataVersionsView, CompensationDeductionsView, CompensationFaultOffsetView,
            CompensationHoffman240CapView, CompensationInheritanceShareView,
            CompensationSegmentView, DISCLAIMER_KO,
        };
        CompensationDeathResultView {
            living_cost_deduction_ratio: 1.0 / 3.0,
            segments: vec![CompensationSegmentView {
                start_month: 0,
                end_month: 360,
                loss_rate: 1.0,
                daily_wage_won: 172_068.0,
                monthly_wage_won: 3_785_496.0,
                raw_hoffman: 219.610067,
                applied_hoffman: 219.610067,
                amount_floor_won: 554_222_020.0,
            }],
            lost_income_subtotal_won: 554_222_020.0,
            solatium_won: 80_000_000.0,
            pecuniary_damages_subtotal_won: 634_222_020.0,
            fault_offset: CompensationFaultOffsetView {
                ratio: 0.0,
                before_won: 634_222_020.0,
                after_won: 634_222_020.0,
            },
            funeral_expense_won: 5_000_000.0,
            deductions: CompensationDeductionsView {
                ratio_subtotal_won: 0.0,
                absolute_subtotal_won: 0.0,
                industrial_benefit_won: None,
                after_won: 639_222_020.0,
            },
            final_won: 639_222_000.0,
            inheritance_shares: Some(vec![
                CompensationInheritanceShareView {
                    name: "배우자".into(),
                    numerator: 3,
                    denominator: 7,
                    amount_won: 273_952_286.0,
                },
                CompensationInheritanceShareView {
                    name: "자녀1".into(),
                    numerator: 2,
                    denominator: 7,
                    amount_won: 182_634_857.0,
                },
            ]),
            hoffman240_cap: CompensationHoffman240CapView {
                applied_hoffman: vec![219.610067],
                capped_at_index: None,
            },
            data_versions: CompensationDataVersionsView {
                labor_rates: "labor-rates/v1.0.0".into(),
                life_expectancy: "life-expectancy/v1.0.0".into(),
                hoffman: "hoffman/v1.0.0".into(),
                leibniz: "leibniz/v1.0.0".into(),
            },
            disclaimer: DISCLAIMER_KO.into(),
            computed_at: "2026-06-02T12:00:00+09:00".into(),
        }
    }

    #[test]
    fn compensation_death_csv_includes_funeral_living_cost_shares_and_disclaimer() {
        let bytes = render_compensation_death_csv_bytes(&compensation_death_sample()).unwrap();
        assert_eq!(&bytes[..3], &[0xEF, 0xBB, 0xBF]);
        let body = std::str::from_utf8(&bytes[3..]).unwrap();
        assert!(body.contains("생계비 공제 비율"));
        assert!(body.contains("일실수입 소계 (생계비 공제 후)"));
        assert!(body.contains("장례비(원)"));
        assert!(body.contains("상속인"));
        assert!(body.contains("배우자"));
        assert!(body.contains("3/7"));
        assert!(body.contains("\"639,222,000\""));
        assert!(body.contains("면책 고지"));
        assert!(body.contains("검토용 계산"));
    }

    #[test]
    fn compensation_death_csv_omits_inheritance_when_absent() {
        let mut view = compensation_death_sample();
        view.inheritance_shares = None;
        let bytes = render_compensation_death_csv_bytes(&view).unwrap();
        let body = std::str::from_utf8(&bytes[3..]).unwrap();
        assert!(!body.contains("상속인"));
        assert!(body.contains("장례비(원)"));
    }

    #[test]
    fn compensation_death_csv_includes_industrial_survivor_benefit_line() {
        let mut view = compensation_death_sample();
        view.deductions.industrial_benefit_won = Some(100_000_000.0);
        let bytes = render_compensation_death_csv_bytes(&view).unwrap();
        let body = std::str::from_utf8(&bytes[3..]).unwrap();
        assert!(body.contains("산재보험급여 공제(유족급여)(원)"));
        assert!(body.contains("\"100,000,000\""));
    }

    /// User-controlled heir name fields must not be evaluated as formulas in
    /// the death-distribution CSV.
    #[test]
    fn malicious_share_name_is_escaped_in_death_csv() {
        let mut view = compensation_death_sample();
        if let Some(shares) = view.inheritance_shares.as_mut() {
            shares[0].name = "=HYPERLINK(\"http://x\",\"x\")".to_string();
        }
        let bytes = render_compensation_death_csv_bytes(&view).unwrap();
        let body = std::str::from_utf8(&bytes[3..]).unwrap();
        assert!(body.contains("'=HYPERLINK"));
    }

    /// User-controlled name fields must not be evaluated as formulas in the
    /// inheritance CSV.
    #[test]
    fn malicious_share_name_is_escaped_in_inheritance_csv() {
        let mut view = inheritance_sample();
        view.shares[0].name = "=HYPERLINK(\"http://x\",\"x\")".to_string();
        view.decedent.name = Some("@SUM(A1)".to_string());
        let bytes = render_inheritance_csv_bytes(&view).unwrap();
        let body = std::str::from_utf8(&bytes[3..]).unwrap();
        // Single-quote prefix prevents Excel/Numbers from evaluating as
        // formula. CSV writer wraps the cell in double-quotes because the
        // payload contains commas and embedded double-quotes.
        assert!(
            body.contains("\"'=HYPERLINK("),
            "leading apostrophe missing: {body}"
        );
        assert!(body.contains("'@SUM(A1)"));
    }
}
