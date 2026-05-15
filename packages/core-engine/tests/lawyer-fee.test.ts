import { describe, expect, it } from "vitest";

import {
  computeLawyerFee,
  getLawyerFeeBracket,
  lawyerFeeDatasetVersionTag,
  loadLawyerFeeDataset,
  type LawyerFeeDataset,
  type LawyerFeeInput,
} from "../src";

const FROZEN_AT = "2026-05-11T00:00:00.000Z";

function input(overrides: Partial<LawyerFeeInput> = {}): LawyerFeeInput {
  return {
    caseValue: 30_000_000,
    caseType: "civilFirstInstanceCollegial",
    discounts: [],
    ...overrides,
  };
}

describe("loadLawyerFeeDataset / 기본 dataset", () => {
  it("inline default dataset 을 검증 후 로드한다", () => {
    const ds = loadLawyerFeeDataset();
    expect(ds.version).toBe("1.1.0");
    expect(ds.brackets).toHaveLength(8);
    expect(ds.brackets.map((b) => b.baseAmount)).toEqual([
      300_000, 300_000, 2_000_000, 4_400_000, 7_400_000, 9_400_000, 10_400_000, 13_400_000,
    ]);
    expect(ds.brackets[7]!.scopeEnd).toBeNull();
    expect(ds.appealsRule.policy).toBe("perInstanceIndependent");
  });

  it("lawyerFeeDatasetVersionTag 는 lawyer-fee/v1.1.0", () => {
    expect(lawyerFeeDatasetVersionTag(loadLawyerFeeDataset())).toBe("lawyer-fee/v1.1.0");
  });

  it("override 도 동일하게 검증한다", () => {
    const override: LawyerFeeDataset = {
      ...loadLawyerFeeDataset(),
      version: "9.9.9-test",
    };
    expect(loadLawyerFeeDataset(override).version).toBe("9.9.9-test");
  });

  it("brackets.length !== 8 거부", () => {
    const ds = loadLawyerFeeDataset();
    const bad: LawyerFeeDataset = { ...ds, brackets: ds.brackets.slice(0, 7) };
    expect(() => loadLawyerFeeDataset(bad)).toThrow(/length must be 8/);
  });

  it("음수 baseAmount 거부", () => {
    const ds = loadLawyerFeeDataset();
    const bad: LawyerFeeDataset = {
      ...ds,
      brackets: [{ ...ds.brackets[0]!, baseAmount: -1 }, ...ds.brackets.slice(1)],
    };
    expect(() => loadLawyerFeeDataset(bad)).toThrow(/baseAmount/);
  });

  it("rate > 1 거부", () => {
    const ds = loadLawyerFeeDataset();
    const bad: LawyerFeeDataset = {
      ...ds,
      brackets: [{ ...ds.brackets[0]!, rate: 1.5 }, ...ds.brackets.slice(1)],
    };
    expect(() => loadLawyerFeeDataset(bad)).toThrow(/rate/);
  });

  it("appealsRule.policy 가 perInstanceIndependent 아니면 거부", () => {
    const ds = loadLawyerFeeDataset();
    const bad = {
      ...ds,
      appealsRule: { ...ds.appealsRule, policy: "invalidPolicy" },
    } as unknown as LawyerFeeDataset;
    expect(() => loadLawyerFeeDataset(bad)).toThrow(/perInstanceIndependent/);
  });

  it("modifier multiplier > 1.5 거부 (제6조 ②항 cap)", () => {
    const ds = loadLawyerFeeDataset();
    const bad: LawyerFeeDataset = {
      ...ds,
      modifiers: {
        ...ds.modifiers,
        provisionalSeizureOrInjunction: {
          ...ds.modifiers.provisionalSeizureOrInjunction,
          multiplier: 2.0,
        },
      },
    };
    expect(() => loadLawyerFeeDataset(bad)).toThrow(/provisionalSeizureOrInjunction.multiplier/);
  });

  it("stackingPolicy clamp 가 [0.0, 1.5] 아니면 거부", () => {
    const ds = loadLawyerFeeDataset();
    const bad: LawyerFeeDataset = {
      ...ds,
      stackingPolicy: { ...ds.stackingPolicy, maxMultiplierCap: 2.0 },
    };
    expect(() => loadLawyerFeeDataset(bad)).toThrow(/stackingPolicy clamp/);
  });

  it("마지막 bracket scopeEnd 가 null 이 아니면 거부", () => {
    const ds = loadLawyerFeeDataset();
    const bad: LawyerFeeDataset = {
      ...ds,
      brackets: [...ds.brackets.slice(0, 7), { ...ds.brackets[7]!, scopeEnd: 10_000_000_000 }],
    };
    expect(() => loadLawyerFeeDataset(bad)).toThrow(/scopeEnd=null/);
  });
});

