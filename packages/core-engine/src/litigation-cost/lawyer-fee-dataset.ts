import type { IsoDate } from "../types";
import { DEFAULT_LAWYER_FEE_DATASET } from "./lawyer-fee-dataset.generated";
import type { LawyerFeeAppealsRule, LawyerFeeBracket, NoOralHearingReason } from "./types";

/**
 * 변호사보수 dataset shape. `data/lawyer-fee/v2.json` 이 single source — `scripts/sync-lawyer-fee.mjs`
 * 가 빌드 타임에 본 모듈의 `lawyer-fee-dataset.generated.ts` 로 인라인.
 *
 * 적용 조문 (G2 + G5 final 확정):
 *   - 「변호사보수의 소송비용 산입에 관한 규칙」 제3조 제1항 (각 심급단위 별표 적용), 제4조 제1항 +
 *     민사소송 등 인지규칙 제25조 (상소심 소가 = 상소로써 불복하는 범위)
 *   - 동 규칙 제3조 제2항 (가압류·가처분 ×1/2, 변론·심문기일 시 ×1.0)
 *   - 동 규칙 제5조 (무변론·자백·이행권고결정 ×1/2)
 *   - 동 규칙 제6조 제1항·②항 (재량 감액 무한 / 증액 ×1.5 cap)
 *   - Korea Legal Aid Corporation (KLAC) 보수 기준 (대한법률구조공단 × 0.42)
 *
 * `brackets` 는 현행 2020판 별표(표 D)다. v1.3.0 부터 연혁 7개 판을 `ruleVersions` 로, 구 별표
 * 표 A·B·C 를 `historicalTables` 로 함께 싣는다. `computeLawyerFee` 는 계속 `brackets` 만 쓰고,
 * 접수일별 판 선택은 소송비용확정 엔진(`computeCostAssessment`)이 한다.
 */

export interface LawyerFeeSourceLaw {
  name: string;
  lsId: string;
  currentEffectiveFrom: IsoDate;
  currentRuleNumber: string;
  bracketTableEffectiveFrom: IsoDate;
  bracketTableRuleNumber: string;
  sourceUrl: string;
}

export interface LawyerFeeAppealsRuleMeta {
  policy: LawyerFeeAppealsRule;
  note: string;
  sourceArticle: string;
}

export interface LawyerFeeProvisionalModifier {
  multiplier: number;
  exception: string;
  sourceArticle: string;
  enumVariant: "provisionalCase";
}

export interface LawyerFeeNoOralHearingTrigger {
  reason: NoOralHearingReason;
  labelKo: string;
  effectiveFrom?: IsoDate;
  ruleNumber?: string;
}

export interface LawyerFeeNoOralHearingModifier {
  multiplier: number;
  triggers: LawyerFeeNoOralHearingTrigger[];
  sourceArticle: string;
  enumVariant: "noOralHearingOrAdmission";
}

export interface LawyerFeeCourtDiscretionModifier {
  decreaseUnlimited: boolean;
  increaseMaxMultiplier: number;
  note: string;
  sourceArticle: string;
  enumVariant: "courtDiscretion";
  supremeCourtFactors: string[];
  sourceCase: string;
  sourceCaseUrl: string;
}

export interface LawyerFeeKoreaLegalAidModifier {
  multiplier: number;
  applicableCases: string[];
  nonApplicableCases: string[];
  note: string;
  source: string;
  sourceUrl: string;
  enumVariant: "koreaLegalAid";
}

export interface LawyerFeeCustomPercentModifier {
  note: string;
  enumVariant: "customPercent";
}

export interface LawyerFeeModifiers {
  provisionalSeizureOrInjunction: LawyerFeeProvisionalModifier;
  noOralHearingOrAdmission: LawyerFeeNoOralHearingModifier;
  courtDiscretion: LawyerFeeCourtDiscretionModifier;
  koreaLegalAid: LawyerFeeKoreaLegalAidModifier;
  customPercent: LawyerFeeCustomPercentModifier;
}

export interface LawyerFeeStackingPolicy {
  default: "compound";
  minMultiplierCap: number;
  maxMultiplierCap: number;
  note: string;
  sourceBasis: string;
}

export interface LawyerFeeInterpretiveCases {
  scopeOfAgreedFee: {
    caseNumber: string;
    url: string;
    note: string;
  };
}

export interface LawyerFeeBracketTableChange {
  effectiveFrom: IsoDate;
  ruleNumber: string;
  summary: string;
}

export interface LawyerFeeModifierChange {
  effectiveFrom: IsoDate;
  ruleNumber: string;
  summary: string;
}

