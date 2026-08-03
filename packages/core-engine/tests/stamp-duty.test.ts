import { describe, expect, it } from "vitest";

import {
  applyStampDutyRounding,
  computeStampDuty,
  getAppealsMultiplier,
  getStampDutyBracket,
  loadStampDutyDataset,
  stampDutyVersionTag,
  type StampDutyDataset,
  type StampDutyInput,
} from "../src";

const FROZEN_AT = "2026-05-11T00:00:00.000Z";

function input(overrides: Partial<StampDutyInput> = {}): StampDutyInput {
  return {
    caseValue: 10_000_000,
    caseType: "civilFirstInstanceCollegial",
    appealsLevel: "firstInstance",
    ...overrides,
  };
}

describe("loadStampDutyDataset / 기본 dataset", () => {
  it("inline default dataset 을 검증 후 로드한다", () => {
    const ds = loadStampDutyDataset();
    expect(ds.version).toBe("1.1.0");
    expect(ds.brackets).toHaveLength(4);
    expect(ds.brackets.map((b) => b.baseAmount)).toEqual([0, 5000, 55000, 555000]);
    expect(ds.brackets.map((b) => b.rate)).toEqual([0.005, 0.0045, 0.004, 0.0035]);
  });

  it("stampDutyVersionTag 는 stamp-duty/v1.1.0", () => {
    expect(stampDutyVersionTag(loadStampDutyDataset())).toBe("stamp-duty/v1.1.0");
  });

  it("override 도 동일하게 검증한다", () => {
    const override: StampDutyDataset = {
      ...loadStampDutyDataset(),
      version: "9.9.9-test",
    };
    expect(loadStampDutyDataset(override).version).toBe("9.9.9-test");
  });

  it("음수 baseAmount 거부", () => {
    const ds = loadStampDutyDataset();
    const bad: StampDutyDataset = {
      ...ds,
      brackets: [{ ...ds.brackets[0]!, baseAmount: -1 }, ...ds.brackets.slice(1)],
    };
    expect(() => loadStampDutyDataset(bad)).toThrow(/baseAmount/);
  });

  it("rate > 1 거부", () => {
    const ds = loadStampDutyDataset();
    const bad: StampDutyDataset = {
      ...ds,
      brackets: [{ ...ds.brackets[0]!, rate: 1.5 }, ...ds.brackets.slice(1)],
    };
    expect(() => loadStampDutyDataset(bad)).toThrow(/rate/);
  });

  it("bracket 간 gap 거부 (scopeEnd != next.scopeStart)", () => {
    const ds = loadStampDutyDataset();
    const bad: StampDutyDataset = {
      ...ds,
      brackets: [
        { ...ds.brackets[0]!, scopeEnd: 9_000_000 },
        ds.brackets[1]!,
        ds.brackets[2]!,
        ds.brackets[3]!,
      ],
    };
    expect(() => loadStampDutyDataset(bad)).toThrow(/scopeEnd/);
  });

  it("마지막 bracket 의 scopeEnd 가 null 이 아니면 거부", () => {
    const ds = loadStampDutyDataset();
    const bad: StampDutyDataset = {
      ...ds,
      brackets: [
        ds.brackets[0]!,
        ds.brackets[1]!,
        ds.brackets[2]!,
        { ...ds.brackets[3]!, scopeEnd: 10_000_000_000 },
      ],
    };
    expect(() => loadStampDutyDataset(bad)).toThrow(/scopeEnd=null/);
  });

  it("특별절차 multiplier > 1 거부", () => {
    const ds = loadStampDutyDataset();
    const bad: StampDutyDataset = {
      ...ds,
      specialProcedures: {
        ...ds.specialProcedures,
        paymentOrder: { ...ds.specialProcedures.paymentOrder, multiplier: 1.5 },
      },
    };
    expect(() => loadStampDutyDataset(bad)).toThrow(/paymentOrder.multiplier/);
  });

  it("전자소송 multiplier 0 거부", () => {
    const ds = loadStampDutyDataset();
    const bad: StampDutyDataset = {
      ...ds,
      electronicFilingDiscount: { ...ds.electronicFilingDiscount, multiplier: 0 },
    };
    expect(() => loadStampDutyDataset(bad)).toThrow(/electronicFilingDiscount.multiplier/);
  });
});