describe("getLawyerFeeBracket / 8구간 경계값", () => {
  const ds = loadLawyerFeeDataset();

  it("0 → 1구간 (정액 30만)", () => {
    expect(getLawyerFeeBracket(ds, 0).sortOrder).toBe(1);
  });

  it("2,999,999 → 1구간", () => {
    expect(getLawyerFeeBracket(ds, 2_999_999).sortOrder).toBe(1);
  });

  it("3,000,000 → 2구간", () => {
    expect(getLawyerFeeBracket(ds, 3_000_000).sortOrder).toBe(2);
  });

  it("19,999,999 → 2구간", () => {
    expect(getLawyerFeeBracket(ds, 19_999_999).sortOrder).toBe(2);
  });

  it("20,000,000 → 3구간", () => {
    expect(getLawyerFeeBracket(ds, 20_000_000).sortOrder).toBe(3);
  });

  it("50,000,000 → 4구간", () => {
    expect(getLawyerFeeBracket(ds, 50_000_000).sortOrder).toBe(4);
  });

  it("100,000,000 → 5구간", () => {
    expect(getLawyerFeeBracket(ds, 100_000_000).sortOrder).toBe(5);
  });

  it("150,000,000 → 6구간", () => {
    expect(getLawyerFeeBracket(ds, 150_000_000).sortOrder).toBe(6);
  });

  it("200,000,000 → 7구간", () => {
    expect(getLawyerFeeBracket(ds, 200_000_000).sortOrder).toBe(7);
  });

  it("499,999,999 → 7구간", () => {
    expect(getLawyerFeeBracket(ds, 499_999_999).sortOrder).toBe(7);
  });

  it("500,000,000 → 8구간 (G2 §4 spec 누락 정정 검증)", () => {
    expect(getLawyerFeeBracket(ds, 500_000_000).sortOrder).toBe(8);
  });

  it("10,000,000,000 → 8구간 (무한대 wedge)", () => {
    expect(getLawyerFeeBracket(ds, 10_000_000_000).sortOrder).toBe(8);
  });

  it("음수 caseValue 거부", () => {
    expect(() => getLawyerFeeBracket(ds, -1)).toThrow(/must be >= 0/);
  });
});

