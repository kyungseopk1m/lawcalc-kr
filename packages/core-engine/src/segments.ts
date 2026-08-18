import { addDays, maxDate, minDate, parseIsoDateUtc } from "./days";
import { type LegalRateDataset, loadLegalRates, rateHistoryFor } from "./legal-rates";
import type { InterestInput, IsoDate, LegalRatePreset, RateSegment } from "./types";

/**
 * `resolveSegments` 의 두 번째 인자. dataset 주입 (B9, v0.2). 미지정 시 bundled dataset.
 */
export interface ResolveSegmentsDeps {
  dataset?: LegalRateDataset;
}

function isCustomRate(p: LegalRatePreset): p is { customRate: number } {
  return typeof p === "object" && p !== null && "customRate" in p;
}

/**
 * `[from, to]` 가 `[start, end]` 안에 들어오도록 자른다. 교집합이 없으면 null.
 */
function clipRange(
  from: IsoDate,
  to: IsoDate | null,
  start: IsoDate,
  end: IsoDate,
): { from: IsoDate; to: IsoDate } | null {
  const lo = maxDate(from, start);
  const hi = to === null ? end : minDate(to, end);
  if (parseIsoDateUtc(lo) > parseIsoDateUtc(hi)) return null;
  return { from: lo, to: hi };
}

/**
 * 입력을 startDate~endDate 안에서 RateSegment 배열로 정규화한다.
 *
 * 우선순위:
 * 1. `input.segments` 가 있으면 정렬 + 인접/겹침 검증.
 * 2. 없고 `input.legalRatePreset` 이 customRate 객체면 단일 구간.
 * 3. 없고 LegalRateCode 면 데이터셋 변경 이력으로 자동 분할
 *    (소촉법 12% / 15% / 20% 변경일이 기간 안에 걸리면 분할).
 * 4. 둘 다 없으면 RangeError.
 *
 * 반환된 segments 는 항상 from <= to, 인접 구간 to+1 == 다음 from, 모두 [start, end] 안.
 */
