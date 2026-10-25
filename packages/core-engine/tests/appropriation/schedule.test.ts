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

  it("데이터 범위(2007-06-30) 앞 약정은 제한하지 않고 알린다", () => {
    const r = computeAppropriation(loan({ interestLimitAct: { agreedAt: "2007-06-29" } }));
    expect(r.interestLimits![0]).toMatchObject({ capped: false, capRate: null });
    expect(r.interestLimits![0]!.notice).toMatch(/데이터가 없어/);
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