describe("computeLawyerFee / bracket 산식", () => {
  it("소가 1,000,000 (1구간 정액) = 300,000원", () => {
    const r = computeLawyerFee(input({ caseValue: 1_000_000 }), { computedAt: FROZEN_AT });
    expect(r.baseAmount).toBe(300_000);
    expect(r.amount).toBe(300_000);
    expect(r.multiplier).toBe(1.0);
    expect(r.dataVersion).toBe("lawyer-fee/v1.1.0");
    expect(r.computedAt).toBe(FROZEN_AT);
  });

  it("소가 0 (1구간 정액) = 300,000원 (최저기준액)", () => {
    const r = computeLawyerFee(input({ caseValue: 0 }), { computedAt: FROZEN_AT });
    expect(r.amount).toBe(300_000);
  });

  it("소가 10,000,000 (2구간) = 300,000 + (10M-3M) × 0.10 = 1,000,000원", () => {
    const r = computeLawyerFee(input({ caseValue: 10_000_000 }), { computedAt: FROZEN_AT });
    expect(r.baseAmount).toBe(1_000_000);
    expect(r.amount).toBe(1_000_000);
  });

  it("소가 30,000,000 (3구간) = 2,000,000 + (30M-20M) × 0.08 = 2,800,000원", () => {
    const r = computeLawyerFee(input({ caseValue: 30_000_000 }), { computedAt: FROZEN_AT });
    expect(r.baseAmount).toBe(2_800_000);
    expect(r.amount).toBe(2_800_000);
  });

  it("소가 100,000,000 (5구간 진입, base 만) = 7,400,000원", () => {
    const r = computeLawyerFee(input({ caseValue: 100_000_000 }), { computedAt: FROZEN_AT });
    expect(r.amount).toBe(7_400_000);
  });

  it("소가 500,000,000 (8구간 진입, base 만, G2 §4 누락 정정) = 13,400,000원", () => {
    const r = computeLawyerFee(input({ caseValue: 500_000_000 }), { computedAt: FROZEN_AT });
    expect(r.amount).toBe(13_400_000);
  });

  it("소가 1,000,000,000 (8구간) = 13,400,000 + (10억-5억) × 0.005 = 15,900,000원", () => {
    const r = computeLawyerFee(input({ caseValue: 1_000_000_000 }), { computedAt: FROZEN_AT });
    expect(r.baseAmount).toBe(15_900_000);
    expect(r.amount).toBe(15_900_000);
  });
});

describe("computeLawyerFee / 5 discount variant", () => {
  it("noOralHearingOrAdmission (×0.5, 제5조) — 무변론 판결", () => {
    const r = computeLawyerFee(
      input({
        caseValue: 30_000_000,
        discounts: [{ kind: "noOralHearingOrAdmission", reason: "noOralHearing" }],
      }),
      { computedAt: FROZEN_AT },
    );
    expect(r.multiplier).toBe(0.5);
    expect(r.amount).toBe(2_800_000 * 0.5);
  });

  it("provisionalCase hasOralHearing=false (×0.5, 제3조 ②항)", () => {
    const r = computeLawyerFee(
      input({
        caseValue: 30_000_000,
        caseType: "provisionalMeasureCollegial",
        discounts: [{ kind: "provisionalCase", hasOralHearing: false }],
      }),
      { computedAt: FROZEN_AT },
    );
    expect(r.multiplier).toBe(0.5);
    expect(r.amount).toBe(2_800_000 * 0.5);
  });

  it("provisionalCase hasOralHearing=true (×1.0, 제3조 ②항 단서)", () => {
    const r = computeLawyerFee(
      input({
        caseValue: 30_000_000,
        caseType: "provisionalMeasureCollegial",
        discounts: [{ kind: "provisionalCase", hasOralHearing: true }],
      }),
      { computedAt: FROZEN_AT },
    );
    expect(r.multiplier).toBe(1.0);
    expect(r.amount).toBe(2_800_000);
  });

  it("koreaLegalAid (×0.42 default)", () => {
    const r = computeLawyerFee(
      input({ caseValue: 30_000_000, discounts: [{ kind: "koreaLegalAid" }] }),
      {
        computedAt: FROZEN_AT,
      },
    );
    expect(r.multiplier).toBeCloseTo(0.42);
    expect(r.amount).toBeCloseTo(2_800_000 * 0.42);
  });

  it("koreaLegalAid + koreaLegalAidAgreedFeeWon override (지급보수액 cap)", () => {
    const r = computeLawyerFee(
      input({
        caseValue: 30_000_000,
        discounts: [{ kind: "koreaLegalAid" }],
        koreaLegalAidAgreedFeeWon: 1_000_000,
      }),
      { computedAt: FROZEN_AT },
    );
    expect(r.multiplier).toBeCloseTo(1_000_000 / 2_800_000);
    expect(r.amount).toBeCloseTo(1_000_000);
  });

  it("courtDiscretion 0.3 (감액)", () => {
    const r = computeLawyerFee(
      input({
        caseValue: 30_000_000,
        discounts: [{ kind: "courtDiscretion", multiplier: 0.3 }],
      }),
      { computedAt: FROZEN_AT },
    );
    expect(r.multiplier).toBe(0.3);
    expect(r.amount).toBe(2_800_000 * 0.3);
  });

  it("courtDiscretion 1.5 (증액 상한, 제6조 ②항)", () => {
    const r = computeLawyerFee(
      input({
        caseValue: 30_000_000,
        discounts: [{ kind: "courtDiscretion", multiplier: 1.5 }],
      }),
      { computedAt: FROZEN_AT },
    );
    expect(r.multiplier).toBe(1.5);
    expect(r.multiplierClamped).toBe(false);
    expect(r.amount).toBe(2_800_000 * 1.5);
  });

  it("customPercent (본 규칙 외)", () => {
    const r = computeLawyerFee(
      input({
        caseValue: 30_000_000,
        discounts: [{ kind: "customPercent", rate: 0.7 }],
      }),
      { computedAt: FROZEN_AT },
    );
    expect(r.multiplier).toBeCloseTo(0.7);
    expect(r.amount).toBeCloseTo(2_800_000 * 0.7);
  });
});

