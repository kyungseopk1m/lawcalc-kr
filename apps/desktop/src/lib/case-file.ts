import { useEffect, useRef } from "react";

import { STANDARD_DISCLAIMER } from "@lawcalc-kr/core-engine";

import type { LcalcCaseCalculationKey, LcalcCaseInfo, LcalcFile } from "./ipc";
import { CURRENT_LCALC_SCHEMA_VERSION } from "./lcalc-migrations";

/** 사건 파일 UI 가 탭 이름을 표시할 때 쓰는 한국어 라벨. */
export const CASE_CALCULATION_LABELS: Record<LcalcCaseCalculationKey, string> = {
  interest: "이자 계산",
  inheritance: "상속분",
  "litigation-cost": "소송비용",
  appropriation: "변제충당",
  compensation: "손해배상",
};

export const CASE_CALCULATION_KEYS = Object.keys(
  CASE_CALCULATION_LABELS,
) as LcalcCaseCalculationKey[];

export type CaseCollectOutcome =
  | { status: "ok"; file: LcalcFile }
  | { status: "pristine" }
  | { status: "invalid" };

/**
 * 각 calculator 탭이 사건 파일 저장/열기에 참여하기 위해 등록하는 인터페이스.
 *
 * - `collect`: 현재 입력을 단일 도메인 `.lcalc` envelope 로 반환.
 *   초기 상태 그대로면 "pristine" (사건 파일에서 제외), 입력 오류면 "invalid" (저장 중단).
 * - `apply`: 사건 파일에서 꺼낸 단일 도메인 envelope 를 탭 상태로 복원.
 * - `markSaved`: 사건 파일 저장 성공 시 해당 탭의 미저장 변경 추적을 해제.
 * - `reset`: 탭을 초기 상태로 되돌린다. 사건 파일 로드 시 그 사건에 없는 탭을 비워,
 *   직전 사건의 잔여 입력이 다음 저장에 섞여 들어가는 교차 오염을 막는다.
 */
export interface CaseSlot {
  collect: () => CaseCollectOutcome;
  apply: (file: LcalcFile) => void;
  markSaved: () => void;
  reset: () => void;
}

const slots = new Map<LcalcCaseCalculationKey, CaseSlot>();

export function registerCaseSlot(key: LcalcCaseCalculationKey, slot: CaseSlot): () => void {
  slots.set(key, slot);
  return () => {
    if (slots.get(key) === slot) {
      slots.delete(key);
    }
  };
}

/**
 * 탭 컴포넌트용 등록 hook. 최신 render 의 collect/apply 를 ref 로 추적해
 * stale closure 없이 한 번만 등록한다.
 */
export function useCaseSlot(key: LcalcCaseCalculationKey, slot: CaseSlot): void {
  const slotRef = useRef(slot);

  useEffect(() => {
    slotRef.current = slot;
  });

  useEffect(
    () =>
      registerCaseSlot(key, {
        collect: () => slotRef.current.collect(),
        apply: (file) => slotRef.current.apply(file),
        markSaved: () => slotRef.current.markSaved(),
        reset: () => slotRef.current.reset(),
      }),
    [key],
  );
}

export interface CollectedCaseCalculations {
  calculations: Partial<Record<LcalcCaseCalculationKey, LcalcFile>>;
  included: LcalcCaseCalculationKey[];
  invalid: LcalcCaseCalculationKey[];
}

export function collectCaseCalculations(): CollectedCaseCalculations {
  const calculations: Partial<Record<LcalcCaseCalculationKey, LcalcFile>> = {};
  const included: LcalcCaseCalculationKey[] = [];
  const invalid: LcalcCaseCalculationKey[] = [];

  for (const key of CASE_CALCULATION_KEYS) {
    const slot = slots.get(key);
    if (!slot) {
      continue;
    }
    const outcome = slot.collect();
    if (outcome.status === "ok") {
      calculations[key] = outcome.file;
      included.push(key);
    } else if (outcome.status === "invalid") {
      invalid.push(key);
    }
  }

  return { calculations, included, invalid };
}

/**
 * 사건 파일의 계산들을 각 탭에 복원한다. 적용된 탭 키 목록을 반환.
 *
 * `resetAbsent` 가 true 면 (= 완결된 사건 파일 로드) 해당 사건에 없는 탭을 초기화해
 * 워크스페이스를 그 사건의 상태로만 맞춘다. 단일 계산 파일을 "사건 열기"로 추가할
 * 때는 false 로 두어 다른 탭의 입력을 보존한다.
 */
export function applyCaseCalculations(
  calculations: Partial<Record<LcalcCaseCalculationKey, LcalcFile>>,
  resetAbsent = false,
): LcalcCaseCalculationKey[] {
  const applied: LcalcCaseCalculationKey[] = [];
  for (const key of CASE_CALCULATION_KEYS) {
    const file = calculations[key];
    const slot = slots.get(key);
    if (!slot) {
      continue;
    }
    if (file) {
      slot.apply(file);
      applied.push(key);
    } else if (resetAbsent) {
      slot.reset();
    }
  }
  return applied;
}

export function markCaseCalculationsSaved(keys: LcalcCaseCalculationKey[]): void {
  for (const key of keys) {
    slots.get(key)?.markSaved();
  }
}

/**
 * 수집한 계산들을 사건 파일(case@1) envelope 로 묶는다. envelopeFeatures 는
 * "case@1" + 포함된 계산들의 capability 합집합, dataVersions 는 도메인별 키가
 * 서로 겹치지 않으므로 단순 병합한다.
 */
export function buildCaseLcalcFile(
  caseInfo: LcalcCaseInfo,
  calculations: Partial<Record<LcalcCaseCalculationKey, LcalcFile>>,
  appVersion: string,
): LcalcFile {
  const features = new Set<string>(["case@1"]);
  const dataVersions: Record<string, string> = {};
  for (const child of Object.values(calculations)) {
    for (const feature of child.envelopeFeatures) {
      features.add(feature);
    }
    Object.assign(dataVersions, child.dataVersions);
  }

  return {
    schemaVersion: CURRENT_LCALC_SCHEMA_VERSION,
    kind: "case",
    envelopeFeatures: [...features],
    dataVersions,
    payload: {
      appVersion,
      createdAt: new Date().toISOString(),
      caseInfo,
      calculations,
      disclaimer: STANDARD_DISCLAIMER,
    },
  };
}