describe("getStampDutyBracket / 경계값", () => {
  const ds = loadStampDutyDataset();

  it("0 → 1구간", () => {
    expect(getStampDutyBracket(ds, 0).sortOrder).toBe(1);
  });

  it("9,999,999 → 1구간 (경계 내)", () => {
    expect(getStampDutyBracket(ds, 9_999_999).sortOrder).toBe(1);
  });

  it("10,000,000 → 2구간 (경계 진입)", () => {
    expect(getStampDutyBracket(ds, 10_000_000).sortOrder).toBe(2);
  });

  it("99,999,999 → 2구간", () => {
    expect(getStampDutyBracket(ds, 99_999_999).sortOrder).toBe(2);
  });

  it("100,000,000 → 3구간", () => {
    expect(getStampDutyBracket(ds, 100_000_000).sortOrder).toBe(3);
  });

  it("999,999,999 → 3구간", () => {
    expect(getStampDutyBracket(ds, 999_999_999).sortOrder).toBe(3);
  });

  it("1,000,000,000 → 4구간 (마지막, scopeEnd null)", () => {
    expect(getStampDutyBracket(ds, 1_000_000_000).sortOrder).toBe(4);
  });

  it("10,000,000,000 → 4구간 (무한대 wedge)", () => {
    expect(getStampDutyBracket(ds, 10_000_000_000).sortOrder).toBe(4);
  });

  it("음수 caseValue 거부", () => {
    expect(() => getStampDutyBracket(ds, -1)).toThrow(/must be >= 0/);
  });
});

describe("getAppealsMultiplier", () => {
  const ds = loadStampDutyDataset();

  it("1심 1.0 / 항소 1.5 / 상고 2.0", () => {
    expect(getAppealsMultiplier(ds, "firstInstance")).toBe(1.0);
    expect(getAppealsMultiplier(ds, "appeal")).toBe(1.5);
    expect(getAppealsMultiplier(ds, "supreme")).toBe(2.0);
  });
});

describe("applyStampDutyRounding (제2조 ②항)", () => {
  const ds = loadStampDutyDataset();
  const policy = ds.roundingPolicy;

  it("999 → 1,000 (floor 1,000)", () => {
    expect(applyStampDutyRounding(999, policy)).toBe(1000);
  });

  it("0 → 1,000 (floor)", () => {
    expect(applyStampDutyRounding(0, policy)).toBe(1000);
  });

  it("1,000 → 1,000 (경계, floor 미작용)", () => {
    expect(applyStampDutyRounding(1000, policy)).toBe(1000);
  });

  it("1,001 → 1,000 (100원 미만 절사)", () => {
    expect(applyStampDutyRounding(1001, policy)).toBe(1000);
  });

  it("1,234 → 1,200", () => {
    expect(applyStampDutyRounding(1234, policy)).toBe(1200);
  });

  it("12,345 → 12,300", () => {
    expect(applyStampDutyRounding(12_345, policy)).toBe(12_300);
  });

  it("12,300 → 12,300 (경계)", () => {
    expect(applyStampDutyRounding(12_300, policy)).toBe(12_300);
  });

  it("12,399 → 12,300", () => {
    expect(applyStampDutyRounding(12_399, policy)).toBe(12_300);
  });

  it("음수 amount 거부", () => {
    expect(() => applyStampDutyRounding(-1, policy)).toThrow(/must be >= 0/);
  });
});

