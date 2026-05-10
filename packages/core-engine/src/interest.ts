import { datasetVersionTag, loadLegalRates, type LegalRateDataset } from "./legal-rates";
import { resolveSegments } from "./segments";
import { computeSegmentInterest } from "./shared/accrual";
import { applyRounding, type RoundingMode } from "./shared/rounding";
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
 * 3. 각 segment + 최종 합계에 `options.rounding` 적용 (default "floor")
 * 4. dataVersion + computedAt 기록
 *
 * 반올림 정책 (v2):
 * - `options.rounding` 미지정 시 "floor" (v1 회귀 호환)
 * - 각 구간 `interest` 와 `totalInterest` 모두 동일 모드로 처리
 * - segment-floor 합과 totalInterest(raw 합계 floor) 간 ≤ 3원 차이는 v1과 동일하게 가능
 *   ("floor accumulation" edge.test.ts 회귀로 고정)
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

  let rawTotal = 0;
  const out: InterestSegment[] = segments.map((seg) => {
    const { days, interestRaw, formula } = computeSegmentInterest(
      input.principal,
      seg.rate,
      seg,
      input.options,
    );
    rawTotal += interestRaw;
    return {
      from: seg.from,
      to: seg.to,
      days,
      rate: seg.rate,
      formula,
      interest: applyRounding(interestRaw, rounding),
    };
  });

  const totalInterest = applyRounding(rawTotal, rounding);
  const grandTotal = input.principal + totalInterest;

  return {
    principal: input.principal,
    segments: out,
    totalInterest,
    grandTotal,
    options: input.options,
    dataVersion: datasetVersionTag(dataset),
    computedAt: new Date().toISOString(),
  };
}