export interface LawyerFeeHistoryNote {
  bracketTableChanges: LawyerFeeBracketTableChange[];
  modifierChanges: LawyerFeeModifierChange[];
}

/** 별표 표 식별자. A = 1981·1990·2003판, B = 2008·2013판, C = 2018판, D = 2020판(현행 `brackets`). */
export type LawyerFeeTableKey = "A" | "B" | "C" | "D";

export type LawyerFeeRuleVersionKey =
  "v1981" | "v1990" | "v2003" | "v2008" | "v2013" | "v2018" | "v2020";

/**
 * 제5조 감액(1/2) 사유. 판마다 범위가 다르다.
 *   - `admissionJudgment`: 피고의 전부자백·의제자백(자백간주)에 의한 판결 (전 판)
 *   - `nonJudgmentEnding`: 화해·청구의 포기·인낙 등 재판에 의하지 않은 완결 (1981·1990판 제5조 제2호)
 *   - `noOralHearingJudgment`: 무변론 판결 (2003판부터)
 *   - `orderForPerformance`: 이행권고결정 (2020판부터)
 */
export type LawyerFeeArticle5Reason =
  "admissionJudgment" | "nonJudgmentEnding" | "noOralHearingJudgment" | "orderForPerformance";

/** 규칙 한 판. 접수일이 `effectiveFrom` 이상인 마지막 판이 기본 선택이다. */
export interface LawyerFeeRuleVersion {
  key: LawyerFeeRuleVersionKey;
  ruleNumber: string;
  promulgatedOn: IsoDate;
  effectiveFrom: IsoDate;
  /** 법제처 법령 일련번호. */
  mst: number;
  sourceUrl: string;
  table: LawyerFeeTableKey;
  /** 제3조 제1항 단서 최저액 (2008판 10만원, 2013·2018판 30만원). 없으면 null. */
  minimumWon: number | null;
  minimumArticle: string | null;
  article5Reasons: LawyerFeeArticle5Reason[];
  /** 제3조 제2항 가압류·가처분 1/2 규정 유무 (1990판 신설). */
  provisionalHalf: boolean;
  /** 제6조 제2항 증액 규정 유무 (2008판 신설). */
  courtIncreaseAllowed: boolean;
  /** 부칙 경과규정 원문 요지. 없으면 null (1981·1990·2003·2020판). */
  transitionalProvision: string | null;
}

/**
 * 변호사보수 dataset. AGPL-3.0-or-later — 본 dataset 의 source 메타는 법령 호수 + 조문 +
 * 정부/실무 URL (law.go.kr, klac.or.kr, casenote.kr) 만.
 */
export interface LawyerFeeDataset {
  version: string;
  updatedAt: IsoDate;
  source: string;
  sourceUrl: string;
  license: string;
  snapshotDate: IsoDate;
  snapshotMethod: string;
  sourceLaw: LawyerFeeSourceLaw;
  brackets: LawyerFeeBracket[];
  appealsRule: LawyerFeeAppealsRuleMeta;
  modifiers: LawyerFeeModifiers;
  stackingPolicy: LawyerFeeStackingPolicy;
  interpretiveCases: LawyerFeeInterpretiveCases;
  historyNote: LawyerFeeHistoryNote;
  /** 구 별표. 표 D 는 `brackets` 라 여기 없다. */
  historicalTables: Record<"A" | "B" | "C", LawyerFeeBracket[]>;
  /** 연혁 판, effectiveFrom 오름차순. */
  ruleVersions: LawyerFeeRuleVersion[];
}

const DEFAULT_DATASET: LawyerFeeDataset = DEFAULT_LAWYER_FEE_DATASET;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(value: string, context: string): void {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new RangeError(`${context}: invalid ISO date "${value}"`);
  }
}