describe("computeLawyerFee / 누적 (compound) + clamp", () => {
  it("koreaLegalAid × noOralHearingOrAdmission = 0.42 × 0.5 = 0.21 (누적)", () => {
    const r = computeLawyerFee(
      input({
        caseValue: 30_000_000,
        discounts: [
          { kind: "koreaLegalAid" },
          { kind: "noOralHearingOrAdmission", reason: "noOralHearing" },
        ],
      }),
      { computedAt: FROZEN_AT },
    );
    expect(r.rawMultiplier).toBeCloseTo(0.21);
    expect(r.multiplier).toBeCloseTo(0.21);
    expect(r.multiplierClamped).toBe(false);
  });

  it("courtDiscretion 1.5 + customPercent 1.5 = 2.25 → clamp 1.5 (raw 2.25)", () => {
    const r = computeLawyerFee(
      input({
        caseValue: 30_000_000,
        discounts: [
          { kind: "courtDiscretion", multiplier: 1.5 },
          { kind: "customPercent", rate: 1.5 },
        ],
      }),
      { computedAt: FROZEN_AT },
    );
    expect(r.rawMultiplier).toBeCloseTo(2.25);
    expect(r.multiplier).toBe(1.5);
    expect(r.multiplierClamped).toBe(true);
  });

  it("courtDiscretion 0.0 = 0.0 floor 적용 (raw 0)", () => {
    const r = computeLawyerFee(
      input({
        caseValue: 30_000_000,
        discounts: [{ kind: "courtDiscretion", multiplier: 0.0 }],
      }),
      { computedAt: FROZEN_AT },
    );
    expect(r.multiplier).toBe(0.0);
    expect(r.amount).toBe(0);
  });
});

