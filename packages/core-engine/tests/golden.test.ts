import { describe, expect, it } from "vitest";

import { calculateInterest, STANDARD_DISCLAIMER, type InterestInput } from "../src";
import { findCoverageViolations, type GoldenCoverage } from "./golden-coverage";

/**
 * 골든 fixture 의 schema 버전. v1 = W2 도입 시점.
 *
 * 추후 골든 fixture 자체의 형식이 변경되면 (예: rounding 옵션 명시, segment formula 비교 추가)
 * 이 상수와 case JSON 의 `schemaVersion` 양쪽을 함께 올린다. 본 상수와 다른 버전을 가진
 * fixture 는 테스트에서 명시적으로 실패시켜 누락 변경을 잡는다.
 */
const GOLDEN_FIXTURE_SCHEMA = "1";

interface GoldenCase {
  schemaVersion: string;
  id: string;
  title: string;
  source: string;
  notes?: string;
  input: InterestInput;
  expected: {
    totalInterest: number;
    grandTotal: number;
    dataVersion: string;
    segments: Array<{
      from: string;
      to: string;
      days: number;
      rate: number;
      interest: number;
    }>;
  };
}

/**
 * Vite/Vitest의 `import.meta.glob` 으로 골든 JSON 을 빌드 타임에 모두 정적으로 인라인한다.
 * `fs/path/url` 의존을 제거해 `@types/node` 없이도 typed lint가 통과한다.
 */
const modules = import.meta.glob<GoldenCase>("./golden/*.json", {
  eager: true,
  import: "default",
});

const cases: GoldenCase[] = Object.entries(modules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, value]) => value);

/**
 * 골든 테스트는 두 가지 의미를 동시에 갖는다:
 * 1. 회귀 테스트 — 엔진의 의도된 동작을 고정 (`source: engine-internal-w2`)
 * 2. 외부 기준 일치 — 외부 reference 도구/매뉴얼 캡처 (`source: ...`)
 *
 * W2에서는 1번 위주, 윤일 분모 366 산정을 독립 유도한 케이스 1건 포함 (case-007).
 * Windows VM에서 외부 reference site 캡처 케이스는 후속 W에서 추가하며,
 * 그때 source 필드를 그대로 갱신해 출처 변화를 추적한다.
 *
 * 주의: tests/golden.test.ts는 vitest.golden.config.ts 로 격리 실행한다 (`pnpm test:golden`).
 */
const COVERAGE: GoldenCoverage = {
  pinned: [
    "principal",
    "totalInterest",
    "grandTotal",
    "dataVersion",
    "disclaimer",
    "segments[].from",
    "segments[].to",
    "segments[].days",
    "segments[].rate",
    "segments[].interest",
  ],
  unpinned: {
    computedAt: "실행 시각이라 비결정이다.",
    "options.mode":
      "입력 그대로의 패스스루. rounding.test.ts 의 result.options 패스스루 절이 덮는다.",
    "options.includeFirstDay":
      "입력 그대로의 패스스루. 초일산입 자체의 일수 단언은 days.test.ts 가 덮는다.",
    "options.leapYear": "입력 그대로의 패스스루. 윤년 분모 단언은 edge.test.ts 가 덮는다.",
    "segments[].formula": "사람이 읽는 표시 문자열. 분모 표기 단언은 edge.test.ts 가 덮는다.",
  },
};

describe("golden cases (회귀 + 외부 기준 일치)", () => {
  it("loads at least 5 cases (W2 minimum)", () => {
    expect(cases.length).toBeGreaterThanOrEqual(5);
  });

  it("결과의 모든 필드가 골든 선언에 잡힌다 (미검사 필드 0)", () => {
    const results = cases.map((c) => calculateInterest(c.input));
    expect(findCoverageViolations(results, COVERAGE)).toEqual([]);
  });

  it("all cases match GOLDEN_FIXTURE_SCHEMA (v2 옵션 도입 대비 schema gate)", () => {
    for (const c of cases) {
      expect(c.schemaVersion, `${c.id} schemaVersion`).toBe(GOLDEN_FIXTURE_SCHEMA);
    }
  });

  for (const c of cases) {
    it(`${c.id}: ${c.title}`, () => {
      const result = calculateInterest(c.input);

      expect(result.dataVersion).toBe(c.expected.dataVersion);
      expect(result.principal, `${c.id} principal`).toBe(c.input.principal);
      expect(result.disclaimer, `${c.id} disclaimer`).toBe(STANDARD_DISCLAIMER);
      expect(result.totalInterest).toBe(c.expected.totalInterest);
      expect(result.grandTotal).toBe(c.expected.grandTotal);
      expect(result.segments).toHaveLength(c.expected.segments.length);

      for (let i = 0; i < c.expected.segments.length; i++) {
        const expected = c.expected.segments[i]!;
        const actual = result.segments[i]!;
        expect(actual.from, `${c.id} seg[${i}].from`).toBe(expected.from);
        expect(actual.to, `${c.id} seg[${i}].to`).toBe(expected.to);
        expect(actual.days, `${c.id} seg[${i}].days`).toBe(expected.days);
        expect(actual.rate, `${c.id} seg[${i}].rate`).toBe(expected.rate);
        expect(actual.interest, `${c.id} seg[${i}].interest`).toBe(expected.interest);
      }
    });
  }
});
