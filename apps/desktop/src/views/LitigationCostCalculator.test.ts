import { describe, expect, it } from "vitest";

import { STANDARD_DISCLAIMER, computeLitigationCost } from "@lawcalc-kr/core-engine";

import { migrateLcalcFile } from "../lib/lcalc-migrations";
import {
  parseLoadedLitigationCostLcalcInput,
  validateLcalcEnvelope,
} from "../lib/lcalc-validation";
import {
  buildProvisionalDiscount,
  buildStampDutyInput,
  hasLegacyPaymentOrderFlag,
  parseProportionalValues,
} from "./LitigationCostCalculator";

/**
 * 「변호사보수의 소송비용 산입에 관한 규칙」제3조 제2항.
 *
 * 단서 "다만, 가압류, 가처분 명령의 신청사건에 있어서는 변론 또는 심문을 거친 경우에
 * 한한다" 는 신청사건 전용이다. 이의·취소 신청사건은 단서 대상이 아니므로 변론·심문
 * 여부와 무관하게 1/2 이 산입된다.
 *
 * 직전 UI 는 체크박스 하나뿐이라 이의·취소 사건에도 `hasOralHearing: false` 를 붙여
 * 산입 불가(0원)로 강제했다. 엔진에는 `applicationKind` 분기가 이미 있었는데 UI 에서
 * 그 분기에 도달할 방법이 없었다.
 */
describe("buildProvisionalDiscount (변호사보수규칙 제3조 제2항)", () => {
  const provisional = "provisionalMeasureCollegial" as const;

  it("이의·취소 신청사건은 hasOralHearing 을 붙이지 않는다", () => {
    const d = buildProvisionalDiscount("objectionOrCancellation", provisional);
    expect(d).toEqual({ kind: "provisionalCase", applicationKind: "objectionOrCancellation" });
  });

  it("신청사건 · 변론 거침 → 산입 (1/2)", () => {
    expect(buildProvisionalDiscount("applicationWithHearing", provisional)).toEqual({
      kind: "provisionalCase",
      applicationKind: "application",
      hasOralHearing: true,
    });
  });

  it("신청사건 · 변론 미거침 → 산입 불가", () => {
    expect(buildProvisionalDiscount("applicationWithoutHearing", provisional)).toEqual({
      kind: "provisionalCase",
      applicationKind: "application",
      hasOralHearing: false,
    });
  });

  it("지정하지 않으면 discount 를 만들지 않는다 (본문 1/2 만 자동 적용)", () => {
    expect(buildProvisionalDiscount("unspecified", provisional)).toBeNull();
  });

  it("보전 사건구분이 아니면 어떤 선택이든 null", () => {
    for (const kind of [
      "objectionOrCancellation",
      "applicationWithHearing",
      "applicationWithoutHearing",
    ] as const) {
      expect(buildProvisionalDiscount(kind, "civilFirstInstanceSingle")).toBeNull();
    }
  });

  it("이의·취소 사건의 변호사보수가 0원이 아니다 (엔진까지 태운 확인)", () => {
    const discount = buildProvisionalDiscount("objectionOrCancellation", provisional)!;
    const withObjection = computeLitigationCost(
      {
        stampDuty: { caseValue: 30_000_000, caseType: provisional, appealsLevel: "firstInstance" },
        deliveryFee: { caseType: provisional, partyCount: 2 },
        lawyerFee: { caseValue: 30_000_000, caseType: provisional, discounts: [discount] },
      },
      { computedAt: "2026-08-18T00:00:00.000Z" },
    );
    const withoutHearing = computeLitigationCost(
      {
        stampDuty: { caseValue: 30_000_000, caseType: provisional, appealsLevel: "firstInstance" },
        deliveryFee: { caseType: provisional, partyCount: 2 },
        lawyerFee: {
          caseValue: 30_000_000,
          caseType: provisional,
          discounts: [buildProvisionalDiscount("applicationWithoutHearing", provisional)!],
        },
      },
      { computedAt: "2026-08-18T00:00:00.000Z" },
    );
    expect(withObjection.lawyerFee.amount).toBe(1_400_000); // 별표 2,800,000 × 1/2
    expect(withoutHearing.lawyerFee.amount).toBe(0);
  });
});

