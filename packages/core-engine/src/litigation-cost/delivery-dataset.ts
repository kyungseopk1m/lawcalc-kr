import type { IsoDate } from "../types";
import { DEFAULT_DELIVERY_DATASET } from "./delivery-dataset.generated";
import type { CaseType, DeliveryFormula } from "./types";

/**
 * 송달료 dataset shape. `data/delivery/v1.json` 이 single source — `scripts/sync-delivery.mjs`
 * 가 빌드 타임에 본 모듈의 `delivery-dataset.generated.ts` 로 인라인.
 *
 * 적용 source:
 *   - 「송달료규칙」 (대법원규칙) — 본체. 회당 단가 수권 규정.
 *   - 「송달료규칙의 시행에 따른 업무처리요령 (재일 87-4)」 별표 1 — 사건구분별 송달 횟수 매트릭스 위임.
 *
 * 본 dataset 의 구조 (2 축 분리):
 *   - `unitPriceHistory`: 시기별 회당 단가 슬라이스 (현행 5,500원 / 2025-06-01 시행 외 3 시점 보존).
 *   - `countMatrix`: 사건구분별 송달 횟수 + 산식 분기 (PR 1 의 `DeliveryFormula` 4 kind).
 *
 * `previousVersions` 패턴 (stamp-duty / interest-limits) 대신 본 v1.0.0 은
 * 매트릭스를 현행 단일 슬라이스로 두되 `unitPriceHistory` 만 시기별 array — 단가가 매트릭스보다
 * 자주 바뀌는 도메인 특성 반영.
 */

export interface DeliverySourceLaw {
  name: string;
  lsId: string;
  currentEffectiveFrom: IsoDate;
  currentRuleNumber: string;
  sourceUrl: string;
}

export interface DeliveryMatrixDelegation {
  name: string;
  alias: string;
  sourceUrl: string;
  note: string;
  /** 본 dataset 의 countMatrix 가 인용하는 재판예규 시행일 (ISO). */
  currentEffectiveFrom?: IsoDate;
  /** 본 dataset 의 countMatrix 가 인용하는 재판예규 번호 (예: "재판예규 제1950호"). */
  currentRuleNumber?: string;
}

export interface DeliveryUnitPriceHistoryEntry {
  effectiveFrom: IsoDate;
  unitPriceWon: number;
  secondaryUnitPriceWon: number;
  secondaryNote: string;
  sourceRef: string;
  sourceUrl: string;
}

export interface DeliveryCountMatrixEntry {
  caseType: CaseType;
  labelKo: string;
  formula: DeliveryFormula;
  verifiedBy: string[];
}

export interface DeliveryUnverifiedEntry {
  caseType: CaseType;
  labelKo: string;
  draftFormula: DeliveryFormula;
  verificationPending: string;
}

export interface DeliveryRuleChange {
  effectiveFrom: IsoDate;
  ruleNumber: string;
  summary: string;
}

export interface DeliveryHistoryNote {
  ruleChanges: DeliveryRuleChange[];
  unitPriceChangesCount: number;
  matrixDelegationAnchor: string;
  roundingPolicyNote: string;
}

/**
 * 송달료 dataset. AGPL-3.0-or-later — 본 dataset 의 source 메타는 법령 호수 + 재판예규 호수 +
 * 정부/실무 URL 만.
 */
export interface DeliveryDataset {
  version: string;
  updatedAt: IsoDate;
  sourceLaw: DeliverySourceLaw;
  matrixDelegation: DeliveryMatrixDelegation;
  unitPriceHistory: DeliveryUnitPriceHistoryEntry[];
  countMatrix: DeliveryCountMatrixEntry[];
  unverifiedMatrix: DeliveryUnverifiedEntry[];
  historyNote: DeliveryHistoryNote;
}

const DEFAULT_DATASET: DeliveryDataset = DEFAULT_DELIVERY_DATASET;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(value: string, context: string): void {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new RangeError(`${context}: invalid ISO date "${value}"`);
  }
}

function assertPositiveInt(value: number, context: string): void {
  if (!Number.isFinite(value) || value < 1 || !Number.isInteger(value)) {
    throw new RangeError(`${context}: must be a positive integer (got ${value})`);
  }
}

function assertNonNegativeInt(value: number, context: string): void {
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new RangeError(`${context}: must be a non-negative integer (got ${value})`);
  }
}

