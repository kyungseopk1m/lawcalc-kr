import { describe, expect, it } from "vitest";

import { calculateInterest, type InterestInput } from "../src";

interface GoldenCase {
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
 * 2. 외부 기준 일치 — 법원 프로그램/매뉴얼 캡처 (`source: ...`)
 *
 * W2에서는 1번 위주, 매뉴얼 예시 인용 케이스 1건 포함 (case-007).
 * Windows VM에서 ejpc.scourt.go.kr 캡처 케이스는 후속 W에서 추가하며,
 * 그때 source 필드를 그대로 갱신해 출처 변화를 추적한다.
 *
 * 주의: tests/golden.test.ts는 vitest.golden.config.ts 로 격리 실행한다 (`pnpm test:golden`).
 */
describe("golden cases (회귀 + 외부 기준 일치)", () => {
  it("loads at least 5 cases (W2 minimum)", () => {
    expect(cases.length).toBeGreaterThanOrEqual(5);
  });

  for (const c of cases) {
    it(`${c.id}: ${c.title}`, () => {
      const result = calculateInterest(c.input);

      expect(result.dataVersion).toBe(c.expected.dataVersion);
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
