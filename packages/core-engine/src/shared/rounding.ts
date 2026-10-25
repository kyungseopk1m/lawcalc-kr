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

/** `num / den` (den > 0) 의 정확한 끝수 처리. "round" 는 0.5 를 0 에서 먼 쪽으로 (이자는 음수가 없다). */
export function applyRoundingExact(num: bigint, den: bigint, mode: RoundingMode): number {
  const q = num / den;
  const r = num % den;
  if (r === 0n) return Number(q);
  const floor = num < 0n ? q - 1n : q;
  switch (mode) {
    case "ceil":
      return Number(floor + 1n);
    case "round": {
      const twice = 2n * (num - floor * den);
      return Number(twice >= den ? floor + 1n : floor);
    }
    case "floor":
    default:
      return Number(floor);
  }
}
