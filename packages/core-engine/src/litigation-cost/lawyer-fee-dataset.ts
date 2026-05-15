import type { IsoDate } from "../types";
import { DEFAULT_LAWYER_FEE_DATASET } from "./lawyer-fee-dataset.generated";
import type { LawyerFeeAppealsRule, LawyerFeeBracket, NoOralHearingReason } from "./types";

/**
 * 변호사보수 dataset shape. `data/lawyer-fee/v2.json` 이 single source — `scripts/sync-lawyer-fee.mjs`
 * 가 빌드 타임에 본 모듈의 `lawyer-fee-dataset.generated.ts` 로 인라인.
 *
 * 적용 조문 (G2 + G5 final 확정):
 *   - 「변호사보수의 소송비용 산입에 관한 규칙」 제3조 ①·③항 (별표 적용 + 항소심 불복 범위 = 소가)
 *   - 동 규칙 제3조 ②항 (가압류·가처분 ×1/2, 변론·심문기일 시 ×1.0)
 *   - 동 규칙 제5조 (무변론·자백·이행권고결정 ×1/2)
 *   - 동 규칙 제6조 ①항·②항 (재량 감액 무한 / 증액 ×1.5 cap)
 *   - Korea Legal Aid Corporation (KLAC) 보수 기준 (대한법률구조공단 × 0.42)
 *
 * `previousVersions` 패턴 (legal-rates) 대신 본 v1.1.0 은 현행 단일 슬라이스 (2018-04-01
 * 별표) + `historyNote.bracketTableChanges` 메타로 시기별 변경 시점만 보존. history-aware
 * 슬라이스 (2008/2013/2018) 확장은 v0.3.1+ 영역.
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

/**
 * 변호사보수 dataset. AGPL-3.0-or-later — 본 dataset 의 source 메타는 법령 호수 + 조문 +
 * 정부/실무 URL (law.go.kr, klac.or.kr, casenote.kr) 만.
 */
export interface LawyerFeeDataset {
  version: string;
  updatedAt: IsoDate;
  sourceLaw: LawyerFeeSourceLaw;
  brackets: LawyerFeeBracket[];
  appealsRule: LawyerFeeAppealsRuleMeta;
  modifiers: LawyerFeeModifiers;
  stackingPolicy: LawyerFeeStackingPolicy;
  interpretiveCases: LawyerFeeInterpretiveCases;
  historyNote: LawyerFeeHistoryNote;
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

/**
 * dataset 정합성 검증. validate 항목:
 *   - version / updatedAt ISO + 존재.
 *   - sourceLaw.* 존재 + sourceUrl 비어있지 않음.
 *   - brackets.length === 8 (별표 8구간 고정) + sortOrder 1..8 유니크 + scopeStart 오름차순.
 *   - 각 bracket: baseAmount/rate ≥ 0 + rate ≤ 1 + scopeEnd === next.scopeStart 정합 +
 *     마지막 row 의 scopeEnd === null.
 *   - appealsRule.policy === "perInstanceIndependent" 강제 (G2 §2.4).
 *   - modifiers.*.multiplier ∈ (0, 1.5] (제6조 ②항 cap 정합).
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

  const sorted = dataset.brackets.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const seenSortOrder = new Set<number>();
  for (const [i, b] of sorted.entries()) {
    if (seenSortOrder.has(b.sortOrder)) {
      throw new RangeError(`LawyerFeeDataset: duplicate sortOrder ${b.sortOrder}`);
    }
    seenSortOrder.add(b.sortOrder);
    assertFiniteNonNegative(b.scopeStart, `brackets[${i}].scopeStart`);
    if (b.scopeEnd !== null) {
      assertFiniteNonNegative(b.scopeEnd, `brackets[${i}].scopeEnd`);
      if (b.scopeEnd <= b.scopeStart) {
        throw new RangeError(
          `brackets[${i}]: scopeEnd (${b.scopeEnd}) must be > scopeStart (${b.scopeStart})`,
        );
      }
    }
    assertFiniteNonNegative(b.baseAmount, `brackets[${i}].baseAmount`);
    if (!Number.isFinite(b.rate) || b.rate < 0 || b.rate > 1) {
      throw new RangeError(`brackets[${i}].rate: must be in [0, 1] (got ${b.rate})`);
    }
    if (!b.name || !b.rateText) {
      throw new Error(`brackets[${i}]: name/rateText are required`);
    }
    const next = sorted[i + 1];
    if (next && b.scopeEnd !== next.scopeStart) {
      throw new RangeError(
        `brackets: scopeEnd of sortOrder ${b.sortOrder} (${b.scopeEnd}) must equal ` +
          `scopeStart of sortOrder ${next.sortOrder} (${next.scopeStart})`,
      );
    }
    if (!next && b.scopeEnd !== null) {
      throw new RangeError(
        `brackets: last bracket (sortOrder ${b.sortOrder}) must have scopeEnd=null`,
      );
    }
  }

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
