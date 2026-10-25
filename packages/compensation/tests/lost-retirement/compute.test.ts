import { describe, expect, it } from "vitest";
import { computeLostRetirement } from "../../src/lost-retirement";
import type { LostRetirementInput, LostRetirementMethod } from "../../src/lost-retirement";
import { combineDisabilityRatesPercent } from "../../src/internal";

const ACCIDENT = "2010-01-01";

function vk(
  method: LostRetirementMethod,
  separationDate: string,
  lossRatePercent = 100,
): LostRetirementInput {
  return {
    method,
    retirementDate: "2039-12-31",
    payAtRetirementWon: 90_000_000,
    separationDate,
    payAtSeparationWon: 15_000_000,
    lossRatePercent,
  };
}

describe("computeLostRetirement: VK 실측", () => {
  it.each([
    ["2010-01-01", 100, "presentValueMinusReceived", 21_000_000],
    ["2010-01-01", 100, "differenceDiscounted", 30_000_000],
    ["2010-01-01", 100, "bothDiscounted", 21_000_000],
    ["2012-01-01", 100, "presentValueMinusReceived", 21_000_000],
    ["2012-01-01", 100, "differenceDiscounted", 30_000_000],
    ["2012-01-01", 100, "bothDiscounted", 22_365_000],
    ["2012-01-01", 43.63, "bothDiscounted", 9_757_849],
  ] as const)("퇴직 %s, 상실률 %s%%, %s → %i원", (sep, rate, method, expected) => {
    const r = computeLostRetirement(vk(method, sep, rate), ACCIDENT);
    expect(r.amountWon).toBe(expected);
    expect(r.retirementMonths).toBe(360);
    expect(r.retirementFactor).toBe(0.4);
    expect(r.warnings).toEqual([]);
  });

  it("③ 퇴직 월수 24 → 계수 0.9090 (0.90909... 절사), 중간값 노출", () => {
    const r = computeLostRetirement(vk("bothDiscounted", "2012-01-01", 43.63), ACCIDENT);
    expect(r.separationMonths).toBe(24);
    expect(r.separationFactor).toBe(0.909);
    expect(r.retirementPresentValueWon).toBe(36_000_000);
    expect(r.separationPresentValueWon).toBe(13_635_000);
    expect(r.baseWon).toBe(22_365_000);
    expect(r.formulaText).toContain("0.9090");
    expect(r.formulaText).toContain("43.63%");
  });

  it("직접 입력은 그대로", () => {
    const r = computeLostRetirement({ method: "direct", amountWon: 12_345_678 }, ACCIDENT);
    expect(r.amountWon).toBe(12_345_678);
    expect(r.retirementMonths).toBeUndefined();
  });

  it("음수 현가 차이는 0 + 경고", () => {
    const input = {
      ...vk("presentValueMinusReceived", "2010-01-01"),
      payAtSeparationWon: 50_000_000,
    };
    const r = computeLostRetirement(input, ACCIDENT);
    expect(r.baseWon).toBe(0);
    expect(r.amountWon).toBe(0);
    expect(r.warnings.map((w) => w.code)).toEqual(["negativeClamped"]);
  });

  it("검증: 상실률 범위·소수 자리, 날짜 순서, 금액 정수", () => {
    const bad: LostRetirementInput[] = [
      vk("bothDiscounted", "2012-01-01", 0),
      vk("bothDiscounted", "2012-01-01", 100.01),
      vk("bothDiscounted", "2012-01-01", 43.635),
      vk("bothDiscounted", "2009-12-31"),
      vk("bothDiscounted", "2040-01-01"),
      { ...vk("bothDiscounted", "2012-01-01"), payAtRetirementWon: 1.5 } as LostRetirementInput,
      { method: "direct", amountWon: -1 },
    ];
    for (const input of bad)
      expect(() => computeLostRetirement(input, ACCIDENT)).toThrow(RangeError);
  });

  it("퍼징: 만 원 단위 퇴직금, 독립 BigInt 계산과 원 단위 일치", () => {
    const methods: LostRetirementMethod[] = [
      "presentValueMinusReceived",
      "differenceDiscounted",
      "bothDiscounted",
    ];
    let checked = 0;
    for (let i = 0; i < 300; i++) {
      const retMonths = 1 + ((i * 37) % 480);
      const sepMonths = (i * 13) % retMonths;
      const pay = 10_000 * (1000 + ((i * 7919) % 20000));
      const received = 10_000 * ((i * 104729) % 3000);
      const rate100 = 1 + ((i * 2731) % 10000);
      const method = methods[i % 3]!;
      // 사고일 2010-01-01 기준 월말·월초 날짜를 독립적으로 만든다.
      const ym = (m: number) =>
        `${2010 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}-01`;
      const lastDay = (m: number) => new Date(Date.UTC(2010, m, 0)).toISOString().slice(0, 10);
      const r = computeLostRetirement(
        {
          method,
          retirementDate: lastDay(retMonths),
          payAtRetirementWon: pay,
          separationDate: ym(sepMonths),
          payAtSeparationWon: received,
          lossRatePercent: rate100 / 100,
        },
        ACCIDENT,
      );
      // f(n) = 1/(1 + 0.05n/12) 의 만분율 절사 = floor(120000 / (12 + 0.05n)) = floor(2400000 / (240 + n)).
      const f = (n: number) => 2_400_000n / BigInt(240 + n);
      const pv = (won: bigint, n: number) => (won * f(n)) / 10000n;
      const P = BigInt(pay);
      const S = BigInt(received);
      let base =
        method === "presentValueMinusReceived"
          ? pv(P, retMonths) - S
          : method === "differenceDiscounted"
            ? pv(P - S, retMonths)
            : pv(P, retMonths) - pv(S, sepMonths);
      if (base < 0n) base = 0n;
      expect(r.retirementMonths, `${i}`).toBe(retMonths);
      expect(BigInt(r.amountWon), `${i}`).toBe((base * BigInt(rate100)) / 10000n);
      checked++;
    }
    expect(checked).toBe(300);
  });
});

describe("combineDisabilityRatesPercent", () => {
  it("1 − Π(1 − r) 를 % 소수 2자리에서 버린다", () => {
    expect(combineDisabilityRatesPercent([30, 20, 10])).toBe(49.6);
    expect(combineDisabilityRatesPercent([33.3, 15.5])).toBe(43.63);
    expect(combineDisabilityRatesPercent([])).toBe(0);
    expect(combineDisabilityRatesPercent([0, 45.5])).toBe(45.5);
  });

  it("검증: 범위·소수 자리·건수", () => {
    expect(() => combineDisabilityRatesPercent([100])).toThrow(RangeError);
    expect(() => combineDisabilityRatesPercent([-1])).toThrow(RangeError);
    expect(() => combineDisabilityRatesPercent([12.345])).toThrow(RangeError);
    expect(() => combineDisabilityRatesPercent(Array(21).fill(1))).toThrow(RangeError);
  });

  it("퍼징: 독립 BigInt 계산과 일치", () => {
    for (let i = 0; i < 300; i++) {
      const rates = [(i * 997) % 9999, (i * 7919) % 9999, (i * 31) % 9999].slice(0, 1 + (i % 3));
      let keep = 1n;
      let den = 1n;
      for (const r of rates) {
        keep *= 10000n - BigInt(r);
        den *= 10000n;
      }
      const expected = Number(((den - keep) * 10000n) / den);
      expect(Math.round(combineDisabilityRatesPercent(rates.map((r) => r / 100)) * 100)).toBe(
        expected,
      );
    }
  });
});
