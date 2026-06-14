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
    ).toThrow("직계존속과 4촌 이내 방계혈족은 대습상속 대상이 아닙니다.");
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

  it("handles 4촌 이내 방계 (4순위) when 1·2·3순위·배우자 부재", () => {
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

  it("drops a slot when all of its representatives also died (no share to the dead)", () => {
    const result = calculateInheritance({
      decedent: { deceasedAt: "2025-01-01" },
      spouse: { alive: true },
      linealDescendants: [
        { name: "자녀1", deceasedBeforeOpening: false },
        {
          name: "자녀2",
          deceasedBeforeOpening: true,
          representatives: [{ name: "손주", deceasedBeforeOpening: true }],
        },
      ],
    });
    // 자녀2 슬롯 소멸 (대습자 전원 사망) → denom = 3(배우자) + 2(자녀1) = 5
    expect(result.shares).toHaveLength(2);
    expect(result.shares[0]).toMatchObject({ name: "배우자", numerator: 3, denominator: 5 });
    expect(result.shares[1]).toMatchObject({ name: "자녀1", numerator: 2, denominator: 5 });
  });

  it("distributes only to living representatives within a slot", () => {
    const result = calculateInheritance({
      decedent: { deceasedAt: "2025-01-01" },
      spouse: { alive: true },
      linealDescendants: [
        { name: "자녀1", deceasedBeforeOpening: false },
        {
          name: "자녀2",
          deceasedBeforeOpening: true,
          representatives: [
            { name: "손주A", deceasedBeforeOpening: false },
            { name: "손주B", deceasedBeforeOpening: true },
          ],
        },
      ],
    });
    // denom = 3 + 2*2 = 7. 자녀2 슬롯 2/7 은 생존 대습자 손주A 단독 (손주B 제외)
    expect(result.shares).toHaveLength(3);
    expect(result.shares[0]).toMatchObject({ name: "배우자", numerator: 3, denominator: 7 });
    expect(result.shares[1]).toMatchObject({ name: "자녀1", numerator: 2, denominator: 7 });
    expect(result.shares[2]).toMatchObject({ name: "손주A", numerator: 2, denominator: 7 });
  });

  it("배우자 없이 자녀 전원 사망 시 생존 대습자에게만 분배", () => {
    const result = calculateInheritance({
      decedent: { deceasedAt: "2025-01-01" },
      linealDescendants: [
        {
          name: "자녀1",
          deceasedBeforeOpening: true,
          representatives: [{ name: "손A", deceasedBeforeOpening: false }],
        },
        {
          name: "자녀2",
          deceasedBeforeOpening: true,
          representatives: [
            { name: "손B", deceasedBeforeOpening: false },
            { name: "손C", deceasedBeforeOpening: false },
          ],
        },
      ],
    });
    // denom = 2 slot × 2 = 4. 자녀1 slot 1/2 → 손A 단독, 자녀2 slot 1/2 → 손B·손C 각 1/4
    expect(result.shares).toHaveLength(3);
    expect(result.shares[0]).toMatchObject({ name: "손A", numerator: 1, denominator: 2 });
    expect(result.shares[1]).toMatchObject({ name: "손B", numerator: 1, denominator: 4 });
    expect(result.shares[2]).toMatchObject({ name: "손C", numerator: 1, denominator: 4 });
  });

  it("3순위 형제 대습에서 사망 대습자를 제외하고 생존 대습자에게 분배", () => {
    const result = calculateInheritance({
      decedent: { deceasedAt: "2025-01-01" },
      siblings: [
        { name: "형제1", deceasedBeforeOpening: false },
        {
          name: "형제2",
          deceasedBeforeOpening: true,
          representatives: [
            { name: "조카A", deceasedBeforeOpening: false },
            { name: "조카B", deceasedBeforeOpening: true },
          ],
        },
        {
          name: "형제3",
          deceasedBeforeOpening: true,
          representatives: [
            { name: "조카C", deceasedBeforeOpening: false },
            { name: "조카D", deceasedBeforeOpening: false },
          ],
        },
      ],
    });
    // denom = 3 slot. 형제2 slot 1/3 → 조카A 단독(조카B 제외), 형제3 slot 1/3 → 조카C·조카D 각 1/6
    expect(result.shares).toHaveLength(4);
    expect(result.shares[0]).toMatchObject({ name: "형제1", numerator: 1, denominator: 3 });
    expect(result.shares[1]).toMatchObject({ name: "조카A", numerator: 1, denominator: 3 });
    expect(result.shares[2]).toMatchObject({ name: "조카C", numerator: 1, denominator: 6 });
    expect(result.shares[3]).toMatchObject({ name: "조카D", numerator: 1, denominator: 6 });
  });

  it("유일한 직계비속 slot 의 대습자가 전원 사망이면 상속인 없음", () => {
    expect(() =>
      calculateInheritance({
        decedent: { deceasedAt: "2025-01-01" },
        linealDescendants: [
          {
            name: "자녀1",
            deceasedBeforeOpening: true,
            representatives: [{ name: "손주", deceasedBeforeOpening: true }],
          },
        ],
      }),
    ).toThrow("상속인이 없습니다");
  });

  it("사망(대습 없음) slot 제거 후 기본 이름은 상속 slot 순번을 따른다", () => {
    const result = calculateInheritance({
      decedent: { deceasedAt: "2025-01-01" },
      linealDescendants: [
        { deceasedBeforeOpening: true }, // 대습 없이 사망 → slot 제거(이름 미배정)
        { deceasedBeforeOpening: false }, // 생존 → 기본 이름 자녀1
        { deceasedBeforeOpening: true, representatives: [{ deceasedBeforeOpening: false }] }, // 자녀2 대습
      ],
    });
    expect(result.shares.map((s) => s.name)).toEqual(["자녀1", "자녀2의 대습1"]);
  });
});
