/** 신법(calculate.ts)과 구법(old-law.ts)이 함께 쓰는 상속인 목록 판정. */

import type { HeirNode } from "./types";

/** 실제로 지분을 받을 수 있는 대습자: 생존해 있고 스스로 포기하지도 않은 자. */
export function livingReps(h: HeirNode): HeirNode[] {
  return (h.representatives ?? []).filter((r) => !r.deceasedBeforeOpening && !r.renounced);
}

/**
 * 슬롯 유지 조건의 대습 판정. 대습자가 1명이라도 생존해야 해당 슬롯이 상속한다.
 * 대습자 전원이 상속개시 전 사망/결격이거나 상속을 포기하면 그 슬롯은 소멸한다
 * (죽은 자·포기자에게 지분 귀속 방지).
 */
export function hasLivingRepresentative(h: HeirNode): boolean {
  return livingReps(h).length > 0;
}

/** 슬롯을 차지하는 상속인: 생존해 있거나, 사망했지만 대습자가 남아 있는 자. */
export function slotted(heirs: HeirNode[]): HeirNode[] {
  return heirs.filter((h) => !h.deceasedBeforeOpening || hasLivingRepresentative(h));
}

/**
 * 같은 순위 안에서 촌수가 다르면 최근친(최소 촌수)만 남긴다 (민법 제1000조 제2항: 부모 우선 조부모,
 * 삼촌 우선 사촌). 한 명이라도 `degree` 미지정이면 정보가 불완전하므로 필터하지 않고
 * 전원 동순위로 균분한다 (하위호환: 기존 입력·골든·`.lcalc` 무영향).
 */
export function closestByDegree(heirs: HeirNode[]): HeirNode[] {
  if (heirs.length === 0 || heirs.some((h) => h.degree === undefined)) return heirs;
  const minDegree = Math.min(...heirs.map((h) => h.degree as number));
  return heirs.filter((h) => h.degree === minDegree);
}
