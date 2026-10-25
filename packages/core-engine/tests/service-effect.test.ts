import { describe, expect, it } from "vitest";

import {
  buildServiceEffectCalendar,
  computeServiceEffect,
  createHolidayDeps,
  type ServiceEffectOptions,
} from "../src";

const deps = createHolidayDeps();

/**
 * VK 실측 (2026-09 송달일 7개, "08년 이후" 규칙). 다섯 번째 송달일은 9.10 이다.
 * 9.14 로 두면 7일 상소기간 만료(9.21)·15일 표기(9.29)가 VK 값(9.17·9.28)과 어긋나고,
 * 9.10 이면 일곱 열 전부가 맞는다 (9.10 + 7 = 9.17, 9.10 + 15 = 9.25 추석 → 9.28).
 */
const SERVICE = ["09-01", "09-04", "09-05", "09-09", "09-10", "09-17", "09-26"].map(
  (d) => `2026-${d}`,
);

function run(options: ServiceEffectOptions): string[] {
  return SERVICE.map((serviceDate) =>
    computeServiceEffect({ ...options, serviceDate }, deps).date.slice(5),
  );
}

describe("computeServiceEffect · VK 실측 재현", () => {
  it("공시송달 효력 day14 (기본)", () => {
    expect(run({ kind: "publicServiceEffect" })).toEqual([
      "09-16",
      "09-19",
      "09-22",
      "09-24",
      "09-29",
      "10-02",
      "10-13",
    ]);
  });

  it("공시송달 효력 day15", () => {
    expect(run({ kind: "publicServiceEffect", basis: "day15" })).toEqual([
      "09-16",
      "09-21",
      "09-21",
      "09-28",
      "09-28",
      "10-02",
      "10-12",
    ]);
  });

  it("상소기간 14일 만료", () => {
    expect(run({ kind: "appealExpiry", days: 14 })).toEqual([
      "09-15",
      "09-18",
      "09-21",
      "09-23",
      "09-28",
      "10-01",
      "10-12",
    ]);
  });

  it("상소기간 7일 만료: 9.26 송달은 10.5 대체공휴일까지 넘어 10.6 (VK 는 대체공휴일이 없어 10.5)", () => {
    expect(run({ kind: "appealExpiry", days: 7 })).toEqual([
      "09-08",
      "09-11",
      "09-14",
      "09-16",
      "09-17",
      "09-28",
      "10-06",
    ]);
  });

  it("확정일 14일 / 7일", () => {
    expect(run({ kind: "finalDate", days: 14 })).toEqual([
      "09-16",
      "09-19",
      "09-22",
      "09-24",
      "09-29",
      "10-02",
      "10-13",
    ]);
    expect(run({ kind: "finalDate", days: 7 })).toEqual([
      "09-09",
      "09-12",
      "09-15",
      "09-17",
      "09-18",
      "09-29",
      "10-07",
    ]);
  });

  it("2008-03-22 계속 사건: 토요일은 연장하지 않는다 (추석 연휴 토요일 9.26 은 공휴일이라 연장)", () => {
    expect(run({ kind: "appealExpiry", days: 14, pendingOn20080322: true })).toEqual([
      "09-15",
      "09-18",
      "09-19",
      "09-23",
      "09-28",
      "10-01",
      "10-10",
    ]);
    expect(run({ kind: "publicServiceEffect", pendingOn20080322: true })).toEqual([
      "09-16",
      "09-19",
      "09-20",
      "09-24",
      "09-29",
      "10-02",
      "10-11",
    ]);
  });

  it("day14 효력발생일은 2주 상소기간의 확정일과 같은 규칙이다", () => {
    expect(run({ kind: "publicServiceEffect" })).toEqual(run({ kind: "finalDate", days: 14 }));
  });
});

