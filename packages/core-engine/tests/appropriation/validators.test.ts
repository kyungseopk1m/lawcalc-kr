import { describe, expect, it } from "vitest";

import { validateAppropriationInput, type AppropriationInput } from "../../src";

function base(): AppropriationInput {
  return {
    claims: [{ id: "c1", principalBalance: 1000, dueAt: "2025-01-01" }],
    payment: { amount: 500, allocation: { type: "legal" } },
    computedAt: "2026-05-15",
  };
}

describe("validateAppropriationInput — Korean RangeError 분기", () => {
  it("claims 가 빈 배열이면 reject", () => {
    const input = { ...base(), claims: [] };
    expect(() => validateAppropriationInput(input)).toThrow(/채권은 최소 1건/);
  });

  it("claims 가 51건이면 reject", () => {
    const claims = Array.from({ length: 51 }, (_, i) => ({
      id: `c${i + 1}`,
      principalBalance: 1000,
      dueAt: "2025-01-01",
    }));
    const input = { ...base(), claims };
    expect(() => validateAppropriationInput(input)).toThrow(/50건 이하/);
  });

  it("claim id 중복이면 reject", () => {
    const input = {
      ...base(),
      claims: [
        { id: "c1", principalBalance: 1000, dueAt: "2025-01-01" },
        { id: "c1", principalBalance: 2000, dueAt: "2025-01-01" },
      ],
    };
    expect(() => validateAppropriationInput(input)).toThrow(/중복/);
  });

  it("claim id 패턴 불일치 (한글 포함) reject", () => {
    const input: AppropriationInput = {
      claims: [{ id: "채권1", principalBalance: 1000, dueAt: "2025-01-01" }],
      payment: { amount: 500, allocation: { type: "legal" } },
      computedAt: "2026-05-15",
    };
    expect(() => validateAppropriationInput(input)).toThrow(/영문\/숫자\/_\/-/);
  });

  it("principalBalance 음수면 reject", () => {
    const input = {
      ...base(),
      claims: [{ id: "c1", principalBalance: -100, dueAt: "2025-01-01" }],
    };
    expect(() => validateAppropriationInput(input)).toThrow(/principalBalance.+0 이상 정수/);
  });

  it("costBalance 가 정수 아니면 reject", () => {
    const input = {
      ...base(),
      claims: [
        {
          id: "c1",
          costBalance: 100.5,
          principalBalance: 1000,
          dueAt: "2025-01-01",
        },
      ],
    };
    expect(() => validateAppropriationInput(input)).toThrow(/costBalance.+0 이상 정수/);
  });

  it("dueAt 형식 잘못되면 reject", () => {
    const input = {
      ...base(),
      claims: [{ id: "c1", principalBalance: 1000, dueAt: "2025/01/01" }],
    };
    expect(() => validateAppropriationInput(input)).toThrow(/dueAt.+YYYY-MM-DD/);
  });

  it("debtorBenefitRank 음수면 reject", () => {
    const input = {
      ...base(),
      claims: [
        {
          id: "c1",
          principalBalance: 1000,
          dueAt: "2025-01-01",
          debtorBenefitRank: -1,
        },
      ],
    };
    expect(() => validateAppropriationInput(input)).toThrow(/debtorBenefitRank/);
  });

  it("payment.amount 가 0 이면 reject", () => {
    const input = {
      ...base(),
      payment: { amount: 0, allocation: { type: "legal" as const } },
    };
    expect(() => validateAppropriationInput(input)).toThrow(/payment\.amount.+1 이상/);
  });

  it("legal allocation 에 targets 가 붙으면 reject", () => {
    const input = {
      ...base(),
      payment: {
        amount: 500,
        allocation: {
          type: "legal" as const,
          targets: [{ claimId: "c1", amount: 500 }],
        } as unknown as AppropriationInput["payment"]["allocation"],
      },
    };
    expect(() => validateAppropriationInput(input)).toThrow(/legal 충당은 targets/);
  });

  it("agreement allocation 의 targets 가 비면 reject", () => {
    const input = {
      ...base(),
      payment: {
        amount: 500,
        allocation: { type: "agreement" as const, targets: [] },
      },
    };
    expect(() => validateAppropriationInput(input)).toThrow(/agreement 충당은 targets 최소 1건/);
  });

  it("target.claimId 가 채권 목록에 없으면 reject", () => {
    const input = {
      ...base(),
      payment: {
        amount: 500,
        allocation: {
          type: "agreement" as const,
          targets: [{ claimId: "unknown", amount: 100 }],
        },
      },
    };
    expect(() => validateAppropriationInput(input)).toThrow(/채권 목록에 없습니다/);
  });

  it("target.amount 가 0 이면 reject", () => {
    const input = {
      ...base(),
      payment: {
        amount: 500,
        allocation: {
          type: "agreement" as const,
          targets: [{ claimId: "c1", amount: 0 }],
        },
      },
    };
    expect(() => validateAppropriationInput(input)).toThrow(/target\.amount.+1 이상/);
  });

  it("sum(targets) > payment.amount 이면 reject", () => {
    const input = {
      ...base(),
      claims: [
        { id: "c1", principalBalance: 1000, dueAt: "2025-01-01" },
        { id: "c2", principalBalance: 1000, dueAt: "2025-01-01" },
      ],
      payment: {
        amount: 500,
        allocation: {
          type: "agreement" as const,
          targets: [
            { claimId: "c1", amount: 300 },
            { claimId: "c2", amount: 300 },
          ],
        },
      },
    };
    expect(() => validateAppropriationInput(input)).toThrow(/payment\.amount.+초과/);
  });

  it("computedAt 형식 잘못되면 reject", () => {
    const input = { ...base(), computedAt: "2026/05/15" };
    expect(() => validateAppropriationInput(input)).toThrow(/computedAt.+YYYY-MM-DD/);
  });

  it("정상 입력은 통과", () => {
    expect(() => validateAppropriationInput(base())).not.toThrow();
  });
});
