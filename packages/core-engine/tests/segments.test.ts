import { describe, expect, it } from "vitest";

import { resolveSegments, type CalcOptions, type InterestInput } from "../src";

const opts: CalcOptions = { mode: "totalDays", leapYear: "actual", includeFirstDay: false };

describe("resolveSegments — explicit segments", () => {
  it("accepts contiguous segments that exactly span [start, end]", () => {
    const input: InterestInput = {
      principal: 1_000_000,
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      segments: [
        { from: "2024-01-01", to: "2024-06-30", rate: 0.05 },
        { from: "2024-07-01", to: "2024-12-31", rate: 0.06 },
      ],
      options: opts,
    };
    expect(resolveSegments(input)).toHaveLength(2);
  });

  it("rejects gaps", () => {
    const input: InterestInput = {
      principal: 1_000_000,
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      segments: [
        { from: "2024-01-01", to: "2024-06-29", rate: 0.05 },
        { from: "2024-07-01", to: "2024-12-31", rate: 0.06 },
      ],
      options: opts,
    };
    expect(() => resolveSegments(input)).toThrow(/contiguous|gap/);
  });

  it("rejects overlaps", () => {
    const input: InterestInput = {
      principal: 1_000_000,
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      segments: [
        { from: "2024-01-01", to: "2024-07-15", rate: 0.05 },
        { from: "2024-07-01", to: "2024-12-31", rate: 0.06 },
      ],
      options: opts,
    };
    expect(() => resolveSegments(input)).toThrow(/overlap/);
  });

  it("rejects segments that do not span [start, end] exactly", () => {
    const input: InterestInput = {
      principal: 1_000_000,
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      segments: [{ from: "2024-02-01", to: "2024-12-31", rate: 0.05 }],
      options: opts,
    };
    expect(() => resolveSegments(input)).toThrow(/startDate/);
  });
});

describe("resolveSegments — legalRatePreset auto-split (소촉법)", () => {
  it("splits at 2019-06-01 when range crosses the 15% → 12% change", () => {
    const input: InterestInput = {
      principal: 1_000_000,
      startDate: "2019-01-01",
      endDate: "2019-12-31",
      legalRatePreset: "promotion",
      options: opts,
    };
    const result = resolveSegments(input);
    expect(result).toEqual([
      { from: "2019-01-01", to: "2019-05-31", rate: 0.15 },
      { from: "2019-06-01", to: "2019-12-31", rate: 0.12 },
    ]);
  });

  it("splits at both 2015-10-01 and 2019-06-01 when range straddles 20% → 15% → 12%", () => {
    const input: InterestInput = {
      principal: 1_000_000,
      startDate: "2015-01-01",
      endDate: "2020-12-31",
      legalRatePreset: "promotion",
      options: opts,
    };
    const result = resolveSegments(input);
    expect(result).toEqual([
      { from: "2015-01-01", to: "2015-09-30", rate: 0.2 },
      { from: "2015-10-01", to: "2019-05-31", rate: 0.15 },
      { from: "2019-06-01", to: "2020-12-31", rate: 0.12 },
    ]);
  });

  it("returns single segment when range is entirely after the latest change", () => {
    const input: InterestInput = {
      principal: 1_000_000,
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      legalRatePreset: "promotion",
      options: opts,
    };
    expect(resolveSegments(input)).toEqual([{ from: "2024-01-01", to: "2024-12-31", rate: 0.12 }]);
  });

  // INT-1: 자동분할 커버리지 가드. 데이터셋 최초 시행일보다 앞선 구간이 입력되면
  // 종전엔 그 구간이 "조용히" 누락된 채 과소계산된 결과가 반환됐다 → 이제 명시적으로 throw.
  it("throws when the range starts before the dataset's earliest slice (no silent under-calc) [INT-1]", () => {
    // promotion 최초 슬라이스 = 2003-06-01. 시작일이 그 이전이면 leading gap.
    const input: InterestInput = {
      principal: 1_000_000,
      startDate: "2002-01-01",
      endDate: "2004-12-31",
      legalRatePreset: "promotion",
      options: opts,
    };
    expect(() => resolveSegments(input)).toThrow(/no rate covering 2002-01-01/);
  });

  it("still throws when the range is entirely before any slice (out.length === 0) [INT-1]", () => {
    const input: InterestInput = {
      principal: 1_000_000,
      startDate: "2001-01-01",
      endDate: "2002-12-31",
      legalRatePreset: "promotion",
      options: opts,
    };
    expect(() => resolveSegments(input)).toThrow(/no rate/);
  });

  it("does not throw when the range is fully covered from the earliest applicable slice [INT-1]", () => {
    const input: InterestInput = {
      principal: 1_000_000,
      startDate: "2010-01-01",
      endDate: "2024-12-31",
      legalRatePreset: "promotion",
      options: opts,
    };
    expect(() => resolveSegments(input)).not.toThrow();
  });
});

describe("resolveSegments — customRate", () => {
  it("returns a single segment with the custom rate", () => {
    const input: InterestInput = {
      principal: 1_000_000,
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      legalRatePreset: { customRate: 0.04 },
      options: opts,
    };
    expect(resolveSegments(input)).toEqual([{ from: "2024-01-01", to: "2024-12-31", rate: 0.04 }]);
  });

  it("rejects negative customRate", () => {
    const input: InterestInput = {
      principal: 1_000_000,
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      legalRatePreset: { customRate: -0.01 },
      options: opts,
    };
    expect(() => resolveSegments(input)).toThrow(/>= 0|customRate/);
  });
});

describe("resolveSegments — defensive errors", () => {
  it("rejects principal <= 0", () => {
    const input: InterestInput = {
      principal: 0,
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      legalRatePreset: "civil",
      options: opts,
    };
    expect(() => resolveSegments(input)).toThrow(/principal/);
  });

  it("rejects endDate < startDate", () => {
    const input: InterestInput = {
      principal: 100,
      startDate: "2024-12-31",
      endDate: "2024-01-01",
      legalRatePreset: "civil",
      options: opts,
    };
    expect(() => resolveSegments(input)).toThrow(/endDate/);
  });

  it("rejects neither segments nor preset", () => {
    const input: InterestInput = {
      principal: 100,
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      options: opts,
    };
    expect(() => resolveSegments(input)).toThrow(/segments or input\.legalRatePreset/);
  });
});