function validateFormula(formula: DeliveryFormula, context: string): void {
  switch (formula.kind) {
    case "simplePerParty":
      assertPositiveInt(formula.countPerParty, `${context}.countPerParty`);
      return;
    case "partyOffsetTimesCount":
      assertPositiveInt(formula.countPerParty, `${context}.countPerParty`);
      assertNonNegativeInt(formula.partyOffset, `${context}.partyOffset`);
      if (formula.partyBasis !== "stakeholders") {
        throw new RangeError(`${context}.partyBasis: must be "stakeholders"`);
      }
      return;
    case "baseCountPlusCreditorMultiple":
      assertPositiveInt(formula.baseCount, `${context}.baseCount`);
      assertPositiveInt(formula.creditorMultiple, `${context}.creditorMultiple`);
      return;
    case "range":
      assertPositiveInt(formula.countMin, `${context}.countMin`);
      assertPositiveInt(formula.countMax, `${context}.countMax`);
      if (formula.countMin > formula.countMax) {
        throw new RangeError(
          `${context}: countMin (${formula.countMin}) must be <= countMax (${formula.countMax})`,
        );
      }
      if (formula.partyBasis !== "appellantPlusOpponent") {
        throw new RangeError(`${context}.partyBasis: must be "appellantPlusOpponent"`);
      }
      return;
  }
}

/**
 * dataset 정합성 검증. validate 항목:
 *   - version / updatedAt ISO 형식 + 존재.
 *   - sourceLaw.* 존재 + sourceUrl 비어있지 않음.
 *   - matrixDelegation.sourceUrl 존재.
 *   - unitPriceHistory.length >= 1 + 각 entry effectiveFrom ISO + unitPriceWon > 0 + 내림차순 (최신 first).
 *   - countMatrix 각 caseType 유니크 + formula validate.
 *   - unverifiedMatrix.caseType 와 countMatrix.caseType disjoint.
 *   - historyNote.unitPriceChangesCount === unitPriceHistory.length (정합).
 */
function validate(dataset: DeliveryDataset): void {
  if (!dataset.version || !dataset.updatedAt) {
    throw new Error("DeliveryDataset: version/updatedAt are required");
  }
  assertIsoDate(dataset.updatedAt, "updatedAt");

  const { sourceLaw } = dataset;
  if (!sourceLaw || !sourceLaw.name || !sourceLaw.sourceUrl) {
    throw new Error("DeliveryDataset: sourceLaw.name/sourceUrl are required");
  }
  assertIsoDate(sourceLaw.currentEffectiveFrom, "sourceLaw.currentEffectiveFrom");

  const { matrixDelegation } = dataset;
  if (!matrixDelegation || !matrixDelegation.sourceUrl || !matrixDelegation.alias) {
    throw new Error("DeliveryDataset: matrixDelegation.alias/sourceUrl are required");
  }

  if (!Array.isArray(dataset.unitPriceHistory) || dataset.unitPriceHistory.length === 0) {
    throw new Error("DeliveryDataset: unitPriceHistory must be a non-empty array");
  }
  let previousEffectiveFrom: string | null = null;
  for (const [i, entry] of dataset.unitPriceHistory.entries()) {
    assertIsoDate(entry.effectiveFrom, `unitPriceHistory[${i}].effectiveFrom`);
    if (!Number.isFinite(entry.unitPriceWon) || entry.unitPriceWon <= 0) {
      throw new RangeError(
        `unitPriceHistory[${i}].unitPriceWon: must be > 0 (got ${entry.unitPriceWon})`,
      );
    }
    if (!Number.isFinite(entry.secondaryUnitPriceWon) || entry.secondaryUnitPriceWon <= 0) {
      throw new RangeError(
        `unitPriceHistory[${i}].secondaryUnitPriceWon: must be > 0 (got ${entry.secondaryUnitPriceWon})`,
      );
    }
    if (previousEffectiveFrom !== null && entry.effectiveFrom >= previousEffectiveFrom) {
      throw new RangeError(
        `unitPriceHistory: entries must be sorted by effectiveFrom DESC (latest first). ` +
          `entry[${i}] effectiveFrom=${entry.effectiveFrom} >= previous=${previousEffectiveFrom}`,
      );
    }
    previousEffectiveFrom = entry.effectiveFrom;
  }

  if (!Array.isArray(dataset.countMatrix)) {
    throw new Error("DeliveryDataset: countMatrix must be an array");
  }
  const seenCaseTypes = new Set<CaseType>();
  for (const [i, entry] of dataset.countMatrix.entries()) {
    if (!entry.caseType || !entry.labelKo) {
      throw new Error(`countMatrix[${i}]: caseType/labelKo are required`);
    }
    if (seenCaseTypes.has(entry.caseType)) {
      throw new RangeError(`countMatrix: duplicate caseType "${entry.caseType}"`);
    }
    seenCaseTypes.add(entry.caseType);
    validateFormula(entry.formula, `countMatrix[${i}].formula`);
  }

  if (!Array.isArray(dataset.unverifiedMatrix)) {
    throw new Error("DeliveryDataset: unverifiedMatrix must be an array");
  }
  for (const [i, entry] of dataset.unverifiedMatrix.entries()) {
    if (!entry.caseType || !entry.labelKo || !entry.verificationPending) {
      throw new Error(`unverifiedMatrix[${i}]: caseType/labelKo/verificationPending are required`);
    }
    if (seenCaseTypes.has(entry.caseType)) {
      throw new RangeError(
        `unverifiedMatrix[${i}]: caseType "${entry.caseType}" already present in countMatrix`,
      );
    }
    validateFormula(entry.draftFormula, `unverifiedMatrix[${i}].draftFormula`);
  }

  const { historyNote } = dataset;
  if (!historyNote || !Array.isArray(historyNote.ruleChanges)) {
    throw new Error("DeliveryDataset: historyNote.ruleChanges is required");
  }
  if (historyNote.unitPriceChangesCount !== dataset.unitPriceHistory.length) {
    throw new RangeError(
      `historyNote.unitPriceChangesCount (${historyNote.unitPriceChangesCount}) must equal ` +
        `unitPriceHistory.length (${dataset.unitPriceHistory.length})`,
    );
  }
}

