import { describe, expect, it } from "vitest";

import { computeAppropriation, serviceSwitchSegments, type AppropriationInput } from "../../src";

const base: AppropriationInput = {
  claims: [{ id: "loan", principalBalance: 1_000_000, dueAt: "2025-01-01" }],
  payment: { amount: 300_000, paidAt: "2025-06-30", allocation: { type: "legal" } },
  computedAt: "2026-10-25",
};

describe("여러 번 변제·이자 (P5-4)", () => {
  it("새 키가 없으면 종전 결과 모양 그대로 (events 없음)", () => {
    const r = computeAppropriation(base);
    expect(r).not.toHaveProperty("events");
    expect(r).not.toHaveProperty("interestLimits");
    expect(r.claims[0]!.statutoryRank?.priorityLabel).toBe(
      "법정충당 1순위 (변제기 도래, 변제이익 순위 0)",
    );
  });

  it("이자 없이 여러 번 변제하면 단일 변제를 차례로 한 것과 같다", () => {
    const r = computeAppropriation({
      ...base,
      additionalPayments: [
        { amount: 900_000, paidAt: "2025-07-31", allocation: { type: "legal" } },
      ],
    });
    expect(r.events!.map((e) => e.appliedAmount)).toEqual([300_000, 700_000]);
    expect(r.payment).toEqual({
      amount: 1_200_000,
      allocationType: "legal",
      appliedAmount: 1_000_000,
      unappliedAmount: 200_000,
    });
    expect(r.claims[0]!.principalBalanceAfter).toBe(0);
    expect(r.claims[0]).not.toHaveProperty("statutoryRank");
  });

  it("같은 날 변제는 입력 순서대로 충당한다", () => {
    const r = computeAppropriation({
      ...base,
      payment: { ...base.payment, kind: "setoff" },
      additionalPayments: [
        { amount: 100_000, paidAt: "2025-06-30", allocation: { type: "legal" } },
      ],
    });
    expect(r.events!.map((e) => e.kind)).toEqual(["setoff", "payment"]);
    expect(r.events![0]!.claims[0]!.statutoryRank?.priorityLabel).toMatch(/^상계 법정충당/);
  });

  it("변제일이 없으면 거부한다", () => {
    expect(() =>
      computeAppropriation({
        ...base,
        payment: { amount: 1, allocation: { type: "legal" } },
        additionalPayments: [],
      }),
    ).toThrow(/변제일/);
  });

  it("이율이 있으면 이자 기산일이 필요하다", () => {
    expect(() =>
      computeAppropriation({ ...base, claims: [{ ...base.claims[0]!, interestRate: 0.05 }] }),
    ).toThrow(/이자 기산일/);
  });

  it("이자 기산일보다 앞선 변제에는 이자를 붙이지 않는다", () => {
    const r = computeAppropriation({
      ...base,
      claims: [{ ...base.claims[0]!, interestRate: 0.12, interestFrom: "2025-07-01" }],
    });
    expect(r.events![0]!.claims[0]!.interestAccrued).toBe(0);
    expect(r.events![0]!.claims[0]).not.toHaveProperty("accruedFrom");
  });
});

