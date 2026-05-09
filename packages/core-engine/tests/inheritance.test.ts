import { describe, expect, it } from "vitest";

import { calculateInheritance } from "../src";
import { gcd, simplify } from "../src/inheritance/fraction";

describe("inheritance/fraction", () => {
  it("computes Euclidean gcd", () => {
    expect(gcd(8n, 12n)).toBe(4n);
    expect(gcd(7n, 0n)).toBe(7n);
    expect(gcd(0n, 5n)).toBe(5n);
    expect(gcd(-12n, 8n)).toBe(4n);
  });

  it("simplifies fractions to lowest terms", () => {
    expect(simplify({ num: 6n, den: 9n })).toEqual({ num: 2n, den: 3n });
    expect(simplify({ num: 0n, den: 5n })).toEqual({ num: 0n, den: 1n });
    expect(simplify({ num: 7n, den: 7n })).toEqual({ num: 1n, den: 1n });
  });

  it("throws on zero denominator", () => {
    expect(() => simplify({ num: 1n, den: 0n })).toThrow();
  });
});

describe("calculateInheritance — 입력 검증", () => {
  it("throws when deceasedAt missing or malformed", () => {
    expect(() => calculateInheritance({ decedent: { deceasedAt: "" } })).toThrow();
    expect(() => calculateInheritance({ decedent: { deceasedAt: "2025/01/01" } })).toThrow();
  });

  it("rejects 2nd-tier representation in linealDescendants", () => {
    expect(() =>
      calculateInheritance({
        decedent: { deceasedAt: "2025-01-01" },
        linealDescendants: [
          {
            deceasedBeforeOpening: true,
            representatives: [
              {
                deceasedBeforeOpening: true,
                representatives: [{ deceasedBeforeOpening: false }],
              },
            ],
          },
        ],
      }),
    ).toThrow("2차 이상 대습은 본 버전에서 지원하지 않습니다.");
  });

  it("rejects representation on linealAscendants (민법 1001조)", () => {
    expect(() =>
      calculateInheritance({
        decedent: { deceasedAt: "2025-01-01" },
        linealAscendants: [
          {
            deceasedBeforeOpening: true,
            representatives: [{ deceasedBeforeOpening: false }],
          },
        ],
      }),
    ).toThrow("직계존속과 4촌이내 방계혈족은 대습상속 대상이 아닙니다.");
  });

  it("throws when no heirs exist at all", () => {
    expect(() => calculateInheritance({ decedent: { deceasedAt: "2025-01-01" } })).toThrow(
      "상속인이 없습니다",
    );
  });
});

describe("calculateInheritance — 분배 정원", () => {
  it("populates disclaimer + dataVersion + computedAt", () => {
    const result = calculateInheritance({
      decedent: { deceasedAt: "2025-01-01" },
      spouse: { alive: true },
    });
    expect(result.disclaimer).toContain("검토용 계산");
    expect(result.dataVersion).toBe("inheritance/v1.0.0");
    expect(result.computedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("preserves rawNumerator/rawDenominator before GCD", () => {
    const result = calculateInheritance({
      decedent: { deceasedAt: "2025-01-01" },
      linealDescendants: [{ deceasedBeforeOpening: false }, { deceasedBeforeOpening: false }],
    });
    expect(result.shares).toHaveLength(2);
    expect(result.shares[0]!.numerator).toBe(1);
    expect(result.shares[0]!.denominator).toBe(2);
    expect(result.shares[0]!.rawNumerator).toBe(2);
    expect(result.shares[0]!.rawDenominator).toBe(4);
  });

  it("handles 4촌이내 방계 (4순위) when 1·2·3순위·배우자 부재", () => {
    const result = calculateInheritance({
      decedent: { deceasedAt: "2025-01-01" },
      collateralFourth: [
        { name: "삼촌", deceasedBeforeOpening: false },
        { name: "사촌", deceasedBeforeOpening: false },
      ],
    });
    expect(result.shares).toHaveLength(2);
    expect(result.shares[0]!.numerator).toBe(1);
    expect(result.shares[0]!.denominator).toBe(2);
  });

  it("uses default names when name is omitted", () => {
    const result = calculateInheritance({
      decedent: { deceasedAt: "2025-01-01" },
      linealDescendants: [{ deceasedBeforeOpening: false }, { deceasedBeforeOpening: false }],
    });
    expect(result.shares.map((s) => s.name)).toEqual(["자녀1", "자녀2"]);
  });

  it("supports siblings (3순위) representation with default 대습 names", () => {
    const result = calculateInheritance({
      decedent: { deceasedAt: "2025-01-01" },
      siblings: [
        { name: "형제1", deceasedBeforeOpening: false },
        {
          name: "형제2",
          deceasedBeforeOpening: true,
          representatives: [{ deceasedBeforeOpening: false }],
        },
      ],
    });
    expect(result.shares).toHaveLength(2);
    expect(result.shares[0]).toMatchObject({ name: "형제1", numerator: 1, denominator: 2 });
    expect(result.shares[1]).toMatchObject({
      name: "형제2의 대습1",
      numerator: 1,
      denominator: 2,
    });
  });
});
