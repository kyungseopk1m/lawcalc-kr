import { STANDARD_DISCLAIMER } from "./disclaimers";
import { datasetVersionTag, loadLegalRates, type LegalRateDataset } from "./legal-rates";
import { resolveSegments } from "./segments";
import { computeSegmentInterest } from "./shared/accrual";
import { applyRoundingExact, type RoundingMode } from "./shared/rounding";
import type { InterestInput, InterestResult, InterestSegment } from "./types";

/**
 * `calculateInterest` 의 두 번째 인자. 도메인 추가 시 `{ datasets: { ... } }` 로 일반화된다 (B9, v0.2).
 *
 * `dataset` 미지정 시 bundled `data/legal-rates/v1.json` 으로 동작 (회귀 호환).
 */
export interface CalculateInterestDeps {
  dataset?: LegalRateDataset;
}

/**
 * 이자 계산 메인 엔트리.
 *
 * 처리 순서:
 * 1. resolveSegments 로 RateSegment[] 확정
 * 2. 각 구간에 computeSegmentInterest 적용 (구간별 raw 이자 누적)
 * 3. 각 segment 에 `options.rounding` 적용 (default "floor") 후 합산
 * 4. dataVersion + computedAt 기록
 *
 * 반올림 정책 (v2):
 * - `options.rounding` 미지정 시 "floor" (v1 회귀 호환)
 * - 각 구간 raw 이자에 rounding 을 적용하고, `totalInterest` 는 그 구간 금액의 합이다.
 *   법원 이자 계산 매뉴얼 예시(합계 295,989 = 66,301 + 83,333 + 39,068 + 107,287)와
 *   외부 대조값이 모두 행별로 끊은 금액을 더한다. raw 합계를 한 번에 끊던 이전 방식은 구간 수에 따라
 *   최대 (구간 수 - 1)원까지 컸다 ("floor accumulation" edge.test.ts 회귀로 고정)
 */
export function calculateInterest(
  input: InterestInput,
  deps?: CalculateInterestDeps,
): InterestResult {
  if (input.principal <= 0) {
    throw new RangeError(`calculateInterest: principal must be > 0 (got ${input.principal})`);
  }
  if (!Number.isFinite(input.principal)) {
    throw new RangeError("calculateInterest: principal must be a finite number");
  }
  const dataset = loadLegalRates(deps?.dataset);
  const segments = resolveSegments(input, { dataset });
  const rounding: RoundingMode = input.options.rounding ?? "floor";

  let totalInterest = 0;
  const out: InterestSegment[] = segments.map((seg, i) => {
    // 초일 불산입(민법 제157조)은 기간 전체의 기산일에 한 번만 적용한다.
    // 이율 변경으로 구간이 분할되어도 두 번째 구간부터는 첫날을 산입해야
    // Σ segments[].days 가 countDays(startDate, endDate, options) 와 일치한다.
    const segOptions = i === 0 ? input.options : { ...input.options, includeFirstDay: true };
    const { days, interestExact, formula } = computeSegmentInterest(
      input.principal,
      seg.rate,
      seg,
      segOptions,
    );
    // 정확한 유리수로 끝수 처리한다 (실수 곱은 584,347,845 × 12% × 275/365 = 52,831,449 를 1원 모자라게 낸다).
    const interest = applyRoundingExact(interestExact.num, interestExact.den, rounding);
    totalInterest += interest;
    return {
      from: seg.from,
      to: seg.to,
      days,
      rate: seg.rate,
      formula,
      interest,
    };
  });

  const grandTotal = input.principal + totalInterest;

  return {
    principal: input.principal,
    segments: out,
    totalInterest,
    grandTotal,
    options: input.options,
    dataVersion: datasetVersionTag(dataset),
    computedAt: new Date().toISOString(),
    disclaimer: STANDARD_DISCLAIMER,
  };
}