describe("이자제한법 (제2조·제3조)", () => {
  const loan = (overrides: object) => ({
    ...base,
    claims: [
      {
        id: "loan",
        principalBalance: 1_000_000,
        dueAt: "2025-01-01",
        interestRate: 0.3,
        interestFrom: "2024-01-01",
        interestLimitAct: { agreedAt: "2024-01-01" },
        ...overrides,
      },
    ],
  });

  it("대차원금 10만원 미만은 제한하지 않는다 (제2조 제5항)", () => {
    const r = computeAppropriation(loan({ principalBalance: 99_999 }));
    expect(r.interestLimits![0]).toMatchObject({ capped: false, capRate: null, appliedRate: 0.3 });
    expect(r.interestLimits![0]!.notice).toMatch(/제2조 제5항/);
  });

  // 법률 제8322호 부칙 제2항: 시행 전 성립한 대차도 시행일(2007-06-30) 이후 이자는 이 법으로 계산한다.
  // 이후 개정령은 그 시행 후 체결·갱신 계약부터라 시행 전 약정에는 2007-06-30 시행 연 30% 가 미친다.
  it("시행 전 약정도 시행일 이후 이자는 2007-06-30 최고이자율로 제한한다 (부칙 제2항)", () => {
    // 2007-06-30~2008-06-29 양끝 포함 1년. 1,000,000 × 0.30 × 1 = 300,000. 변제 1원은 이자에 충당 → 299,999.
    const r = computeAppropriation({
      claims: [
        {
          id: "A",
          principalBalance: 1_000_000,
          dueAt: "2007-06-30",
          interestFrom: "2007-06-30",
          interestRate: 1,
          interestLimitAct: { agreedAt: "2007-06-29" },
        },
      ],
      payment: { amount: 1, paidAt: "2008-06-29", allocation: { type: "legal" } },
      computedAt: "2008-06-29",
    });
    expect(r.interestLimits![0]).toMatchObject({ capped: true, capRate: 0.3, appliedRate: 0.3 });
    expect(r.interestLimits![0]!.notice).toMatch(/법률 제8322호 부칙 제2항/);
    expect(r.events![0]!.claims[0]!.interestAccrued).toBe(300_000);
    expect(r.totals.remainingInterest).toBe(299_999);
  });

  it("시행일 전 기간은 약정이율, 시행일부터는 최고이자율로 나눠 붙인다", () => {
    // 법원 기간식: 기산일부터 1년 안에 2008-02-29 가 있으면 366일로 나눈다.
    // 2007-06-01~2007-06-29 = 29일. 1,000,000 × 1.0 × 29 / 366 = 79,234.97 → 79,234.
    // 2007-06-30~2007-07-31 = 32일. 1,000,000 × 0.3 × 32 / 366 = 26,229.50 → 26,229. 합 105,463.
    const r = computeAppropriation({
      claims: [
        {
          id: "A",
          principalBalance: 1_000_000,
          dueAt: "2007-06-01",
          interestFrom: "2007-06-01",
          interestRate: 1,
          interestLimitAct: { agreedAt: "2005-01-01" },
        },
      ],
      payment: { amount: 1, paidAt: "2007-07-31", allocation: { type: "legal" } },
      computedAt: "2007-07-31",
    });
    expect(r.events![0]!.claims[0]).toMatchObject({
      interestAccrued: 105_463,
      accruedFrom: "2007-06-01",
      accruedTo: "2007-07-31",
    });
  });

  it("시행 전 약정이라도 시행일 이후 공제한 선이자는 제3조로 검토한다", () => {
    // 받은 금액 900,000 × 0.3 × 2007-07-01~2008-06-30(366일 중 1년) = 270,000. 선이자 400,000 → 초과 130,000.
    const r = computeAppropriation({
      claims: [
        {
          id: "A",
          principalBalance: 1_000_000,
          dueAt: "2008-06-30",
          interestFrom: "2007-07-01",
          interestRate: 0.5,
          interestLimitAct: { agreedAt: "2007-06-01", prepaidInterest: 100_000 },
        },
      ],
      payment: { amount: 1, paidAt: "2008-07-01", allocation: { type: "legal" } },
      computedAt: "2008-07-01",
    });
    expect(r.interestLimits![0]!.prepaid).toMatchObject({
      receivedAmount: 900_000,
      allowedInterest: 270_000,
      excessToPrincipal: 0,
    });
  });

  it("약정일 기준 상한을 쓴다 (2018-02-07 약정은 25%, 다음 날은 24%)", () => {
    const at = (agreedAt: string) =>
      computeAppropriation(loan({ interestLimitAct: { agreedAt } })).interestLimits![0]!.capRate;
    expect(at("2018-02-07")).toBe(0.25);
    expect(at("2018-02-08")).toBe(0.24);
  });

  it("약정이율이 상한 이하이면 그대로 쓴다", () => {
    const r = computeAppropriation(loan({ interestRate: 0.15 }));
    expect(r.interestLimits![0]).toMatchObject({ capped: false, capRate: 0.2, appliedRate: 0.15 });
  });

  it("선이자는 원본보다 작아야 한다", () => {
    expect(() =>
      computeAppropriation(
        loan({ interestLimitAct: { agreedAt: "2024-01-01", prepaidInterest: 1_000_000 } }),
      ),
    ).toThrow(/선이자/);
  });

  it("선이자가 한도 안이면 원본을 조정하지 않는다", () => {
    const r = computeAppropriation(
      loan({ interestLimitAct: { agreedAt: "2024-01-01", prepaidInterest: 100_000 } }),
    );
    expect(r.interestLimits![0]!.prepaid).toMatchObject({
      excessToPrincipal: 0,
      principalAfter: 1_000_000,
    });
  });

  // 손 계산 (법원 방식, 초일 산입, 원 미만 절사). 선이자가 이자 기산일~이행기를 덮으므로 이자는
  // 이행기 다음 날부터만 붙는다. 제3조 검토를 하지 않는 경우에도 같다.
  it("2007-06-30 전 약정의 선이자는 제3조 없이 그 기간 이자로만 본다 (이중 계산 없음)", () => {
    // 2006-01-01~2006-06-30 = 181일. 1,000,000 × 0.2 × 181 / 365 = 99,178.08 → 99,178.
    // 변제 500,000 = 이자 99,178 + 원본 400,822 → 원본 599,178.
    const r = computeAppropriation({
      claims: [
        {
          id: "a",
          principalBalance: 1_000_000,
          dueAt: "2005-12-31",
          interestRate: 0.2,
          interestFrom: "2005-01-01",
          interestLimitAct: { agreedAt: "2005-01-01", prepaidInterest: 200_000 },
        },
      ],
      payment: { amount: 500_000, paidAt: "2006-06-30", allocation: { type: "legal" } },
      computedAt: "2026-10-25",
    });
    expect(r.events![0]!.claims[0]).toMatchObject({
      interestAccrued: 99_178,
      accruedFrom: "2006-01-01",
      accruedTo: "2006-06-30",
      interestApplied: 99_178,
      principalApplied: 400_822,
      principalBalanceAfter: 599_178,
    });
    expect(r.interestLimits![0]).not.toHaveProperty("prepaid");
    expect(r.interestLimits![0]!.notice).toMatch(/법률 제8322호.*선이자 200,000원/);
  });

  it("대차원금 10만원 미만의 선이자도 그 기간 이자로만 본다 (제3조 미적용)", () => {
    // 2023-01-01~2023-06-30 = 181일. 99,999 × 0.2 × 181 / 365 = 9,917.71 → 9,917.
    // 변제 50,000 = 이자 9,917 + 원본 40,083 → 원본 59,916.
    const r = computeAppropriation({
      claims: [
        {
          id: "a",
          principalBalance: 99_999,
          dueAt: "2022-12-31",
          interestRate: 0.2,
          interestFrom: "2022-01-01",
          interestLimitAct: { agreedAt: "2022-01-01", prepaidInterest: 20_000 },
        },
      ],
      payment: { amount: 50_000, paidAt: "2023-06-30", allocation: { type: "legal" } },
      computedAt: "2026-10-25",
    });
    expect(r.events![0]!.claims[0]).toMatchObject({
      interestAccrued: 9_917,
      accruedFrom: "2023-01-01",
      principalApplied: 40_083,
      principalBalanceAfter: 59_916,
    });
    expect(r.interestLimits![0]).not.toHaveProperty("prepaid");
    expect(r.interestLimits![0]!.notice).toMatch(/제3조\) 검토도 하지 않았습니다.*선이자 20,000원/);
  });
});

