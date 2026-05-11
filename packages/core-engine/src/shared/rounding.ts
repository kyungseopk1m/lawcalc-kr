import type { CalcOptions } from "../types";

export type RoundingMode = NonNullable<CalcOptions["rounding"]>;

/**
 * 원 단위 끝수 처리. v2 도입.
 *
 * 매뉴얼 매핑 (외부 reference 매뉴얼, private):
 * - "floor" → 절사 (채권자 보수, default)
 * - "ceil"  → 절상 (채무자 보수)
 * - "round" → 사사오입 (`Math.round` 의 half-away-from-zero, JS 표준)
 *
 * @internal package-internal helper — `index.ts` 미export. caller 도메인 (`interest.ts`,
 * 향후 `appropriation`) 이 raw 값을 받아 본 함수로 정수 변환.
 */
export function applyRounding(value: number, mode: RoundingMode): number {
  switch (mode) {
    case "ceil":
      return Math.ceil(value);
    case "round":
      return Math.round(value);
    case "floor":
    default:
      return Math.floor(value);
  }
}
