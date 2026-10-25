import { describe, expect, it } from "vitest";

import {
  computeCostAssessment,
  computeLawyerFee,
  loadLawyerFeeDataset,
  selectLawyerFeeRuleVersion,
  STANDARD_DISCLAIMER,
  type CostAssessmentHalfReason,
  type CostAssessmentInput,
  type CostAssessmentInstanceInput,
  type CostAssessmentPartyCostsInput,
  type LawyerFeeRuleVersionKey,
} from "../src";

// 손계산: for-claude personal/lawcalc-kr/docs/plans/vk-p46-cost-assessment-derivation-2026-10-25.md
const AT = "2026-10-25T00:00:00.000Z";

const none: CostAssessmentPartyCostsInput = {
  stampDuty: { mode: "manual", amountWon: 0 },
  deliveryFee: { mode: "manual", amountWon: 0 },
  lawyerRetained: false,
};
const lawyerOnly: CostAssessmentPartyCostsInput = { ...none, lawyerRetained: true };

function instance(
  filingDate: string,
  caseValue: number,
  extra: Partial<CostAssessmentInstanceInput> = {},
): CostAssessmentInstanceInput {
  return {
    level: "firstInstance",
    caseType: "civilFirstInstanceSingle",
    filingDate,
    caseValue,
    plaintiff: lawyerOnly,
    defendant: none,
    ...extra,
  };
}

function fee(
  filingDate: string,
  caseValue: number,
  halfReason?: CostAssessmentHalfReason,
  ruleVersionOverride?: LawyerFeeRuleVersionKey,
) {
  const input: CostAssessmentInput = {
    instances: [
      instance(filingDate, caseValue, {
        ...(halfReason === undefined ? {} : { halfReason }),
        ...(ruleVersionOverride === undefined ? {} : { ruleVersionOverride }),
      }),
    ],
    burden: { plaintiff: 0, defendant: 1 },
    applicant: "plaintiff",
    opponentSubmitted: false,
  };
  return computeCostAssessment(input, { computedAt: AT }).instances[0]!.lawyerFee;
}

describe("변호사보수 규칙 판 선택 (심급 접수일)", () => {
  const ds = loadLawyerFeeDataset();
  it.each([
    ["1981-03-01", "v1981"],
    ["1990-08-31", "v1981"],
    ["1990-09-01", "v1990"],
    ["2003-07-01", "v2003"],
    ["2007-12-31", "v2003"],
    ["2008-01-01", "v2008"],
    ["2013-11-30", "v2008"],
    ["2013-12-01", "v2013"],
    ["2018-03-31", "v2013"],
    ["2018-04-01", "v2018"],
    ["2020-12-27", "v2018"],
    ["2020-12-28", "v2020"],
    ["2026-10-25", "v2020"],
  ])("%s → %s", (date, key) => {
    expect(selectLawyerFeeRuleVersion(ds, date).key).toBe(key);
  });

  it("규칙 제정 전 접수일은 거부", () => {
    expect(() => selectLawyerFeeRuleVersion(ds, "1981-02-28")).toThrow(RangeError);
  });
});

