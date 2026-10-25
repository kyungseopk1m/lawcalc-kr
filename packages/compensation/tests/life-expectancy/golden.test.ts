import { describe, expect, it } from "vitest";

import { computeLifeExpectancy } from "../../src/life-expectancy";
import type { LifeExpectancyInput } from "../../src/life-expectancy";

interface GoldenCase {
  id: string;
  input: LifeExpectancyInput;
  expected: {
    baseDate: string;
    age: number;
    tableYear: number;
    remainingYears: number;
    normalEndDate: string;
    shortenedRemainingYears?: number;
    shortenedEndDate?: string;
    endDate: string;
    endDateOverridden: boolean;
    warningCodes: string[];
  };
  metadata: { oracle: string; derivedAt: string; derivedBy: string };
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
const modules = import.meta.glob<GoldenCase>("../golden/life-expectancy/*.json", {
  eager: true,
  import: "default",
});

// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
const cases: GoldenCase[] = Object.values(modules);

/** 여명종료일 골든. 기대값은 r2b2-golden-derivation-b7-2026-10-04.md 손계산. */
describe("life expectancy golden cases", () => {
  it("loads exactly 8 cases", () => {
    expect(cases).toHaveLength(8);
  });

  it.each(cases.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    expect(c.metadata.oracle).toBe("manual-derivation");
    const { warnings, ...rest } = computeLifeExpectancy(c.input);
    const { warningCodes, ...expected } = c.expected;
    expect(rest).toEqual(expected);
    expect(warnings.map((w) => w.code)).toEqual(warningCodes);
  });
});
