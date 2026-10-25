import { describe, expect, it } from "vitest";

import { computeDelayDamages } from "../../src/delay-damages";
import type { DelayDamagesInput } from "../../src/delay-damages";

interface GoldenCase {
  id: string;
  input: DelayDamagesInput;
  expected: {
    segments: Array<{ from: string; to: string; rate: number; interest: number }>;
    totalInterest: number;
    grandTotal: number;
  };
  metadata: { oracle: string; derivedAt: string; derivedBy: string };
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
const modules = import.meta.glob<GoldenCase>("../golden/delay-damages/*.json", {
  eager: true,
  import: "default",
});

// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
const cases: GoldenCase[] = Object.values(modules);

/** 지연손해금 골든. 기대값은 r2b2-golden-derivation-2026-10-04.md B9 절 손계산. */
describe("delay damages golden cases", () => {
  it("loads exactly 3 cases", () => {
    expect(cases).toHaveLength(3);
  });

  it.each(cases.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    expect(c.metadata.oracle).toBe("manual-derivation");
    const r = computeDelayDamages(c.input);
    expect(
      r.segments.map(({ from, to, rate, interest }) => ({ from, to, rate, interest })),
    ).toEqual(c.expected.segments);
    expect(r.totalInterest).toBe(c.expected.totalInterest);
    expect(r.grandTotal).toBe(c.expected.grandTotal);
  });
});
