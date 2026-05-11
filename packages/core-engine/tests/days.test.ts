import { describe, expect, it } from "vitest";

import { addDays, addYears, containsLeapDay, countDays, daysInYear, isLeapYear } from "../src";

describe("countDays", () => {
  it("includes the end date and respects includeFirstDay=false (default 실무)", () => {
    expect(
      countDays("2024-01-01", "2024-01-31", { leapYear: "actual", includeFirstDay: false }),
    ).toBe(30);
  });

  it("adds the first day when includeFirstDay=true", () => {
    expect(
      countDays("2024-01-01", "2024-01-31", { leapYear: "actual", includeFirstDay: true }),
    ).toBe(31);
  });

  it("returns 0 for same-day with includeFirstDay=false", () => {
    expect(
      countDays("2024-05-09", "2024-05-09", { leapYear: "actual", includeFirstDay: false }),
    ).toBe(0);
  });

  it("returns 1 for same-day with includeFirstDay=true", () => {
    expect(
      countDays("2024-05-09", "2024-05-09", { leapYear: "actual", includeFirstDay: true }),
    ).toBe(1);
  });

  it("counts leap-year February correctly (29 days)", () => {
    expect(
      countDays("2024-02-01", "2024-02-29", { leapYear: "actual", includeFirstDay: true }),
    ).toBe(29);
  });

  it("counts non-leap February correctly (28 days)", () => {
    expect(
      countDays("2023-02-01", "2023-02-28", { leapYear: "actual", includeFirstDay: true }),
    ).toBe(28);
  });

  it("crosses year boundary correctly", () => {
    // 2023-12-31 → 2024-01-01, 초일 불산입 = 1일
    expect(
      countDays("2023-12-31", "2024-01-01", { leapYear: "actual", includeFirstDay: false }),
    ).toBe(1);
  });

  it("throws when to < from", () => {
    expect(() =>
      countDays("2024-05-10", "2024-05-09", { leapYear: "actual", includeFirstDay: false }),
    ).toThrow(/before/);
  });

  it("throws on invalid date strings", () => {
    expect(() =>
      countDays("2024-13-01", "2024-12-31", { leapYear: "actual", includeFirstDay: false }),
    ).toThrow(/Invalid/);
    expect(() =>
      countDays("2024-02-30", "2024-12-31", { leapYear: "actual", includeFirstDay: false }),
    ).toThrow(/Invalid calendar date/);
  });
});

describe("isLeapYear / daysInYear", () => {
  it("knows the Gregorian leap-year rules", () => {
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2023)).toBe(false);
  });

  it("returns 365 for fixed365 regardless of year", () => {
    expect(daysInYear(2024, "fixed365")).toBe(365);
    expect(daysInYear(2000, "fixed365")).toBe(365);
  });

  it("returns actual days for actual mode", () => {
    expect(daysInYear(2024, "actual")).toBe(366);
    expect(daysInYear(2023, "actual")).toBe(365);
  });
});

describe("containsLeapDay", () => {
  it("detects 2/29 inside the range", () => {
    expect(containsLeapDay("2024-01-01", "2024-12-31")).toBe(true);
    expect(containsLeapDay("2024-02-29", "2024-02-29")).toBe(true);
    expect(containsLeapDay("2024-02-28", "2024-03-01")).toBe(true);
  });

  it("returns false when the range misses 2/29", () => {
    expect(containsLeapDay("2024-03-01", "2024-12-31")).toBe(false);
    expect(containsLeapDay("2023-01-01", "2023-12-31")).toBe(false);
    expect(containsLeapDay("2025-02-01", "2025-12-31")).toBe(false);
  });

  it("외부 reference 매뉴얼 예시: 2015-05-01 시작 1년이면 2016-04-30까지 → 2016-02-29 포함 (366)", () => {
    expect(containsLeapDay("2015-05-01", "2016-04-30")).toBe(true);
  });

  it("외부 reference 매뉴얼 반례: 2016-05-01 시작 1년이면 2017-04-30 → 윤일 없음 (365)", () => {
    expect(containsLeapDay("2016-05-01", "2017-04-30")).toBe(false);
  });
});

describe("addDays / addYears", () => {
  it("addDays handles month/year wrap", () => {
    expect(addDays("2024-01-31", 1)).toBe("2024-02-01");
    expect(addDays("2024-12-31", 1)).toBe("2025-01-01");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
  });

  it("addYears clips 02-29 to 02-28 in non-leap target year", () => {
    expect(addYears("2024-02-29", 1)).toBe("2025-02-28");
    expect(addYears("2024-02-29", 4)).toBe("2028-02-29");
    expect(addYears("2023-05-01", 1)).toBe("2024-05-01");
  });
});
