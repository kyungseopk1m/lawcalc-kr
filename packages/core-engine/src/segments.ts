import { addDays, maxDate, minDate, parseIsoDateUtc } from "./days";
import { loadLegalRates, rateHistoryFor } from "./legal-rates";
import type { InterestInput, IsoDate, LegalRatePreset, RateSegment } from "./types";

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
export function resolveSegments(input: InterestInput): RateSegment[] {
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
    if (legalRatePreset.customRate < 0) {
      throw new RangeError("resolveSegments: customRate must be >= 0");
    }
    return [{ from: startDate, to: endDate, rate: legalRatePreset.customRate }];
  }

  const dataset = loadLegalRates();
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
    if (seg.rate < 0) {
      throw new RangeError(`segment rate must be >= 0 (got ${seg.rate})`);
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
