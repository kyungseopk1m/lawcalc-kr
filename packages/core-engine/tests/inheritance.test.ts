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

describe("calculateInheritance — 최근친 우선 + 배우자 대습 (§1000②·§1003②·§1009②)", () => {
  const frac = (s: { name: string; numerator: number; denominator: number }) =>
    `${s.name}=${s.numerator}/${s.denominator}`;

  it("INH-1 방계 4순위: 삼촌(3촌)이 사촌(4촌)에 우선 → 삼촌 단독", () => {
    const r = calculateInheritance({
      decedent: { deceasedAt: "2025-01-01" },
      collateralFourth: [
        { name: "삼촌", deceasedBeforeOpening: false, degree: 3 },
        { name: "사촌", deceasedBeforeOpening: false, degree: 4 },
      ],
    });
    expect(r.shares.map(frac)).toEqual(["삼촌=1/1"]);
  });

  /**
   * 직계비속(1순위)도 §1000② 최근친 우선 대상이다. 직전 구현은 2·4순위에만 필터를 걸고
   * 1순위는 통과시켜, 자와 손을 함께 넣으면 균등 분할됐다 (자 1/2, 손 1/2).
   * `degree` 는 validator 가 받아 검증까지 하면서 계산에서는 버려지고 있었다.
   */
  it("INH-1 직계비속: 자(1촌)가 손(2촌)에 우선 → 자 단독", () => {
    const r = calculateInheritance({
      decedent: { deceasedAt: "2025-01-01" },
      linealDescendants: [
        { name: "자", deceasedBeforeOpening: false, degree: 1 },
        { name: "손", deceasedBeforeOpening: false, degree: 2 },
      ],
    });
    expect(r.shares.map(frac)).toEqual(["자=1/1"]);
  });

  it("INH-1 직계비속 + 배우자: 최근친만 배우자와 공동상속", () => {
    const r = calculateInheritance({
      decedent: { deceasedAt: "2025-01-01" },
      spouse: { alive: true, name: "배우자" },
      linealDescendants: [
        { name: "자", deceasedBeforeOpening: false, degree: 1 },
        { name: "손", deceasedBeforeOpening: false, degree: 2 },
      ],
    });
    // 배우자 3 : 자 2 → 3/5, 2/5. 손은 상속인이 아니다.
    expect(r.shares.map(frac)).toEqual(["배우자=3/5", "자=2/5"]);
  });

  it("INH-1 촌수를 지정하지 않으면 기존대로 전원 균분한다 (하위호환)", () => {
    const r = calculateInheritance({
      decedent: { deceasedAt: "2025-01-01" },
      linealDescendants: [
        { name: "자1", deceasedBeforeOpening: false },
        { name: "자2", deceasedBeforeOpening: false },
      ],
    });
    expect(r.shares.map(frac)).toEqual(["자1=1/2", "자2=1/2"]);
  });

  it("INH-1 최근친인 자가 사망해도 대습자가 있으면 그 슬롯이 유지된다", () => {
    const r = calculateInheritance({
      decedent: { deceasedAt: "2025-01-01" },
      linealDescendants: [
        {
          name: "장남",
          deceasedBeforeOpening: true,
          degree: 1,
          representatives: [{ name: "손1", deceasedBeforeOpening: false }],
        },
        { name: "차남", deceasedBeforeOpening: false, degree: 1 },
      ],
    });
    expect(r.shares.map(frac)).toEqual(["손1=1/2", "차남=1/2"]);
  });

  /**
   * 민법 제1003조 ①: 배우자는 1·2순위와 공동상속하고, 그들이 없으면 단독상속인이 된다.
   * 형제자매(3순위)·4촌 이내 방계(4순위)는 배우자가 있으면 상속인이 되지 않는다.
   *
   * 이 조합을 검증하는 테스트가 한 건도 없어, 순위 분기를 뒤집어 배우자를 완전히 배제하는
   * 뮤테이션이 전 테스트를 통과했다.
   */
  it("INH-3 배우자 + 형제자매 → 배우자 단독 (제1003조 ①)", () => {
    const r = calculateInheritance({
      decedent: { deceasedAt: "2025-01-01" },
      spouse: { alive: true, name: "배우자" },
      siblings: [
        { name: "형", deceasedBeforeOpening: false },
        { name: "제", deceasedBeforeOpening: false },
      ],
    });
    expect(r.shares.map(frac)).toEqual(["배우자=1/1"]);
  });

  it("INH-3 배우자 + 4촌 이내 방계 → 배우자 단독", () => {
    const r = calculateInheritance({
      decedent: { deceasedAt: "2025-01-01" },
      spouse: { alive: true, name: "배우자" },
      collateralFourth: [{ name: "삼촌", deceasedBeforeOpening: false, degree: 3 }],
    });
    expect(r.shares.map(frac)).toEqual(["배우자=1/1"]);
  });

  it("INH-3 배우자가 없어야 형제자매가 상속한다", () => {
    const r = calculateInheritance({
      decedent: { deceasedAt: "2025-01-01" },
      siblings: [
        { name: "형", deceasedBeforeOpening: false },
        { name: "제", deceasedBeforeOpening: false },
      ],
    });
    expect(r.shares.map(frac)).toEqual(["형=1/2", "제=1/2"]);
  });

  it("INH-3 배우자는 1·2순위와는 공동상속한다", () => {
    const withChild = calculateInheritance({
      decedent: { deceasedAt: "2025-01-01" },
      spouse: { alive: true, name: "배우자" },
      linealDescendants: [{ name: "자", deceasedBeforeOpening: false }],
      siblings: [{ name: "형", deceasedBeforeOpening: false }],
    });
    expect(withChild.shares.map(frac)).toEqual(["배우자=3/5", "자=2/5"]);

    const withParent = calculateInheritance({
      decedent: { deceasedAt: "2025-01-01" },
      spouse: { alive: true, name: "배우자" },
      linealAscendants: [{ name: "부", deceasedBeforeOpening: false, degree: 1 }],
      siblings: [{ name: "형", deceasedBeforeOpening: false }],
    });
    expect(withParent.shares.map(frac)).toEqual(["배우자=3/5", "부=2/5"]);
  });

  it("INH-2 직계존속: 부(1촌)가 조부(2촌)에 우선 → 부 단독", () => {
    const r = calculateInheritance({
      decedent: { deceasedAt: "2025-01-01" },
      linealAscendants: [
        { name: "부", deceasedBeforeOpening: false, degree: 1 },
        { name: "조부", deceasedBeforeOpening: false, degree: 2 },
      ],
    });
    expect(r.shares.map(frac)).toEqual(["부=1/1"]);
  });

  it("INH-2 최근친 전원 사망 시 차순위 촌수가 상속 (부·모 사망 → 조부)", () => {
    const r = calculateInheritance({
      decedent: { deceasedAt: "2025-01-01" },
      linealAscendants: [
        { name: "부", deceasedBeforeOpening: true, degree: 1 },
        { name: "모", deceasedBeforeOpening: true, degree: 1 },
        { name: "조부", deceasedBeforeOpening: false, degree: 2 },
      ],
    });
    expect(r.shares.map(frac)).toEqual(["조부=1/1"]);
  });

  it("INH-2 + 배우자: 부(1촌) 우선·조부 배제 → 배우자 3/5, 부 2/5", () => {
    const r = calculateInheritance({
      decedent: { deceasedAt: "2025-01-01" },
      spouse: { alive: true },
      linealAscendants: [
        { name: "부", deceasedBeforeOpening: false, degree: 1 },
        { name: "조부", deceasedBeforeOpening: false, degree: 2 },
      ],
    });
    expect(r.shares.map(frac)).toEqual(["배우자=3/5", "부=2/5"]);
  });

  it("INH-3 배우자 대습 5할 가산: 손주 1/5, 며느리 3/10 (손주:며느리=2:3)", () => {
    const r = calculateInheritance({
      decedent: { deceasedAt: "2025-01-01" },
      linealDescendants: [
        { name: "자녀B", deceasedBeforeOpening: false },
        {
          name: "자녀A",
          deceasedBeforeOpening: true,
          representatives: [
            { name: "손주", deceasedBeforeOpening: false },
            { name: "며느리", deceasedBeforeOpening: false, isSpouseOfRepresented: true },
          ],
        },
      ],
    });
    expect(r.shares.map(frac)).toEqual(["자녀B=1/2", "손주=1/5", "며느리=3/10"]);
  });

  it("하위호환: 배우자 표시 없는 대습은 종전대로 균분 (손주·며느리 각 1/4)", () => {
    const r = calculateInheritance({
      decedent: { deceasedAt: "2025-01-01" },
      linealDescendants: [
        { name: "자녀B", deceasedBeforeOpening: false },
        {
          name: "자녀A",
          deceasedBeforeOpening: true,
          representatives: [
            { name: "손주", deceasedBeforeOpening: false },
            { name: "며느리", deceasedBeforeOpening: false },
          ],
        },
      ],
    });
    expect(r.shares.map(frac)).toEqual(["자녀B=1/2", "손주=1/4", "며느리=1/4"]);
  });

  it("하위호환: degree 미지정 직계존속은 종전대로 균분 (부·모 각 1/2)", () => {
    const r = calculateInheritance({
      decedent: { deceasedAt: "2025-01-01" },
      linealAscendants: [
        { name: "부", deceasedBeforeOpening: false },
        { name: "모", deceasedBeforeOpening: false },
      ],
    });
    expect(r.shares.map(frac)).toEqual(["부=1/2", "모=1/2"]);
  });

  it("형제자매 대습도 배우자 5할 가산: 조카 1/5, 형수 3/10 (§1001·§1003②·§1009②)", () => {
    const r = calculateInheritance({
      decedent: { deceasedAt: "2025-01-01" },
      siblings: [
        { name: "형제B", deceasedBeforeOpening: false },
        {
          name: "형제A",
          deceasedBeforeOpening: true,
          representatives: [
            { name: "조카", deceasedBeforeOpening: false },
            { name: "형수", deceasedBeforeOpening: false, isSpouseOfRepresented: true },
          ],
        },
      ],
    });
    expect(r.shares.map(frac)).toEqual(["형제B=1/2", "조카=1/5", "형수=3/10"]);
  });

  it("촌수가 0 이하/비정수면 RangeError (방계·직계존속)", () => {
    expect(() =>
      calculateInheritance({
        decedent: { deceasedAt: "2025-01-01" },
        collateralFourth: [{ name: "삼촌", deceasedBeforeOpening: false, degree: 0 }],
      }),
    ).toThrow("촌수(degree)는 1 이상의 정수여야 합니다.");
    expect(() =>
      calculateInheritance({
        decedent: { deceasedAt: "2025-01-01" },
        linealAscendants: [{ name: "부", deceasedBeforeOpening: false, degree: 1.5 }],
      }),
    ).toThrow("촌수(degree)는 1 이상의 정수여야 합니다.");
  });

  it("촌수 검증은 HeirNode 공통 필드 — 직계비속·형제자매·대습 노드에도 적용 (public API 경계)", () => {
    // 직계비속의 degree 는 계산에 안 쓰이지만 잘못된 값은 거부한다.
    expect(() =>
      calculateInheritance({
        decedent: { deceasedAt: "2025-01-01" },
        linealDescendants: [{ name: "자녀", deceasedBeforeOpening: false, degree: 0 }],
      }),
    ).toThrow("촌수(degree)는 1 이상의 정수여야 합니다.");
    // 형제자매
    expect(() =>
      calculateInheritance({
        decedent: { deceasedAt: "2025-01-01" },
        siblings: [{ name: "형제", deceasedBeforeOpening: false, degree: -2 }],
      }),
    ).toThrow("촌수(degree)는 1 이상의 정수여야 합니다.");
    // 대습 노드 (재귀)
    expect(() =>
      calculateInheritance({
        decedent: { deceasedAt: "2025-01-01" },
        linealDescendants: [
          {
            name: "자녀A",
            deceasedBeforeOpening: true,
            representatives: [{ name: "손주", deceasedBeforeOpening: false, degree: 0 }],
          },
        ],
      }),
    ).toThrow("촌수(degree)는 1 이상의 정수여야 합니다.");
  });
});