describe("변호사보수 산정 (손계산 D1~D6)", () => {
  it("D1 표 A (2003판): 소가 2,500만 → 650,000 + 15,000,000 × 0.04 = 1,250,000", () => {
    const r = fee("2005-05-10", 25_000_000);
    expect(r).toMatchObject({ ruleVersion: "v2003", table: "A", assessedWon: 1_250_000 });
    expect(r.formulaText).toContain("경과규정이 없는 판");
  });

  it("D2 표 B (2008판): 소가 2,500만 → 1,500,000 + 5,000,000 × 0.06 = 1,800,000", () => {
    const r = fee("2008-03-10", 25_000_000);
    expect(r).toMatchObject({ ruleVersion: "v2008", table: "B", assessedWon: 1_800_000 });
    expect(r.formulaText).toContain("부칙 제2조");
  });

  it("D3 최저액: 2008판 소가 100만 → 80,000 < 100,000 → 100,000", () => {
    const r = fee("2009-01-01", 1_000_000);
    expect(r).toMatchObject({ tableAmountWon: 80_000, minimumApplied: true, assessedWon: 100_000 });
  });

  it("D3 최저액 후 1/2: 2013판 소가 200만 무변론 → 160,000 → 300,000 → 150,000", () => {
    const r = fee("2015-01-05", 2_000_000, "noOralHearingJudgment");
    expect(r).toMatchObject({
      tableAmountWon: 160_000,
      minimumApplied: true,
      halved: true,
      assessedWon: 150_000,
    });
    expect(r.formulaText).toContain("판례 미확인");
  });

  it("D4 끝수: 2008판 소가 12,345,678 → 964,197.46 → 964,197, 1/2 → 482,098", () => {
    expect(fee("2010-01-01", 12_345_678).assessedWon).toBe(964_197);
    expect(fee("2010-01-01", 12_345_678, "admissionJudgment").assessedWon).toBe(482_098);
  });

  it("D5 판에 없는 사유는 감액하지 않음", () => {
    const order = fee("2005-05-10", 25_000_000, "orderForPerformance");
    expect(order).toMatchObject({ halved: false, assessedWon: 1_250_000 });
    expect(order.formulaText).toContain("사유가 없어 감액하지 않음");
    const prov1981 = fee("1985-01-01", 25_000_000, "provisional");
    expect(prov1981).toMatchObject({ halved: false, assessedWon: 1_250_000 });
    expect(fee("1995-01-01", 25_000_000, "nonJudgmentEnding")).toMatchObject({
      halved: true,
      assessedWon: 625_000,
    });
    expect(fee("2005-05-10", 25_000_000, "nonJudgmentEnding").halved).toBe(false);
  });

  it("D6 판 직접 지정: 2007년 접수라도 v2008 지정 시 표 B", () => {
    expect(fee("2007-06-01", 25_000_000, undefined, "v2008")).toMatchObject({
      ruleVersion: "v2008",
      selectedBy: "override",
      assessedWon: 1_800_000,
    });
  });

  it("2020판·2018판 산정액 = 기존 computeLawyerFee (현행 결과 불변)", () => {
    for (const v of [
      1, 2_000_000, 3_000_000, 3_500_000, 12_345_678, 19_000_000, 20_000_000, 35_000_000,
      50_000_000, 100_000_000, 260_000_000, 600_000_000,
    ]) {
      const current = computeLawyerFee({
        caseValue: v,
        caseType: "civilFirstInstanceSingle",
        discounts: [],
      }).amount;
      const halfCurrent = computeLawyerFee({
        caseValue: v,
        caseType: "civilFirstInstanceSingle",
        discounts: [{ kind: "noOralHearingOrAdmission", reason: "noOralHearing" }],
      }).amount;
      expect(fee("2024-01-02", v).assessedWon, `v2020 ${v}`).toBe(current);
      expect(fee("2019-01-02", v).assessedWon, `v2018 ${v}`).toBe(current);
      expect(fee("2024-01-02", v, "noOralHearingJudgment").assessedWon).toBe(halfCurrent);
      expect(fee("2019-01-02", v, "noOralHearingJudgment").assessedWon).toBe(halfCurrent);
    }
  });
});

