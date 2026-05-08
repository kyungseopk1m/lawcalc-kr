import type { InterestInput, InterestResult } from "./types";

/**
 * 이자 계산 메인 엔트리.
 *
 * 구현 예정 (W2):
 * 1. resolveSegments로 RateSegment[] 확정
 * 2. 각 구간에 대해 countDays + 이율 적용
 * 3. 부동소수점 정밀도(원 단위 정수 vs decimal.js)는 골든 케이스 수집 후 결정
 * 4. dataVersion / computedAt 메타데이터 기록
 */
export function calculateInterest(input: InterestInput): InterestResult {
  throw new Error(
    `calculateInterest(principal=${input.principal}, ${input.startDate} → ${input.endDate}) is not implemented yet (W2)`,
  );
}