// 대법원 2022. 8. 31. 선고 2022다239896 이유 2.나: 같은 채권자의 여러 원본과 이자에 변제가 모자라면 합의가
// 없는 한 이자·지연손해금을 원본보다 먼저 충당한다. 상계도 같다 (민법 제499조).
describe("여러 채무 법정충당: 모든 채무의 이자 먼저, 원본은 제477조 순", () => {
  const twoDebts: AppropriationInput = {
    claims: [
      { id: "A", principalBalance: 1000, interestBalance: 100, dueAt: "2024-01-01" },
      { id: "B", principalBalance: 1000, interestBalance: 100, dueAt: "2024-02-01" },
    ],
    payment: { amount: 500, paidAt: "2025-01-01", allocation: { type: "legal" } },
    computedAt: "2025-01-01",
  };
  const balances = (r: ReturnType<typeof computeAppropriation>) =>
    r.claims.map((c) => [c.claimId, c.interestBalanceAfter, c.principalBalanceAfter]);

  it("상계: A·B 이자 200 먼저, 남은 300 은 이행기가 빠른 A 원본", () => {
    const r = computeAppropriation({
      ...twoDebts,
      payment: { ...twoDebts.payment, kind: "setoff" },
    });
    expect(balances(r)).toEqual([
      ["A", 0, 700],
      ["B", 0, 1000],
    ]);
    expect(r.events![0]!.claims.map((c) => c.statutoryRank?.priorityLabel)).toEqual([
      "상계 법정충당 1순위 (변제기 도래, 변제이익 순위 0)",
      "상계 법정충당 2순위 (변제기 도래, 변제이익 순위 0)",
    ]);
    expect(r.interpretationNotices![0]).toContain("2022다239896");
  });

  it("일반 변제도 같다", () => {
    expect(balances(computeAppropriation(twoDebts))).toEqual([
      ["A", 0, 700],
      ["B", 0, 1000],
    ]);
  });

  it("지정충당은 지정한 채무 안에서만 비용·이자·원본 순 (다른 채무 이자는 남는다)", () => {
    const r = computeAppropriation({
      ...twoDebts,
      payment: {
        ...twoDebts.payment,
        allocation: { type: "debtorDesignation", targets: [{ claimId: "B", amount: 500 }] },
      },
    });
    expect(balances(r)).toEqual([
      ["A", 100, 1000],
      ["B", 0, 600],
    ]);
  });

  it("지정 잉여는 법정충당: 남은 이자 먼저, 그다음 원본", () => {
    // B 지정 150 = B 이자 100 + B 원본 50. 잉여 350 = A 이자 100 + A 원본 250.
    const r = computeAppropriation({
      ...twoDebts,
      payment: {
        ...twoDebts.payment,
        allocation: { type: "debtorDesignation", targets: [{ claimId: "B", amount: 150 }] },
      },
    });
    expect(balances(r)).toEqual([
      ["A", 0, 750],
      ["B", 0, 950],
    ]);
  });

  it("동순위 채무는 단계마다 그 단계 잔액에 비례 안분한다", () => {
    // 이자 100 + 300 을 먼저, 남은 400 은 원본 1,000 : 3,000 = 100 : 300.
    const r = computeAppropriation({
      claims: [
        { id: "A", principalBalance: 1000, interestBalance: 100, dueAt: "2024-01-01" },
        { id: "B", principalBalance: 3000, interestBalance: 300, dueAt: "2024-01-01" },
      ],
      payment: { amount: 800, paidAt: "2025-01-01", allocation: { type: "legal" } },
      computedAt: "2025-01-01",
    });
    expect(balances(r)).toEqual([
      ["A", 0, 900],
      ["B", 0, 2700],
    ]);
  });
});