function assertFiniteNonNegative(value: number, context: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${context}: must be a finite non-negative number (got ${value})`);
  }
}

function assertMultiplierInRange(value: number, max: number, context: string): void {
  if (!Number.isFinite(value) || value <= 0 || value > max) {
    throw new RangeError(`${context}: must be in (0, ${max}] (got ${value})`);
  }
}

const RULE_TABLE_KEYS = ["A", "B", "C", "D"] as const;

/** 연혁 판 목록과 구 별표 검증. 판은 effectiveFrom 오름차순, 표 키는 실재하는 표를 가리켜야 한다. */
function validateRuleVersions(dataset: LawyerFeeDataset): void {
  for (const key of ["A", "B", "C"] as const) {
    const table = dataset.historicalTables?.[key];
    if (!Array.isArray(table) || table.length === 0) {
      throw new Error(`LawyerFeeDataset: historicalTables.${key} is required`);
    }
    validateBracketList(table, `historicalTables.${key}`);
  }
  const versions = dataset.ruleVersions;
  if (!Array.isArray(versions) || versions.length === 0) {
    throw new Error("LawyerFeeDataset: ruleVersions must be a non-empty array");
  }
  for (const [i, v] of versions.entries()) {
    assertIsoDate(v.effectiveFrom, `ruleVersions[${i}].effectiveFrom`);
    if (i > 0 && v.effectiveFrom <= versions[i - 1]!.effectiveFrom) {
      throw new RangeError(`ruleVersions[${i}]: effectiveFrom must be ascending`);
    }
    if (!RULE_TABLE_KEYS.includes(v.table)) {
      throw new RangeError(`ruleVersions[${i}].table: unknown table "${String(v.table)}"`);
    }
    if (v.minimumWon !== null) {
      assertFiniteNonNegative(v.minimumWon, `ruleVersions[${i}].minimumWon`);
    }
    if (!v.ruleNumber || !v.sourceUrl) {
      throw new Error(`ruleVersions[${i}]: ruleNumber/sourceUrl are required`);
    }
  }
}

function validateBracketList(brackets: LawyerFeeBracket[], label: string): void {
  const sorted = brackets.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const seenSortOrder = new Set<number>();
  for (const [i, b] of sorted.entries()) {
    if (seenSortOrder.has(b.sortOrder)) {
      throw new RangeError(`LawyerFeeDataset: duplicate sortOrder ${b.sortOrder}`);
    }
    seenSortOrder.add(b.sortOrder);
    assertFiniteNonNegative(b.scopeStart, `${label}[${i}].scopeStart`);
    if (b.scopeEnd !== null) {
      assertFiniteNonNegative(b.scopeEnd, `${label}[${i}].scopeEnd`);
      if (b.scopeEnd <= b.scopeStart) {
        throw new RangeError(
          `${label}[${i}]: scopeEnd (${b.scopeEnd}) must be > scopeStart (${b.scopeStart})`,
        );
      }
    }
    assertFiniteNonNegative(b.baseAmount, `${label}[${i}].baseAmount`);
    if (!Number.isFinite(b.rate) || b.rate < 0 || b.rate > 1) {
      throw new RangeError(`${label}[${i}].rate: must be in [0, 1] (got ${b.rate})`);
    }
    if (!b.name || !b.rateText) {
      throw new Error(`${label}[${i}]: name/rateText are required`);
    }
    const next = sorted[i + 1];
    if (next && b.scopeEnd !== next.scopeStart) {
      throw new RangeError(
        `${label}: scopeEnd of sortOrder ${b.sortOrder} (${b.scopeEnd}) must equal ` +
          `scopeStart of sortOrder ${next.sortOrder} (${next.scopeStart})`,
      );
    }
    if (!next && b.scopeEnd !== null) {
      throw new RangeError(
        `${label}: last bracket (sortOrder ${b.sortOrder}) must have scopeEnd=null`,
      );
    }
  }
}

/**
 * dataset 정합성 검증. validate 항목:
 *   - version / updatedAt ISO + 존재.
 *   - sourceLaw.* 존재 + sourceUrl 비어있지 않음.
 *   - brackets.length === 8 (별표 8구간 고정) + sortOrder 1..8 유니크 + scopeStart 오름차순.
 *   - 각 bracket: baseAmount/rate ≥ 0 + rate ≤ 1 + scopeEnd === next.scopeStart 정합 +
 *     마지막 row 의 scopeEnd === null.
 *   - appealsRule.policy === "perInstanceIndependent" 강제 (G2 제2조.4).
 *   - modifiers.*.multiplier ∈ (0, 1.5] (제6조 제2항 cap 정합).
 *   - stackingPolicy.maxMultiplierCap === 1.5 + minMultiplierCap === 0.0 (PR 1 의
 *     LAWYER_FEE_MULTIPLIER_MAX/MIN 와 정합).
 */
function validate(dataset: LawyerFeeDataset): void {
  if (!dataset.version || !dataset.updatedAt) {
    throw new Error("LawyerFeeDataset: version/updatedAt are required");
  }
  assertIsoDate(dataset.updatedAt, "updatedAt");

  const { sourceLaw } = dataset;
  if (!sourceLaw || !sourceLaw.name || !sourceLaw.sourceUrl) {
    throw new Error("LawyerFeeDataset: sourceLaw.name/sourceUrl are required");
  }
  assertIsoDate(sourceLaw.currentEffectiveFrom, "sourceLaw.currentEffectiveFrom");
  assertIsoDate(sourceLaw.bracketTableEffectiveFrom, "sourceLaw.bracketTableEffectiveFrom");

  if (!Array.isArray(dataset.brackets) || dataset.brackets.length !== 8) {
    throw new RangeError(
      `LawyerFeeDataset: brackets.length must be 8 (got ${dataset.brackets?.length})`,
    );
  }

  validateBracketList(dataset.brackets, "brackets");

  validateRuleVersions(dataset);

  const { appealsRule } = dataset;
  if (!appealsRule || appealsRule.policy !== "perInstanceIndependent") {
    throw new RangeError(
      `LawyerFeeDataset: appealsRule.policy must be "perInstanceIndependent" (got ${String(appealsRule?.policy)})`,
    );
  }

  const { modifiers } = dataset;
  if (!modifiers) {
    throw new Error("LawyerFeeDataset: modifiers are required");
  }
  assertMultiplierInRange(
    modifiers.provisionalSeizureOrInjunction.multiplier,
    1.5,
    "modifiers.provisionalSeizureOrInjunction.multiplier",
  );
  assertMultiplierInRange(
    modifiers.noOralHearingOrAdmission.multiplier,
    1.5,
    "modifiers.noOralHearingOrAdmission.multiplier",
  );
  if (
    !Array.isArray(modifiers.noOralHearingOrAdmission.triggers) ||
    modifiers.noOralHearingOrAdmission.triggers.length === 0
  ) {
    throw new Error("modifiers.noOralHearingOrAdmission.triggers must be a non-empty array");
  }
  assertMultiplierInRange(
    modifiers.koreaLegalAid.multiplier,
    1.5,
    "modifiers.koreaLegalAid.multiplier",
  );
  assertFiniteNonNegative(
    modifiers.courtDiscretion.increaseMaxMultiplier,
    "modifiers.courtDiscretion.increaseMaxMultiplier",
  );

  const { stackingPolicy } = dataset;
  if (!stackingPolicy || stackingPolicy.default !== "compound") {
    throw new RangeError(
      `LawyerFeeDataset: stackingPolicy.default must be "compound" (got ${String(stackingPolicy?.default)})`,
    );
  }
  if (stackingPolicy.minMultiplierCap !== 0.0 || stackingPolicy.maxMultiplierCap !== 1.5) {
    throw new RangeError(
      `LawyerFeeDataset: stackingPolicy clamp must be [0.0, 1.5] (got ` +
        `[${stackingPolicy.minMultiplierCap}, ${stackingPolicy.maxMultiplierCap}])`,
    );
  }
}

/**
 * 기본 인라인 dataset 또는 호출자가 제공한 외부 dataset 을 검증해 반환한다.
 *
 * @internal core-engine 내부 전용 — litigation-cost / lawyer-fee 도메인이 dataset 주입 receiver.
 *           외부 consumer 는 `computeLawyerFee(input, { dataset })` 형태로 주입한다.
 */
export function loadLawyerFeeDataset(override?: LawyerFeeDataset): LawyerFeeDataset {
  const dataset = override ?? DEFAULT_DATASET;
  validate(dataset);
  return dataset;
}

/**
 * dataset 식별자 (`lawyer-fee/vX.Y.Z`). `.lcalc` envelope v3 의
 * `dataVersions["lawyer-fee"]` 와 `LawyerFeeResult.dataVersion` 에 그대로 기록.
 */
export function lawyerFeeDatasetVersionTag(dataset: LawyerFeeDataset): string {
  return `lawyer-fee/v${dataset.version}`;
}

/**
 * 소가에 해당하는 누진 bracket 반환. 매칭 규칙:
 *   scopeStart <= caseValue < scopeEnd (마지막 bracket 의 scopeEnd null = 무한대).
 *
 * caseValue 가 음수면 RangeError. validator (`validateLawyerFeeInput`) 가 이미 거부하지만
 * dataset-only 호출 경로 안전망.
 */
export function getLawyerFeeBracket(
  dataset: LawyerFeeDataset,
  caseValue: number,
): LawyerFeeBracket {
  if (!Number.isFinite(caseValue) || caseValue < 0) {
    throw new RangeError(`getLawyerFeeBracket.caseValue: must be >= 0 (got ${caseValue})`);
  }
  const sorted = dataset.brackets.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  for (const b of sorted) {
    if (caseValue >= b.scopeStart && (b.scopeEnd === null || caseValue < b.scopeEnd)) {
      return b;
    }
  }
  throw new Error(`getLawyerFeeBracket: no bracket matched for caseValue ${caseValue}`);
}