describe("computeStampDuty / 누진 산식 + 심급 + 반올림", () => {
  // 소가 1,000만원 1심: 2구간 진입 (scopeStart <= caseValue < scopeEnd 규칙).
  // 인지법 §2① 2호 — 소가 전체 × 0.0045 + 5,000 = 45,000 + 5,000 = 50,000.
  // (1구간 상한 9,999,999 × 0.005 ≈ 49,999 와 이어지는 연속 보정식.)
  it("소가 10,000,000 1심 = 50,000원 (2구간 경계, 연속)", () => {
    const r = computeStampDuty(input({ caseValue: 10_000_000 }), { computedAt: FROZEN_AT });
    expect(r.amount).toBe(50_000);
    expect(r.dataVersion).toBe("stamp-duty/v1.1.0");
    expect(r.computedAt).toBe(FROZEN_AT);
  });

  it("소가 9,999,999 1심 = 49,900원 (1구간, 100원 절사)", () => {
    // 9,999,999 × 0.005 = 49,999.995 → floor to 100 = 49,900
    const r = computeStampDuty(input({ caseValue: 9_999_999 }), { computedAt: FROZEN_AT });
    expect(r.amount).toBe(49_900);
  });

  it("소가 0 1심 = 1,000원 (floor 적용)", () => {
    const r = computeStampDuty(input({ caseValue: 0 }), { computedAt: FROZEN_AT });
    expect(r.amount).toBe(1000);
  });

  it("소가 100,000,000 1심 = 455,000원 (3구간 경계, 연속)", () => {
    // 100,000,000 × 0.004 + 55,000 = 455,000. (2구간 상한과 연속.)
    const r = computeStampDuty(input({ caseValue: 100_000_000 }), { computedAt: FROZEN_AT });
    expect(r.amount).toBe(455_000);
  });

  it("소가 50,000,000 1심 = 230,000원 (2구간 중간)", () => {
    // 50,000,000 × 0.0045 + 5,000 = 225,000 + 5,000 = 230,000 (인지법 §2① 2호, 소가 전체).
    const r = computeStampDuty(input({ caseValue: 50_000_000 }), { computedAt: FROZEN_AT });
    expect(r.amount).toBe(230_000);
  });

  it("소가 1,000,000,000 1심 = 4,055,000원 (4구간 경계, 연속)", () => {
    // 1,000,000,000 × 0.0035 + 555,000 = 3,500,000 + 555,000 = 4,055,000.
    const r = computeStampDuty(input({ caseValue: 1_000_000_000 }), { computedAt: FROZEN_AT });
    expect(r.amount).toBe(4_055_000);
  });

  it("소가 10,000,000,000 1심 = 35,555,000원 (4구간)", () => {
    // 10,000,000,000 × 0.0035 + 555,000 = 35,000,000 + 555,000 = 35,555,000.
    const r = computeStampDuty(input({ caseValue: 10_000_000_000 }), { computedAt: FROZEN_AT });
    expect(r.amount).toBe(35_555_000);
  });

  it("소가 50,000,000 항소 = 345,000원 (base × 1.5)", () => {
    // 230,000 × 1.5 = 345,000.
    const r = computeStampDuty(input({ caseValue: 50_000_000, appealsLevel: "appeal" }), {
      computedAt: FROZEN_AT,
    });
    expect(r.amount).toBe(345_000);
  });

  it("소가 50,000,000 상고 = 460,000원 (base × 2)", () => {
    // 230,000 × 2 = 460,000.
    const r = computeStampDuty(input({ caseValue: 50_000_000, appealsLevel: "supreme" }), {
      computedAt: FROZEN_AT,
    });
    expect(r.amount).toBe(460_000);
  });
});

describe("computeStampDuty / 특별절차 (지급명령 / 화해)", () => {
  it("지급명령 1심 (10분의 1): 소가 50,000,000 = 23,000원", () => {
    // 230,000 × 0.1 = 23,000 → 100원 절사 후 23,000.
    const r = computeStampDuty(input({ caseValue: 50_000_000, isPaymentOrder: true }), {
      computedAt: FROZEN_AT,
    });
    expect(r.amount).toBe(23_000);
  });

  it("화해 1심 (5분의 1): 소가 50,000,000 = 46,000원", () => {
    // 230,000 × 0.2 = 46,000.
    const r = computeStampDuty(input({ caseValue: 50_000_000, isSettlement: true }), {
      computedAt: FROZEN_AT,
    });
    expect(r.amount).toBe(46_000);
  });

  it("지급명령 + 항소 동시 = RangeError (validator)", () => {
    expect(() => computeStampDuty(input({ appealsLevel: "appeal", isPaymentOrder: true }))).toThrow(
      /지급명령·화해는 1심에서만/,
    );
  });

  it("지급명령 + 화해 동시 = RangeError (validator)", () => {
    expect(() => computeStampDuty(input({ isPaymentOrder: true, isSettlement: true }))).toThrow(
      /동시에 적용할 수 없습니다/,
    );
  });
});

