import { describe, expect, it } from "vitest";

import { calculateInheritance, type HeirNode, type InheritanceInput } from "../src";

const male = (name: string, extra: Partial<HeirNode> = {}): HeirNode => ({
  name,
  deceasedBeforeOpening: false,
  sex: "male",
  ...extra,
});
const female = (name: string, sameFamilyRegister: boolean): HeirNode => ({
  name,
  deceasedBeforeOpening: false,
  sex: "female",
  sameFamilyRegister,
});

/** VK E-4a·E-4c 와 같은 관계: 처 + 호주상속 아들 + 동일가적 딸 + 출가녀. */
const e4 = (deceasedAt: string): InheritanceInput => ({
  decedent: { deceasedAt },
  spouse: { name: "을", alive: true, relation: "wife" },
  linealDescendants: [male("병", { hojuSuccessor: true }), female("정", true), female("무", false)],
});

const fractions = (input: InheritanceInput) =>
  calculateInheritance(input).shares.map((s) => `${s.name} ${s.numerator}/${s.denominator}`);

describe("구법 상속분 (1960~1990 사망)", () => {
  it("VK E-4a (1985) 6/17·6/17·4/17·1/17 재현", () => {
    expect(fractions(e4("1985-06-01"))).toEqual(["을 6/17", "병 6/17", "정 4/17", "무 1/17"]);
  });

  it("VK E-4c (1970) 2/11·6/11·2/11·1/11 재현", () => {
    expect(fractions(e4("1970-06-01"))).toEqual(["을 2/11", "병 6/11", "정 2/11", "무 1/11"]);
  });

  it("1977 개정 시행일 경계: 1978-12-31 은 제정 민법, 1979-01-01 은 개정 민법", () => {
    expect(fractions(e4("1978-12-31"))).toEqual(fractions(e4("1970-06-01")));
    expect(fractions(e4("1979-01-01"))).toEqual(fractions(e4("1985-06-01")));
    expect(fractions(e4("1960-01-01"))).toEqual(fractions(e4("1970-06-01")));
  });

  it("1991-01-01 은 현행 경로 (구법 필드는 쓰이지 않음, VK E-4b 3/9·2/9)", () => {
    const r = calculateInheritance(e4("1991-01-01"));
    expect(r.dataVersion).toBe("inheritance/v1.0.0");
    expect(r.shares.map((s) => `${s.rawNumerator}/${s.rawDenominator}`)).toEqual([
      "3/9",
      "2/9",
      "2/9",
      "2/9",
    ]);
  });

  it("구법 필드가 없는 1991 전 입력은 종전 메시지로 거부 (손해배상 탭·구파일 무변경)", () => {
    expect(() =>
      calculateInheritance({
        decedent: { deceasedAt: "1985-06-01" },
        spouse: { alive: true },
        linealDescendants: [{ deceasedBeforeOpening: false }],
      }),
    ).toThrow("1991-01-01 이전 사망 케이스는 본 버전에서 지원하지 않습니다 (입력: 1985-06-01)");
  });

  it("1979 이후 처 + 직계존속: 처는 직계존속 상속분의 5할 가산 (3/7·2/7·2/7)", () => {
    expect(
      fractions({
        decedent: { deceasedAt: "1985-01-01" },
        spouse: { name: "처", alive: true, relation: "wife" },
        linealAscendants: [male("부"), female("모", true)],
      }),
    ).toEqual(["처 3/7", "부 2/7", "모 2/7"]);
  });

  it("처가 피상속인이고 직계비속이 없으면 남편 단독 (제1002조, 직계존속 배제)", () => {
    expect(
      fractions({
        decedent: { deceasedAt: "1985-01-01" },
        spouse: { name: "남편", alive: true, relation: "husband" },
        linealAscendants: [male("부"), female("모", true)],
      }),
    ).toEqual(["남편 1/1"]);
  });

  it("처 + 형제자매 → 처 단독 (제1003조 제1항)", () => {
    expect(
      fractions({
        decedent: { deceasedAt: "1970-01-01" },
        spouse: { name: "처", alive: true, relation: "wife" },
        siblings: [male("형")],
      }),
    ).toEqual(["처 1/1"]);
  });

  it("1960~78 형제자매: 출가 자매 1/4, 동일가적 자매 1/2", () => {
    expect(
      fractions({
        decedent: { deceasedAt: "1970-01-01" },
        siblings: [male("형"), female("누나", true), female("여동생", false)],
      }),
    ).toEqual(["형 4/7", "누나 2/7", "여동생 1/7"]);
  });

  it("전개식에 구법 근거와 전문가 확인 경고가 실린다", () => {
    const r = calculateInheritance({ ...e4("1985-06-01"), includeTrace: true });
    expect(r.dataVersion).toBe("inheritance-pre1991/v1.0.0");
    expect(r.trace?.join("\n")).toContain("법률 제3051호");
    expect(r.trace?.join("\n")).toContain("전문가 확인");
  });

  it("상속재산 금액 배분 (원 미만 내림)", () => {
    const r = calculateInheritance({ ...e4("1985-06-01"), estateWon: 1_000_000 });
    expect(r.shares.map((s) => s.amountWon)).toEqual([352_941, 352_941, 235_294, 58_823]);
    expect(r.remainderWon).toBe(1);
  });

  describe("입력 검증", () => {
    const base = e4("1985-06-01");
    it.each<[string, InheritanceInput, string]>([
      [
        "배우자 처·남편 구분 누락",
        { ...base, spouse: { alive: true } },
        "배우자가 처인지 남편인지",
      ],
      [
        "성별 누락",
        {
          ...base,
          linealDescendants: [{ name: "x", deceasedBeforeOpening: false }, female("y", true)],
        },
        "성별",
      ],
      [
        "여자 동일가적 여부 누락",
        {
          ...base,
          linealDescendants: [{ name: "x", deceasedBeforeOpening: false, sex: "female" }],
        },
        "동일가적 여부",
      ],
      [
        "호주상속인 2명",
        {
          ...base,
          linealDescendants: [
            male("a", { hojuSuccessor: true }),
            male("b", { hojuSuccessor: true }),
          ],
        },
        "한 명만",
      ],
      [
        "출가녀 호주상속인",
        {
          ...base,
          linealDescendants: [{ ...female("a", false), hojuSuccessor: true }],
        },
        "제984조 제2호",
      ],
      [
        "사위 대습",
        {
          ...base,
          linealDescendants: [
            {
              name: "딸",
              deceasedBeforeOpening: true,
              sex: "female",
              sameFamilyRegister: false,
              representatives: [
                { name: "사위", deceasedBeforeOpening: false, isSpouseOfRepresented: true },
              ],
            },
          ],
        },
        "사위 대습 없음",
      ],
      [
        "상속포기",
        { ...base, linealDescendants: [male("a", { renounced: true }), male("b")] },
        "상속포기",
      ],
      [
        "아들이 있는데 딸을 호주상속인으로 지정",
        {
          ...base,
          linealDescendants: [male("병"), { ...female("정", true), hojuSuccessor: true }],
        },
        "제984조 제1호",
      ],
      [
        "대습하는 손자가 있는데 딸을 호주상속인으로 지정",
        {
          ...base,
          linealDescendants: [
            {
              name: "아들",
              deceasedBeforeOpening: true,
              sex: "male",
              representatives: [male("손자")],
            },
            { ...female("정", true), hojuSuccessor: true },
          ],
        },
        "제984조 제1호",
      ],
      [
        "대습 원인 상속권 상실선고",
        {
          ...base,
          linealDescendants: [
            male("병", {
              deceasedBeforeOpening: true,
              representationCause: "forfeited",
              representatives: [male("손자")],
            }),
            female("정", true),
          ],
        },
        "제1004조의2",
      ],
      [
        "방계 9촌",
        {
          decedent: { deceasedAt: "1985-06-01" },
          collateralFourth: [male("a", { degree: 9 })],
        },
        "8촌 이내",
      ],
    ])("%s → 거부 + 전문가 확인 안내", (_label, input, message) => {
      expect(() => calculateInheritance(input)).toThrow(message);
      expect(() => calculateInheritance(input)).toThrow("전문가 확인");
    });
  });

  describe("경고 (계산은 하되 결과에 싣는다)", () => {
    it("아들이 없으면 가족인 딸의 호주상속 지정은 그대로 계산 (제984조 제2호)", () => {
      const r = calculateInheritance({
        decedent: { deceasedAt: "1985-06-01" },
        linealDescendants: [{ ...female("정", true), hojuSuccessor: true }, female("무", false)],
      });
      expect(r.shares.map((s) => `${s.numerator}/${s.denominator}`)).toEqual(["6/7", "1/7"]);
      expect(r.warnings).toBeUndefined();
    });

    it("피상속인이 처이고 남편 생존 + 호주상속 가산 → 경고, 지분은 입력대로", () => {
      const r = calculateInheritance({
        decedent: { deceasedAt: "1985-06-01" },
        spouse: { name: "남편", alive: true, relation: "husband" },
        linealDescendants: [male("병", { hojuSuccessor: true }), female("정", true)],
      });
      expect(r.shares.map((s) => `${s.numerator}/${s.denominator}`)).toEqual(["2/7", "3/7", "2/7"]);
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings![0]).toContain("제980조");
      expect(r.warnings![0]).toContain("입부혼");
    });

    it("1979~1990 처 + 출가녀만 → 기준 불명확 경고, 금액 불변 (12:2)", () => {
      const r = calculateInheritance({
        decedent: { deceasedAt: "1985-06-01" },
        spouse: { name: "을", alive: true, relation: "wife" },
        linealDescendants: [female("무", false)],
      });
      expect(r.shares.map((s) => `${s.rawNumerator}/${s.rawDenominator}`)).toEqual([
        "12/14",
        "2/14",
      ]);
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings![0]).toContain("제1009조 제3항");
      expect(r.warnings![0]).toContain("동일가적내에 있는 직계비속의 상속분");
    });

    it("1979~1990 처 + 가적 밖 모만 → 직계존속 기준 경고", () => {
      const r = calculateInheritance({
        decedent: { deceasedAt: "1985-06-01" },
        spouse: { name: "을", alive: true, relation: "wife" },
        linealAscendants: [{ ...female("모", false), degree: 1 }],
      });
      expect(r.shares.map((s) => `${s.rawNumerator}/${s.rawDenominator}`)).toEqual([
        "12/14",
        "2/14",
      ]);
      expect(r.warnings![0]).toContain("직계존속의 상속분");
    });

    it("1960~1978 은 기준이 남자의 상속분이라 경고 없음, 기준 집단에 가적 안 상속인이 있어도 없음", () => {
      expect(
        calculateInheritance({
          decedent: { deceasedAt: "1970-06-01" },
          spouse: { alive: true, relation: "wife" },
          linealDescendants: [female("무", false)],
        }).warnings,
      ).toBeUndefined();
      expect(calculateInheritance(e4("1985-06-01")).warnings).toBeUndefined();
    });
  });
});
