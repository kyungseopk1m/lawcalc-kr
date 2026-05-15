import { describe, expect, it } from "vitest";

import { computeAppropriation, STANDARD_DISCLAIMER } from "@lawcalc-kr/core-engine";

import {
  applyLoadedAppropriationInput,
  buildAppropriationInput,
  buildAppropriationLcalcFile,
  formatAppropriationForClipboard,
  type ClaimInputState,
  type PaymentInputState,
} from "./AppropriationCalculator";

function claim(overrides: Partial<ClaimInputState> = {}): ClaimInputState {
  return {
    uid: "uid-1",
    id: "loan-1",
    name: "",
    costBalanceText: "",
    interestBalanceText: "",
    principalBalanceText: "1000000",
    dueAt: "2025-01-01",
    debtorBenefitRankText: "",
    ...overrides,
  };
}

describe("buildAppropriationInput", () => {
  it("legal directive 의 단일 채권 input 정상 생성", () => {
    const payment: PaymentInputState = {
      amountText: "500000",
      allocationType: "legal",
      targets: [],
    };
    const input = buildAppropriationInput([claim()], payment, "2026-05-15");
    expect(input.claims).toHaveLength(1);
    expect(input.claims[0]).toEqual({
      id: "loan-1",
      principalBalance: 1000000,
      dueAt: "2025-01-01",
    });
    expect(input.payment).toEqual({
      amount: 500000,
      allocation: { type: "legal" },
    });
    expect(input.computedAt).toBe("2026-05-15");
  });

  it("cost/interest/name/rank 가 비어있을 때 optional 필드 omit", () => {
    const payment: PaymentInputState = {
      amountText: "100000",
      allocationType: "legal",
      targets: [],
    };
    const input = buildAppropriationInput([claim()], payment);
    expect(input.claims[0]).not.toHaveProperty("name");
    expect(input.claims[0]).not.toHaveProperty("costBalance");
    expect(input.claims[0]).not.toHaveProperty("interestBalance");
    expect(input.claims[0]).not.toHaveProperty("debtorBenefitRank");
    expect(input).not.toHaveProperty("computedAt");
  });

  it("cost/interest/name/rank 가 채워졌을 때 모든 필드 포함", () => {
    const payment: PaymentInputState = {
      amountText: "100000",
      allocationType: "legal",
      targets: [],
    };
    const input = buildAppropriationInput(
      [
        claim({
          name: "대여금A",
          costBalanceText: "1000",
          interestBalanceText: "2000",
          debtorBenefitRankText: "3",
        }),
      ],
      payment,
    );
    expect(input.claims[0]).toEqual({
      id: "loan-1",
      name: "대여금A",
      costBalance: 1000,
      interestBalance: 2000,
      principalBalance: 1000000,
      dueAt: "2025-01-01",
      debtorBenefitRank: 3,
    });
  });

  it("agreement directive 는 targets 직렬화 + 0/빈 amount 토큰 제거", () => {
    const payment: PaymentInputState = {
      amountText: "500000",
      allocationType: "agreement",
      targets: [
        { uid: "t1", claimId: "loan-1", amountText: "300000" },
        { uid: "t2", claimId: "", amountText: "100000" },
        { uid: "t3", claimId: "loan-1", amountText: "0" },
      ],
    };
    const input = buildAppropriationInput([claim()], payment);
    expect(input.payment.allocation).toEqual({
      type: "agreement",
      targets: [{ claimId: "loan-1", amount: 300000 }],
    });
  });

  it("legal directive 일 때 payment.targets 무시", () => {
    const payment: PaymentInputState = {
      amountText: "500000",
      allocationType: "legal",
      targets: [{ uid: "t1", claimId: "loan-1", amountText: "300000" }],
    };
    const input = buildAppropriationInput([claim()], payment);
    expect(input.payment.allocation).toEqual({ type: "legal" });
  });
});

describe("applyLoadedAppropriationInput", () => {
  it("round-trip: build → compute → apply 시 동일 shape 복원", () => {
    const initialClaims: ClaimInputState[] = [
      claim({
        name: "대여금A",
        costBalanceText: "1000",
        interestBalanceText: "2000",
        principalBalanceText: "10000",
      }),
    ];
    const initialPayment: PaymentInputState = {
      amountText: "5000",
      allocationType: "debtorDesignation",
      targets: [{ uid: "t1", claimId: "loan-1", amountText: "5000" }],
    };
    const input = buildAppropriationInput(initialClaims, initialPayment, "2026-05-15");
    const { claims: reloadedClaims, payment: reloadedPayment } =
      applyLoadedAppropriationInput(input);
    expect(reloadedClaims[0]?.id).toBe("loan-1");
    expect(reloadedClaims[0]?.name).toBe("대여금A");
    expect(reloadedClaims[0]?.principalBalanceText).toBe("10000");
    expect(reloadedClaims[0]?.costBalanceText).toBe("1000");
    expect(reloadedPayment.amountText).toBe("5000");
    expect(reloadedPayment.allocationType).toBe("debtorDesignation");
    expect(reloadedPayment.targets).toHaveLength(1);
    expect(reloadedPayment.targets[0]?.claimId).toBe("loan-1");
    expect(reloadedPayment.targets[0]?.amountText).toBe("5000");
  });
});

describe("formatAppropriationForClipboard + buildAppropriationLcalcFile", () => {
  it("clipboard 본문은 STANDARD_DISCLAIMER 로 끝남", () => {
    const input = buildAppropriationInput(
      [claim()],
      { amountText: "100000", allocationType: "legal", targets: [] },
      "2026-05-15",
    );
    const result = computeAppropriation(input);
    const text = formatAppropriationForClipboard(result);
    expect(text).toContain("LawCalc Korea 변제충당 계산 결과");
    expect(text.trim().endsWith(STANDARD_DISCLAIMER)).toBe(true);
  });

  it("lcalc envelope 는 v3 + appropriation kind + appropriation@1 capability", () => {
    const input = buildAppropriationInput(
      [claim()],
      { amountText: "100000", allocationType: "legal", targets: [] },
      "2026-05-15",
    );
    const result = computeAppropriation(input);
    const file = buildAppropriationLcalcFile(input, result, "비고 메모");
    expect(file.schemaVersion).toBe("3");
    expect(file.kind).toBe("appropriation");
    expect(file.envelopeFeatures).toEqual(["appropriation@1"]);
    expect(file.dataVersions.appropriation).toBe(result.dataVersion);
    expect(file.payload.disclaimer).toBe(STANDARD_DISCLAIMER);
    expect(file.payload.note).toBe("비고 메모");
  });
});
