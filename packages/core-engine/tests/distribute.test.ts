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

  it("divideProportionally floors each share and assigns remainder from the first party", () => {
    expect(divideProportionally(10, [1, 1, 1])).toEqual({
      perParty: [4, 3, 3],
      remainder: 1,
    });
    expect(divideProportionally(100, [1, 2, 7])).toEqual({
      perParty: [10, 20, 70],
      remainder: 0,
    });
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
