import type { CalcOptions, IsoDate } from "./types";

/**
 * 두 날짜 사이의 일수를 옵션에 따라 계산한다.
 *
 * 구현 예정 (W2):
 * - includeFirstDay 처리
 * - leapYear: "fixed365" vs "actual"
 * - 시간대 영향 배제 (UTC 기반 또는 순수 정수 산술)
 */
export function countDays(
  from: IsoDate,
  to: IsoDate,
  options: Pick<CalcOptions, "leapYear" | "includeFirstDay">,
): number {
  throw new Error(
    `countDays(${from} → ${to}, leapYear=${options.leapYear}, includeFirstDay=${String(
      options.includeFirstDay,
    )}) is not implemented yet (W2)`,
  );
}
