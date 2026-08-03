import { describe, expect, it } from "vitest";

import { STANDARD_DISCLAIMER, computeLitigationCost } from "@lawcalc-kr/core-engine";

import { migrateLcalcFile } from "../lib/lcalc-migrations";
import {
  parseLoadedLitigationCostLcalcInput,
  validateLcalcEnvelope,
} from "../lib/lcalc-validation";
import {
  buildStampDutyInput,
  hasLegacyPaymentOrderFlag,
  parseProportionalValues,
} from "./LitigationCostCalculator";

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
 * 체크박스를 없앤 뒤 UI 가 이 값을 넘기지 않아서, 파일을 열고 다시 계산하면 제7조 ②항 1/10 이
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

    // 보전처분은 제9조 ②항 별도 체계라 구파일 플래그가 따라붙으면 안 된다.
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
