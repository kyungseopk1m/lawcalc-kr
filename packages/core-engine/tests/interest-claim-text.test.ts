import { describe, expect, it } from "vitest";

import { buildInterestClaimText, formatCourtDate } from "../src/interest-claim-text";
import type { InterestSegment } from "../src/types";

function segment(from: string, to: string, rate: number): InterestSegment {
  return { from, to, rate, days: 0, formula: "", interest: 0 };
}

describe("formatCourtDate", () => {
  it("formats with court-style spacing and no leading zeros", () => {
    expect(formatCourtDate("2026-01-05")).toBe("2026. 1. 5.");
    expect(formatCourtDate("2026-12-31")).toBe("2026. 12. 31.");
  });

  it("rejects malformed input", () => {
    expect(() => formatCourtDate("2026/01/05")).toThrow(RangeError);
  });
});

describe("buildInterestClaimText", () => {
  it("renders a single-rate claim open-ended by default", () => {
    const text = buildInterestClaimText({
      principal: 10_000_000,
      segments: [segment("2026-01-01", "2026-12-31", 0.05)],
    });

    expect(text).toBe(
      "피고는 원고에게 10,000,000원 및 이에 대하여 2026. 1. 1.부터 다 갚는 날까지 연 5%의 비율로 계산한 돈을 지급하라.",
    );
  });

  it("renders a single-rate claim up to the calculation end date", () => {
    const text = buildInterestClaimText(
      {
        principal: 10_000_000,
        segments: [segment("2026-01-01", "2026-12-31", 0.05)],
      },
      { ending: "untilEndDate" },
    );

    expect(text).toBe(
      "피고는 원고에게 10,000,000원 및 이에 대하여 2026. 1. 1.부터 2026. 12. 31.까지 연 5%의 비율로 계산한 돈을 지급하라.",
    );
  });

  it("joins contiguous multi-rate segments with 그 다음 날부터 and 각 비율", () => {
    const text = buildInterestClaimText({
      principal: 10_000_000,
      segments: [
        segment("2026-01-01", "2026-06-30", 0.05),
        segment("2026-07-01", "2026-12-31", 0.12),
      ],
    });

    expect(text).toBe(
      "피고는 원고에게 10,000,000원 및 이에 대하여 2026. 1. 1.부터 2026. 6. 30.까지는 연 5%의, 그 다음 날부터 다 갚는 날까지는 연 12%의 각 비율로 계산한 돈을 지급하라.",
    );
  });

  it("keeps the calculation end date for multi-rate segments when requested", () => {
    const text = buildInterestClaimText(
      {
        principal: 10_000_000,
        segments: [
          segment("2026-01-01", "2026-06-30", 0.05),
          segment("2026-07-01", "2026-12-31", 0.12),
        ],
      },
      { ending: "untilEndDate" },
    );

    expect(text).toBe(
      "피고는 원고에게 10,000,000원 및 이에 대하여 2026. 1. 1.부터 2026. 6. 30.까지는 연 5%의, 그 다음 날부터 2026. 12. 31.까지는 연 12%의 각 비율로 계산한 돈을 지급하라.",
    );
  });

  it("spells out the start date when segments are not contiguous", () => {
    const text = buildInterestClaimText({
      principal: 1_000_000,
      segments: [
        segment("2026-01-01", "2026-06-30", 0.05),
        segment("2026-08-01", "2026-12-31", 0.12),
      ],
    });

    expect(text).toBe(
      "피고는 원고에게 1,000,000원 및 이에 대하여 2026. 1. 1.부터 2026. 6. 30.까지는 연 5%의, 2026. 8. 1.부터 다 갚는 날까지는 연 12%의 각 비율로 계산한 돈을 지급하라.",
    );
  });

  it("formats fractional rates without trailing zeros", () => {
    const text = buildInterestClaimText({
      principal: 5_000_000,
      segments: [segment("2026-01-01", "2026-12-31", 0.035)],
    });

    expect(text).toContain("연 3.5%의 비율로 계산한 돈");
  });

  it("formats common rates without IEEE754 noise [INT-4]", () => {
    for (const [rate, shown] of [
      [0.05, "연 5%"],
      [0.06, "연 6%"],
      [0.07, "연 7%"], // (0.07*100) 의 부동소수 꼬리(7.000000000000001)가 새지 않아야 함
      [0.0825, "연 8.25%"],
      [0.18, "연 18%"],
    ] as const) {
      const text = buildInterestClaimText({
        principal: 1_000_000,
        segments: [segment("2026-01-01", "2026-12-31", rate)],
      });
      expect(text).toContain(`${shown}의 비율로 계산한 돈`);
    }
  });

  it("renders multi-decimal agreement rates losslessly up to 10 percent-decimals [INT-4]", () => {
    const text = buildInterestClaimText({
      principal: 1_000_000,
      segments: [segment("2026-01-01", "2026-12-31", 0.123456)],
    });
    // 종전 maximumFractionDigits:3 은 12.346% 로 반올림했다. 이제 12.3456% 로 정확 표기.
    expect(text).toContain("연 12.3456%의 비율로 계산한 돈");
  });

  it("renders three chained segments in claim order", () => {
    const text = buildInterestClaimText({
      principal: 20_000_000,
      segments: [
        segment("2025-01-01", "2025-12-31", 0.05),
        segment("2026-01-01", "2026-06-30", 0.06),
        segment("2026-07-01", "2026-12-31", 0.12),
      ],
    });

    expect(text).toBe(
      "피고는 원고에게 20,000,000원 및 이에 대하여 2025. 1. 1.부터 2025. 12. 31.까지는 연 5%의, 그 다음 날부터 2026. 6. 30.까지는 연 6%의, 그 다음 날부터 다 갚는 날까지는 연 12%의 각 비율로 계산한 돈을 지급하라.",
    );
  });

  it("rejects an empty segment list", () => {
    expect(() => buildInterestClaimText({ principal: 1_000_000, segments: [] })).toThrow(
      RangeError,
    );
  });
});