describe("parseProportionalValues", () => {
  it("parses comma-separated plain integers", () => {
    expect(parseProportionalValues("10000000, 20000000")).toEqual([10000000, 20000000]);
  });

  it("parses slash-separated thousands-grouped integers (placeholder format)", () => {
    expect(parseProportionalValues("10,000,000 / 20,000,000")).toEqual([10000000, 20000000]);
  });

  it("parses newline-separated thousands-grouped integers", () => {
    expect(parseProportionalValues("10,000,000\n20,000,000")).toEqual([10000000, 20000000]);
  });

  it("parses tab-separated thousands-grouped integers", () => {
    expect(parseProportionalValues("10,000,000\t20,000,000")).toEqual([10000000, 20000000]);
  });

  it("trims leading and trailing whitespace", () => {
    expect(parseProportionalValues("  10000000, 20000000  ")).toEqual([10000000, 20000000]);
  });

  it("accepts a single thousands-grouped value", () => {
    expect(parseProportionalValues("1,234,567,890")).toEqual([1234567890]);
  });

  it("rejects malformed thousands grouping (silent skip)", () => {
    expect(parseProportionalValues("10,000,00")).toEqual([]);
    expect(parseProportionalValues("1,00")).toEqual([]);
    expect(parseProportionalValues("1,234,5")).toEqual([]);
    expect(parseProportionalValues(",000,000")).toEqual([]);
  });

  it("rejects decimal input (silent skip)", () => {
    expect(parseProportionalValues("1,000,000.5")).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(parseProportionalValues("")).toEqual([]);
  });

  it("filters out zero and negative values", () => {
    expect(parseProportionalValues("0")).toEqual([]);
    expect(parseProportionalValues("0, 100")).toEqual([100]);
  });
});

/**
 * v0.10.0 이하가 저장한 `.lcalc` 에는 `stampDuty.isPaymentOrder` 가 사건구분과 따로 들어 있다.
 * 체크박스를 없앤 뒤 UI 가 이 값을 넘기지 않아서, 파일을 열고 다시 계산하면 제7조 제2항 1/10 이
 * 풀리고 소가 5천만 기준 23,000 이 230,000 으로 뛰었다. 그 회귀를 여기서 잡는다.
 */
