import { describe, expect, it } from "vitest";

import type { RateSegment } from "@lawcalc-kr/core-engine";

import { straddlesPromotionRateChange } from "./LegalRatePreset";
import { validatePresetCoverage } from "../../App";

/**
 * 소촉법 이율 변경일(2015-10-01, 2019-06-01)을 걸치는 계산 기간에만 부칙 경과조치를 안내한다.
 *
 * 대통령령 제26553호 부칙 제2조 ①항 / 제29768호 부칙 제2조 ①항 — "이 영 시행 당시 법원에
 * 계속 중인 사건으로서 제1심의 변론이 종결된 사건에 대한 법정이율은 이 영의 개정규정에도
 * 불구하고 종전의 규정에 따른다." 변론종결일은 입력에 없으므로 계산은 그대로 두고 안내만 한다.
 *
 * 최초 시행일 2003-06-01 은 경계에서 제외한다 — 그 앞 기간은 위헌결정 안내와 커버리지 가드가
 * 이미 덮는다.
 */
describe("straddlesPromotionRateChange", () => {
  it("2019-06-01 을 걸치면 true", () => {
    expect(straddlesPromotionRateChange("2019-01-01", "2020-01-01")).toBe(true);
  });

  it("2015-10-01 을 걸치면 true", () => {
    expect(straddlesPromotionRateChange("2015-01-01", "2016-01-01")).toBe(true);
  });

  it("변경일이 종료일과 같으면 true (그날부터 새 이율이 붙는다)", () => {
    expect(straddlesPromotionRateChange("2019-01-01", "2019-06-01")).toBe(true);
  });

  it("변경일이 시작일과 같으면 false (기간 전체가 새 이율)", () => {
    expect(straddlesPromotionRateChange("2019-06-01", "2020-01-01")).toBe(false);
  });

  it("변경일 뒤에만 걸친 기간은 false", () => {
    expect(straddlesPromotionRateChange("2020-01-01", "2024-01-01")).toBe(false);
  });

  it("변경일 사이에만 있는 기간은 false", () => {
    expect(straddlesPromotionRateChange("2016-01-01", "2018-01-01")).toBe(false);
  });

  it("두 변경일을 모두 걸쳐도 true", () => {
    expect(straddlesPromotionRateChange("2014-01-01", "2020-01-01")).toBe(true);
  });

  it("최초 시행일 2003-06-01 은 경계가 아니다", () => {
    expect(straddlesPromotionRateChange("2003-01-01", "2003-12-31")).toBe(false);
  });

  it("날짜가 비었거나 역순이면 false", () => {
    expect(straddlesPromotionRateChange(undefined, "2020-01-01")).toBe(false);
    expect(straddlesPromotionRateChange("2019-01-01", undefined)).toBe(false);
    expect(straddlesPromotionRateChange("2020-01-01", "2019-01-01")).toBe(false);
    expect(straddlesPromotionRateChange("2019-06-01", "2019-06-01")).toBe(false);
  });
});

/**
 * 프리셋이 계산 기간을 덮지 못하면 계산 전에 한국어로 막는다.
 *
 * 막지 않으면 `resolveSegments` 의 RangeError 가 그대로 노출된다 —
 * `resolveSegments: legalRatePreset "promotion" has no rate covering 2001-01-01 ...
 * supply an explicit segment for the period before 2003-06-01`.
 */
describe("validatePresetCoverage", () => {
  const input = (startDate: string, segments: RateSegment[] = []) => ({
    principal: 1_000_000,
    startDate,
    endDate: "2026-01-01",
    ...(segments.length > 0 ? { segments } : {}),
  });

  it("소촉법 + 2003-06-01 이전이면 한국어 안내를 낸다", () => {
    const message = validatePresetCoverage(input("2001-01-01"), "promotion");
    expect(message).toContain("2003-06-01");
    expect(message).toContain("이자율 구간 직접 입력");
    // 개발자용 문구가 사용자 화면에 새지 않는다.
    expect(message).not.toContain("resolveSegments");
    expect(message).not.toMatch(/[a-z]{4,} [a-z]{2,} [a-z]{4,}/);
  });

  it("경계 당일(2003-06-01)부터는 통과한다", () => {
    expect(validatePresetCoverage(input("2003-06-01"), "promotion")).toBe("");
  });

  it("구간을 직접 입력했으면 프리셋 커버리지를 따지지 않는다", () => {
    expect(
      validatePresetCoverage(
        input("2001-01-01", [{ from: "2001-01-01", to: "2026-01-01", rate: 0.05 }]),
        "promotion",
      ),
    ).toBe("");
  });

  it("민법·직접 입력은 대상이 아니다", () => {
    expect(validatePresetCoverage(input("1960-01-01"), "custom")).toBe("");
  });
});
