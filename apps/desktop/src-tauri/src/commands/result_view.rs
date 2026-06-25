//! Typed Rust view of the `@lawcalc-kr/core-engine` `InterestResult` shape.
//!
//! `lcalc.rs` keeps the on-disk `result` as `serde_json::Value` because the
//! renderer is the source of truth for shape. PDF and CSV exporters need a
//! typed view to format rows; we deserialize lazily here so a malformed
//! payload is rejected at the export entry point rather than mid-render.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultView {
    pub principal: f64,
    pub segments: Vec<SegmentView>,
    pub total_interest: f64,
    pub grand_total: f64,
    pub options: OptionsView,
    pub data_version: String,
    pub computed_at: String,
    #[serde(default)]
    pub disclaimer: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SegmentView {
    pub from: String,
    pub to: String,
    pub days: i64,
    pub rate: f64,
    pub formula: String,
    pub interest: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OptionsView {
    pub mode: String,
    pub leap_year: String,
    pub include_first_day: bool,
    #[serde(default)]
    pub rounding: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InheritanceResultView {
    pub decedent: InheritanceDecedentView,
    pub shares: Vec<InheritanceShareView>,
    pub disclaimer: String,
    pub data_version: String,
    pub computed_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InheritanceDecedentView {
    #[serde(default)]
    pub name: Option<String>,
    pub deceased_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InheritanceShareView {
    pub name: String,
    pub numerator: i64,
    pub denominator: i64,
    pub raw_numerator: i64,
    pub raw_denominator: i64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LitigationCostResultView {
    pub stamp_duty: LitigationCostComponentView,
    pub delivery_fee: LitigationCostComponentView,
    pub lawyer_fee: LitigationCostComponentView,
    pub total_amount: f64,
    #[serde(default)]
    pub distribution: Option<LitigationCostDistributionView>,
    pub disclaimer: String,
    pub data_versions: std::collections::BTreeMap<String, String>,
    pub computed_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LitigationCostComponentView {
    pub amount: f64,
    pub formula_text: String,
    pub data_version: String,
    pub computed_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LitigationCostDistributionView {
    pub mode: String,
    pub total_won: i64,
    pub per_party: Vec<i64>,
    pub remainder: i64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompensationResultView {
    pub combined_loss_rate: f64,
    pub segments: Vec<CompensationSegmentView>,
    pub lost_income_subtotal_won: f64,
    pub solatium_won: f64,
    pub pecuniary_damages_subtotal_won: f64,
    pub fault_offset: CompensationFaultOffsetView,
    pub deductions: CompensationDeductionsView,
    pub final_won: f64,
    /// 기타손해 (개호비·치료비·보조구). `otherDamages` 입력 결과에만 존재하며, 미입력
    /// 결과에는 키가 없다 (회귀 0).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub other_damages: Option<CompensationOtherDamagesView>,
    pub hoffman240_cap: CompensationHoffman240CapView,
    pub data_versions: CompensationDataVersionsView,
    pub disclaimer: String,
    pub computed_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompensationSegmentView {
    pub start_month: i64,
    pub end_month: i64,
    pub loss_rate: f64,
    pub daily_wage_won: f64,
    pub applied_hoffman: f64,
    pub amount_floor_won: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompensationFaultOffsetView {
    pub ratio: f64,
    pub after_won: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompensationDeductionsView {
    pub ratio_subtotal_won: f64,
    pub absolute_subtotal_won: f64,
    /// 산재보험급여 공제 (부상=장해급여 / 사망=유족급여). 산재(`accidentType: "industrial"`)
    /// 결과에만 존재하며, 자동차 결과에는 키가 없다 (회귀 0).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub industrial_benefit_won: Option<f64>,
}

/// Typed view of the `@lawcalc-kr/compensation` `OtherDamagesResult` summary
/// (개호비·치료비·보조구 소계 + 기타손해 총계). Present only when the
/// frontend result carries `otherDamages` (회귀 0). The per-section cap detail
/// (호프만 240 / 수치합계 20) is surfaced in the UI but omitted from the
/// export summary, matching the existing export altitude.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompensationOtherDamagesView {
    pub attendant_care_won: f64,
    pub treatment_won: f64,
    pub appliance_won: f64,
    pub subtotal_won: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompensationHoffman240CapView {
    pub applied_hoffman: Vec<f64>,
    pub capped_at_index: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompensationDataVersionsView {
    pub labor_rates: String,
    pub life_expectancy: String,
    pub hoffman: String,
    pub leibniz: String,
}

/// Typed view of the `@lawcalc-kr/compensation` `CompensationAutoDeathResult`
/// shape. The death slice (`compensation@2`) replaces the injury-only
/// `combined_loss_rate` with `living_cost_deduction_ratio`, adds
/// `funeral_expense_won`, and carries optional per-heir distribution rows.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompensationDeathResultView {
    pub living_cost_deduction_ratio: f64,
    pub segments: Vec<CompensationSegmentView>,
    pub lost_income_subtotal_won: f64,
    pub solatium_won: f64,
    pub pecuniary_damages_subtotal_won: f64,
    pub fault_offset: CompensationFaultOffsetView,
    pub funeral_expense_won: f64,
    pub deductions: CompensationDeductionsView,
    pub final_won: f64,
    #[serde(default)]
    pub inheritance_shares: Option<Vec<CompensationInheritanceShareView>>,
    /// 기타손해 (개호비·치료비·보조구). `otherDamages` 입력 결과에만 존재 (회귀 0).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub other_damages: Option<CompensationOtherDamagesView>,
    pub hoffman240_cap: CompensationHoffman240CapView,
    pub data_versions: CompensationDataVersionsView,
    pub disclaimer: String,
    pub computed_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompensationInheritanceShareView {
    pub name: String,
    pub numerator: i64,
    pub denominator: i64,
    pub amount_won: f64,
}

/// Disclaimer copy that must accompany every exported artifact.
/// Source of truth: `packages/core-engine/src/disclaimers.ts` `STANDARD_DISCLAIMER`.
pub const DISCLAIMER_KO: &str =
    "본 결과는 검토용 계산이며, 사건별 특수성은 전문가 확인이 필요합니다.";

pub fn disclaimer_text(disclaimer: Option<&str>) -> &str {
    disclaimer
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(DISCLAIMER_KO)
}

pub fn format_currency(amount: f64) -> String {
    // 비정상 입력(NaN/Inf) 방어. f64→i64 `as` 캐스트는 saturating 이라 메모리 안전성
    // 문제는 없으나, Inf 또는 i64 범위를 넘는 유한값(예: 1e30)이 들어오면 saturating 으로
    // 9,223,372,036,854,775,807 같은 쓰레기 금액이 출력될 수 있다. 두 경우 모두 "-" 로 차단.
    // 정상(유한·범위 내) 금액은 종전과 byte-identical 이라 골든 무영향.
    if !amount.is_finite() || amount.abs() >= 9.2e18 {
        return "-".to_string();
    }
    let n = amount.round() as i64;
    let s = n.abs().to_string();
    let mut grouped = String::with_capacity(s.len() + s.len() / 3);
    for (i, c) in s.chars().rev().enumerate() {
        if i > 0 && i % 3 == 0 {
            grouped.push(',');
        }
        grouped.push(c);
    }
    let signed: String = grouped.chars().rev().collect();
    if n < 0 {
        format!("-{signed}")
    } else {
        signed
    }
}

pub fn format_rate_percent(rate: f64) -> String {
    // 비정상 입력(NaN/Inf) 방어 — format_currency 와 대칭. 정상(유한) 율은 byte-identical.
    if !rate.is_finite() {
        return "-".to_string();
    }
    // 0.05 → "5%", 0.123 → "12.3%". Trim trailing zeros after one decimal.
    let pct = rate * 100.0;
    if (pct - pct.round()).abs() < 1e-9 {
        format!("{:.0}%", pct)
    } else {
        let raw = format!("{:.2}", pct);
        let trimmed = raw.trim_end_matches('0').trim_end_matches('.');
        format!("{trimmed}%")
    }
}

pub fn options_summary(options: &OptionsView) -> String {
    let mode_ko = match options.mode.as_str() {
        "period" => "기간식",
        "totalDays" => "총일수식",
        other => other,
    };
    let leap_ko = match options.leap_year.as_str() {
        "fixed365" => "365일 고정",
        "actual" => "실제 일수(윤년 366)",
        other => other,
    };
    let first_ko = if options.include_first_day {
        "초일 산입"
    } else {
        "초일 미산입"
    };
    let rounding_ko = match options.rounding.as_deref().unwrap_or("floor") {
        "floor" => "절사",
        "ceil" => "절상",
        "round" => "반올림",
        other => other,
    };
    format!(
        "{} · {} · {} · 끝수 처리: {}",
        mode_ko, leap_ko, first_ko, rounding_ko
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn deserializes_camel_case_payload() {
        let v = json!({
            "principal": 10000000,
            "segments": [
                { "from": "2024-01-01", "to": "2024-12-31", "days": 365,
                  "rate": 0.05, "formula": "1,000 × 0.05", "interest": 500000 }
            ],
            "totalInterest": 500000,
            "grandTotal": 10500000,
            "options": { "mode": "period", "leapYear": "fixed365", "includeFirstDay": false },
            "dataVersion": "legal-rates/v1.0.0",
            "computedAt": "2026-05-09T12:00:00+09:00"
        });
        let view: ResultView = serde_json::from_value(v).unwrap();
        assert_eq!(view.principal as i64, 10000000);
        assert_eq!(view.segments[0].days, 365);
        assert_eq!(view.options.mode, "period");
    }

    #[test]
    fn deserializes_inheritance_camel_case_payload() {
        let v = json!({
            "decedent": { "name": "피상속인", "deceasedAt": "2025-01-01" },
            "shares": [
                { "name": "배우자", "numerator": 3, "denominator": 7,
                  "rawNumerator": 3, "rawDenominator": 7 }
            ],
            "disclaimer": DISCLAIMER_KO,
            "dataVersion": "inheritance/v1.0.0",
            "computedAt": "2026-05-09T12:00:00+09:00"
        });
        let view: InheritanceResultView = serde_json::from_value(v).unwrap();
        assert_eq!(view.decedent.deceased_at, "2025-01-01");
        assert_eq!(view.shares[0].raw_denominator, 7);
    }

    #[test]
    fn deserializes_litigation_cost_camel_case_payload() {
        let v = json!({
            "stampDuty": {
                "amount": 95000,
                "formulaText": "인지대 산식",
                "dataVersion": "stamp-duty/v1.0.0",
                "computedAt": "2026-05-11T12:00:00+09:00"
            },
            "deliveryFee": {
                "amount": 165000,
                "formulaText": "송달료 산식",
                "dataVersion": "delivery/v1.1.0",
                "computedAt": "2026-05-11T12:00:00+09:00"
            },
            "lawyerFee": {
                "amount": 2800000,
                "formulaText": "변호사보수 산식",
                "dataVersion": "lawyer-fee/v1.1.0",
                "computedAt": "2026-05-11T12:00:00+09:00"
            },
            "totalAmount": 3060000,
            "distribution": {
                "mode": "equal",
                "totalWon": 3060000,
                "perParty": [1530000, 1530000],
                "remainder": 0,
                "basis": "partyCount"
            },
            "disclaimer": DISCLAIMER_KO,
            "dataVersions": {
                "stamp-duty": "stamp-duty/v1.0.0",
                "delivery": "delivery/v1.1.0",
                "lawyer-fee": "lawyer-fee/v1.1.0"
            },
            "computedAt": "2026-05-11T12:00:00+09:00"
        });
        let view: LitigationCostResultView = serde_json::from_value(v).unwrap();
        assert_eq!(view.stamp_duty.amount as i64, 95000);
        assert_eq!(view.delivery_fee.amount as i64, 165000);
        assert_eq!(view.lawyer_fee.amount as i64, 2800000);
        assert_eq!(view.distribution.unwrap().per_party.len(), 2);
    }

    #[test]
    fn formats_currency_with_korean_thousands() {
        assert_eq!(format_currency(0.0), "0");
        assert_eq!(format_currency(1.0), "1");
        assert_eq!(format_currency(1000.0), "1,000");
        assert_eq!(format_currency(1234567.0), "1,234,567");
        assert_eq!(format_currency(-1234.0), "-1,234");
    }

    #[test]
    fn format_currency_guards_non_finite() {
        // IPC-2: NaN/Inf 입력은 saturating 캐스트로 쓰레기 금액(i64::MAX 등)을 내지 않고 "-" 반환.
        assert_eq!(format_currency(f64::NAN), "-");
        assert_eq!(format_currency(f64::INFINITY), "-");
        assert_eq!(format_currency(f64::NEG_INFINITY), "-");
        // A2: 유한이지만 i64 범위를 넘는 값(1e30)도 saturating 쓰레기 대신 "-".
        assert_eq!(format_currency(1e30), "-");
        assert_eq!(format_currency(-1e30), "-");
    }

    #[test]
    fn formats_rate_percent() {
        assert_eq!(format_rate_percent(0.05), "5%");
        assert_eq!(format_rate_percent(0.06), "6%");
        assert_eq!(format_rate_percent(0.12), "12%");
        assert_eq!(format_rate_percent(0.123), "12.3%");
    }

    #[test]
    fn format_rate_percent_guards_non_finite() {
        // A1: format_currency 와 대칭 — 비정상 율은 "NaN%"/"inf%" 대신 "-".
        assert_eq!(format_rate_percent(f64::NAN), "-");
        assert_eq!(format_rate_percent(f64::INFINITY), "-");
        assert_eq!(format_rate_percent(f64::NEG_INFINITY), "-");
    }

    #[test]
    fn options_summary_ko() {
        let opts = OptionsView {
            mode: "period".into(),
            leap_year: "fixed365".into(),
            include_first_day: false,
            rounding: None,
        };
        assert_eq!(
            options_summary(&opts),
            "기간식 · 365일 고정 · 초일 미산입 · 끝수 처리: 절사"
        );
    }

    #[test]
    fn options_summary_rounding_variants() {
        let base = OptionsView {
            mode: "totalDays".into(),
            leap_year: "actual".into(),
            include_first_day: true,
            rounding: Some("ceil".into()),
        };
        assert!(options_summary(&base).ends_with("끝수 처리: 절상"));

        let round = OptionsView {
            rounding: Some("round".into()),
            ..base
        };
        assert!(options_summary(&round).ends_with("끝수 처리: 반올림"));
    }
}
