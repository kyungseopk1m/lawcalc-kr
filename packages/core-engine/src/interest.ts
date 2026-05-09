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
 * 본 함수는 raw 값(소수 포함)만 반환한다. 원 단위 끝수 처리는 caller `calculateInterest` 가
 * `options.rounding` 에 따라 segment.interest / totalInterest 양쪽에 적용한다 (v2).
 *
 * @internal segment-level 계산 — caller(`calculateInterest`)가 구간 단위로 호출한다.
 */
/**
 * 사람이 읽는 표기 헬퍼 (formula 출력 전용, 계산 영향 없음).
 *
 * `formatPrincipal(1_000_000)` → `"1,000,000원"`
 * `formatRatePercent(0.05)`    → `"5%"`
 * `formatRatePercent(0.123)`   → `"12.3%"` (부동소수점 잡음 정리: toFixed(10) → Number)
 *
 * 통일 표기: `1,000,000원 × 5% × 100일 / 365` (한글/%, B-W5 컨펌).
 */
function formatPrincipal(principal: number): string {
  return `${principal.toLocaleString("en-US")}원`;
}
function formatRatePercent(rate: number): string {
  return `${Number((rate * 100).toFixed(10))}%`;
}

/**
 * 1 cycle (cursor 부터 1년) 의 만료일과 다음 cursor.
 *
 * 민법 159·160조 통설:
 * - 일반: cursor 의 1년 후 동일일자 전날이 만료일 (예: 2023-01-01 → 2023-12-31).
 * - 예외 (160조 3항 "해당일 없는 때 그 월의 말일"): cursor 가 02-29 이고 다음 해가
 *   비윤년이면 그 해 02-28 자체가 만료일이다 (예: 2024-02-29 → 2025-02-28).
 *
 * `addYears` 가 02-29 → 02-28 으로 clip 한 결과를 그대로 만료일로 채택하고,
 * 다음 cursor 는 만료일 + 1 일로 잡는다. 이 한 곳에서 fullYears 루프와 periodDaysSum 이
 * 동일한 만기 정의를 공유한다 (변호사 답변 A안 채택, TIER-A #2).
 */
function periodCycleEnd(cursor: IsoDate): { end: IsoDate; nextCursor: IsoDate } {
  const nextSameDate = addYears(cursor, 1);
  const isLeapClip = cursor.endsWith("-02-29") && nextSameDate.endsWith("-02-28");
  const end = isLeapClip ? nextSameDate : addDays(nextSameDate, -1);
  return { end, nextCursor: addDays(end, 1) };
}

/**
 * period 모드의 segment.days 재계산.
 *
 * `formula` 분자 일수 합과 일치시키기 위한 helper. 풀 1년 cycle 마다 `periodCycleEnd`
 * 가 정의한 cycle 의 실 일수를 누적하고 마지막 partial 일수를 더한다. 윤년 02-29
 * 시작 cycle 은 365 일(만료 02-28 까지), 일반 cycle 은 윤일 포함 여부에 따라 365/366.
 * 사용자가 결과 표의 days 컬럼을 formula 의 일수 합으로 검산할 때 비대칭이 생기지
 * 않도록 보장한다.
 */
function periodDaysSum(effectiveStart: IsoDate, fullYears: number, partialDays: number): number {
  let total = partialDays;
  let cursor: IsoDate = effectiveStart;
  for (let i = 0; i < fullYears; i++) {
    const { nextCursor } = periodCycleEnd(cursor);
    total += Math.round((parseIsoDateUtc(nextCursor) - parseIsoDateUtc(cursor)) / 86_400_000);
    cursor = nextCursor;
  }
  return total;
}

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
      formula: `${formatPrincipal(principal)} × ${formatRatePercent(rate)} × 0일 = 0`,
    };
  }

  if (options.mode === "totalDays") {
    const denom =
      options.leapYear === "fixed365" ? 365 : containsLeapDay(segment.from, segment.to) ? 366 : 365;
    const interestRaw = (principal * rate * days) / denom;
    const formula = `${formatPrincipal(principal)} × ${formatRatePercent(rate)} × ${days}일 / ${denom}`;
    return { days, interestRaw, formula };
  }

  // mode === "period"
  const effectiveStart: IsoDate = options.includeFirstDay ? segment.from : addDays(segment.from, 1);
  if (parseIsoDateUtc(effectiveStart) > parseIsoDateUtc(segment.to)) {
    return {
      days: 0,
      interestRaw: 0,
      formula: `${formatPrincipal(principal)} × ${formatRatePercent(rate)} × 0일 = 0`,
    };
  }

  let cursor: IsoDate = effectiveStart;
  let fullYears = 0;
  while (true) {
    // 풀 1년 만료일은 민법 159·160 통설(`periodCycleEnd`) 을 따른다.
    // 윤년 02-29 시작은 비윤년 02-28 자체가 만료일 (TIER-A #2 = A안 채택).
    const { end: fullYearEnd, nextCursor } = periodCycleEnd(cursor);
    if (parseIsoDateUtc(fullYearEnd) <= parseIsoDateUtc(segment.to)) {
      fullYears += 1;
      cursor = nextCursor;
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
  if (fullYears > 0)
    parts.push(`${fullYears}년 × ${formatPrincipal(principal)} × ${formatRatePercent(rate)}`);
  if (partialDays > 0) {
    parts.push(
      `${formatPrincipal(principal)} × ${formatRatePercent(rate)} × ${partialDays}일 / ${denom}`,
    );
  }
  const computedDays = periodDaysSum(effectiveStart, fullYears, partialDays);
  return { days: computedDays, interestRaw, formula: parts.join(" + ") || "0" };
}

type RoundingMode = NonNullable<CalcOptions["rounding"]>;

/**
 * 원 단위 끝수 처리. v2 도입.
 *
 * 매뉴얼(Calculator.hwp) 매핑:
 * - "floor" → 절사 (채권자 보수, default)
 * - "ceil"  → 절상 (채무자 보수)
 * - "round" → 사사오입 (`Math.round` 의 half-away-from-zero, JS 표준)
 */
function applyRounding(value: number, mode: RoundingMode): number {
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
export function calculateInterest(input: InterestInput): InterestResult {
  if (input.principal <= 0) {
    throw new RangeError(`calculateInterest: principal must be > 0 (got ${input.principal})`);
  }
  if (!Number.isFinite(input.principal)) {
    throw new RangeError("calculateInterest: principal must be a finite number");
  }
  const segments = resolveSegments(input);
  const dataset = loadLegalRates();
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
