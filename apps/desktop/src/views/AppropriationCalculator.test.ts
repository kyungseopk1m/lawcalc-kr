import { describe, expect, it } from "vitest";

import { computeAppropriation, STANDARD_DISCLAIMER } from "@lawcalc-kr/core-engine";

import {
  applyLoadedAppropriationInput,
  appropriationSummaryRows,
  buildAppropriationExportView,
  buildAppropriationInput,
  buildAppropriationLcalcFile,
  formatAppropriationForClipboard,
  type ClaimInputState,
  type PaymentInputState,
} from "./AppropriationCalculator";
import { validateLcalcEnvelope } from "../lib/lcalc-validation";

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

/**
 * APP-3 — 변제일(`paidAt`)의 UI 모델 ↔ 도메인 입력 ↔ `.lcalc` 왕복.
 *
 * 어느 한 구간에서 유실되면 저장한 파일을 나중에 열었을 때 오늘 기준으로 변제기가 재판정돼
 * 같은 파일이 다른 결과를 낸다.
 */
describe("변제일 (paidAt) 왕복 [APP-3]", () => {
  it("입력한 변제일이 도메인 입력으로 넘어간다", () => {
    const payment: PaymentInputState = {
      amountText: "500000",
      allocationType: "legal",
      paidAt: "2025-06-01",
      targets: [],
    };
    expect(buildAppropriationInput([claim()], payment).payment.paidAt).toBe("2025-06-01");
  });

  it("변제일이 비어 있으면 필드를 만들지 않는다 (구파일과 같은 모양)", () => {
    const omitted: PaymentInputState = {
      amountText: "500000",
      allocationType: "legal",
      targets: [],
    };
    const empty: PaymentInputState = { ...omitted, paidAt: "" };
    expect(buildAppropriationInput([claim()], omitted).payment).not.toHaveProperty("paidAt");
    expect(buildAppropriationInput([claim()], empty).payment).not.toHaveProperty("paidAt");
  });

  it("불러오기에서 변제일이 복원된다", () => {
    const payment: PaymentInputState = {
      amountText: "500000",
      allocationType: "legal",
      paidAt: "2025-06-01",
      targets: [],
    };
    const input = buildAppropriationInput([claim()], payment, "2026-05-15");
    expect(applyLoadedAppropriationInput(input).payment.paidAt).toBe("2025-06-01");
  });

  it("변제일 없는 구파일을 불러오면 빈 값이 된다", () => {
    const input = buildAppropriationInput([claim()], {
      amountText: "500000",
      allocationType: "legal",
      targets: [],
    });
    expect(applyLoadedAppropriationInput(input).payment.paidAt).toBe("");
  });

  it("저장 → 불러오기 왕복에서 계산 결과가 유지된다", () => {
    const claims = [
      claim({ uid: "u1", id: "benefit", principalBalanceText: "100000", dueAt: "2026-01-01" }),
      claim({
        uid: "u2",
        id: "late",
        principalBalanceText: "100000",
        dueAt: "2024-01-01",
        debtorBenefitRankText: "1",
      }),
    ];
    const payment: PaymentInputState = {
      amountText: "50000",
      allocationType: "legal",
      paidAt: "2025-06-01",
      targets: [],
    };
    const input = buildAppropriationInput(claims, payment, "2026-05-15");
    const before = computeAppropriation(input);

    const reloaded = applyLoadedAppropriationInput(input);
    const after = computeAppropriation(
      buildAppropriationInput(reloaded.claims, reloaded.payment, "2030-01-01"),
    );

    // 계산 시각이 2030 으로 바뀌어도 변제일이 살아 있으면 충당 결과는 동일하다.
    expect(after.claims.map((c) => c.totalApplied)).toEqual(
      before.claims.map((c) => c.totalApplied),
    );
    expect(after.claims.find((c) => c.claimId === "late")?.totalApplied).toBe(50000);
  });
});

/**
 * P5-4 — 여러 번 변제·상계·이자·이자제한법. 새 키가 있을 때만 `appropriation@3`.
 */
