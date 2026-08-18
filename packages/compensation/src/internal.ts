/**
 * compensation 패키지 공용 내부 헬퍼.
 *
 * 월수 계산과 호프만 현가율 조회는 자×부상·자×사망·기타손해 세 도메인이 같은 정원을
 * 써야 한다. 과거 세 곳에 각자 복제돼 있었고, 그 탓에 coverage clamp 가 기타손해에만
 * 적용되어 일실수입 본류에서 RangeError 가 나는 비대칭이 생겼다. 단일 출처로 합쳐
 * 같은 결함이 재발하지 않게 한다.
 */

import { getHoffmanAt, type HoffmanDataset } from "@lawcalc-kr/datasets-compensation";
import type { IsoDate } from "@lawcalc-kr/core-engine";

/** `H[0] = 0` 정원 보강 (dataset 의 1-based index 와 segment boundary 통합). */
export function getCumulativeHoffman(dataset: HoffmanDataset, month: number): number {
  if (month === 0) return 0;
  return getHoffmanAt(dataset, month);
}

/**
 * 두 ISO 날짜 사이의 calendar month floor 차이.
 *
 * - `to.day` 가 `from.day` 보다 작으면 -1 (월 미충족 분 제거).
 * - 사고일 ~ (생년 + retirementAge 년) 정원에서는 day 가 정확 동일하므로 -1 발생 안 함.
 */
export function monthsBetween(from: IsoDate, to: IsoDate): number {
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return months;
}

/**
 * 호프만표 coverage 범위로 월수를 clamp 한다.
 *
 * 사고 당시 만 25세 미만(가동연한 65세 기준 480개월 초과)이거나 가동연한을 65세보다
 * 높게 잡으면 조회 월수가 dataset 의 `monthsCovered` 를 넘어 `getHoffmanAt` 이
 * RangeError 를 던진다. 단리 중간이자 공제의 현가율은 414개월에서 이미 240 한도에
 * 걸리므로(대법원 1992. 7. 10. 선고 92다15871 — 240 을 넘으면 수치표상 값과 무관하게
 * 240 적용), coverage 를 넘는 구간의 기여분은 0 이고 clamp 해도 금액이 달라지지 않는다.
 *
 * 즉 clamp 는 근사가 아니라 판례가 정한 한도를 그대로 반영하는 것이며, 계산을 거부할
 * 이유가 없다. 표시용 `startMonth`/`endMonth` 는 clamp 하지 않아 실제 가동기간이
 * 결과에 그대로 남고, 한도 적용 사실은 `hoffman240Cap` 이 별도로 드러낸다.
 */
export function clampToHoffmanCoverage(dataset: HoffmanDataset, month: number): number {
  return Math.max(0, Math.min(month, dataset.monthsCovered));
}

/** clamp 를 적용한 누적 현가율 조회. 일실수입·개호비 전 경로의 단일 진입점. */
export function getCumulativeHoffmanClamped(dataset: HoffmanDataset, month: number): number {
  return getCumulativeHoffman(dataset, clampToHoffmanCoverage(dataset, month));
}