export function resolveSegments(input: InterestInput, deps?: ResolveSegmentsDeps): RateSegment[] {
  const { startDate, endDate, segments, legalRatePreset } = input;
  if (parseIsoDateUtc(endDate) < parseIsoDateUtc(startDate)) {
    throw new RangeError(`resolveSegments: endDate (${endDate}) < startDate (${startDate})`);
  }
  if (input.principal <= 0) {
    throw new RangeError(`resolveSegments: principal must be > 0 (got ${input.principal})`);
  }

  if (segments && segments.length > 0) {
    return validateExplicitSegments(segments, startDate, endDate);
  }

  if (!legalRatePreset) {
    throw new RangeError(
      "resolveSegments: either input.segments or input.legalRatePreset must be provided",
    );
  }

  if (isCustomRate(legalRatePreset)) {
    // NaN < 0 은 false 라 부등호만으로는 통과한다. 원금은 이미 Number.isFinite 로
    // 막혀 있으므로(interest.ts) 이율도 같은 기준을 적용해 NaN 결과 유입을 차단한다.
    if (!Number.isFinite(legalRatePreset.customRate) || legalRatePreset.customRate < 0) {
      throw new RangeError(
        `resolveSegments: customRate must be a finite number >= 0 (got ${String(legalRatePreset.customRate)})`,
      );
    }
    return [{ from: startDate, to: endDate, rate: legalRatePreset.customRate }];
  }

  const dataset = loadLegalRates(deps?.dataset);
  const history = rateHistoryFor(dataset, legalRatePreset);
  if (history.length === 0) {
    throw new Error(`resolveSegments: unknown legalRatePreset "${legalRatePreset}"`);
  }

  const out: RateSegment[] = [];
  for (const slice of history) {
    const clipped = clipRange(slice.from, slice.to, startDate, endDate);
    if (clipped) {
      out.push({ from: clipped.from, to: clipped.to, rate: slice.rate });
    }
  }
  if (out.length === 0) {
    throw new RangeError(
      `resolveSegments: legalRatePreset "${legalRatePreset}" has no rate covering ${startDate}..${endDate}`,
    );
  }
  // 자동분할 커버리지 가드: explicit segment 경로(validateExplicitSegments)가 강제하는
  // 불변식 — 첫 구간 from == startDate, 구간 인접, 마지막 구간 to == endDate — 을 auto
  // 경로에도 동일하게 강제한다. 데이터셋 최초 시행일보다 앞선 기간(예: 소촉법 2003-06-01
  // 이전)이 입력되면 종전엔 그 구간이 "조용히" 누락된 채 과소계산된 결과가 정상처럼
  // 반환됐다. 법률 계산기에서 침묵 과소계산은 가장 위험한 결함이므로 loud error 를 택한다.
  if (out[0]!.from !== startDate) {
    // 소촉법의 최초 시행일 2003-06-01 은 데이터 누락이 아니라 실효(失效)다. 헌재 2003. 4. 24.
    // 선고 2002헌가15 위헌결정으로 구 규정(연 25%)이 효력을 잃었고, 그 뒤 대통령령으로
    // 다시 정해진 이율이 2003-06-01 부터 적용된다. 사유를 밝히지 않으면 "데이터셋을
    // 채우면 되는 문제" 로 읽혀 사용자가 잘못된 대응을 한다.
    const reason =
      legalRatePreset === "promotion"
        ? " (소촉법 이율은 헌재 2003. 4. 24. 선고 2002헌가15 위헌결정으로 구 규정이 실효되어 그 이전 기간에는 존재하지 않는다)"
        : "";
    throw new RangeError(
      `resolveSegments: legalRatePreset "${legalRatePreset}" has no rate covering ${startDate} ` +
        `(earliest available rate starts ${out[0]!.from})${reason}; supply an explicit segment for the period before ${out[0]!.from}`,
    );
  }
  for (let i = 1; i < out.length; i++) {
    if (addDays(out[i - 1]!.to, 1) !== out[i]!.from) {
      throw new RangeError(
        `resolveSegments: legalRatePreset "${legalRatePreset}" has a coverage gap between ${out[i - 1]!.to} and ${out[i]!.from}`,
      );
    }
  }
  if (out[out.length - 1]!.to !== endDate) {
    throw new RangeError(
      `resolveSegments: legalRatePreset "${legalRatePreset}" has no rate covering through ${endDate} (last covered ${out[out.length - 1]!.to})`,
    );
  }
  return out;
}

function validateExplicitSegments(
  segments: RateSegment[],
  startDate: IsoDate,
  endDate: IsoDate,
): RateSegment[] {
  const sorted = [...segments].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  for (const seg of sorted) {
    if (parseIsoDateUtc(seg.from) > parseIsoDateUtc(seg.to)) {
      throw new RangeError(`segment from(${seg.from}) > to(${seg.to})`);
    }
    if (!Number.isFinite(seg.rate) || seg.rate < 0) {
      throw new RangeError(`segment rate must be a finite number >= 0 (got ${String(seg.rate)})`);
    }
    if (seg.from < startDate || seg.to > endDate) {
      throw new RangeError(`segment ${seg.from}..${seg.to} is outside [${startDate}, ${endDate}]`);
    }
  }
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (parseIsoDateUtc(cur.from) <= parseIsoDateUtc(prev.to)) {
      throw new RangeError(`segments overlap: ${prev.to} >= ${cur.from}`);
    }
    if (addDays(prev.to, 1) !== cur.from) {
      throw new RangeError(`segments are not contiguous: gap between ${prev.to} and ${cur.from}`);
    }
  }
  if (sorted.length > 0) {
    if (sorted[0]!.from !== startDate) {
      throw new RangeError(
        `first segment from (${sorted[0]!.from}) must equal startDate (${startDate})`,
      );
    }
    if (sorted[sorted.length - 1]!.to !== endDate) {
      throw new RangeError(
        `last segment to (${sorted[sorted.length - 1]!.to}) must equal endDate (${endDate})`,
      );
    }
  }
  return sorted;
}