describe("legacy payment-order flag", () => {
  const caseValue = 50_000_000;
  const legacyInput = {
    stampDuty: {
      caseValue,
      caseType: "civilFirstInstanceSingle" as const,
      appealsLevel: "firstInstance" as const,
      isPaymentOrder: true,
    },
    deliveryFee: { caseType: "civilFirstInstanceSingle" as const, partyCount: 2 },
    lawyerFee: {
      caseValue,
      caseType: "civilFirstInstanceSingle" as const,
      discounts: [],
    },
  };

  function loadLegacyFile() {
    const result = computeLitigationCost(legacyInput, { computedAt: "2026-07-01T00:00:00.000Z" });
    const file = migrateLcalcFile({
      schemaVersion: "3",
      kind: "litigation-cost",
      envelopeFeatures: ["litigation-cost@1"],
      dataVersions: {
        "stamp-duty": result.dataVersions["stamp-duty"],
        delivery: result.dataVersions.delivery,
        "lawyer-fee": result.dataVersions["lawyer-fee"],
      },
      payload: {
        appVersion: "0.10.0",
        createdAt: "2026-07-01T00:00:00.000Z",
        input: legacyInput,
        result,
        disclaimer: STANDARD_DISCLAIMER,
      },
    });
    validateLcalcEnvelope(file);
    return {
      loaded: parseLoadedLitigationCostLcalcInput(file),
      savedAmount: result.stampDuty.amount,
    };
  }

  const uiState = {
    caseValue,
    caseType: "civilFirstInstanceSingle" as const,
    appealsLevel: "firstInstance" as const,
    isSettlement: false,
    isElectronicFiling: false,
    provisionalMeasureType: "general" as const,
    filingDate: "2026-07-01",
  };

  it("keeps the 1/10 reduction when a v0.10.0 file is reloaded and recomputed", () => {
    const { loaded, savedAmount } = loadLegacyFile();
    expect(savedAmount).toBe(23_000);
    expect(hasLegacyPaymentOrderFlag(loaded.input.stampDuty)).toBe(true);

    const rebuilt = buildStampDutyInput({
      ...uiState,
      legacyPaymentOrder: hasLegacyPaymentOrderFlag(loaded.input.stampDuty),
    });
    const recomputed = computeLitigationCost(
      { ...loaded.input, stampDuty: rebuilt },
      { computedAt: "2026-08-03T00:00:00.000Z" },
    );
    expect(recomputed.stampDuty.amount).toBe(savedAmount);
  });

  /**
   * 「민사소송 등 인지규칙」제25조(원칙): 항소장·상고장 인지액은 상소로써 불복하는
   * 범위의 소가를 기준으로 산정한다.
   *
   * 직전 구현은 불복 범위를 변호사보수에만 넘기고 인지에는 전체 소가를 그대로 넘겼다.
   * UI 에 "항소·상고 불복 범위" 입력란이 노출돼 있어 사용자는 반영된다고 믿게 된다.
   */
  describe("항소·상고 인지액은 불복 범위 기준 (인지규칙 제25조)", () => {
    const baseAppealState = {
      ...uiState,
      caseValue: 100_000_000,
      legacyPaymentOrder: false,
    };
    const appealState = { ...baseAppealState, appealValue: 30_000_000 };

    it("항소심 인지액이 불복 범위 소가로 산정된다", () => {
      const built = buildStampDutyInput({ ...appealState, appealsLevel: "appeal" });
      expect(built.caseValue).toBe(30_000_000);
      const full = buildStampDutyInput({
        ...appealState,
        appealsLevel: "appeal",
        appealValue: 100_000_000,
      });
      // 전체 소가를 그대로 쓰면 3.25 배로 과대해진다.
      expect(built.caseValue).toBeLessThan(full.caseValue);
    });

    it("상고심에도 같은 기준이 적용된다", () => {
      expect(buildStampDutyInput({ ...appealState, appealsLevel: "supreme" }).caseValue).toBe(
        30_000_000,
      );
    });

    it("1심은 전체 소가를 그대로 쓴다", () => {
      expect(buildStampDutyInput({ ...appealState, appealsLevel: "firstInstance" }).caseValue).toBe(
        100_000_000,
      );
    });

    it("불복 범위 미입력이면 전체 소가로 대체된다", () => {
      const built = buildStampDutyInput({ ...baseAppealState, appealsLevel: "appeal" });
      expect(built.caseValue).toBe(100_000_000);
    });

    /**
     * 「민사소송 등 인지규칙」제18조의2 간주 소가.
     * 인지와 변호사보수가 반드시 같은 기준액을 써야 한다.
     */
    it("간주 소가 기준을 엔진 입력에 그대로 전달한다", () => {
      const built = buildStampDutyInput({
        ...baseAppealState,
        appealsLevel: "firstInstance",
        caseValueBasis: "unascertainable",
      });
      expect(built.caseValueBasis).toBe("unascertainable");
      // 엔진이 소가를 대체하므로 인지액은 5,000만원 기준이 된다.
      expect(
        computeLitigationCost(
          {
            stampDuty: built,
            deliveryFee: { caseType: "civilFirstInstanceSingle", partyCount: 2 },
            lawyerFee: {
              caseValue: 50_000_000,
              caseType: "civilFirstInstanceSingle",
              discounts: [],
            },
          },
          { computedAt: "2026-08-18T00:00:00.000Z" },
        ).stampDuty.amount,
      ).toBe(230_000);
    });

    it("기본값(금액 산출)일 때는 caseValueBasis 를 넘기지 않는다", () => {
      expect(
        buildStampDutyInput({ ...baseAppealState, caseValueBasis: "amount" }).caseValueBasis,
      ).toBeUndefined();
      expect(buildStampDutyInput({ ...baseAppealState }).caseValueBasis).toBeUndefined();
    });

    it("심급이 1심으로 강제되는 사건구분은 불복 범위를 쓰지 않는다", () => {
      // 지급명령·보전처분은 빌더가 심급을 1심으로 낮추므로 전체 소가가 기준이다.
      for (const caseType of ["paymentOrder", "provisionalMeasureSingle"] as const) {
        const built = buildStampDutyInput({ ...appealState, caseType, appealsLevel: "appeal" });
        expect(built.appealsLevel).toBe("firstInstance");
        expect(built.caseValue).toBe(100_000_000);
      }
    });
  });

  it("charges the full 소장 인지 once the flag is cleared", () => {
    const rebuilt = buildStampDutyInput({ ...uiState, legacyPaymentOrder: false });
    expect(rebuilt.isPaymentOrder).toBeUndefined();
    const recomputed = computeLitigationCost(
      { ...legacyInput, stampDuty: rebuilt },
      { computedAt: "2026-08-03T00:00:00.000Z" },
    );
    expect(recomputed.stampDuty.amount).toBe(230_000);
  });

  it("does not flag a file whose 사건구분 is already 지급명령", () => {
    expect(
      hasLegacyPaymentOrderFlag({
        caseValue,
        caseType: "paymentOrder",
        appealsLevel: "firstInstance",
        isPaymentOrder: true,
      }),
    ).toBe(false);
    // 사건구분이 authoritative 인 경로에서는 플래그를 중복 발행하지 않는다.
    expect(
      buildStampDutyInput({ ...uiState, caseType: "paymentOrder", legacyPaymentOrder: true })
        .isPaymentOrder,
    ).toBeUndefined();
  });

  it("never produces a combination the validator rejects", () => {
    // 지급명령 + 항소심, 지급명령 + 화해는 validator 가 거부한다 (인지법 제7조).
    const withAppeal = buildStampDutyInput({
      ...uiState,
      appealsLevel: "appeal",
      isSettlement: true,
      legacyPaymentOrder: true,
    });
    expect(withAppeal.appealsLevel).toBe("firstInstance");
    expect(withAppeal.isSettlement).toBeUndefined();

    // 보전처분은 제9조 제2항 별도 체계라 구파일 플래그가 따라붙으면 안 된다.
    const provisional = buildStampDutyInput({
      ...uiState,
      caseType: "provisionalMeasureSingle",
      legacyPaymentOrder: true,
    });
    expect(provisional.isPaymentOrder).toBeUndefined();
    expect(() =>
      computeLitigationCost(
        {
          ...legacyInput,
          stampDuty: provisional,
          deliveryFee: { caseType: "provisionalMeasureSingle", partyCount: 2 },
          lawyerFee: { caseValue, caseType: "provisionalMeasureSingle", discounts: [] },
        },
        { computedAt: "2026-08-03T00:00:00.000Z" },
      ),
    ).not.toThrow();
  });
});

