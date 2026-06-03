/**
 * 기타손해 전용 cap / 현가 헬퍼.
 *
 * - `applyValueSum20Cap`: 치료비/보조구 일시금 현가계수 합 20 cap (매뉴얼 §6-나 L440).
 * - `singlePaymentHoffman`: 단리 일시금 현가계수 `1 / (1 + 0.05 × months/12)` (사고일 base).
 *
 * 개호비의 호프만 240 cap 은 연금형이라 `@lawcalc-kr/datasets-compensation` 의
 * `applyHoffman240Cap` (연금현가율 누적) 을 재사용한다. 본 모듈은 일시금형 cap 전담.
 */

/** 단리 할인율 (연 5%). 호프만식 정합 (leibniz 복리 아님). */
export const SINGLE_PAYMENT_DISCOUNT_RATE = 0.05;

/** 수치합계 cap 기본값 (매뉴얼 §6-나·다). */
export const VALUE_SUM_CAP = 20;

/** 수치합계 20 cap 적용 결과. */
export interface ValueSum20CapResult {
  /** cap 전 합. */
  rawSum: number;
  /** cap 후 합 (`min(rawSum, cap)`). */
  appliedSum: number;
  /** cap 발생 여부. */
  capped: boolean;
}

/**
 * 단리 일시금 현가계수. `months` 개월 뒤 일시 지출의 사고일 기준 현가율.
 *
 * `1 / (1 + 0.05 × months/12)`. `months = 0` (사고일 당일) → 1.
 * 연금현가율(호프만 단리연금현가율 표)과 달리 단일 시점 일시금용.
 */
export function singlePaymentHoffman(months: number): number {
  if (!Number.isFinite(months) || months < 0) {
    throw new RangeError(
      `singlePaymentHoffman: months must be a non-negative finite number (got ${months})`,
    );
  }
  return 1 / (1 + (SINGLE_PAYMENT_DISCOUNT_RATE * months) / 12);
}

/**
 * 치료비/보조구 수치합계(단리 일시금 현가계수 합)에 20 cap 을 적용한다.
 *
 * 매뉴얼 §6-나 L440 "과잉배상 방지를 위하여 수치합계가 20을 초과하면 20으로 제한된다".
 * 항목(치료비 종류)별로 독립 적용한다.
 */
export function applyValueSum20Cap(rawSum: number, cap = VALUE_SUM_CAP): ValueSum20CapResult {
  if (cap <= 0) {
    throw new RangeError(`applyValueSum20Cap: cap must be > 0 (got ${cap})`);
  }
  if (!Number.isFinite(rawSum) || rawSum < 0) {
    throw new RangeError(
      `applyValueSum20Cap: rawSum must be a non-negative finite number (got ${rawSum})`,
    );
  }
  if (rawSum > cap) {
    return { rawSum, appliedSum: cap, capped: true };
  }
  return { rawSum, appliedSum: rawSum, capped: false };
}
