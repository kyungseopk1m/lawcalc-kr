import { addDays } from "./days";
import type { InterestResult, IsoDate } from "./types";

/**
 * 청구취지 종결 방식.
 *
 * - "untilFullPayment": 마지막 구간을 "다 갚는 날까지"로 개방 — 소장·지급명령 기본형.
 * - "untilEndDate": 계산 종료일을 그대로 기재 — 확정 기간 검산·정산용.
 */
export type ClaimTextEnding = "untilFullPayment" | "untilEndDate";

export interface BuildInterestClaimTextOptions {
  /** 미지정 시 "untilFullPayment". */
  ending?: ClaimTextEnding;
}

/** `buildInterestClaimText` 가 필요로 하는 결과 부분집합. */
export type InterestClaimTextSource = Pick<InterestResult, "principal" | "segments">;

/**
 * ISO 날짜를 법원 표기로 변환한다 (예: "2026-01-05" → "2026. 1. 5.").
 * 월·일의 leading zero 를 제거하고, 점 뒤 공백 + 끝 점을 붙인다.
 */
export function formatCourtDate(iso: IsoDate): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) {
    throw new RangeError(`formatCourtDate: invalid ISO date "${iso}"`);
  }
  return `${Number(year)}. ${Number(month)}. ${Number(day)}.`;
}

function formatPercent(rate: number): string {
  // 청구취지 표시이율 정책: 백분율 기준 소수점 **최대 10자리**.
  // - 법정이율(5/6/12/15/20%)·실무 약정이율(소수 몇 자리)은 손실 없이 정확히 표기된다.
  // - 계산은 항상 입력 raw rate 를 그대로 쓴다. 백분율 10자리(= rate 소수 12자리)를 넘는
  //   극단 정밀도 이율(법원 제출 문서엔 비현실적)만 표기 시 반올림되며, 그 경우에 한해
  //   표시이율이 계산이율과 미세하게 어긋날 수 있다.
  // - 상한을 15+ 로 올리면 0.07 → "7.000000000000001" 같은 IEEE754 잡음이 새므로 10 으로 고정.
  return `${(rate * 100).toLocaleString("ko-KR", { maximumFractionDigits: 10 })}%`;
}

/**
 * 계산 결과를 소장·지급명령 청구취지 문장으로 만든다.
 *
 * 기재례 (대법원 현행 표기 — "비율로 계산한 돈", 복수 이율은 "각 비율"):
 * - 단일 이율: "피고는 원고에게 10,000,000원 및 이에 대하여 2026. 1. 1.부터
 *   다 갚는 날까지 연 5%의 비율로 계산한 돈을 지급하라."
 * - 복수 이율: "… 2026. 1. 1.부터 2026. 6. 30.까지는 연 5%의, 그 다음 날부터
 *   다 갚는 날까지는 연 12%의 각 비율로 계산한 돈을 지급하라."
 *
 * 뒤 구간이 앞 구간 종료 다음 날에 시작하면 "그 다음 날부터"로 잇고,
 * 그렇지 않으면 시작일을 그대로 기재한다.
 */
export function buildInterestClaimText(
  source: InterestClaimTextSource,
  options?: BuildInterestClaimTextOptions,
): string {
  const segments = source.segments;
  if (segments.length === 0) {
    throw new RangeError("buildInterestClaimText: segments must not be empty");
  }

  const ending: ClaimTextEnding = options?.ending ?? "untilFullPayment";
  const principal = `${source.principal.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}원`;

  if (segments.length === 1) {
    const only = segments[0]!;
    const until =
      ending === "untilFullPayment" ? "다 갚는 날까지" : `${formatCourtDate(only.to)}까지`;
    return `피고는 원고에게 ${principal} 및 이에 대하여 ${formatCourtDate(only.from)}부터 ${until} 연 ${formatPercent(only.rate)}의 비율로 계산한 돈을 지급하라.`;
  }

  const parts = segments.map((segment, index) => {
    const previous = segments[index - 1];
    const from =
      previous && addDays(previous.to, 1) === segment.from
        ? "그 다음 날부터"
        : `${formatCourtDate(segment.from)}부터`;
    const isLast = index === segments.length - 1;
    const until =
      isLast && ending === "untilFullPayment"
        ? "다 갚는 날까지는"
        : `${formatCourtDate(segment.to)}까지는`;
    return `${from} ${until} 연 ${formatPercent(segment.rate)}의`;
  });

  return `피고는 원고에게 ${principal} 및 이에 대하여 ${parts.join(", ")} 각 비율로 계산한 돈을 지급하라.`;
}
