import type { InterestInput, RateSegment } from "./types";

/**
 * 입력을 startDate~endDate 안에서 RateSegment 배열로 정규화한다.
 *
 * 구현 예정 (W2):
 * - input.segments가 있으면 그대로 사용 (검증 + 정렬)
 * - 없으면 legalRatePreset과 법정이율 데이터셋의 변경 이력으로 자동 분할
 */
export function resolveSegments(input: InterestInput): RateSegment[] {
  throw new Error(
    `resolveSegments(${input.startDate} → ${input.endDate}) is not implemented yet (W2)`,
  );
}
