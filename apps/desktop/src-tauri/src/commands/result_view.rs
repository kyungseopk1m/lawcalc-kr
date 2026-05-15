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
    pub basis: String,
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
        "round" => "사사오입",
        other => other,
    };
    format!(
        "{} · {} · {} · 끝수처리: {}",
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
    fn formats_rate_percent() {
        assert_eq!(format_rate_percent(0.05), "5%");
        assert_eq!(format_rate_percent(0.06), "6%");
        assert_eq!(format_rate_percent(0.12), "12%");
        assert_eq!(format_rate_percent(0.123), "12.3%");
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
            "기간식 · 365일 고정 · 초일 미산입 · 끝수처리: 절사"
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
        assert!(options_summary(&base).ends_with("끝수처리: 절상"));

        let round = OptionsView {
            rounding: Some("round".into()),
            ..base
        };
        assert!(options_summary(&round).ends_with("끝수처리: 사사오입"));
    }
}
