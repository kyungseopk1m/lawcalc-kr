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

  /**
   * 수치합계 상한은 지출 주기와 무관하게 고정 20 이다 (공개 매뉴얼 기타손해 항목 근거).
   *
   * 한때 `240 / 주기개월수` 로 바꾼 적이 있다. 판례가 든 "월단위 240 / 연단위 20"이 같은
   * 원리에서 나온다는 유추였는데, 그 240 은 대법원 1987. 4. 14. 선고 86다카1009 가
   * **일실이익**("매월 입게 되는 손해액" 기준)에 대해 든 수치라 주기적 일시 지출로 옮길
   * 근거가 없고, 아래 판례 계산례와 실제로 충돌했다. 되돌리지 마라.
   */
  describe("수치합계 상한은 주기 무관 고정 20", () => {
    const recurring = (lifespanMonths: number, lastDate: string, costWon = 1_000_000) =>
      run({
        treatment: {
          future: [
            { costWon, kind: "recurring", firstDate: "2026-01-01", lastDate, lifespanMonths },
          ],
        },
      });

    it("월 1회 초장기 → 20 에서 잘린다", () => {
      const r = recurring(1, "2086-01-01");
      expect(r.treatment?.valueSum20Capped).toBe(true);
      expect(r.treatment?.futureWon).toBe(20_000_000); // 1,000,000 × 20
    });

    it("연 1회 초장기 → 20 에서 잘린다", () => {
      const r = recurring(12, "2086-01-01");
      expect(r.treatment?.valueSum20Capped).toBe(true);
      expect(r.treatment?.futureWon).toBe(20_000_000); // 1,000,000 × 20
    });

    it("5년 주기 초장기 → 계수 합이 20 에 못 미쳐 상한이 걸리지 않는다", () => {
      // `240 / 60 = 4` 상한이 살아 있으면 여기서 capped=true 로 뒤집힌다.
      const r = recurring(60, "2186-01-01", 3_000_000);
      expect(r.treatment?.valueSum20Capped).toBe(false);
      expect(r.treatment?.futureWon).toBeGreaterThan(12_000_000); // 상한 4 였다면 정확히 12,000,000
    });
  });

  /**
   * 실제 판결 계산례 회귀 — 서울중앙지방법원 2016. 10. 6. 선고 2015나72834 (판례 ID 194825)
   * 보조구 계산표.
   *
   * 사고일 2013-03-16, 최초필요일 2016-08-19(m=41), 필요최종일 2053-05-19(m=482).
   * 판결이 쓴 수치합계는 5년 주기 4.2672, 3년 주기 6.8098 로 **둘 다 `240 / 주기개월수`
   * (각 4, 6.6667) 를 넘는다.** 판결은 상한을 걸지 않았다.
   *
   * 판결은 계수를 소수 4자리로 반올림해 더하므로 원 단위 완전 일치는 성립하지 않는다.
   * 상한 회귀를 잡는 것이 목적이라 0.1% 허용오차로 고정한다.
   */
  describe("판례 2015나72834 보조구 계산례", () => {
    const precCtx: OtherDamagesContext = { ...ctx, accidentDate: "2013-03-16" };
    const appliance = (costWon: number, lifespanMonths: number) => {
      const r = computeOtherDamages(
        {
          appliance: [
            {
              costWon,
              kind: "recurring",
              firstDate: "2016-08-19",
              lastDate: "2053-05-19",
              lifespanMonths,
            },
          ],
        },
        precCtx,
      );
      if (r === null) throw new Error("expected non-null otherDamages result");
      return r;
    };

    it("특수 휠체어 5년 주기 = 판례 17,068,800원", () => {
      const r = appliance(4_000_000, 60);
      expect(r.appliance?.valueSum20Capped).toBe(false);
      expect(r.appliance?.futureWon).toBeGreaterThan(17_068_800 * 0.999);
      expect(r.appliance?.futureWon).toBeLessThan(17_068_800 * 1.001);
    });

    it("방석 등 3년 주기 = 판례 6,809,800원", () => {
      const r = appliance(1_000_000, 36);
      expect(r.appliance?.valueSum20Capped).toBe(false);
      expect(r.appliance?.futureWon).toBeGreaterThan(6_809_800 * 0.999);
      expect(r.appliance?.futureWon).toBeLessThan(6_809_800 * 1.001);
    });
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

/**
 * COMP-H2 부수 — 항목 분할로 수치합계 상한을 우회하는 조합 감지.
 *
 * 상한(20)이 항목별로 걸리므로 월 1회 30년 1건을 월 1회 15년 2건으로
 * 나누면 상한 여력이 두 배가 된다. 상한을 손해 항목 전체로 묶을지는 정책 판단이 필요하고
 * 정당하게 분리된 항목(다른 부위·다른 치료)을 합산하면 그것대로 오답이 되므로,
 * **금액은 바꾸지 않고** 의심 조합만 표시한다.
 */
describe("향후 지출 항목 분할 감지 (splitSuspected) [COMP-H2]", () => {
  const item = (over: Record<string, unknown> = {}) => ({
    costWon: 100_000,
    kind: "recurring" as const,
    firstDate: "2026-02-01",
    lastDate: "2041-01-01",
    lifespanMonths: 12,
    ...over,
  });

  it("단가·주기가 같고 기간이 이어지면 경고 on", () => {
    const r = run({
      treatment: {
        future: [item(), item({ firstDate: "2041-02-01", lastDate: "2056-01-01" })],
      },
    });
    expect(r.treatment?.splitSuspected).toBe(true);
  });

  it("경고가 켜져도 금액은 무변경 — 항목별 계산의 단순 합과 같다", () => {
    const second = item({ firstDate: "2041-02-01", lastDate: "2056-01-01" });
    const split = run({ treatment: { future: [item(), second] } });
    expect(split.treatment?.splitSuspected).toBe(true);

    // 감지는 계산에 개입하지 않는다 — 두 항목을 따로 계산한 값의 합과 정확히 일치한다.
    const a = run({ treatment: { future: [item()] } }).treatmentWon;
    const b = run({ treatment: { future: [second] } }).treatmentWon;
    expect(split.treatmentWon).toBe(a + b);

    // 경고가 꺼지는 조합(단가만 다름)도 같은 성질을 가진다 — 경고 여부와 금액은 독립이다.
    const cheaper = item({ costWon: 200_000, firstDate: "2041-02-01", lastDate: "2056-01-01" });
    const quiet = run({ treatment: { future: [item(), cheaper] } });
    expect(quiet.treatment?.splitSuspected).toBeUndefined();
    expect(quiet.treatmentWon).toBe(a + run({ treatment: { future: [cheaper] } }).treatmentWon);
  });

  it("단가가 다르면 경고 off", () => {
    const r = run({
      treatment: {
        future: [
          item(),
          item({ costWon: 200_000, firstDate: "2041-02-01", lastDate: "2056-01-01" }),
        ],
      },
    });
    expect(r.treatment?.splitSuspected).toBeUndefined();
  });

  it("주기가 다르면 경고 off", () => {
    const r = run({
      treatment: {
        future: [
          item(),
          item({ lifespanMonths: 24, firstDate: "2041-02-01", lastDate: "2056-01-01" }),
        ],
      },
    });
    expect(r.treatment?.splitSuspected).toBeUndefined();
  });

  it("간격이 정확히 한 주기면 경고 on, 한 달 더 벌어지면 off (상한 경계)", () => {
    // lastDate 2041-01-01 기준. gap 12 = 주기와 동일 → on, gap 13 → off.
    const on = run({
      treatment: {
        future: [item(), item({ firstDate: "2042-01-01", lastDate: "2057-01-01" })],
      },
    });
    const off = run({
      treatment: {
        future: [item(), item({ firstDate: "2042-02-01", lastDate: "2057-02-01" })],
      },
    });
    expect(on.treatment?.splitSuspected).toBe(true);
    expect(off.treatment?.splitSuspected).toBeUndefined();
  });

  it("기간이 한 주기보다 멀리 떨어져 있으면 경고 off", () => {
    // lastDate 2041-01-01 → 다음 firstDate 2043-01-01 (24개월 > 주기 12개월).
    const r = run({
      treatment: {
        future: [item(), item({ firstDate: "2043-01-01", lastDate: "2058-01-01" })],
      },
    });
    expect(r.treatment?.splitSuspected).toBeUndefined();
  });

  it("같은 달에 이어지면 경고 on (gap 0)", () => {
    const r = run({
      treatment: {
        future: [item(), item({ firstDate: "2041-01-01", lastDate: "2056-01-01" })],
      },
    });
    expect(r.treatment?.splitSuspected).toBe(true);
  });

  it("같은 항목을 두 번 입력하면 경고 on (상한 여력이 정확히 두 배)", () => {
    const r = run({ treatment: { future: [item(), item()] } });
    expect(r.treatment?.splitSuspected).toBe(true);
  });

  // 종전에는 "완전 일치" 와 "gap >= 0 인 인접" 두 갈래만 봐서, 그 사이의 부분 겹침과
  // 포함 관계가 빠져나갔다 (겹치면 gap 이 음수라 인접 조건에 안 걸린다).
  it("기간이 부분적으로 겹치면 경고 on", () => {
    const r = run({
      treatment: {
        future: [item(), item({ firstDate: "2030-02-01", lastDate: "2045-01-01" })],
      },
    });
    expect(r.treatment?.splitSuspected).toBe(true);
  });

  it("한 항목이 다른 항목에 완전히 포함되면 경고 on", () => {
    const r = run({
      treatment: {
        future: [item(), item({ firstDate: "2030-02-01", lastDate: "2035-01-01" })],
      },
    });
    expect(r.treatment?.splitSuspected).toBe(true);
  });

  it("한 날짜만 겹쳐도 경고 on (겹침 경계)", () => {
    // b.firstDate == a.lastDate. 종전 완전 일치 조건으로는 못 잡던 최소 겹침이다.
    const r = run({
      treatment: {
        future: [item(), item({ firstDate: "2041-01-01", lastDate: "2056-01-01" })],
      },
    });
    expect(r.treatment?.splitSuspected).toBe(true);
  });

  it("일시금(oneTime) 끼리는 감지 대상이 아니다", () => {
    const r = run({
      treatment: {
        future: [
          { costWon: 100_000, kind: "oneTime", firstDate: "2026-02-01", lastDate: "2026-02-01" },
          { costWon: 100_000, kind: "oneTime", firstDate: "2026-02-01", lastDate: "2026-02-01" },
        ],
      },
    });
    expect(r.treatment?.splitSuspected).toBeUndefined();
  });

  it("항목이 하나면 경고 off", () => {
    expect(run({ treatment: { future: [item()] } }).treatment?.splitSuspected).toBeUndefined();
  });

  it("보조구 목록에서도 같은 규칙이 적용된다", () => {
    const r = run({
      appliance: [item(), item({ firstDate: "2041-02-01", lastDate: "2056-01-01" })],
    });
    expect(r.appliance?.splitSuspected).toBe(true);
  });

  it("치료비와 보조구는 서로 다른 목록이라 교차 감지하지 않는다", () => {
    const r = run({
      treatment: { future: [item()] },
      appliance: [item({ firstDate: "2041-02-01", lastDate: "2056-01-01" })],
    });
    expect(r.treatment?.splitSuspected).toBeUndefined();
    expect(r.appliance?.splitSuspected).toBeUndefined();
  });
});
