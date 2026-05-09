/**
 * Public domain types for the lawcalc-kr inheritance (상속분 간이) calculation engine.
 *
 * 근거: 대법원 손해배상 등 계산프로그램 매뉴얼 (Inheritance.hwp).
 * 공식 사이트: http://ejpc.scourt.go.kr/
 * 적용 조항: 민법 제1000조, 제1001조, 제1003조, 제1009조, 제1010조.
 *
 * 적용 시점: 1991. 1. 1. 이후 피상속인 사망 케이스만 (1990 개정민법 시행).
 */

import type { IsoDate } from "../types";

/**
 * 상속인 노드. 4 순위 그룹의 원소이자 대습상속인의 원소.
 *
 * - `deceasedBeforeOpening`: 매뉴얼의 "사망여부 체크". 결격(민법 1004조) 도 동일하게 true 로 입력.
 * - `representatives`: 1차 대습 상속인. v0.2 첫 PR 은 1차만 지원.
 *   재귀 type 으로 v0.3+ 에서 N차 대습 일반화 대비 — runtime 에서 depth ≥ 2 거부.
 */
export interface HeirNode {
  name?: string;
  deceasedBeforeOpening: boolean;
  representatives?: HeirNode[];
}

/**
 * 상속분 계산 입력.
 *
 * 4 순위 분리 필드 (직계비속/직계존속/형제자매/방계4촌) + 배우자 단수.
 * 매뉴얼 §3 ② "선순위 자동 우선" 정책 = 상위 순위 1명 이상 입력 시 하위 순위 자동 무시.
 *
 * 한국어 라벨 출처: source-extraction-spike-2026-05-09.md §8.3 (UI strings verbatim).
 */
export interface InheritanceInput {
  decedent: {
    name?: string;
    /** 1991-01-01 이후 강제. 그 이전이면 RangeError throw. */
    deceasedAt: IsoDate;
  };
  /**
   * 배우자 0~1. 매뉴얼 + UI strings 가 single object 로 hard-cap (`배우자를 한명 이상 입력할 수 없습니다`).
   * `alive: false` 또는 omit 양쪽 모두 "배우자 미존재" 동치.
   */
  spouse?: { name?: string; alive: boolean };
  /** 1순위 직계비속. 매뉴얼 §3 ② fall-through. */
  linealDescendants?: HeirNode[];
  /** 2순위 직계존속. 1순위 부재 시에만 분배 참여. 대습 X (1001조). */
  linealAscendants?: HeirNode[];
  /** 3순위 형제자매. 1·2순위·배우자 모두 부재 시에만. 대습 가능 (1001조). */
  siblings?: HeirNode[];
  /** 4순위 4촌이내 방계혈족 (1000조 ①-4). 1·2·3순위·배우자 모두 부재 시에만. 대습 X. */
  collateralFourth?: HeirNode[];
}

/**
 * 상속인별 지분.
 *
 * 분수 표기 정원 (UI strings `1/1`, `[배우자] (1X1)` 와 정합).
 * - `numerator/denominator`: GCD 약분 후 정수 쌍.
 * - `rawNumerator/rawDenominator`: 약분 전 분수 (검산·디버그용).
 */
export interface InheritanceShare {
  name: string;
  numerator: number;
  denominator: number;
  rawNumerator: number;
  rawDenominator: number;
}

/**
 * 상속분 계산 결과.
 *
 * `dataVersion` 은 inheritance 도메인 module-level 버전 식별자
 * (예: "inheritance/v1.0.0"). 비율 4 상수 + 1991-01-01 cutoff 정원이 변경되면 bump.
 */
export interface InheritanceResult {
  decedent: { name?: string; deceasedAt: IsoDate };
  shares: InheritanceShare[];
  /** B11 단일 source — `STANDARD_DISCLAIMER` 그대로. */
  disclaimer: string;
  dataVersion: string;
  /** ISO 8601 datetime. */
  computedAt: string;
}