/**
 * 기본 인라인 dataset 또는 호출자가 제공한 외부 dataset 을 검증해 반환한다.
 *
 * @internal core-engine 내부 전용 — litigation-cost / delivery 도메인이 dataset 주입 receiver.
 *           외부 consumer 는 `computeDeliveryFee(input, { dataset })` 형태로 주입한다.
 */
export function loadDeliveryDataset(override?: DeliveryDataset): DeliveryDataset {
  const dataset = override ?? DEFAULT_DATASET;
  validate(dataset);
  return dataset;
}

/**
 * dataset 식별자 (`delivery/vX.Y.Z`). `.lcalc` envelope v3 의
 * `dataVersions["delivery"]` 와 `DeliveryFeeResult.dataVersion` 에 그대로 기록.
 */
export function deliveryDatasetVersionTag(dataset: DeliveryDataset): string {
  return `delivery/v${dataset.version}`;
}

/**
 * 사건구분의 송달 횟수 매트릭스 entry 반환.
 *
 *   - countMatrix 에 존재 → 해당 entry 반환.
 *   - unverifiedMatrix 에 존재 → RangeError (verificationPending 메시지 포함).
 *   - 둘 다 없음 → RangeError.
 */
export function getDeliveryCount(
  dataset: DeliveryDataset,
  caseType: CaseType,
): DeliveryCountMatrixEntry {
  const verified = dataset.countMatrix.find((e) => e.caseType === caseType);
  if (verified) {
    return verified;
  }
  const unverified = dataset.unverifiedMatrix.find((e) => e.caseType === caseType);
  if (unverified) {
    throw new RangeError(
      `getDeliveryCount: caseType "${caseType}" (${unverified.labelKo}) 의 송달 횟수 매트릭스가 ` +
        `정본 출처 확보 대기 상태입니다 — ${unverified.verificationPending}`,
    );
  }
  throw new RangeError(
    `getDeliveryCount: caseType "${caseType}" 가 본 dataset 의 매트릭스에 없습니다`,
  );
}

/**
 * 시기별 회당 단가 lookup. `filingDate` 미지정 시 dataset 의 최신 슬라이스 (현행),
 * 지정 시 `effectiveFrom <= filingDate` 의 최신 슬라이스 반환.
 *
 * @example
 *   getDeliveryUnitPriceAt(dataset)                  // → 5500 (현행)
 *   getDeliveryUnitPriceAt(dataset, "2025-06-01")    // → 5500
 *   getDeliveryUnitPriceAt(dataset, "2024-12-31")    // → 5200 (2021-09-01 시행 슬라이스)
 *   getDeliveryUnitPriceAt(dataset, "2019-04-30")    // → throw (모든 슬라이스보다 이른 시점)
 */
export function getDeliveryUnitPriceAt(
  dataset: DeliveryDataset,
  filingDate?: IsoDate,
): DeliveryUnitPriceHistoryEntry {
  if (filingDate === undefined) {
    // unitPriceHistory 는 validate 단계에서 내림차순 (최신 first) + 비어있지 않음 강제.
    return dataset.unitPriceHistory[0]!;
  }
  assertIsoDate(filingDate, "filingDate");
  for (const entry of dataset.unitPriceHistory) {
    if (entry.effectiveFrom <= filingDate) {
      return entry;
    }
  }
  throw new RangeError(
    `getDeliveryUnitPriceAt: filingDate "${filingDate}" 가 dataset 의 모든 슬라이스보다 이른 시점입니다 ` +
      `(가장 이른 슬라이스: ${dataset.unitPriceHistory[dataset.unitPriceHistory.length - 1]!.effectiveFrom})`,
  );
}