/**
 * 상소심 파일의 전체 소가 보존.
 *
 * 인지규칙 제25조 때문에 상소심의 `stampDuty.caseValue` 는 불복 범위다. 보존 필드가 없던
 * 동안 전체 소가가 파일 어디에도 남지 않아, 다시 열어 심급을 1심으로 되돌리면 불복 범위를
 * 소가로 착각해 조용히 과소 계산됐다 (1억 → 3천만, 인지 455,000 → 140,000).
 */
describe("전체 소가 보존 (fullCaseValue)", () => {
  const uiState = {
    caseValue: 100_000_000,
    appealValue: 30_000_000,
    caseType: "civilFirstInstanceSingle" as const,
    appealsLevel: "appeal" as const,
    legacyPaymentOrder: false,
    isSettlement: false,
    isElectronicFiling: false,
    provisionalMeasureType: "general" as const,
    filingDate: "2026-08-18",
  };

  it("상소심은 불복 범위와 전체 소가를 함께 남긴다", () => {
    const built = buildStampDutyInput(uiState);
    expect(built.caseValue).toBe(30_000_000);
    expect(built.fullCaseValue).toBe(100_000_000);
  });

  it("1심이거나 불복 범위가 전체 소가와 같으면 붙이지 않는다", () => {
    expect(
      buildStampDutyInput({ ...uiState, appealsLevel: "firstInstance" }).fullCaseValue,
    ).toBeUndefined();
    expect(
      buildStampDutyInput({ ...uiState, appealValue: 100_000_000 }).fullCaseValue,
    ).toBeUndefined();
  });

  it("`.lcalc` 왕복에서 살아남는다", () => {
    const stampDuty = buildStampDutyInput(uiState);
    const input = {
      stampDuty,
      deliveryFee: { caseType: "civilFirstInstanceSingle" as const, partyCount: 2 },
      lawyerFee: {
        caseValue: 30_000_000,
        caseType: "civilFirstInstanceSingle" as const,
        discounts: [],
      },
    };
    const result = computeLitigationCost(input, { computedAt: "2026-08-18T00:00:00.000Z" });
    const file = {
      schemaVersion: "3" as const,
      kind: "litigation-cost" as const,
      envelopeFeatures: ["litigation-cost@2"],
      dataVersions: {
        "stamp-duty": result.dataVersions["stamp-duty"]!,
        delivery: result.dataVersions.delivery!,
        "lawyer-fee": result.dataVersions["lawyer-fee"]!,
      },
      payload: {
        appVersion: "0.12.0",
        createdAt: "2026-08-18T00:00:00.000Z",
        input,
        result: { ...result, disclaimer: STANDARD_DISCLAIMER },
        disclaimer: STANDARD_DISCLAIMER,
      },
    };
    validateLcalcEnvelope(file);
    const loaded = parseLoadedLitigationCostLcalcInput(file);
    expect(loaded.input.stampDuty.fullCaseValue).toBe(100_000_000);
    expect(loaded.input.stampDuty.caseValue).toBe(30_000_000);
  });

  it("구앱이 fast-reject 하도록 `litigation-cost@2` 는 화이트리스트에 있다", () => {
    expect(() =>
      validateLcalcEnvelope({
        schemaVersion: "3",
        kind: "litigation-cost",
        envelopeFeatures: ["litigation-cost@9"],
        dataVersions: {},
        payload: {},
      } as unknown as Parameters<typeof validateLcalcEnvelope>[0]),
    ).toThrow();
  });
});

