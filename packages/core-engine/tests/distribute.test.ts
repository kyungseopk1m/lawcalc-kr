import { describe, expect, it } from "vitest";

import {
  divideEqually,
  divideProportionally,
  validateDistributeEqualInput,
  validateDistributeProportionalInput,
} from "../src";

describe("litigation-cost / distribute", () => {
  it("divideEqually floors quotient and assigns remainder from the first party", () => {
    expect(divideEqually(10, 3)).toEqual({ perParty: [4, 3, 3], remainder: 1 });
    expect(divideEqually(0, 3)).toEqual({ perParty: [0, 0, 0], remainder: 0 });
  });

  it("divideProportionally floors each share and assigns remainder by largest remainder", () => {
    // 전원 동률 잉여 + 동일 기준액 → tie-break 입력 순 (기존 결과와 동일).
    expect(divideProportionally(10, [1, 1, 1])).toEqual({
      perParty: [4, 3, 3],
      remainder: 1,
    });
    expect(divideProportionally(100, [1, 2, 7])).toEqual({
      perParty: [10, 20, 70],
      remainder: 0,
    });
    // 최대잉여법 — 잉여 4/6(두 번째) > 2/6(세 번째) > 0(첫 번째) → 두 번째가 +1.
    // (앞 당사자 우선 배정이었다면 [51, 16, 33].)
    expect(divideProportionally(100, [3, 1, 2])).toEqual({
      perParty: [50, 17, 33],
      remainder: 1,
    });
  });

  it("divideProportionally is order-invariant — 입력 순서를 바꿔도 같은 당사자가 같은 금액", () => {
    // 잉여 2/3(기준액 1) > 1/3(기준액 2) → 기준액 1 당사자가 +1, 순서 무관.
    expect(divideProportionally(101, [1, 2])).toEqual({ perParty: [34, 67], remainder: 1 });
    expect(divideProportionally(101, [2, 1])).toEqual({ perParty: [67, 34], remainder: 1 });
  });

  it("divideProportionally tie-break — 잉여 동률이면 기준액 큰 당사자 우선", () => {
    // 잉여 2/4 동률 → 기준액 3 > 1 → 두 번째가 +1.
    expect(divideProportionally(10, [1, 3])).toEqual({ perParty: [2, 8], remainder: 1 });
  });

  it("divideProportionally handles 2^53 초과 곱셈을 BigInt 로 정확 계산", () => {
    // totalWon × partyValue ≈ 10^19 > Number.MAX_SAFE_INTEGER.
    const parts = divideProportionally(1_000_000_000, [10_000_000_001, 9_999_999_999]);
    expect(parts.perParty).toEqual([500_000_000, 500_000_000]);
    expect(parts.perParty[0]! + parts.perParty[1]!).toBe(1_000_000_000);
  });

  it("rejects non-integer totals and invalid party counts", () => {
    expect(() => validateDistributeEqualInput(10.5, 2)).toThrow(/^분배 입력 검증 실패:/);
    expect(() => validateDistributeEqualInput(10, 0)).toThrow(/^분배 입력 검증 실패:/);
    expect(() => validateDistributeEqualInput(-1, 2)).toThrow(/^분배 입력 검증 실패:/);
  });

  it("rejects empty or non-positive proportional bases", () => {
    expect(() => validateDistributeProportionalInput(10, [])).toThrow(/^분배 입력 검증 실패:/);
    expect(() => validateDistributeProportionalInput(10, [1, 0])).toThrow(/^분배 입력 검증 실패:/);
    expect(() => validateDistributeProportionalInput(10, [1, 1.5])).toThrow(
      /^분배 입력 검증 실패:/,
    );
  });
});
