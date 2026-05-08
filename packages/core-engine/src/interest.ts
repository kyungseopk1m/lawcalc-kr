import { addDays, addYears, containsLeapDay, countDays, parseIsoDateUtc } from "./days";
import { datasetVersionTag, loadLegalRates } from "./legal-rates";
import { resolveSegments } from "./segments";
import type {
  CalcOptions,
  InterestInput,
  InterestResult,
  InterestSegment,
  IsoDate,
  RateSegment,
} from "./types";

/**
 * 한 구간의 이자 계산.
 *
 * mode="totalDays":
 *   interest = principal × rate × days / denom
 *   - leapYear="fixed365": denom = 365
 *   - leapYear="actual":   윤일(2/29)이 [from, to]에 포함되면 366, 아니면 365
 *
 * mode="period" (법원 매뉴얼 기간식):
 *   1년 단위로 분할. 풀 1년 단위는 principal × rate (분모/분모 = 1).
 *   마지막 1년 미만 구간은 principal × rate × days / denom.
 *   - leapYear="fixed365": denom = 365
 *   - leapYear="actual":   마지막 미만 구간 [start_of_partial, partial_end] 에 윤일 포함 시 366
 *
 * 반올림: 각 구간 합산 후 `Math.floor` 로 원 단위 절사 (채권자 보수적, 법원 매뉴얼 끝수처리 옵션 중 하나).
 *
 * @internal segment-level 계산 — caller(`calculateInterest`)가 구간 단위로 호출한다.
 */
function computeSegmentInterest(
  principal: number,
  rate: number,
  segment: RateSegment,
  options: CalcOptions,
): { days: number; interestRaw: number; formula: string } {
  const days = countDays(segment.from, segment.to, options);
  if (days <= 0) {
    return {
      days: 0,
      interestRaw: 0,
      formula: `${principal.toLocaleString("en-US")} × ${rate} × 0일 = 0`,
    };
  }

  if (options.mode === "totalDays") {
    const denom =
      options.leapYear === "fixed365" ? 365 : containsLeapDay(segment.from, segment.to) ? 366 : 365;
    const interestRaw = (principal * rate * days) / denom;
    const formula = `${principal.toLocaleString("en-US")} × ${rate} × ${days} / ${denom}`;
    return { days, interestRaw, formula };
  }

  // mode === "period"
  const effectiveStart: IsoDate = options.includeFirstDay ? segment.from : addDays(segment.from, 1);
  if (parseIsoDateUtc(effectiveStart) > parseIsoDateUtc(segment.to)) {
    return {
      days: 0,
      interestRaw: 0,
      formula: `${principal.toLocaleString("en-US")} × ${rate} × 0일 = 0`,
    };
  }

  let cursor: IsoDate = effectiveStart;
  let fullYears = 0;
  while (true) {
    const nextYearStart = addYears(cursor, 1);
    // 풀 1년: [cursor, nextYearStart - 1day] 가 segment.to 이내일 때
    const fullYearEnd = addDays(nextYearStart, -1);
    if (parseIsoDateUtc(fullYearEnd) <= parseIsoDateUtc(segment.to)) {
      fullYears += 1;
      cursor = nextYearStart;
    } else {
      break;
    }
  }
  const partialStart = cursor;
  const partialDays =
    parseIsoDateUtc(partialStart) > parseIsoDateUtc(segment.to)
      ? 0
      : Math.round((parseIsoDateUtc(segment.to) - parseIsoDateUtc(partialStart)) / 86_400_000) + 1;

  let denom = 365;
  if (partialDays > 0 && options.leapYear === "actual") {
    // 마지막 미만 구간이 자기 자신의 1년 후까지 사이에 윤일을 포함하는지로 결정
    const oneYearLater = addDays(addYears(partialStart, 1), -1);
    denom = containsLeapDay(partialStart, oneYearLater) ? 366 : 365;
  }

  const interestFull = fullYears * principal * rate;
  const interestPartial = partialDays > 0 ? (principal * rate * partialDays) / denom : 0;
  const interestRaw = interestFull + interestPartial;
  const parts: string[] = [];
  if (fullYears > 0) parts.push(`${fullYears}년 × ${principal.toLocaleString("en-US")} × ${rate}`);
  if (partialDays > 0) {
    parts.push(`${principal.toLocaleString("en-US")} × ${rate} × ${partialDays} / ${denom}`);
  }
  return { days, interestRaw, formula: parts.join(" + ") || "0" };
}

/**
 * 이자 계산 메인 엔트리.
 *
 * 처리 순서:
 * 1. resolveSegments 로 RateSegment[] 확정
 * 2. 각 구간에 computeSegmentInterest 적용 (구간별 raw 이자 누적)
 * 3. 최종 합계만 `Math.floor` 로 원 단위 절사 → 합산 오차 최소화
 * 4. dataVersion + computedAt 기록
 *
 * 반올림 정책 (현행, v1):
 * - 각 구간의 `interest` 필드는 표시용으로 raw 값을 `Math.floor`
 * - `totalInterest` 는 raw 합계의 `Math.floor` (구간 floor 합과 1원 차이 가능)
 * - 법원 매뉴얼이 절사/절상/사사오입을 모두 옵션화하므로 v2에서 옵션 도입 예정
 */
export function calculateInterest(input: InterestInput): InterestResult {
  if (input.principal <= 0) {
    throw new RangeError(`calculateInterest: principal must be > 0 (got ${input.principal})`);
  }
  if (!Number.isFinite(input.principal)) {
    throw new RangeError("calculateInterest: principal must be a finite number");
  }
  const segments = resolveSegments(input);
  const dataset = loadLegalRates();

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
      interest: Math.floor(interestRaw),
    };
  });

  const totalInterest = Math.floor(rawTotal);
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