describe("serviceSwitchSegments (소촉법 제3조 제1항)", () => {
  it("송달일까지 민법, 다음 날부터 소촉법 이율", () => {
    expect(
      serviceSwitchSegments({
        startDate: "2024-01-01",
        endDate: "2024-12-31",
        serviceDate: "2024-03-15",
        basePreset: "civil",
      }),
    ).toEqual([
      { from: "2024-01-01", to: "2024-03-15", rate: 0.05 },
      { from: "2024-03-16", to: "2024-12-31", rate: 0.12 },
    ]);
  });

  it("소촉법 이율 변경일을 걸치면 시행일마다 나눈다", () => {
    const segs = serviceSwitchSegments({
      startDate: "2019-01-01",
      endDate: "2019-12-31",
      serviceDate: "2019-02-28",
      basePreset: { customRate: 0.24 },
    });
    expect(segs.map((s) => [s.from, s.rate])).toEqual([
      ["2019-01-01", 0.24],
      ["2019-03-01", 0.15],
      ["2019-06-01", 0.12],
    ]);
  });

  it("송달일이 기간 밖이면 한쪽 이율만", () => {
    const args = {
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      basePreset: "commercial" as const,
    };
    expect(serviceSwitchSegments({ ...args, serviceDate: "2024-12-31" })).toEqual([
      { from: "2024-01-01", to: "2024-12-31", rate: 0.06 },
    ]);
    expect(serviceSwitchSegments({ ...args, serviceDate: "2023-12-31" })).toEqual([
      { from: "2024-01-01", to: "2024-12-31", rate: 0.12 },
    ]);
  });
});
