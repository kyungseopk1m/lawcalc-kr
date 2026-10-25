import { describe, expect, it } from "vitest";
import {
  computeStaleBadge,
  LABOR_RATES_CADENCE,
  LIFE_EXPECTANCY_CADENCE,
} from "../src/stale-badge";

describe("computeStaleBadge", () => {
  it("반기 상반기 판(2026-01-01)은 다음 판 2026-09-01 + 6개월 전날까지 neutral", () => {
    const result = computeStaleBadge("2026-01-01", "2027-02-28", LABOR_RATES_CADENCE);
    expect(result.level).toBe("neutral");
    expect(result.nextEditionDate).toBe("2026-09-01");
    expect(result.monthsElapsed).toBe(13);
  });

  it("반기 상반기 판은 2027-03-01 부터 amber", () => {
    expect(computeStaleBadge("2026-01-01", "2027-03-01", LABOR_RATES_CADENCE).level).toBe("amber");
  });

  it("반기 하반기 판(2026-09-01)은 다음 판 2027-01-01, 2027-07-01 부터 amber", () => {
    const before = computeStaleBadge("2026-09-01", "2027-06-30", LABOR_RATES_CADENCE);
    expect(before.nextEditionDate).toBe("2027-01-01");
    expect(before.level).toBe("neutral");
    expect(computeStaleBadge("2026-09-01", "2027-07-01", LABOR_RATES_CADENCE).level).toBe("amber");
  });

  it("연 1회 판(2024-12-04)은 다음 판 2025-12-01, 2026-06-01 부터 amber", () => {
    const before = computeStaleBadge("2024-12-04", "2026-05-31", LIFE_EXPECTANCY_CADENCE);
    expect(before.nextEditionDate).toBe("2025-12-01");
    expect(before.level).toBe("neutral");
    expect(computeStaleBadge("2024-12-04", "2026-06-01", LIFE_EXPECTANCY_CADENCE).level).toBe(
      "amber",
    );
  });

  it("오늘이 기준일보다 앞이면 neutral, 경과 0개월", () => {
    const result = computeStaleBadge("2026-01-01", "2025-12-01", LABOR_RATES_CADENCE);
    expect(result.level).toBe("neutral");
    expect(result.monthsElapsed).toBe(0);
  });

  it("문구와 빨강 단계를 돌려주지 않는다", () => {
    const result = computeStaleBadge("2020-01-01", "2026-10-25", LABOR_RATES_CADENCE);
    expect(result.level).toBe("amber");
    expect(Object.keys(result).sort()).toEqual(["level", "monthsElapsed", "nextEditionDate"]);
  });

  it("rejects malformed ISO dates", () => {
    expect(() => computeStaleBadge("2026/01/01", "2026-07-01", LABOR_RATES_CADENCE)).toThrow(
      RangeError,
    );
    expect(() => computeStaleBadge("2026-01-01", "20260701", LABOR_RATES_CADENCE)).toThrow(
      RangeError,
    );
    expect(() => computeStaleBadge("2026-13-01", "2026-07-01", LABOR_RATES_CADENCE)).toThrow(
      RangeError,
    );
  });

  it("존재하지 않는 달력 날짜(2026-02-30)는 거부하고 윤일(2024-02-29)은 받는다", () => {
    expect(() => computeStaleBadge("2026-02-30", "2026-07-01", LABOR_RATES_CADENCE)).toThrow(
      RangeError,
    );
    expect(() => computeStaleBadge("2024-02-29", "2026-07-01", LABOR_RATES_CADENCE)).not.toThrow();
  });

  it("잘못된 공표 주기는 거부한다", () => {
    expect(() => computeStaleBadge("2026-01-01", "2026-07-01", [])).toThrow(RangeError);
    expect(() => computeStaleBadge("2026-01-01", "2026-07-01", [13])).toThrow(RangeError);
  });
});
