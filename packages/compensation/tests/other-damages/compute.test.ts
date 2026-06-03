import { describe, expect, it } from "vitest";

import { loadHoffmanTable, loadLaborRatesTable } from "@lawcalc-kr/datasets-compensation";
import { computeOtherDamages } from "../../src/other-damages/compute";
import type { OtherDamagesContext } from "../../src/other-damages/internal";
import type { OtherDamagesInput } from "../../src/other-damages/types";

const ctx: OtherDamagesContext = {
  accidentDate: "2026-01-01",
  laborRates: loadLaborRatesTable(),
  hoffman: loadHoffmanTable(),
};

function run(input: OtherDamagesInput) {
  const r = computeOtherDamages(input, ctx);
  if (r === null) throw new Error("expected non-null otherDamages result");
  return r;
}

describe("개호비 (attendant care)", () => {
  it("기왕개호비 = 일당 × 총일수 × (1 - 기왕증)", () => {
    const r = run({
      attendantCare: {
        past: [{ directDailyWageWon: 100000, totalDays: 10, priorRatio: 0 }],
      },
    });
    expect(r.attendantCare?.pastWon).toBe(1000000);
    expect(r.attendantCareWon).toBe(1000000);
  });

  it("실제지출액이 계산값보다 적으면 실지출 적용 (min)", () => {
    const r = run({
      attendantCare: {
        past: [{ directDailyWageWon: 100000, totalDays: 10, actualSpentWon: 500000 }],
      },
    });
    expect(r.attendantCare?.pastWon).toBe(500000);
  });

  it("기왕증 반영", () => {
    const r = run({
      attendantCare: { past: [{ directDailyWageWon: 100000, totalDays: 10, priorRatio: 0.2 }] },
    });
    expect(r.attendantCare?.pastWon).toBe(800000);
  });

  it("향후개호비 단일 segment [0,1] = 월개호비 × H[1]", () => {
    const r = run({
      attendantCare: {
        future: [
          {
            directDailyWageWon: 100000,
            startDate: "2026-01-01",
            endDate: "2026-02-01",
            personCount: 1,
            daysPerMonth: 30,
          },
        ],
      },
    });
    expect(r.attendantCare?.futureWon).toBe(2987551);
    expect(r.attendantCare?.hoffman240CappedAtIndex).toBeNull();
  });

  it("향후개호비 240 cap 누적 (장기 + 다segment)", () => {
    const r = run({
      attendantCare: {
        future: [
          {
            directDailyWageWon: 100000,
            startDate: "2026-01-01",
            endDate: "2030-01-01",
            personCount: 1,
          },
          {
            directDailyWageWon: 100000,
            startDate: "2030-01-01",
            endDate: "2061-01-01",
            personCount: 1,
          },
        ],
      },
    });
    // 누적 호프만 H[420]=242.466 > 240 → 두 번째 segment 에서 cap.
    expect(r.attendantCare?.hoffman240CappedAtIndex).toBe(1);
  });

  it("항목 모두 비면 null 반환 (회귀 0)", () => {
    expect(computeOtherDamages({ attendantCare: { past: [], future: [] } }, ctx)).toBeNull();
  });
});

describe("치료비 / 보조구 (treatment / appliance)", () => {
  it("기왕치료비 = Σ 비용 × (1 - 기왕증)", () => {
    const r = run({
      treatment: { past: [{ costWon: 3000000, priorRatio: 0.1 }] },
    });
    expect(r.treatment?.pastWon).toBe(2700000);
  });

  it("향후 1회성 = 비용 × 단리계수(firstDate)", () => {
    const r = run({
      treatment: {
        future: [
          { costWon: 1050000, kind: "oneTime", firstDate: "2027-01-01", lastDate: "2027-01-01" },
        ],
      },
    });
    // month 12, spf = 1/1.05 → 1,050,000 × (1/1.05) = 1,000,000
    expect(r.treatment?.futureWon).toBe(1000000);
    expect(r.treatment?.valueSum20Capped).toBe(false);
  });

  it("향후 반복 = 비용 × 단리계수 합 (수치합계)", () => {
    const r = run({
      treatment: {
        future: [
          {
            costWon: 1000000,
            kind: "recurring",
            firstDate: "2026-01-01",
            lastDate: "2027-01-01",
            lifespanMonths: 12,
          },
        ],
      },
    });
    // 발생 month 0, 12 → spf 합 = 1 + 1/1.05 = 1.95238 → floor(1,000,000 × 1.95238)
    expect(r.treatment?.futureWon).toBe(1952380);
    expect(r.treatment?.valueSum20Capped).toBe(false);
  });

  it("반복 장기 → 수치합계 20 cap + capped 플래그", () => {
    const r = run({
      treatment: {
        future: [
          {
            costWon: 1000000,
            kind: "recurring",
            firstDate: "2026-01-01",
            lastDate: "2046-01-01",
            lifespanMonths: 1,
          },
        ],
      },
    });
    expect(r.treatment?.futureWon).toBe(20000000); // 1,000,000 × 20 (cap)
    expect(r.treatment?.valueSum20Capped).toBe(true);
  });

  it("보조구는 치료비 향후와 동형 (pastWon 0)", () => {
    const r = run({
      appliance: [
        { costWon: 1050000, kind: "oneTime", firstDate: "2027-01-01", lastDate: "2027-01-01" },
      ],
    });
    expect(r.appliance?.pastWon).toBe(0);
    expect(r.appliance?.futureWon).toBe(1000000);
    expect(r.applianceWon).toBe(1000000);
  });
});

describe("합산 + 회귀", () => {
  it("subtotal = 개호비 + 치료비 + 보조구", () => {
    const r = run({
      attendantCare: { past: [{ directDailyWageWon: 100000, totalDays: 10 }] },
      treatment: { past: [{ costWon: 2000000 }] },
      appliance: [
        { costWon: 1050000, kind: "oneTime", firstDate: "2027-01-01", lastDate: "2027-01-01" },
      ],
    });
    expect(r.attendantCareWon).toBe(1000000);
    expect(r.treatmentWon).toBe(2000000);
    expect(r.applianceWon).toBe(1000000);
    expect(r.subtotalWon).toBe(4000000);
  });

  it("빈 입력 → null 반환 (회귀 0)", () => {
    expect(computeOtherDamages({}, ctx)).toBeNull();
  });
});

describe("robustness (코드리뷰 반영)", () => {
  it("향후개호 종료일이 호프만 coverage(480개월) 초과해도 RangeError 없이 240 cap", () => {
    const r = run({
      attendantCare: {
        future: [
          {
            directDailyWageWon: 100000,
            startDate: "2026-01-01",
            endDate: "2106-01-01", // 80년(960개월) > coverage → clamp
            personCount: 1,
          },
        ],
      },
    });
    expect(r.attendantCare?.hoffman240CappedAtIndex).toBe(0);
    expect(r.attendantCareWon).toBeGreaterThan(0);
  });

  it("향후개호 startDate 가 사고일 이전이면 한국어 RangeError", () => {
    expect(() =>
      run({
        attendantCare: {
          future: [
            {
              directDailyWageWon: 100000,
              startDate: "2025-01-01",
              endDate: "2030-01-01",
              personCount: 1,
            },
          ],
        },
      }),
    ).toThrow(/사고일/);
  });

  it("향후치료 firstDate 가 사고일 이전이면 한국어 RangeError", () => {
    expect(() =>
      run({
        treatment: {
          future: [
            { costWon: 1000000, kind: "oneTime", firstDate: "2025-01-01", lastDate: "2025-01-01" },
          ],
        },
      }),
    ).toThrow(/사고일/);
  });
});
