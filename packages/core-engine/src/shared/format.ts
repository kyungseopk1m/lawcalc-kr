/**
 * 사람이 읽는 표기 헬퍼 (formula 출력 전용, 계산 영향 없음).
 *
 * `formatPrincipal(1_000_000)` → `"1,000,000원"`
 * `formatRatePercent(0.05)`    → `"5%"`
 * `formatRatePercent(0.123)`   → `"12.3%"` (부동소수점 잡음 정리: toFixed(10) → Number)
 *
 * 통일 표기: `1,000,000원 × 5% × 100일 / 365` (한글/%, B-W5 컨펌).
 *
 * @internal package-internal helper — `index.ts` 미export. 도메인 간 formula 표기 통일용.
 */
export function formatPrincipal(principal: number): string {
  return `${principal.toLocaleString("en-US")}원`;
}
export function formatRatePercent(rate: number): string {
  return `${Number((rate * 100).toFixed(10))}%`;
}