/** 조정신청(머)에는 상소 수수료가 없다 — 빌더가 심급을 1심으로 정규화한다. */
describe("민사조정 심급 정규화", () => {
  it("항소·상고를 골라도 1심으로 낮추고 전체 소가를 쓴다", () => {
    for (const appealsLevel of ["appeal", "supreme"] as const) {
      const built = buildStampDutyInput({
        caseValue: 30_000_000,
        appealValue: 10_000_000,
        caseType: "civilMediation",
        appealsLevel,
        legacyPaymentOrder: false,
        isSettlement: false,
        isElectronicFiling: false,
        provisionalMeasureType: "general",
        filingDate: "2026-08-18",
      });
      expect(built.appealsLevel).toBe("firstInstance");
      expect(built.caseValue).toBe(30_000_000);
      // 엔진이 조정신청 상소를 거부하므로 빌더 정규화가 없으면 여기서 던진다.
      expect(
        () =>
          computeLitigationCost(
            {
              stampDuty: built,
              deliveryFee: { caseType: "civilMediation", partyCount: 2 },
              lawyerFee: { caseValue: 30_000_000, caseType: "civilMediation", discounts: [] },
            },
            { computedAt: "2026-08-18T00:00:00.000Z" },
          ).stampDuty.amount,
      ).not.toThrow();
    }
  });
});

/**
 * 인지법 제11조 제1항 — "제9조 또는 제10조의 신청에 관한 재판에 대한 항고장 및 상소장에는
 * 해당 신청서에 붙인 인지액의 2배에 해당하는 인지를 붙여야 한다."
 *
 * 엔진에는 있었지만 UI·빌더·`.lcalc` 어디에도 배선돼 있지 않아, 화면에서 만들 수 있는 항고
 * 입력은 항상 제11조 제2항 정액 2,000원이었다.
 */
describe("항고 원신청서 인지액 (제11조 제1항)", () => {
  const state = {
    caseValue: 50_000_000,
    caseType: "civilInterlocutoryAppeal" as const,
    appealsLevel: "firstInstance" as const,
    legacyPaymentOrder: false,
    isSettlement: false,
    isElectronicFiling: false,
    provisionalMeasureType: "general" as const,
    filingDate: "2026-08-18",
  };

  it("원신청 인지액을 넘기면 그 2배가 인지액이 된다", () => {
    const built = buildStampDutyInput({ ...state, underlyingApplicationStampDutyWon: 10_000 });
    expect(built.underlyingApplicationStampDutyWon).toBe(10_000);
    expect(
      computeLitigationCost(
        {
          stampDuty: built,
          deliveryFee: { caseType: "civilInterlocutoryAppeal", partyCount: 2 },
          lawyerFee: { caseValue: 50_000_000, caseType: "civilFirstInstanceSingle", discounts: [] },
        },
        { computedAt: "2026-08-18T00:00:00.000Z" },
      ).stampDuty.amount,
    ).toBe(20_000);
  });

  it("비우면 제11조 제2항 정액 2,000원이다", () => {
    const built = buildStampDutyInput(state);
    expect(built.underlyingApplicationStampDutyWon).toBeUndefined();
  });

  it("항고가 아닌 사건구분에는 붙이지 않는다", () => {
    const built = buildStampDutyInput({
      ...state,
      caseType: "civilFirstInstanceSingle",
      underlyingApplicationStampDutyWon: 10_000,
    });
    expect(built.underlyingApplicationStampDutyWon).toBeUndefined();
  });
});