/**
 * INH-2 — 상속포기는 사망·결격과 다른 사유다.
 *
 * 민법 제1001조의 대습원인은 "상속개시전 사망" 과 제1004조·제1004조의2(결격·상속권
 * 상실선고) 뿐이고 포기는 열거되어 있지 않다. 포기를 `deceasedBeforeOpening` 으로
 * 대용하면 있지도 않은 대습이 발생해 손자녀에게 지분이 배분된다.
 *
 * 제1042조 — 포기자는 상속개시시부터 상속인이 아니었던 것으로 본다.
 * 제1043조 — 포기한 상속분은 다른 상속인에게 그 상속분 비율로 귀속된다.
 * 대법원 2023. 3. 23.자 2020그42 전합 — 자녀 전원이 포기하면 배우자가 단독상속인이 된다
 * (손자녀와 공동상속하지 않는다). 종전 2013다48852 변경.
 * 대법원 1995. 9. 26. 선고 95다27769 — 배우자 없이 자녀 전원이 포기하면 손자녀가
 * 차순위 **본위상속** 한다 (대습이 아니다).
 */
describe("calculateInheritance / 상속포기 (renounced) [INH-2]", () => {
  const decedent = { deceasedAt: "2025-01-01" };
  const asMap = (r: ReturnType<typeof calculateInheritance>) =>
    Object.fromEntries(r.shares.map((s) => [s.name, `${s.numerator}/${s.denominator}`]));

  it("자녀 전원 포기 + 배우자 = 배우자 1/1 (손자녀와 공동상속하지 않는다)", () => {
    const r = calculateInheritance({
      decedent,
      spouse: { name: "배우자", alive: true },
      linealDescendants: [
        {
          name: "자녀A",
          deceasedBeforeOpening: false,
          renounced: true,
          representatives: [{ name: "손주", deceasedBeforeOpening: false }],
        },
      ],
    });
    expect(asMap(r)).toEqual({ 배우자: "1/1" });
  });

  it("같은 가족을 포기 대신 사망으로 입력하면 대습이 발생한다 (오답 재현 — 두 사유가 갈린다)", () => {
    const renounced = calculateInheritance({
      decedent,
      spouse: { name: "배우자", alive: true },
      linealDescendants: [
        {
          name: "자녀A",
          deceasedBeforeOpening: false,
          renounced: true,
          representatives: [{ name: "손주", deceasedBeforeOpening: false }],
        },
      ],
    });
    const died = calculateInheritance({
      decedent,
      spouse: { name: "배우자", alive: true },
      linealDescendants: [
        {
          name: "자녀A",
          deceasedBeforeOpening: true,
          representatives: [{ name: "손주", deceasedBeforeOpening: false }],
        },
      ],
    });
    expect(asMap(renounced)).toEqual({ 배우자: "1/1" });
    expect(asMap(died)).toEqual({ 배우자: "3/5", 손주: "2/5" });
  });

  it("자녀 일부 포기 = 남은 자녀와 배우자가 공동상속 (§1043 재분배와 같은 값)", () => {
    // 배우자 3 : 자녀A 2 : 자녀B 2 에서 자녀B 포기 → 배우자 3/5, 자녀A 2/5.
    const r = calculateInheritance({
      decedent,
      spouse: { name: "배우자", alive: true },
      linealDescendants: [
        { name: "자녀A", deceasedBeforeOpening: false },
        { name: "자녀B", deceasedBeforeOpening: false, renounced: true },
      ],
    });
    expect(asMap(r)).toEqual({ 배우자: "3/5", 자녀A: "2/5" });
  });

  it("포기자에게 대습자를 붙여도 슬롯이 생기지 않는다", () => {
    const r = calculateInheritance({
      decedent,
      linealDescendants: [
        { name: "자녀A", deceasedBeforeOpening: false },
        {
          name: "자녀B",
          deceasedBeforeOpening: false,
          renounced: true,
          representatives: [{ name: "손주", deceasedBeforeOpening: false }],
        },
      ],
    });
    expect(asMap(r)).toEqual({ 자녀A: "1/1" });
  });

  it("배우자 없이 자녀 전원 포기 + 손자녀 = 손자녀 본위상속 (§1000②)", () => {
    const r = calculateInheritance({
      decedent,
      linealDescendants: [
        { name: "자녀A", deceasedBeforeOpening: false, renounced: true, degree: 1 },
        { name: "손주1", deceasedBeforeOpening: false, degree: 2 },
        { name: "손주2", deceasedBeforeOpening: false, degree: 2 },
      ],
    });
    expect(asMap(r)).toEqual({ 손주1: "1/2", 손주2: "1/2" });
  });

  it("배우자가 있으면 자녀 전원 포기해도 손자녀로 내려가지 않는다 (2020그42)", () => {
    const r = calculateInheritance({
      decedent,
      spouse: { name: "배우자", alive: true },
      linealDescendants: [
        { name: "자녀A", deceasedBeforeOpening: false, renounced: true, degree: 1 },
        { name: "손주1", deceasedBeforeOpening: false, degree: 2 },
      ],
    });
    expect(asMap(r)).toEqual({ 배우자: "1/1" });
  });

  it("자녀 전원 포기 + 배우자 + 부모 생존 = 배우자 단독 (2순위로 내려가지 않는다)", () => {
    const r = calculateInheritance({
      decedent,
      spouse: { name: "배우자", alive: true },
      linealDescendants: [{ name: "자녀A", deceasedBeforeOpening: false, renounced: true }],
      linealAscendants: [{ name: "부", deceasedBeforeOpening: false }],
    });
    expect(asMap(r)).toEqual({ 배우자: "1/1" });
  });

  it("배우자 없이 자녀 전원 포기 + 부모 생존 = 부모가 2순위로 상속", () => {
    const r = calculateInheritance({
      decedent,
      linealDescendants: [{ name: "자녀A", deceasedBeforeOpening: false, renounced: true }],
      linealAscendants: [{ name: "부", deceasedBeforeOpening: false }],
    });
    expect(asMap(r)).toEqual({ 부: "1/1" });
  });

  it("직계존속 전원 포기 + 배우자 = 배우자 단독 (§1043 동일 구조)", () => {
    const r = calculateInheritance({
      decedent,
      spouse: { name: "배우자", alive: true },
      linealAscendants: [{ name: "부", deceasedBeforeOpening: false, renounced: true }],
    });
    expect(asMap(r)).toEqual({ 배우자: "1/1" });
  });

  it("배우자 없이 부모 전원 포기 = 조부모가 본위상속 (존속 cascade)", () => {
    const r = calculateInheritance({
      decedent,
      linealAscendants: [
        { name: "부", deceasedBeforeOpening: false, renounced: true, degree: 1 },
        { name: "모", deceasedBeforeOpening: false, renounced: true, degree: 1 },
        { name: "조부", deceasedBeforeOpening: false, degree: 2 },
      ],
    });
    expect(asMap(r)).toEqual({ 조부: "1/1" });
  });

  it("방계 4순위도 최근친 전원 포기 시 다음 촌수로 내려간다 (방계 cascade)", () => {
    const r = calculateInheritance({
      decedent,
      collateralFourth: [
        { name: "삼촌", deceasedBeforeOpening: false, renounced: true, degree: 3 },
        { name: "사촌", deceasedBeforeOpening: false, degree: 4 },
      ],
    });
    expect(asMap(r)).toEqual({ 사촌: "1/1" });
  });

  it("형제자매 전원 포기 = 4순위 방계로 넘어간다", () => {
    const r = calculateInheritance({
      decedent,
      siblings: [{ name: "형제", deceasedBeforeOpening: false, renounced: true }],
      collateralFourth: [{ name: "삼촌", deceasedBeforeOpening: false }],
    });
    expect(asMap(r)).toEqual({ 삼촌: "1/1" });
  });

  it("대습자 본인이 포기하면 그 대습자만 빠진다", () => {
    const r = calculateInheritance({
      decedent,
      linealDescendants: [
        {
          name: "자녀A",
          deceasedBeforeOpening: true,
          representatives: [
            { name: "손주1", deceasedBeforeOpening: false, renounced: true },
            { name: "손주2", deceasedBeforeOpening: false },
          ],
        },
      ],
    });
    expect(asMap(r)).toEqual({ 손주2: "1/1" });
  });

  it("대습자 전원이 포기하면 슬롯이 소멸한다", () => {
    const r = calculateInheritance({
      decedent,
      linealDescendants: [
        { name: "자녀A", deceasedBeforeOpening: false },
        {
          name: "자녀B",
          deceasedBeforeOpening: true,
          representatives: [{ name: "손주", deceasedBeforeOpening: false, renounced: true }],
        },
      ],
    });
    expect(asMap(r)).toEqual({ 자녀A: "1/1" });
  });

  it("전원 포기 + 후순위 없음 = 상속인이 없습니다", () => {
    expect(() =>
      calculateInheritance({
        decedent,
        linealDescendants: [{ name: "자녀A", deceasedBeforeOpening: false, renounced: true }],
      }),
    ).toThrow("상속인이 없습니다");
  });

  it("renounced 미지정 시 기존 결과와 완전히 동일 (회귀 0)", () => {
    const base = {
      decedent,
      spouse: { name: "배우자", alive: true },
      linealDescendants: [
        { name: "자녀A", deceasedBeforeOpening: false },
        {
          name: "자녀B",
          deceasedBeforeOpening: true,
          representatives: [{ name: "손주", deceasedBeforeOpening: false }],
        },
      ],
    };
    const omitted = calculateInheritance(base);
    const explicitFalse = calculateInheritance({
      ...base,
      linealDescendants: base.linealDescendants.map((h) => ({ ...h, renounced: false })),
    });
    expect(asMap(omitted)).toEqual({ 배우자: "3/7", 자녀A: "2/7", 손주: "2/7" });
    expect(asMap(explicitFalse)).toEqual(asMap(omitted));
  });
});