describe("computeLawyerFee / 대한법률구조공단 scope warning", () => {
  it("민사 + koreaLegalAid → warning 0", () => {
    const r = computeLawyerFee(
      input({
        caseValue: 30_000_000,
        caseType: "civilFirstInstanceCollegial",
        discounts: [{ kind: "koreaLegalAid" }],
      }),
      { computedAt: FROZEN_AT },
    );
    expect(r.koreaLegalAidWarnings).toHaveLength(0);
  });

  it("가사 + koreaLegalAid → warning 0", () => {
    const r = computeLawyerFee(
      input({
        caseValue: 30_000_000,
        caseType: "familyFirstInstanceCollegial",
        discounts: [{ kind: "koreaLegalAid" }],
      }),
      { computedAt: FROZEN_AT },
    );
    expect(r.koreaLegalAidWarnings).toHaveLength(0);
  });

  it("행정 + koreaLegalAid → koreaLegalAidScopeNotCivilOrFamily 경고", () => {
    const r = computeLawyerFee(
      input({
        caseValue: 30_000_000,
        caseType: "administrativeFirstInstance",
        discounts: [{ kind: "koreaLegalAid" }],
      }),
      { computedAt: FROZEN_AT },
    );
    expect(r.koreaLegalAidWarnings.length).toBeGreaterThanOrEqual(1);
    expect(
      r.koreaLegalAidWarnings.some((w) => w.reason === "koreaLegalAidScopeNotCivilOrFamily"),
    ).toBe(true);
  });

  it("보전 + koreaLegalAid → koreaLegalAidScopeNotCivilOrFamily 경고", () => {
    const r = computeLawyerFee(
      input({
        caseValue: 30_000_000,
        caseType: "provisionalMeasureCollegial",
        discounts: [{ kind: "koreaLegalAid" }],
      }),
      { computedAt: FROZEN_AT },
    );
    expect(
      r.koreaLegalAidWarnings.some((w) => w.reason === "koreaLegalAidScopeNotCivilOrFamily"),
    ).toBe(true);
  });

  it("민사 + koreaLegalAid + customPercent → koreaLegalAidScopeOverridden 경고", () => {
    const r = computeLawyerFee(
      input({
        caseValue: 30_000_000,
        caseType: "civilFirstInstanceCollegial",
        discounts: [{ kind: "koreaLegalAid" }, { kind: "customPercent", rate: 0.5 }],
      }),
      { computedAt: FROZEN_AT },
    );
    expect(r.koreaLegalAidWarnings.some((w) => w.reason === "koreaLegalAidScopeOverridden")).toBe(
      true,
    );
  });

  it("koreaLegalAid 미사용 → warning 0 (다른 discount 만)", () => {
    const r = computeLawyerFee(
      input({
        caseValue: 30_000_000,
        caseType: "administrativeFirstInstance",
        discounts: [{ kind: "courtDiscretion", multiplier: 0.5 }],
      }),
      { computedAt: FROZEN_AT },
    );
    expect(r.koreaLegalAidWarnings).toHaveLength(0);
  });
});

describe("computeLawyerFee / validator integration", () => {
  it("음수 caseValue → RangeError", () => {
    expect(() => computeLawyerFee(input({ caseValue: -1 }))).toThrow(/변호사보수 입력 검증 실패/);
  });

  it("paymentOrder caseType → RangeError (lawyer-fee 도메인 미적용)", () => {
    expect(() => computeLawyerFee(input({ caseType: "paymentOrder" }))).toThrow(
      /도메인에 적용되지 않습니다/,
    );
  });

  it("잘못된 caseType → RangeError", () => {
    expect(() =>
      computeLawyerFee({
        ...input(),
        caseType: "bogusCase" as LawyerFeeInput["caseType"],
      }),
    ).toThrow(/사건구분이 유효하지 않습니다/);
  });

  it("잘못된 filingDate 형식 → RangeError", () => {
    expect(() => computeLawyerFee(input({ filingDate: "not-a-date" }))).toThrow(/ISO 형식/);
  });

  it("courtDiscretion multiplier 가 1.5 초과 → validator 가 거부", () => {
    expect(() =>
      computeLawyerFee(input({ discounts: [{ kind: "courtDiscretion", multiplier: 2.0 }] })),
    ).toThrow(/courtDiscretion.multiplier/);
  });
});