describe("computeStampDuty / 전자소송 (×0.9)", () => {
  it("전자소송 1심 소가 50,000,000 = 207,000원", () => {
    // 230,000 × 0.9 = 207,000.
    const r = computeStampDuty(input({ caseValue: 50_000_000, isElectronicFiling: true }), {
      computedAt: FROZEN_AT,
    });
    expect(r.amount).toBe(207_000);
  });

  it("전자소송 항소 소가 50,000,000 = 310,500원", () => {
    // 230,000 × 1.5 × 0.9 = 310,500.
    const r = computeStampDuty(
      input({ caseValue: 50_000_000, appealsLevel: "appeal", isElectronicFiling: true }),
      { computedAt: FROZEN_AT },
    );
    expect(r.amount).toBe(310_500);
  });

  it("전자소송 + 지급명령 1심 소가 50,000,000 = 20,700원", () => {
    // 230,000 × 0.1 × 0.9 = 20,700.
    const r = computeStampDuty(
      input({ caseValue: 50_000_000, isPaymentOrder: true, isElectronicFiling: true }),
      { computedAt: FROZEN_AT },
    );
    expect(r.amount).toBe(20_700);
  });
});

describe("computeStampDuty / 전자소송 감액 filingDate 게이트 (제16조 시행 2011-10-19)", () => {
  it("접수일 2011-10-19 (시행일 당일) = 감액 적용", () => {
    // 230,000 × 0.9 = 207,000.
    const r = computeStampDuty(
      input({ caseValue: 50_000_000, isElectronicFiling: true, filingDate: "2011-10-19" }),
      { computedAt: FROZEN_AT },
    );
    expect(r.amount).toBe(207_000);
    expect(r.formulaText).toContain("전자소송 (×0.9)");
  });

  it("접수일 2011-10-18 (시행 전날) = 감액 미적용 + 산식에 사유 노트", () => {
    const r = computeStampDuty(
      input({ caseValue: 50_000_000, isElectronicFiling: true, filingDate: "2011-10-18" }),
      { computedAt: FROZEN_AT },
    );
    expect(r.amount).toBe(230_000);
    expect(r.formulaText).toContain("전자소송 감액 미적용");
    expect(r.formulaText).toContain("2011-10-19");
  });

  it("접수일 미지정 = 현행 사건 간주, 감액 적용 (기존 동작 유지)", () => {
    const r = computeStampDuty(input({ caseValue: 50_000_000, isElectronicFiling: true }), {
      computedAt: FROZEN_AT,
    });
    expect(r.amount).toBe(207_000);
  });

  it("전자소송 미지정 + 과거 접수일 = 감액 경로 무관, 노트 없음", () => {
    const r = computeStampDuty(input({ caseValue: 50_000_000, filingDate: "2010-01-01" }), {
      computedAt: FROZEN_AT,
    });
    expect(r.amount).toBe(230_000);
    expect(r.formulaText).not.toContain("전자소송");
  });

  it("접수일 ISO 형식 위반 거부", () => {
    expect(() =>
      computeStampDuty(input({ isElectronicFiling: true, filingDate: "2011/10/19" })),
    ).toThrow(/접수일이 ISO 형식이 아닙니다/);
  });
});