const shareText = (s: { name: string; numerator: number; denominator: number }) =>
  `${s.name}=${s.numerator}/${s.denominator}`;

/**
 * 민법 제1003조 2항 (법률 제21454호, 2026. 3. 17. 공포·시행).
 *
 * 개정 전 "사망 또는 결격된 자의 배우자" → 개정 후 "상속개시전에 사망한 사람의 배우자".
 * 제1001조의 직계비속 대습은 결격·상속권 상실에서도 그대로 유지되므로 손주는 남고
 * 피대습자의 배우자만 빠진다. 부칙 제2조 적용례에 제1003조가 없어 시행일로 갈린다.
 */
describe("대습 배우자 범위 축소 (제1003조 2항, 2026-03-17)", () => {
  const heirs = (cause?: "death" | "disqualified" | "forfeited") => ({
    linealDescendants: [
      {
        name: "자녀A",
        deceasedBeforeOpening: true,
        ...(cause ? { representationCause: cause } : {}),
        representatives: [
          { name: "손주", deceasedBeforeOpening: false },
          { name: "며느리", deceasedBeforeOpening: false, isSpouseOfRepresented: true },
        ],
      },
    ],
  });

  it("시행일 이후 결격이면 며느리가 빠지고 손주가 단독으로 받는다", () => {
    const r = calculateInheritance({
      decedent: { deceasedAt: "2026-04-01" },
      ...heirs("disqualified"),
    });
    expect(r.shares.map(shareText)).toEqual(["손주=1/1"]);
  });

  it("상속권 상실선고도 같다", () => {
    const r = calculateInheritance({
      decedent: { deceasedAt: "2026-04-01" },
      ...heirs("forfeited"),
    });
    expect(r.shares.map(shareText)).toEqual(["손주=1/1"]);
  });

  it("시행일 이후라도 원인이 사망이면 며느리가 5할 가산을 받는다", () => {
    const r = calculateInheritance({
      decedent: { deceasedAt: "2026-04-01" },
      ...heirs("death"),
    });
    expect(r.shares.map(shareText)).toEqual(["손주=2/5", "며느리=3/5"]);
  });

  it("시행일 전(2026-03-16)에는 결격이어도 개정 전 문언대로 며느리가 받는다", () => {
    const r = calculateInheritance({
      decedent: { deceasedAt: "2026-03-16" },
      ...heirs("disqualified"),
    });
    expect(r.shares.map(shareText)).toEqual(["손주=2/5", "며느리=3/5"]);
  });

  it("시행일 당일(2026-03-17)부터 적용된다", () => {
    const r = calculateInheritance({
      decedent: { deceasedAt: "2026-03-17" },
      ...heirs("disqualified"),
    });
    expect(r.shares.map(shareText)).toEqual(["손주=1/1"]);
  });

  it("원인 미지정은 사망으로 본다 (구파일 하위호환)", () => {
    const r = calculateInheritance({ decedent: { deceasedAt: "2026-04-01" }, ...heirs() });
    expect(r.shares.map(shareText)).toEqual(["손주=2/5", "며느리=3/5"]);
  });

  it("배우자가 유일한 대습자였으면 슬롯 자체가 사라진다", () => {
    const r = calculateInheritance({
      decedent: { deceasedAt: "2026-04-01" },
      spouse: { alive: true },
      linealDescendants: [
        { name: "자녀B", deceasedBeforeOpening: false },
        {
          name: "자녀A",
          deceasedBeforeOpening: true,
          representationCause: "disqualified",
          representatives: [
            { name: "며느리", deceasedBeforeOpening: false, isSpouseOfRepresented: true },
          ],
        },
      ],
    });
    // 자녀A 슬롯이 통째로 없어지고 배우자 3 : 자녀B 2 가 된다.
    expect(r.shares.map(shareText)).toEqual(["배우자=3/5", "자녀B=2/5"]);
  });
});

