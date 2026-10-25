import { describe, expect, it } from "vitest";

import { buildDetentionTable, computeDetentionDays } from "../src";

describe("computeDetentionDays (형법 제57조)", () => {
  // VK 실측, 기준일 2026-09-14: [시작일, 선고 기준, 석방 기준]
  const cases: [string, number, number][] = [
    ["2026-07-01", 75, 76],
    ["2026-08-01", 44, 45],
    ["2026-09-01", 13, 14],
    ["2026-09-13", 1, 2],
  ];
  it.each(cases)("%s → %i / %i", (startDate, sentencing, release) => {
    const base = { startDate, baseDate: "2026-09-14" };
    expect(computeDetentionDays({ ...base, basis: "sentencing" }).days).toBe(sentencing);
    expect(computeDetentionDays({ ...base, basis: "release" }).days).toBe(release);
  });

  it("같은 날이면 선고 기준 0, 석방 기준 1", () => {
    const base = { startDate: "2026-09-14", baseDate: "2026-09-14" };
    expect(computeDetentionDays({ ...base, basis: "sentencing" }).days).toBe(0);
    expect(computeDetentionDays({ ...base, basis: "release" }).days).toBe(1);
  });

  it("조문과 산식 서술", () => {
    const r = computeDetentionDays({
      startDate: "2026-09-01",
      baseDate: "2026-09-14",
      basis: "sentencing",
    });
    expect(r.articles).toEqual(["형법 제57조"]);
    expect(r.formulaText).toContain("13일");
  });

  it("기준일이 시작일보다 이르면 거부", () => {
    expect(() =>
      computeDetentionDays({ startDate: "2026-09-14", baseDate: "2026-09-13", basis: "release" }),
    ).toThrow(RangeError);
  });
});

describe("buildDetentionTable", () => {
  it("기준일 달 포함 3개월, 기준일까지", () => {
    const rows = buildDetentionTable("2026-09-14", "sentencing");
    expect(rows[0]).toEqual({ startDate: "2026-07-01", days: 75 });
    expect(rows.at(-1)).toEqual({ startDate: "2026-09-14", days: 0 });
    expect(rows).toHaveLength(31 + 31 + 14);
  });

  it("연 경계와 monthsBack", () => {
    const rows = buildDetentionTable("2026-01-10", "release", 2);
    expect(rows[0]).toEqual({ startDate: "2025-12-01", days: 41 });
    expect(() => buildDetentionTable("2026-01-10", "release", 0)).toThrow(RangeError);
    // 빈 기준일은 Date 의 영어 오류("Invalid time value")가 아니라 한국어 오류로 거절한다.
    expect(() => buildDetentionTable("", "release")).toThrow(/기준일 형식/);
  });

  // Date.UTC(99, …) 는 1999 년이 된다. 기준일 검증(parseIsoDateUtc 의 되짚기)이 0~99 년을 먼저
  // 막으므로 표가 1999 년부터 시작하지 않는다. 그 순서가 바뀌면 여기서 깨진다.
  it("0~99 년 기준일은 한국어 RangeError", () => {
    expect(() => buildDetentionTable("0099-05-01", "release")).toThrow(/기준일 형식/);
  });

  it("1000년 전 기준일은 빈 표가 아니라 한국어 오류", () => {
    expect(() => buildDetentionTable("0999-03-10", "sentencing")).toThrow(/1000 이상/);
  });
});