describe("computeLawyerFee / dataset injection 결정성", () => {
  it("default 호출 → bundled dataset 사용 (lawyer-fee/v1.1.0)", () => {
    const r = computeLawyerFee(input(), { computedAt: FROZEN_AT });
    expect(r.dataVersion).toBe("lawyer-fee/v1.1.0");
  });

  it("custom dataset 주입 → dataVersion 변경", () => {
    const ds = loadLawyerFeeDataset();
    const custom: LawyerFeeDataset = { ...ds, version: "9.9.9-test" };
    const r = computeLawyerFee(input(), { dataset: custom, computedAt: FROZEN_AT });
    expect(r.dataVersion).toBe("lawyer-fee/v9.9.9-test");
  });

  it("잘못된 dataset 주입 → validate 단계에서 throw", () => {
    const ds = loadLawyerFeeDataset();
    const bad: LawyerFeeDataset = {
      ...ds,
      brackets: [{ ...ds.brackets[0]!, baseAmount: -1 }, ...ds.brackets.slice(1)],
    };
    expect(() => computeLawyerFee(input(), { dataset: bad })).toThrow(/baseAmount/);
  });

  it("computedAt override 가 결과에 반영된다", () => {
    const r = computeLawyerFee(input(), { computedAt: FROZEN_AT });
    expect(r.computedAt).toBe(FROZEN_AT);
  });
});

describe("computeLawyerFee / formulaText 회귀", () => {
  it("1구간 정액 산식", () => {
    const r = computeLawyerFee(input({ caseValue: 1_000_000 }), { computedAt: FROZEN_AT });
    expect(r.formulaText).toContain("별표 1구간 정액");
    expect(r.formulaText).toContain("심급별 독립");
  });

  it("3구간 누진 산식 + 단일 discount", () => {
    const r = computeLawyerFee(
      input({
        caseValue: 30_000_000,
        discounts: [{ kind: "koreaLegalAid" }],
      }),
      { computedAt: FROZEN_AT },
    );
    expect(r.formulaText).toContain("별표 3구간");
    expect(r.formulaText).toContain("대한법률구조공단");
  });

  it("clamp 적용 시 formulaText 에 raw → clamped 표시", () => {
    const r = computeLawyerFee(
      input({
        caseValue: 30_000_000,
        discounts: [
          { kind: "courtDiscretion", multiplier: 1.5 },
          { kind: "customPercent", rate: 1.5 },
        ],
      }),
      { computedAt: FROZEN_AT },
    );
    expect(r.formulaText).toContain("clamp 적용");
  });
});

describe("computeLawyerFee / per_instance_independent (G2 §2.4 정정 검증)", () => {
  it("1심·항소심 동일 소가 → 동일 산출 (engine 은 심급 multiplier 미적용)", () => {
    // 본 engine 은 caller 가 항소심 소가 (불복 범위) 를 input.caseValue 로 명시 입력하는 것을 전제.
    // input 자체에 심급 정보 없음 — appealsLevel 은 stamp-duty 에만 존재 (인지법 ×1.5/×2).
    const first = computeLawyerFee(input({ caseValue: 30_000_000 }), { computedAt: FROZEN_AT });
    const appealSameValue = computeLawyerFee(input({ caseValue: 30_000_000 }), {
      computedAt: FROZEN_AT,
    });
    expect(first.amount).toBe(appealSameValue.amount);
  });

  it("항소심 소가 다르게 입력 시 (불복 범위 기준) → 다른 산출", () => {
    // 1심 소가 100M (5구간 base 7.4M), 항소심 불복 범위 50M → 4구간 base 4.4M.
    const first = computeLawyerFee(input({ caseValue: 100_000_000 }), { computedAt: FROZEN_AT });
    const appealOnlyHalfDisputed = computeLawyerFee(input({ caseValue: 50_000_000 }), {
      computedAt: FROZEN_AT,
    });
    expect(first.amount).toBe(7_400_000);
    expect(appealOnlyHalfDisputed.amount).toBe(4_400_000);
  });
});