describe("소송비용액 확정 (손계산 D7~D9)", () => {
  const base: CostAssessmentInput = {
    instances: [
      instance("2019-03-04", 30_000_000, {
        plaintiff: {
          stampDuty: { mode: "auto" },
          deliveryFee: { mode: "manual", amountWon: 156_000 },
          lawyerRetained: true,
          paidLawyerFeeWon: 2_000_000,
          otherCostsWon: 10_000,
        },
        defendant: lawyerOnly,
      }),
      instance("2020-12-28", 20_000_000, {
        level: "appeal",
        caseType: "civilAppeal",
        plaintiff: lawyerOnly,
        defendant: {
          stampDuty: { mode: "manual", amountWon: 142_500 },
          deliveryFee: { mode: "manual", amountWon: 120_000 },
          lawyerRetained: true,
          paidLawyerFeeWon: 3_300_000,
        },
      }),
    ],
    burden: { plaintiff: 3, defendant: 7 },
    applicant: "plaintiff",
    opponentSubmitted: true,
  };

  it("D7 심급별 소계·합계·상계", () => {
    const r = computeCostAssessment(base, { computedAt: AT });
    const [first, appeal] = r.instances;
    expect(first!.lawyerFee).toMatchObject({ ruleVersion: "v2018", assessedWon: 2_800_000 });
    expect(first!.plaintiff).toMatchObject({
      stampDutyWon: 140_000,
      lawyerFeeWon: 2_000_000,
      subtotalWon: 2_306_000,
    });
    expect(first!.defendant.subtotalWon).toBe(2_800_000);
    expect(appeal!.lawyerFee).toMatchObject({ ruleVersion: "v2020", assessedWon: 2_000_000 });
    expect(appeal!.defendant.subtotalWon).toBe(2_262_500);
    expect(appeal!.plaintiff.subtotalWon).toBe(2_000_000);
    expect(r.totals).toEqual({ plaintiff: 4_306_000, defendant: 5_062_500 });
    expect(r.applicantClaim.amountWon).toBe(3_014_200);
    expect(r.opponentClaim?.amountWon).toBe(1_518_750);
    expect(r.net).toMatchObject({ payer: "defendant", payee: "plaintiff", amountWon: 1_495_450 });
    expect(r.net.formulaText).toContain("제112조");
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("현행 인지법");
    expect(r.disclaimer).toBe(STANDARD_DISCLAIMER);
    expect(r.dataVersions["lawyer-fee"]).toBe("lawyer-fee/v1.3.0");
  });

  it("D8 상대방 미제출: 상계 없이 신청인 비용 부담분만", () => {
    const r = computeCostAssessment({ ...base, opponentSubmitted: false }, { computedAt: AT });
    expect(r.opponentClaim).toBeNull();
    expect(r.net).toMatchObject({ payer: "defendant", amountWon: 3_014_200 });
    expect(r.net.formulaText).toContain("제111조 제2항");
  });

  it("D9 비율 1:2 원 미만 버림, 피고 신청", () => {
    const r = computeCostAssessment(
      { ...base, burden: { plaintiff: 1, defendant: 2 } },
      { computedAt: AT },
    );
    expect(r.applicantClaim.amountWon).toBe(2_870_666);
    expect(r.opponentClaim?.amountWon).toBe(1_687_500);
    expect(r.net.amountWon).toBe(1_183_166);
    const byDefendant = computeCostAssessment(
      { ...base, applicant: "defendant", burden: { plaintiff: 1, defendant: 2 } },
      { computedAt: AT },
    );
    expect(byDefendant.net).toMatchObject({
      payer: "defendant",
      payee: "plaintiff",
      amountWon: 1_183_166,
    });
  });

  it("입력 오류는 RangeError", () => {
    expect(() => computeCostAssessment({ ...base, instances: [] })).toThrow(RangeError);
    expect(() =>
      computeCostAssessment({ ...base, burden: { plaintiff: 0, defendant: 0 } }),
    ).toThrow(RangeError);
    expect(() =>
      computeCostAssessment({ ...base, burden: { plaintiff: 0.5, defendant: 1 } }),
    ).toThrow(RangeError);
    expect(() =>
      computeCostAssessment({ ...base, instances: [instance("1980-01-01", 1_000_000)] }),
    ).toThrow(RangeError);
    expect(() =>
      computeCostAssessment({ ...base, instances: [instance("2024-01-01", -1)] }),
    ).toThrow(RangeError);
  });
});

describe("lawyer-fee dataset 연혁 검증", () => {
  it("ruleVersions 7개, 표 A·B·C 연속성", () => {
    const ds = loadLawyerFeeDataset();
    expect(ds.ruleVersions.map((v) => v.key)).toEqual([
      "v1981",
      "v1990",
      "v2003",
      "v2008",
      "v2013",
      "v2018",
      "v2020",
    ]);
    expect(ds.ruleVersions.map((v) => v.minimumWon)).toEqual([
      null,
      null,
      null,
      100_000,
      300_000,
      300_000,
      null,
    ]);
    expect(ds.sourceLaw.bracketTableEffectiveFrom).toBe("2020-12-28");
    expect(ds.appealsRule.sourceArticle).not.toContain("제3항");
  });

  it("판 순서가 어긋나면 거부", () => {
    const ds = loadLawyerFeeDataset();
    const broken = { ...ds, ruleVersions: ds.ruleVersions.slice().reverse() };
    expect(() => loadLawyerFeeDataset(broken)).toThrow(/ascending/);
  });
});