describe("computeStampDuty / 재심 (isRetrial, 산식 무영향)", () => {
  it("재심 1심 = 1심 산식과 동일 amount", () => {
    const plain = computeStampDuty(input({ caseValue: 50_000_000 }), { computedAt: FROZEN_AT });
    const retrial = computeStampDuty(input({ caseValue: 50_000_000, isRetrial: true }), {
      computedAt: FROZEN_AT,
    });
    expect(retrial.amount).toBe(plain.amount);
  });

  it("재심 항소 = 항소 산식과 동일 amount", () => {
    const plain = computeStampDuty(input({ caseValue: 50_000_000, appealsLevel: "appeal" }), {
      computedAt: FROZEN_AT,
    });
    const retrial = computeStampDuty(
      input({ caseValue: 50_000_000, appealsLevel: "appeal", isRetrial: true }),
      { computedAt: FROZEN_AT },
    );
    expect(retrial.amount).toBe(plain.amount);
  });

  it("재심 formulaText 에 prefix '재심소장 (제8조' 포함", () => {
    const r = computeStampDuty(input({ caseValue: 50_000_000, isRetrial: true }), {
      computedAt: FROZEN_AT,
    });
    expect(r.formulaText).toMatch(/재심소장 \(제8조/);
  });
});

describe("computeStampDuty / dataset injection 결정성", () => {
  const case50m: StampDutyInput = input({ caseValue: 50_000_000 });

  it("default 호출 (deps 미지정) → bundled dataset 사용", () => {
    const r = computeStampDuty(case50m, { computedAt: FROZEN_AT });
    expect(r.amount).toBe(230_000);
    expect(r.dataVersion).toBe("stamp-duty/v1.1.0");
  });

  it("custom dataset 주입 → version 변경 + 산출 변화", () => {
    const ds = loadStampDutyDataset();
    const custom: StampDutyDataset = {
      ...ds,
      version: "9.9.9-test",
      brackets: [
        { ...ds.brackets[0]!, rate: 0.01 },
        ds.brackets[1]!,
        ds.brackets[2]!,
        ds.brackets[3]!,
      ],
    };
    const r = computeStampDuty(case50m, { dataset: custom, computedAt: FROZEN_AT });
    expect(r.dataVersion).toBe("stamp-duty/v9.9.9-test");
    // 2구간 진입이라 rate override 는 무영향이지만 dataVersion 은 반영.
    expect(r.amount).toBe(230_000);
  });

  it("잘못된 dataset 주입 → validate 단계에서 throw", () => {
    const ds = loadStampDutyDataset();
    const bad: StampDutyDataset = {
      ...ds,
      brackets: [{ ...ds.brackets[0]!, rate: -0.01 }, ...ds.brackets.slice(1)],
    };
    expect(() => computeStampDuty(case50m, { dataset: bad })).toThrow(/rate/);
  });

  it("computedAt override 가 결과에 반영된다 (결정성)", () => {
    const r = computeStampDuty(case50m, { computedAt: FROZEN_AT });
    expect(r.computedAt).toBe(FROZEN_AT);
  });
});

describe("computeStampDuty / formulaText 회귀", () => {
  it("소가 50,000,000 1심 + 항소 + 전자소송 + 재심 조합", () => {
    const r = computeStampDuty(
      input({
        caseValue: 50_000_000,
        appealsLevel: "appeal",
        isElectronicFiling: true,
        isRetrial: true,
      }),
      { computedAt: FROZEN_AT },
    );
    expect(r.formulaText).toContain("재심소장 (제8조, 심급별 동일 적용)");
    expect(r.formulaText).toContain("항소 (×1.5)");
    expect(r.formulaText).toContain("전자소송 (×0.9)");
    expect(r.formulaText).toContain("제2조 ②항 반올림");
  });

  it("소가 0 1심 formulaText 는 (소가 × rate) 형태", () => {
    const r = computeStampDuty(input({ caseValue: 0 }), { computedAt: FROZEN_AT });
    expect(r.formulaText).toContain("1심 (×1)");
  });
});

describe("computeStampDuty / 지급명령 caseType 자동적용 (감사 F3)", () => {
  it("caseType=paymentOrder 는 flag 없이도 10분의 1 적용: 소가 50,000,000 = 23,000원", () => {
    // 사건구분만 고르고 isPaymentOrder 체크를 놓쳐 소장 인지(230,000)가 나오던 UI 결함 차단.
    const r = computeStampDuty(input({ caseValue: 50_000_000, caseType: "paymentOrder" }), {
      computedAt: FROZEN_AT,
    });
    expect(r.amount).toBe(23_000);
    expect(r.formulaText).toContain("지급명령");
  });

  it("caseType=paymentOrder + 항소 = RangeError (지급명령은 1심)", () => {
    expect(() =>
      computeStampDuty(input({ caseType: "paymentOrder", appealsLevel: "appeal" })),
    ).toThrow(/지급명령·화해는 1심에서만/);
  });
});

describe("computeStampDuty / 보전처분 제9조 ②항 (감사 F1)", () => {
  it("일반 가압류·가처분 (기본): 소가 무관 정액 10,000원", () => {
    // 소가 5천만 카단. 제2조 소장식(230,000)이 아니라 제9조 정액이다.
    const r = computeStampDuty(
      input({ caseValue: 50_000_000, caseType: "provisionalMeasureSingle" }),
      { computedAt: FROZEN_AT },
    );
    expect(r.amount).toBe(10_000);
    expect(r.formulaText).toContain("제9조 ②항 전단");
  });

  it("임시지위 가처분: 본안 인지액의 1/2, 소가 50,000,000 이면 115,000원", () => {
    // 본안 230,000 × 0.5 = 115,000 (상한 50만 미도달).
    const r = computeStampDuty(
      input({
        caseValue: 50_000_000,
        caseType: "provisionalMeasureCollegial",
        provisionalMeasureType: "provisionalStatus",
      }),
      { computedAt: FROZEN_AT },
    );
    expect(r.amount).toBe(115_000);
    expect(r.formulaText).toContain("제9조 ②항 후단");
  });

  it("임시지위 가처분 상한 정확 경계: 본안 1,000,000 (소가 236,250,000) × 0.5 = 500,000원", () => {
    // 236,250,000 × 0.004 + 55,000 = 1,000,000 → ×0.5 = 500,000 = 상한과 정확히 일치.
    const r = computeStampDuty(
      input({
        caseValue: 236_250_000,
        caseType: "provisionalMeasureCollegial",
        provisionalMeasureType: "provisionalStatus",
      }),
      { computedAt: FROZEN_AT },
    );
    expect(r.amount).toBe(500_000);
  });

  it("임시지위 가처분 상한 50만원: 본안 4,055,000 × 0.5 = 2,027,500 → 500,000원", () => {
    const r = computeStampDuty(
      input({
        caseValue: 1_000_000_000,
        caseType: "provisionalMeasureCollegial",
        provisionalMeasureType: "provisionalStatus",
      }),
      { computedAt: FROZEN_AT },
    );
    expect(r.amount).toBe(500_000);
    expect(r.formulaText).toContain("상한");
  });

  it("일반 가압류·가처분 + 전자소송 (×0.9): 10,000 → 9,000원", () => {
    const r = computeStampDuty(
      input({
        caseValue: 50_000_000,
        caseType: "provisionalMeasureSingle",
        isElectronicFiling: true,
      }),
      { computedAt: FROZEN_AT },
    );
    expect(r.amount).toBe(9_000);
  });

  it("제9조 경로는 100원 절사를 적용하지 않는다 (제2조 ②항 준용 없음)", () => {
    // 본안 54,500(제2조 ②항 절사 적용 완료) × 0.5 = 27,250. 제7조 ④항과 달리 제9조에는
    // 제2조 ②항 준용 규정이 없으므로 여기서 다시 100원 절사할 근거가 없다.
    const r = computeStampDuty(
      input({
        caseValue: 11_000_000,
        caseType: "provisionalMeasureSingle",
        provisionalMeasureType: "provisionalStatus",
      }),
      { computedAt: FROZEN_AT },
    );
    expect(r.amount).toBe(27_250);
    expect(r.formulaText).toContain("본안 인지액 54,500 × 0.5 = 27,250원");
    expect(r.formulaText).not.toContain("절사");
    expect(r.formulaText).not.toContain("제2조");
  });

  it("본안 인지액 자체에는 제2조 ②항 절사가 적용된다", () => {
    // 소가 9,999,999 → 49,999.995 → 제2조 ②항으로 49,900. 그 1/2 = 24,950.
    const r = computeStampDuty(
      input({
        caseValue: 9_999_999,
        caseType: "provisionalMeasureSingle",
        provisionalMeasureType: "provisionalStatus",
      }),
      { computedAt: FROZEN_AT },
    );
    expect(r.amount).toBe(24_950);
    expect(r.formulaText).toContain("본안 인지액 49,900");
  });

  it("정액 경로는 1,000원 floor 없이 그대로 나온다", () => {
    const r = computeStampDuty(
      input({ caseValue: 50_000_000, caseType: "provisionalMeasureSingle" }),
      { computedAt: FROZEN_AT },
    );
    expect(r.amount).toBe(10_000);
    expect(r.formulaText).toContain("= 10,000원");
  });

  it("보전처분 + 항소 = RangeError (심급 배수 무관)", () => {
    expect(() =>
      computeStampDuty(input({ caseType: "provisionalMeasureSingle", appealsLevel: "appeal" })),
    ).toThrow(/보전처분 인지는 심급 배수를/);
  });

  it("보전처분 + 지급명령 flag = RangeError (제9조 별도 체계)", () => {
    expect(() =>
      computeStampDuty(input({ caseType: "provisionalMeasureSingle", isPaymentOrder: true })),
    ).toThrow(/보전처분 인지에는 지급명령·화해/);
  });
});