describe("computeServiceEffect · 결과 형태", () => {
  it("밀린 경우 pushed · 사유 · 조문을 싣는다", () => {
    const r = computeServiceEffect({ kind: "appealExpiry", serviceDate: "2026-09-05" }, deps);
    expect(r).toMatchObject({ date: "2026-09-21", periodEnd: "2026-09-21", pushed: true });
    expect(r.holidayExtension).toBe("applied");
    expect(r.articles).toEqual([
      "민사소송법 제396조 제1항",
      "민사소송법 제170조",
      "민법 제157조",
      "민법 제159조",
      "민법 제161조",
    ]);
    expect(r.reasonKo).toContain("제161조");
  });

  it("확정일은 제498조를 인용한다", () => {
    const r = computeServiceEffect({ kind: "finalDate", days: 7, serviceDate: "2026-09-01" }, deps);
    expect(r.articles).toContain("민사소송법 제444조 제1항");
    expect(r.articles.at(-1)).toBe("민사소송법 제498조");
    expect(r.formulaText).toContain("2026-09-09 확정");
  });

  it("그 뒤의 공시송달은 실시한 다음 날", () => {
    const r = computeServiceEffect(
      { kind: "publicServiceEffect", variant: "subsequent", serviceDate: "2026-09-26" },
      deps,
    );
    expect(r).toMatchObject({ date: "2026-09-27", pushed: false, holidayExtension: "off" });
  });

  it("외국 공시송달은 2월 기간이 지난 다음 날", () => {
    // 2026-09-01 실시 → 9.2 기산 2월 → 11.1(일) 만료 → 제161조 11.2 → 효력 11.3
    const r = computeServiceEffect(
      { kind: "publicServiceEffect", variant: "foreign", serviceDate: "2026-09-01" },
      deps,
    );
    expect(r).toMatchObject({ periodEnd: "2026-11-02", date: "2026-11-03", pushed: true });
    expect(r.articles[0]).toBe("민사소송법 제196조 제2항");
  });

  it("day15 는 문언 밖 표기 방식이라는 고지를 단다", () => {
    const r = computeServiceEffect(
      { kind: "publicServiceEffect", basis: "day15", serviceDate: "2026-09-09" },
      deps,
    );
    expect(r).toMatchObject({ date: "2026-09-28", pushed: true });
    expect(r.periodEnd).toBeUndefined();
    expect(r.noteKo).toContain("표기 방식");
  });

  it("공휴일 커버리지 밖이면 밀지 않고 outOfCoverage", () => {
    const r = computeServiceEffect({ kind: "appealExpiry", serviceDate: "1990-01-01" }, deps);
    expect(r.holidayExtension).toBe("outOfCoverage");
    expect(r.pushed).toBe(false);
  });

  it("잘못된 입력은 한국어 RangeError", () => {
    expect(() =>
      computeServiceEffect({ kind: "appealExpiry", serviceDate: "2026-02-30" }, deps),
    ).toThrow(/serviceDate/);
    expect(() =>
      computeServiceEffect(
        { kind: "appealExpiry", days: 10 as 7, serviceDate: "2026-09-01" },
        deps,
      ),
    ).toThrow(/days/);
  });
});

describe("buildServiceEffectCalendar", () => {
  it("가운데 달을 중심으로 3개월 날짜마다 결과를 낸다", () => {
    const cal = buildServiceEffectCalendar(2026, 9, { kind: "appealExpiry", days: 7 }, deps);
    expect(cal).toHaveLength(31 + 30 + 31);
    expect(cal[0]!.serviceDate).toBe("2026-08-01");
    expect(cal.at(-1)!.serviceDate).toBe("2026-10-31");
    const s26 = cal.find((r) => r.serviceDate === "2026-09-26")!;
    expect(s26).toMatchObject({ date: "2026-10-06", pushed: true });
  });

  it("연 경계를 넘는다", () => {
    const cal = buildServiceEffectCalendar(2026, 1, { kind: "publicServiceEffect" }, deps);
    expect(cal[0]!.serviceDate).toBe("2025-12-01");
    expect(cal.at(-1)!.serviceDate).toBe("2026-02-28");
  });

  // Date.UTC(99, …) 는 1999 년이 된다. 입력 중인 "0099" 같은 연도를 1900 년대로 바꾸지 않는다.
  it("네 자리가 아닌 연도는 한국어 RangeError", () => {
    for (const year of [0, 99, 999, 10000]) {
      expect(() => buildServiceEffectCalendar(year, 5, { kind: "finalDate" }, deps)).toThrow(
        /연도는 1000~9999/,
      );
    }
  });

  it("잘못된 달은 거부", () => {
    expect(() => buildServiceEffectCalendar(2026, 13, { kind: "finalDate" }, deps)).toThrow(
      RangeError,
    );
  });
});
