import { describe, expect, it } from "vitest";
import {
  loadLifeExpectancyTable,
  type LifeExpectancyDataset,
} from "@lawcalc-kr/datasets-compensation";

import { computeLifeExpectancy, fullAge } from "../../src/life-expectancy";
import type { LifeExpectancyInput } from "../../src/life-expectancy";

const BASE: LifeExpectancyInput = {
  sex: "male",
  birthDate: "1965-02-08",
  accidentDate: "2015-10-12",
};

/** 0세 값 하나만 든 2000년 표. 퍼징에서 여명 값을 마음대로 고르기 위한 것. */
function singleValueDataset(value: number): LifeExpectancyDataset {
  const base = loadLifeExpectancyTable();
  return {
    ...base,
    mortalityBaseYear: 2000,
    tables: {
      male: [{ age: 0, remainingYears: value }],
      female: [{ age: 0, remainingYears: value }],
    },
    years: [{ mortalityBaseYear: 2000, ageFrom: 0, male: [value], female: [value] }],
  };
}

/** 엔진과 독립된 날짜 더하기 (UTC epoch 일수). */
function plusDays(iso: string, days: bigint): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + Number(days) * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

describe("computeLifeExpectancy", () => {
  it("직접 지정한 여명종료일이 단축값보다 우선한다", () => {
    const r = computeLifeExpectancy({
      ...BASE,
      shortening: { method: "remainingYears", years: 10 },
      endDateOverride: "2030-01-01",
    });
    expect(r.shortenedEndDate).toBe("2025-10-09");
    expect(r.endDate).toBe("2030-01-01");
    expect(r.endDateOverridden).toBe(true);
  });

  it("단축 입력이 없으면 단축 필드를 내지 않는다", () => {
    const r = computeLifeExpectancy(BASE);
    expect(r).not.toHaveProperty("shortenedEndDate");
    expect(r).not.toHaveProperty("shortenedRemainingYears");
    expect(r.endDate).toBe(r.normalEndDate);
  });

  it("만 나이: 생일 전날까지 한 살 적고, 2월 29일생은 평년 3월 1일에 나이를 먹는다", () => {
    expect(fullAge("1965-02-08", "2015-02-07")).toBe(49);
    expect(fullAge("1965-02-08", "2015-02-08")).toBe(50);
    expect(fullAge("2000-02-29", "2001-02-28")).toBe(0);
    expect(fullAge("2000-02-29", "2001-03-01")).toBe(1);
    expect(fullAge("2000-02-29", "2004-02-29")).toBe(4);
  });

  it("101세 이상은 표에 없어 RangeError", () => {
    expect(() =>
      computeLifeExpectancy({ sex: "female", birthDate: "1910-01-01", accidentDate: "2015-01-01" }),
    ).toThrow(/만 105세/);
  });

  it.each([
    [{ ...BASE, basis: "appraisal" as const }, /appraisalDate 가 필요/],
    [{ ...BASE, appraisalDate: "2015-10-11" }, /appraisalDate 는 accidentDate 이후/],
    [{ ...BASE, accidentDate: "1965-02-07" }, /accidentDate 는 birthDate 이후/],
    [{ ...BASE, endDateOverride: "2015-10-11" }, /endDateOverride/],
    [{ ...BASE, shortening: { method: "percent" as const, percent: 0 } }, /percent/],
    [{ ...BASE, shortening: { method: "percent" as const, percent: 100.5 } }, /percent/],
    [{ ...BASE, shortening: { method: "percent" as const, percent: 33.333 } }, /percent/],
    [{ ...BASE, shortening: { method: "subtractYears" as const, years: -1 } }, /years/],
    [{ ...BASE, shortening: { method: "remainingYears" as const, years: 0 } }, /years/],
    [{ ...BASE, shortening: { method: "subtractYears" as const, years: 30.83 } }, /0년 이하/],
  ])("입력 검증 %#", (input, message) => {
    expect(() => computeLifeExpectancy(input)).toThrow(message);
  });

  // 소수 둘째 자리 여명 전 범위 x 5% 단위 백분율·정수 년 차감을 BigInt 손계산과 대조한다.
  // 부동소수로 여명 × 365 를 곱하면 .x5 경계에서 1일씩 어긋나는 값이 생긴다.
  it("퍼징: 여명 0.01~99.99 x 백분율 5% 단위 / 정수 년 차감", () => {
    const base = "2000-01-01";
    const input: LifeExpectancyInput = { sex: "male", birthDate: base, accidentDate: base };
    for (let h = 1; h < 10_000; h += 1) {
      const deps = { lifeExpectancy: singleValueDataset(h / 100) };
      const H = BigInt(h);
      expect(computeLifeExpectancy(input, deps).normalEndDate).toBe(
        plusDays(base, (H * 365n) / 100n),
      );
      if (h % 7 !== 0) continue; // 백분율·차감은 표본만 (속도)
      for (let p = 5; p <= 100; p += 5) {
        const r = computeLifeExpectancy(
          { ...input, shortening: { method: "percent", percent: p } },
          deps,
        );
        expect(r.shortenedEndDate).toBe(plusDays(base, (H * BigInt(p) * 365n) / 10_000n));
      }
      for (let n = 1; n * 100 < h; n += 1) {
        const r = computeLifeExpectancy(
          { ...input, shortening: { method: "subtractYears", years: n } },
          deps,
        );
        expect(r.shortenedEndDate).toBe(plusDays(base, ((H - BigInt(n) * 100n) * 365n) / 100n));
      }
    }
  });
});