describe("여러 번 변제·이자 왕복 [P5-4]", () => {
  const loanClaim = claim({
    principalBalanceText: "10000000",
    dueAt: "2025-12-31",
    interestRateText: "12",
    interestFrom: "2025-01-01",
  });
  const first: PaymentInputState = {
    amountText: "1000000",
    allocationType: "legal",
    paidAt: "2025-03-31",
    targets: [],
  };
  const second: PaymentInputState = {
    uid: "p2",
    amountText: "2000000",
    allocationType: "legal",
    paidAt: "2025-06-30",
    kind: "setoff",
    targets: [],
  };

  it("이율·추가 변제·상계가 도메인 입력으로 넘어간다", () => {
    const input = buildAppropriationInput([loanClaim], first, "2026-10-25", [second]);
    expect(input.claims[0]).toMatchObject({ interestRate: 0.12, interestFrom: "2025-01-01" });
    expect(input.additionalPayments).toEqual([
      { amount: 2000000, allocation: { type: "legal" }, paidAt: "2025-06-30", kind: "setoff" },
    ]);
    const result = computeAppropriation(input);
    // 골든 case-007 과 같은 값 (변제 1: 이자 295,890 / 변제 2: 이자 278,112).
    expect(result.events!.map((e) => e.claims[0]!.interestAccrued)).toEqual([295890, 278112]);
  });

  it("새 키가 있으면 appropriation@3, 없으면 종전 capability", () => {
    const extended = buildAppropriationInput([loanClaim], first, "2026-10-25", [second]);
    const file = buildAppropriationLcalcFile(extended, computeAppropriation(extended), "");
    expect(file.envelopeFeatures).toEqual(["appropriation@3"]);
    expect(() => validateLcalcEnvelope(file)).not.toThrow();

    const plain = buildAppropriationInput([claim()], first, "2026-10-25");
    const plainFile = buildAppropriationLcalcFile(plain, computeAppropriation(plain), "");
    expect(plainFile.envelopeFeatures).toEqual(["appropriation@2"]);
    expect(plain).not.toHaveProperty("additionalPayments");
    expect(plain.claims[0]).not.toHaveProperty("interestRate");
  });

  it("불러오기에서 이율·이자제한법·추가 변제가 복원되고 결과가 같다", () => {
    const limited = claim({
      ...loanClaim,
      interestRateText: "30",
      limitEnabled: true,
      limitAgreedAt: "2025-01-01",
      prepaidText: "100000",
    });
    const input = buildAppropriationInput([limited], first, "2026-10-25", [second]);
    const reloaded = applyLoadedAppropriationInput(input);
    expect(reloaded.claims[0]).toMatchObject({
      interestRateText: "30",
      limitEnabled: true,
      limitAgreedAt: "2025-01-01",
      prepaidText: "100000",
    });
    expect(reloaded.additionalPayments[0]).toMatchObject({ paidAt: "2025-06-30", kind: "setoff" });
    const again = buildAppropriationInput(
      reloaded.claims,
      reloaded.payment,
      "2026-10-25",
      reloaded.additionalPayments,
    );
    expect(again).toEqual(input);
    expect(computeAppropriation(again).totals).toEqual(computeAppropriation(input).totals);
  });

  it("PDF·CSV 계산서에 변제별 표와 이자제한법 문구가 들어간다", () => {
    const limited = claim({
      ...loanClaim,
      interestRateText: "30",
      limitEnabled: true,
      limitAgreedAt: "2025-01-01",
    });
    const result = computeAppropriation(
      buildAppropriationInput([limited], first, "2026-10-25", [second]),
    );
    const view = buildAppropriationExportView(result, "메모");
    expect(view.tables.map((t) => t.title)).toEqual(["채권별 결과", "변제별 충당"]);
    expect(view.tables[1]!.rows).toHaveLength(2);
    expect(view.notes[0]).toContain("이자제한법 제2조 제3항");
    expect(view.notes).toContain("비고: 메모");
    expect(view.dataVersion).toContain("interest-limits/");
    expect(formatAppropriationForClipboard(result)).toContain("변제별");
  });

  it("요약은 변제마다 충당 방식을 적고, 상계 미충당액은 잉여(반환)와 따로 적는다", () => {
    // 채권 1,000,000. 변제 300,000(채무자 지정) → 상계 900,000 중 700,000 충당, 200,000 남음 →
    // 변제 50,000 은 갚을 채권이 없어 반환할 잉여.
    const result = computeAppropriation({
      claims: [{ id: "a", principalBalance: 1_000_000, dueAt: "2025-01-01" }],
      payment: {
        amount: 300_000,
        paidAt: "2025-06-30",
        allocation: { type: "debtorDesignation", targets: [{ claimId: "a", amount: 300_000 }] },
      },
      additionalPayments: [
        { amount: 900_000, paidAt: "2025-07-31", kind: "setoff", allocation: { type: "legal" } },
        { amount: 50_000, paidAt: "2025-08-31", allocation: { type: "legal" } },
      ],
      computedAt: "2026-10-25",
    });
    expect(appropriationSummaryRows(result)).toEqual([
      ["변제액", "1,250,000원 (채무자 지정, 법정충당, 법정충당)"],
      ["충당 합계", "1,000,000원"],
      ["잉여 (반환)", "50,000원"],
      ["상계 후 남은 자동채권", "200,000원"],
    ]);
    expect(formatAppropriationForClipboard(result)).toContain("잉여 (반환): 50,000원");
    expect(buildAppropriationExportView(result, "").summary).toContainEqual([
      "상계 후 남은 자동채권",
      "200,000원",
    ]);
  });
});
