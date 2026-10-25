/**
 * 지연손해금 입력 검증. 실패 시 RangeError (한국어 메시지).
 */

import type { DelayDamagesInput } from "./types";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PREFIX = "지연손해금 입력 검증 실패";

function assertIsoDate(label: string, value: unknown): void {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) {
    throw new RangeError(`${PREFIX}: ${label} 는 YYYY-MM-DD 형식이어야 합니다.`);
  }
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const reconstructed = new Date(Date.UTC(y, m - 1, d));
  if (
    reconstructed.getUTCFullYear() !== y ||
    reconstructed.getUTCMonth() !== m - 1 ||
    reconstructed.getUTCDate() !== d
  ) {
    throw new RangeError(`${PREFIX}: ${label} 는 유효한 날짜여야 합니다.`);
  }
}

export function validateDelayDamagesInput(input: DelayDamagesInput): void {
  if (input === null || typeof input !== "object") {
    throw new RangeError(`${PREFIX}: 입력 객체가 필요합니다.`);
  }
  const p = input.principalWon;
  if (typeof p !== "number" || !Number.isSafeInteger(p) || p <= 0) {
    throw new RangeError(`${PREFIX}: principalWon 는 양의 정수여야 합니다.`);
  }
  assertIsoDate("startDate", input.startDate);
  assertIsoDate("judgmentDate", input.judgmentDate);
  assertIsoDate("endDate", input.endDate);
  if (input.firstInstanceClosingDate !== undefined) {
    assertIsoDate("firstInstanceClosingDate", input.firstInstanceClosingDate);
    if (
      input.firstInstanceClosingDate < input.startDate ||
      input.firstInstanceClosingDate > input.judgmentDate
    ) {
      throw new RangeError(
        `${PREFIX}: firstInstanceClosingDate 는 startDate 와 judgmentDate 사이여야 합니다.`,
      );
    }
  }
  // ISO 형식이 확인됐으므로 문자열 비교가 날짜 비교와 같다.
  if (input.judgmentDate < input.startDate) {
    throw new RangeError(`${PREFIX}: judgmentDate 는 startDate 이후여야 합니다.`);
  }
  if (input.endDate < input.startDate) {
    throw new RangeError(`${PREFIX}: endDate 는 startDate 이후여야 합니다.`);
  }
}
