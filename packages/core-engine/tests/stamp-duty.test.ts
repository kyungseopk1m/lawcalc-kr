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
    expect(ds.version).toBe("1.2.0");
    expect(ds.brackets).toHaveLength(4);
    expect(ds.brackets.map((b) => b.baseAmount)).toEqual([0, 5000, 55000, 555000]);
    expect(ds.brackets.map((b) => b.rate)).toEqual([0.005, 0.0045, 0.004, 0.0035]);
  });

  it("stampDutyVersionTag 는 stamp-duty/v1.2.0", () => {
    expect(stampDutyVersionTag(loadStampDutyDataset())).toBe("stamp-duty/v1.2.0");
  });

  /**
   * 조정신청(머)의 근거는 인지법이 아니라 「민사조정규칙」제3조 제1항이다 —
   * "조정신청의 수수료는 「민사소송 등 인지법」 제2조에 따라 산출한 금액의 10분의 1로 한다."
   *
   * 사건구분 selector 에는 조정사건이 노출돼 있는데 엔진에 분기가 없어 소장 누진식이
   * 그대로 적용됐다. 소가 3,000만원 기준 140,000원(정답 14,000원) — 10배 과대.
   */
  describe("조정신청 인지 (민사조정규칙 제3조 제1항)", () => {
    const mediation = (caseValue: number, extra: Record<string, unknown> = {}) =>
      computeStampDuty(
        {
          caseValue,
          caseType: "civilMediation",
          appealsLevel: "firstInstance",
          ...extra,
        } as never,
        { computedAt: FROZEN_AT },
      );

    const plain = (caseValue: number) =>
      computeStampDuty(
        { caseValue, caseType: "civilFirstInstanceSingle", appealsLevel: "firstInstance" },
        { computedAt: FROZEN_AT },
      );

    it("소가 3,000만원 → 소장 인지의 1/10", () => {
      expect(plain(30_000_000).amount).toBe(140_000);
      expect(mediation(30_000_000).amount).toBe(14_000);
    });

    // 민사조정규칙 제3조는 조정 **신청** 수수료만 정한다. 민사조정법 제34조·제36조의 이의 후
    // 소송 이행은 조정신청의 상소가 아니고, 제6조의 항소심 조정은 법원의 회부다. 가드가 없던
    // 동안 여기서 항소 21,000원 / 상고 28,000원이라는 존재하지 않는 수수료가 나왔다.
    it("항소·상고 심급은 거부한다", () => {
      for (const appealsLevel of ["appeal", "supreme"] as const) {
        expect(() => mediation(30_000_000, { appealsLevel })).toThrow(/조정신청은 1심에서만/);
      }
    });

    it("소가 5억원 → 1/10", () => {
      expect(plain(500_000_000).amount).toBe(2_055_000);
      expect(mediation(500_000_000).amount).toBe(205_500);
    });

    it("전자소송이면 그 위에 10분의 9 가 더 적용된다", () => {
      expect(mediation(30_000_000, { isElectronicFiling: true }).amount).toBe(12_600);
    });

    it("산식에 조정신청 배수가 드러난다", () => {
      expect(mediation(30_000_000).formulaText).toContain("조정신청");
    });

    it("1,000원 하한이 걸린다", () => {
      // 소가가 작아 1/10 이 1,000원 미만이면 1,000원.
      expect(mediation(10_000).amount).toBe(1_000);
    });
  });

  /**
   * 소가를 산출할 수 없는 소송의 간주 소가 (「민사소송 등 인지규칙」제18조의2).
   *
   * "재산권상의 소로서 그 소가를 산출할 수 없는 것과 비재산권을 목적으로 하는 소송의 소가는
   * 5천만 원으로 한다. 다만, 제15조제1항 내지 제3항, 제15조의2, 제17조의2, 제18조에 정한
   * 소송의 소가는 1억 원으로 한다."
   *
   * 이 분기가 없던 동안 비재산권 소송에 소가 0 을 넣으면 인지액이 1,000원(하한)으로
   * 나왔다 — 정답 230,000원 대비 230분의 1.
   */
  describe("소가 산출 불가 / 비재산권 소송 (인지규칙 제18조의2)", () => {
    const basis = (
      caseValueBasis: "amount" | "unascertainable" | "unascertainableHighTier",
      caseValue = 0,
    ) =>
      computeStampDuty(
        {
          caseValue,
          caseType: "civilFirstInstanceSingle",
          appealsLevel: "firstInstance",
          caseValueBasis,
        } as never,
        { computedAt: FROZEN_AT },
      );

    it("소가 0 을 그대로 두면 하한 1,000원이 나온다 (구 동작)", () => {
      expect(basis("amount").amount).toBe(1_000);
    });

    it("비재산권 소송 → 5,000만원 간주 = 230,000원", () => {
      expect(basis("unascertainable").amount).toBe(230_000);
    });

    it("회사관계·특허·무체재산권 등 → 1억원 간주 = 455,000원", () => {
      // 1억 × 40/10,000 + 55,000 = 455,000 (제2조 제1항 3호). 형제 테스트와 같이 금액을
      // 직접 고정한다 — 엔진 자기 출력과 비교하면 누진표가 틀어져도 양변이 함께 움직인다.
      expect(basis("unascertainableHighTier").amount).toBe(455_000);
    });

    it("간주 시 입력한 소가는 무시된다", () => {
      expect(basis("unascertainable", 999_999_999).amount).toBe(230_000);
    });

    it("산식에 간주 근거가 드러난다", () => {
      expect(basis("unascertainable").formulaText).toContain("제18조의2");
      expect(basis("unascertainable").formulaText).toContain("50,000,000");
    });

    it("기본값(미지정)은 기존 동작과 동일하다", () => {
      const explicit = computeStampDuty(
        {
          caseValue: 30_000_000,
          caseType: "civilFirstInstanceSingle",
          appealsLevel: "firstInstance",
          caseValueBasis: "amount",
        } as never,
        { computedAt: FROZEN_AT },
      );
      const omitted = computeStampDuty(
        {
          caseValue: 30_000_000,
          caseType: "civilFirstInstanceSingle",
          appealsLevel: "firstInstance",
        },
        { computedAt: FROZEN_AT },
      );
      expect(explicit.amount).toBe(omitted.amount);
      expect(explicit.formulaText).toBe(omitted.formulaText);
    });

    it("항소심에도 간주 소가에 심급 배수가 적용된다", () => {
      const r = computeStampDuty(
        {
          caseValue: 0,
          caseType: "civilFirstInstanceSingle",
          appealsLevel: "appeal",
          caseValueBasis: "unascertainable",
        } as never,
        { computedAt: FROZEN_AT },
      );
      expect(r.amount).toBe(345_000); // 230,000 × 1.5
    });
  });

  /**
   * 항고·재항고(라/마)는 인지법 제11조 별도 체계다. 제2조 소장 누진표 대상이 아니다.
   *
   * 분기가 없던 동안 소가 3,000만원 항고에 140,000원(정답 2,000원)이 나왔다 — 70배 과대.
   */
  describe("항고·재항고 인지 (인지법 제11조)", () => {
    const appeal = (caseValue: number, extra: Record<string, unknown> = {}) =>
      computeStampDuty(
        {
          caseValue,
          caseType: "civilInterlocutoryAppeal",
          appealsLevel: "firstInstance",
          ...extra,
        } as never,
        { computedAt: FROZEN_AT },
      );

    it("제11조 제2항 — 그 외 항고장은 2,000원 정액 (소가 무관)", () => {
      for (const caseValue of [0, 30_000_000, 500_000_000, 10_000_000_000]) {
        expect(appeal(caseValue).amount).toBe(2_000);
      }
    });

    it("제11조 제1항 — 원신청서 인지액을 넘기면 그 2배", () => {
      // 일반 가압류 신청(제9조 제2항 정액 1만원)에 대한 항고 = 20,000원.
      expect(appeal(50_000_000, { underlyingApplicationStampDutyWon: 10_000 }).amount).toBe(20_000);
      expect(appeal(50_000_000, { underlyingApplicationStampDutyWon: 115_000 }).amount).toBe(
        230_000,
      );
    });

    it("전자소송 감액을 준용하지 않는다 (제16조 제2항 준용 범위는 제3조~제10조)", () => {
      expect(appeal(30_000_000, { isElectronicFiling: true }).amount).toBe(2_000);
    });

    // 검증이 없으면 그대로 2배가 되어 음수 인지액이나 NaN 이 결과에 실린다.
    it("원신청서 인지액은 양의 safe integer 만 받는다", () => {
      for (const bad of [-1, 0, 1.5, NaN, Infinity, -Infinity, 2 ** 53]) {
        expect(() => appeal(50_000_000, { underlyingApplicationStampDutyWon: bad })).toThrow(
          /원신청서 인지액이 유효하지 않습니다/,
        );
      }
    });

    it("심급 배수를 쓰지 않는다", () => {
      expect(appeal(30_000_000, { appealsLevel: "appeal" }).amount).toBe(2_000);
      expect(appeal(30_000_000, { appealsLevel: "supreme" }).amount).toBe(2_000);
    });

    it("산식에 근거 조문이 드러난다", () => {
      expect(appeal(30_000_000).formulaText).toContain("제11조 제2항");
      expect(
        appeal(30_000_000, { underlyingApplicationStampDutyWon: 10_000 }).formulaText,
      ).toContain("제11조 제1항");
    });
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

describe("applyStampDutyRounding (제2조 제2항)", () => {
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
  // 인지법 제2조 제1항 2호 — 소가 전체 × 0.0045 + 5,000 = 45,000 + 5,000 = 50,000.
  // (1구간 상한 9,999,999 × 0.005 ≈ 49,999 와 이어지는 연속 보정식.)
  it("소가 10,000,000 1심 = 50,000원 (2구간 경계, 연속)", () => {
    const r = computeStampDuty(input({ caseValue: 10_000_000 }), { computedAt: FROZEN_AT });
    expect(r.amount).toBe(50_000);
    expect(r.dataVersion).toBe("stamp-duty/v1.2.0");
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
    // 50,000,000 × 0.0045 + 5,000 = 225,000 + 5,000 = 230,000 (인지법 제2조 제1항 2호, 소가 전체).
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

/**
 * 제16조 제1항의 감액 대상은 "제2조에 따른 인지액"이다. 제2조 제2항("제1항에 따라 계산한
 * 인지액이 1천원 미만이면 그 인지액은 1천원으로 하고, 1천원 이상이면 100원 미만은 계산하지
 * 아니한다")이 적용된 뒤의 금액이라는 뜻이고, 감액 후 다시 1천원 하한을 걸라는 문언은
 * 제16조에 없다. 민사조정규칙 제3조 제2항이 같은 구조를 명문화한다 — "제1항 본문에 따른
 * 수수료가 1천원 미만이면 1천원으로 하고, 제1항 본문 또는 단서에 따른 수수료 중 100원
 * 미만은 계산하지 아니한다" (하한은 감액 전 본문 금액에만, 절사는 감액 전후 양쪽에).
 *
 * 하한을 감액 뒤에 걸던 v0.11.0 구현은 소가 약 222,222원 이하 전 구간에서 감액분이 하한에
 * 통째로 먹혀 제16조가 사라졌다 (소가 10,000 전자 = 1,000원 ← 정답 900원).
 */
/**
 * 소가 산정 기준(인지규칙 제18조의2) 화이트리스트 검증.
 *
 * `resolveEffectiveCaseValue` 는 "amount" 가 아닌 **모든** 값을 간주 소가로 취급한다.
 * 검증이 없으면 오타 하나가 소가를 통째로 갈아치우고 에러도 나지 않는다 —
 * 소가 10억 합의부 1심의 정답 4,055,000원이 230,000원(5천만 간주)이 된다.
 * 손편집된 `.lcalc` 이나 신버전이 추가한 기준값을 구버전 앱이 여는 경우에 실제로 도달한다.
 */
/**
 * 제2조 제2항 1,000원 하한은 배수를 곱하기 **전** 금액에 건다.
 *
 * 제2조 제2항 문언이 "**제1항에 따라 계산한** 인지액이 1천원 미만이면" 이고, 제3조가 곱하는
 * "제2조에 따른 금액" 은 그 하한이 적용된 뒤의 금액이다. 하한을 배수 뒤에 걸면 배수가
 * 하한에 통째로 먹혀, 소가 약 222,222원 이하(= 제2조 제1항 금액이 1,000원 미만인 구간)에서
 * 항소가 최대 33%, 상고가 최대 50% 과소계산된다.
 *
 * 화해·지급명령만 예외다 — 제7조 제4항이 "제1항과 제2항에 따른 인지액에 관하여는
 * 제2조제2항을 준용한다" 며 배수 뒤에 다시 걸라고 명문화했다.
 */
describe("computeStampDuty / 제2조 제2항 하한과 배수의 순서", () => {
  const at = (caseValue: number, appealsLevel: StampDutyInput["appealsLevel"]) =>
    computeStampDuty(input({ caseValue, appealsLevel }), { computedAt: FROZEN_AT }).amount;

  it("소가 10,000: 1심 1,000 / 항소 1,500 / 상고 2,000", () => {
    expect(at(10_000, "firstInstance")).toBe(1_000);
    expect(at(10_000, "appeal")).toBe(1_500);
    expect(at(10_000, "supreme")).toBe(2_000);
  });

  it("소가 150,000: 제2조 제1항 750 → 하한 1,000 → 항소 1,500 / 상고 2,000", () => {
    expect(at(150_000, "appeal")).toBe(1_500);
    expect(at(150_000, "supreme")).toBe(2_000);
  });

  it("소가 200,000: 하한 경계 (제2조 제1항 = 정확히 1,000) — 배수만 붙는다", () => {
    expect(at(200_000, "firstInstance")).toBe(1_000);
    expect(at(200_000, "appeal")).toBe(1_500);
    expect(at(200_000, "supreme")).toBe(2_000);
  });

  it("하한이 걸리지 않는 구간은 무변경: 소가 5,000만 항소 345,000 / 상고 460,000", () => {
    expect(at(50_000_000, "appeal")).toBe(345_000);
    expect(at(50_000_000, "supreme")).toBe(460_000);
  });

  it("100원 절사 순서는 건드리지 않았다 — 소가 3,350,000 항소 = 25,100", () => {
    // 16,750 × 1.5 = 25,125 → 100원 절사 = 25,100.
    // 절사를 배수 앞으로 옮기면 floor100(16,750) × 1.5 = 25,050 이 되는데 그건 별개 쟁점이다.
    expect(at(3_350_000, "appeal")).toBe(25_100);
  });

  it("항소 + 전자소송도 배수와 감액이 둘 다 살아난다", () => {
    // 소가 100,000: 하한 1,000 → × 1.5 = 1,500 → × 0.9 = 1,350 → 절사 = 1,300.
    const r = computeStampDuty(
      input({ caseValue: 100_000, appealsLevel: "appeal", isElectronicFiling: true }),
      { computedAt: FROZEN_AT },
    );
    expect(r.amount).toBe(1_300);
  });

  it("화해·지급명령은 제7조 제4항 준용으로 배수 뒤에 하한을 다시 건다", () => {
    // 소가 10,000 지급명령: 하한 1,000 → × 0.1 = 100 → 제7조 제4항 하한 = 1,000.
    expect(
      computeStampDuty(input({ caseValue: 10_000, caseType: "paymentOrder" }), {
        computedAt: FROZEN_AT,
      }).amount,
    ).toBe(1_000);
    // 화해도 동일: 1,000 → × 0.2 = 200 → 1,000.
    expect(
      computeStampDuty(input({ caseValue: 10_000, isSettlement: true }), {
        computedAt: FROZEN_AT,
      }).amount,
    ).toBe(1_000);
  });

  it("제7조 제4항 하한이 걸리면 formulaText 에 그 단계가 남는다", () => {
    const r = computeStampDuty(input({ caseValue: 10_000, caseType: "paymentOrder" }), {
      computedAt: FROZEN_AT,
    });
    expect(r.formulaText).toContain("= 1,000원 (제2조 제2항 하한)");
    expect(r.formulaText).toContain("= 1,000원 (제7조 제4항 하한)");
  });
});

describe("computeStampDuty / caseValueBasis 화이트리스트", () => {
  const bigCase = { caseValue: 1_000_000_000 } as const;

  it("유효한 3개 값은 통과한다", () => {
    for (const basis of ["amount", "unascertainable", "unascertainableHighTier"] as const) {
      expect(() =>
        computeStampDuty(input({ ...bigCase, caseValueBasis: basis }), { computedAt: FROZEN_AT }),
      ).not.toThrow();
    }
  });

  it("오타는 조용히 간주 소가로 빠지지 않고 거부된다", () => {
    expect(() =>
      computeStampDuty(input({ ...bigCase, caseValueBasis: "unascertainableHigh" as never }), {
        computedAt: FROZEN_AT,
      }),
    ).toThrow(/소가 산정 기준이 유효하지 않습니다/);
  });

  it("빈 문자열도 거부된다", () => {
    expect(() =>
      computeStampDuty(input({ ...bigCase, caseValueBasis: "" as never }), {
        computedAt: FROZEN_AT,
      }),
    ).toThrow(/소가 산정 기준이 유효하지 않습니다/);
  });

  it("미지정은 amount 와 같다 (구파일 호환)", () => {
    const omitted = computeStampDuty(input(bigCase), { computedAt: FROZEN_AT });
    const explicit = computeStampDuty(input({ ...bigCase, caseValueBasis: "amount" }), {
      computedAt: FROZEN_AT,
    });
    expect(omitted.amount).toBe(4_055_000);
    expect(explicit.amount).toBe(omitted.amount);
  });
});

describe("computeStampDuty / 전자소송 감액 × 1,000원 하한 순서 (제16조 제1항)", () => {
  it("소가 10,000 전자 = 900원 (하한 1,000 → × 0.9)", () => {
    const r = computeStampDuty(input({ caseValue: 10_000, isElectronicFiling: true }), {
      computedAt: FROZEN_AT,
    });
    expect(r.amount).toBe(900);
  });

  it("소가 200,000 전자 = 900원 (제2조 산출 1,000 = 하한과 동일 → × 0.9)", () => {
    // 200,000 × 50/10,000 = 1,000. 하한이 걸리지 않아도 감액은 그대로 붙는다.
    const r = computeStampDuty(input({ caseValue: 200_000, isElectronicFiling: true }), {
      computedAt: FROZEN_AT,
    });
    expect(r.amount).toBe(900);
  });

  it("소가 220,000 전자 = 900원 (감액 결과 990 → 100원 절사, 하한 재적용 없음)", () => {
    // 220,000 × 50/10,000 = 1,100 → × 0.9 = 990 → 900. 하한을 다시 걸면 1,000 이 되어 오답.
    const r = computeStampDuty(input({ caseValue: 220_000, isElectronicFiling: true }), {
      computedAt: FROZEN_AT,
    });
    expect(r.amount).toBe(900);
  });

  it("소가 222,300 전자 = 1,000원 (감액 결과가 하한을 넘는 첫 구간)", () => {
    // 222,300 × 50/10,000 = 1,111.5 → × 0.9 = 1,000.35 → 1,000.
    const r = computeStampDuty(input({ caseValue: 222_300, isElectronicFiling: true }), {
      computedAt: FROZEN_AT,
    });
    expect(r.amount).toBe(1_000);
  });

  it("하한이 걸리면 formulaText 에 그 단계가 남는다", () => {
    const r = computeStampDuty(input({ caseValue: 10_000, isElectronicFiling: true }), {
      computedAt: FROZEN_AT,
    });
    expect(r.formulaText).toContain("= 1,000원 (제2조 제2항 하한)");
    expect(r.formulaText).toContain("전자소송 (×0.9)");
  });

  it("하한이 걸리지 않으면 formulaText 에 하한 단계가 없다", () => {
    const r = computeStampDuty(input({ caseValue: 50_000_000, isElectronicFiling: true }), {
      computedAt: FROZEN_AT,
    });
    expect(r.formulaText).not.toContain("제2조 제2항 하한");
  });

  it("지급명령 + 전자, 소가 10,000 = 900원 (특별절차 배수 뒤에 하한)", () => {
    // 50 × 0.1 = 5 → 하한 1,000 → × 0.9 = 900. 민사조정규칙 제3조 제2항과 같은 순서.
    const r = computeStampDuty(
      input({ caseValue: 10_000, caseType: "paymentOrder", isElectronicFiling: true }),
      { computedAt: FROZEN_AT },
    );
    expect(r.amount).toBe(900);
  });

  it("비전자 경로는 전부 무변경 — 하한이 최종 금액에 그대로 걸린다", () => {
    const cases: Array<[number, number]> = [
      [10_000, 1_000],
      [200_000, 1_000],
      [220_000, 1_100],
      [222_300, 1_100],
      [50_000_000, 230_000],
    ];
    for (const [caseValue, expected] of cases) {
      const r = computeStampDuty(input({ caseValue }), { computedAt: FROZEN_AT });
      expect(r.amount).toBe(expected);
    }
  });

  it("소가 5,000만 전자 = 207,000원 (기존값 유지 — 100원 절사 순서는 건드리지 않았다)", () => {
    const plain = computeStampDuty(input({ caseValue: 50_000_000, isElectronicFiling: true }), {
      computedAt: FROZEN_AT,
    });
    expect(plain.amount).toBe(207_000);

    const order = computeStampDuty(
      input({ caseValue: 50_000_000, isPaymentOrder: true, isElectronicFiling: true }),
      { computedAt: FROZEN_AT },
    );
    expect(order.amount).toBe(20_700);
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
    expect(r.dataVersion).toBe("stamp-duty/v1.2.0");
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
    expect(r.formulaText).toContain("제2조 제2항 100원 절사");
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

describe("computeStampDuty / 보전처분 제9조 제2항 (감사 F1)", () => {
  it("일반 가압류·가처분 (기본): 소가 무관 정액 10,000원", () => {
    // 소가 5천만 카단. 제2조 소장식(230,000)이 아니라 제9조 정액이다.
    const r = computeStampDuty(
      input({ caseValue: 50_000_000, caseType: "provisionalMeasureSingle" }),
      { computedAt: FROZEN_AT },
    );
    expect(r.amount).toBe(10_000);
    expect(r.formulaText).toContain("제9조 제2항 전단");
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
    expect(r.formulaText).toContain("제9조 제2항 후단");
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

  it("제9조 경로는 100원 절사를 적용하지 않는다 (제2조 제2항 준용 없음)", () => {
    // 본안 54,500(제2조 제2항 절사 적용 완료) × 0.5 = 27,250. 제7조 제4항과 달리 제9조에는
    // 제2조 제2항 준용 규정이 없으므로 여기서 다시 100원 절사할 근거가 없다.
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

  it("본안 인지액 자체에는 제2조 제2항 절사가 적용된다", () => {
    // 소가 9,999,999 → 49,999.995 → 제2조 제2항으로 49,900. 그 1/2 = 24,950.
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
