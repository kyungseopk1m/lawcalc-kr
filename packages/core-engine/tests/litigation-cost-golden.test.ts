import { describe, expect, it } from "vitest";

import { computeStampDuty, type StampDutyInput } from "../src";

const GOLDEN_FIXTURE_SCHEMA = "1";
const FROZEN_AT = "2026-07-02T00:00:00.000Z";

interface ExpectedShape {
  amount: number;
  dataVersion: string;
}

interface GoldenCase {
  schemaVersion: string;
  id: string;
  title: string;
  source: string;
  notes?: string;
  input: StampDutyInput;
  expected: ExpectedShape;
  metadata: {
    oracle: string;
    derivedAt: string;
    derivedBy: string;
    externalCapture?: {
      source: string;
      sourceUrl: string;
      capturedAt: string;
      method: string;
    };
  };
}

const modules = import.meta.glob<GoldenCase>("./golden/litigation-cost/*.json", {
  eager: true,
  import: "default",
});

const cases: GoldenCase[] = Object.entries(modules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, value]) => value);

/**
 * 소송비용(인지액) 골든 — v0.10.0 외부 대조 세트.
 * oracle = `"statute-derivation"` (인지법 제2조·제3조·제7조·제16조 정수 손계산) +
 * 대한법률구조공단 자동계산(클라이언트 JS) 캡처 교차 검증. KLAC 자체 float 오차가 있는
 * 케이스는 fixture notes 에 차이와 근거를 명시한다.
 * 본 세트가 v0.10.0 에서 인지대 구간식 오적용(소가 전체 × 요율 + 보정상수를 구간별
 * 누진식으로 계산, 1천만원 이상 전 구간 과소)을 잡아냈다.
 */
describe("litigation-cost golden cases (v0.10.0 — 인지법 손계산 + KLAC 외부 대조)", () => {
  it("loads at least 5 cases", () => {
    expect(cases.length).toBeGreaterThanOrEqual(5);
  });

  it("all fixtures match GOLDEN_FIXTURE_SCHEMA and use statute-derivation oracle", () => {
    for (const c of cases) {
      expect(c.schemaVersion, `${c.id} schemaVersion`).toBe(GOLDEN_FIXTURE_SCHEMA);
      expect(c.metadata.oracle, `${c.id} oracle`).toBe("statute-derivation");
      expect(c.metadata.externalCapture?.sourceUrl, `${c.id} externalCapture`).toContain(
        "klac.or.kr",
      );
    }
  });

  for (const c of cases) {
    it(`${c.id}: ${c.title}`, () => {
      const result = computeStampDuty(c.input, { computedAt: FROZEN_AT });
      expect(result.amount, `${c.id} amount`).toBe(c.expected.amount);
      expect(result.dataVersion, `${c.id} dataVersion`).toBe(c.expected.dataVersion);
    });
  }
});