/**
 * 상속개시 전 사망·결격과 상속포기는 양립할 수 없다.
 *
 * 허용하면 포기자 제외가 먼저 걸려 대습 슬롯이 통째로 사라지고, 화면에 남아 있는
 * 대습상속인이 결과표에서만 조용히 빠진다 (최악의 경우 배우자 단독상속으로 뒤집힌다).
 */
describe("사망·결격과 상속포기의 배타", () => {
  it("같은 상속인에 둘 다 지정하면 거부한다", () => {
    expect(() =>
      calculateInheritance({
        decedent: { deceasedAt: "2025-01-01" },
        spouse: { alive: true },
        linealDescendants: [
          {
            name: "자녀1",
            deceasedBeforeOpening: true,
            renounced: true,
            representatives: [{ name: "손자1", deceasedBeforeOpening: false }],
          },
          { name: "자녀2", deceasedBeforeOpening: false },
        ],
      }),
    ).toThrow(/동시에 지정할 수 없습니다/);
  });

  it("네 순위 모두에서 거부한다", () => {
    for (const key of [
      "linealDescendants",
      "linealAscendants",
      "siblings",
      "collateralFourth",
    ] as const) {
      expect(() =>
        calculateInheritance({
          decedent: { deceasedAt: "2025-01-01" },
          [key]: [{ name: "X", deceasedBeforeOpening: true, renounced: true }],
        }),
      ).toThrow(/동시에 지정할 수 없습니다/);
    }
  });
});
