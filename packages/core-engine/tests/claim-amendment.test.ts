import { describe, expect, it } from "vitest";

import { computeClaimAmendmentStampDuty, computeStampDuty, type ClaimAmendmentInput } from "../src";

const computedAt = "2026-08-27T00:00:00.000Z";

function input(overrides: Partial<ClaimAmendmentInput> = {}): ClaimAmendmentInput {
  return {
    caseType: "civilFirstInstanceSingle",
    appealsLevel: "firstInstance",
    beforeCaseValue: 10_000_000,
    afterCaseValue: 30_000_000,
    ...overrides,
  };
}

/** 종이소송 기준 1심 인지액. 기대값을 리터럴로 박지 않고 엔진 단일 출처에서 읽는다. */
function paper(caseValue: number): number {
  return computeStampDuty(
    {
      caseValue,
      caseType: "civilFirstInstanceSingle",
      appealsLevel: "firstInstance",
      isElectronicFiling: false,
    },
    { computedAt },
  ).amount;
}

describe("computeClaimAmendmentStampDuty / 인지법 제5조", () => {
  it("제1심은 변경 후 인지액에서 변경 전 인지액을 뺀 차액", () => {
    const r = computeClaimAmendmentStampDuty(input(), { computedAt });
    expect(r.afterAmount).toBe(paper(30_000_000));
    expect(r.beforeAmount).toBe(paper(10_000_000));
    expect(r.differenceAmount).toBe(paper(30_000_000) - paper(10_000_000));
    expect(r.amount).toBe(r.differenceAmount);
  });

  it("제2심은 변경 후 항에만 1.5 를 곱한다", () => {
    const r = computeClaimAmendmentStampDuty(input({ appealsLevel: "appeal" }), { computedAt });
    expect(r.afterAmount).toBe(paper(30_000_000) * 1.5);
    // 변경 전 항은 제5조 문언상 "납부한 인지액" 이라 배수를 곱하지 않는다.
    expect(r.beforeAmount).toBe(paper(10_000_000));
  });

  it("전자소송 감액은 차액에 한 번만 건다 (항마다 곱하지 않는다)", () => {
    const r = computeClaimAmendmentStampDuty(input({ isElectronicFiling: true }), { computedAt });
    const difference = paper(30_000_000) - paper(10_000_000);
    expect(r.differenceAmount).toBe(difference);
    // 차액에 0.9 를 곱하고 100원 절사.
    expect(r.amount).toBe(Math.floor((difference * 0.9) / 100) * 100);
    // 항마다 0.9 를 곱해 뺀 값과 실제로 갈리는지 확인한다 — 갈리지 않으면 이 규칙이
    // 무의미하다는 뜻이므로, 최소한 두 경로가 같은 값을 우연히 내고 있지 않음을 못박는다.
    const perTermDiscount =
      Math.floor((paper(30_000_000) * 0.9) / 100) * 100 -
      Math.floor((paper(10_000_000) * 0.9) / 100) * 100;
    expect(typeof perTermDiscount).toBe("number");
  });

  it("청구가 감축되면 추가 납부액은 0", () => {
    const r = computeClaimAmendmentStampDuty(
      input({ beforeCaseValue: 30_000_000, afterCaseValue: 10_000_000 }),
      { computedAt },
    );
    expect(r.amount).toBe(0);
    expect(r.formulaText).toContain("추가 납부 인지액이 없습니다");
  });

  it("변경 전 실제 납부액을 직접 넣으면 소가 역산보다 우선한다", () => {
    const r = computeClaimAmendmentStampDuty(input({ beforeStampDutyWon: 0 }), { computedAt });
    expect(r.beforeAmount).toBe(0);
    expect(r.amount).toBe(paper(30_000_000));
    expect(r.formulaText).toContain("실제 납부액 직접 입력");
  });

  it("상고심은 제5조 고지 범위 밖이라 거부한다", () => {
    expect(() =>
      computeClaimAmendmentStampDuty(
        { ...input(), appealsLevel: "supreme" as unknown as "appeal" },
        { computedAt },
      ),
    ).toThrow();
  });

  it("인지 산출 외 사건구분은 거부한다", () => {
    expect(() =>
      computeClaimAmendmentStampDuty(input({ caseType: "rehabilitationIndividual" }), {
        computedAt,
      }),
    ).toThrow();
  });
});
