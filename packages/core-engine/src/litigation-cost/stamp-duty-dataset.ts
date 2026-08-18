import type { IsoDate } from "../types";
import { DEFAULT_STAMP_DUTY_DATASET } from "./stamp-duty-dataset.generated";
import type { AppealsLevel, StampDutyBracket, StampDutyRoundingPolicy } from "./types";

/**
 * 인지법 dataset shape. `data/stamp-duty/v1.json` 이 single source — `scripts/sync-stamp-duty.mjs`
 * 가 빌드 타임에 본 모듈의 `stamp-duty-dataset.generated.ts` 로 인라인.
 *
 * 적용 조문:
 *   - 「민사소송 등 인지법」 제2조 (누진표 + 반올림 정책)
 *   - 동법 제3조 (항소·상고 배수)
 *   - 동법 제7조 (지급명령·화해 배수)
 *   - 동법 제16조 (전자소송 감액)
 *
 * `previousVersions` 패턴 (legal-rates) 대신 v1.0.0 은 현행 단일 슬라이스 + `historyNote`
 * 메타로 시기별 변경 시점만 보존. PR 5+ 진입 시 history-aware 슬라이스 확장 결정.
 */

export interface StampDutySourceLaw {
  name: string;
  lsId: string;
  currentEffectiveFrom: IsoDate;
  currentLawNumber: string;
  sourceUrl: string;
}

export interface StampDutySpecialProcedureEntry {
  multiplier: number;
  rateText: string;
  sourceArticle: string;
}

export interface StampDutySpecialProcedures {
  paymentOrder: StampDutySpecialProcedureEntry;
  settlement: StampDutySpecialProcedureEntry;
  /**
   * 조정신청(머). 근거는 인지법이 아니라 「민사조정규칙」제3조 제1항이다 —
   * "조정신청의 수수료는 「민사소송 등 인지법」 제2조에 따라 산출한 금액의 10분의 1로 한다."
   */
  mediation: StampDutySpecialProcedureEntry;
  /**
   * 항고·재항고(라/마). 제2조 소장 누진표와 무관한 별도 체계다.
   *
   *   - 제11조 ②항: 아래 ①항 대상이 아닌 항고장은 2천원 정액.
   *   - 제11조 ①항: 제9조·제10조 신청에 관한 재판(항고법원 재판 포함)에 대한 항고장·상소장은
   *     "해당 신청서에 붙인 인지액의 2배". 원신청서 인지액을 알아야 하므로 호출자가
   *     `underlyingApplicationStampDutyWon` 으로 넘길 때만 이 경로를 탄다.
   */
  interlocutoryAppeal: StampDutyInterlocutoryAppeal;
  /**
   * 소가를 산출할 수 없는 소송의 간주 소가 (「민사소송 등 인지규칙」제18조의2).
   * 기본 5천만원, 회사관계·특허·무체재산권 등 열거 소송은 1억원.
   */
  deemedCaseValues: StampDutyDeemedCaseValues;
}

export interface StampDutyDeemedCaseValues {
  standardWon: number;
  highTierWon: number;
  sourceArticle: string;
  sourceText: string;
  highTierNote: string;
}

export interface StampDutyInterlocutoryAppeal {
  flatWon: number;
  rateText: string;
  sourceArticle: string;
  underlyingMultiplier: number;
  underlyingRateText: string;
  underlyingSourceArticle: string;
}

/**
 * 보전처분(가압류·가처분) 인지는 인지법 제9조 ②항이 근거다. 제2조 소장 누진표와 별개 체계다.
 *
 *   - `general`: 가압류·다툼의 대상에 관한 가처분 신청/이의/취소 = 정액 (현행 1만원).
 *   - `provisionalStatus`: 임시의 지위를 정하기 위한 가처분 신청/이의/취소 = 본안 인지액의 1/2,
 *     상한 50만원.
 */
export interface StampDutyProvisionalMeasures {
  general: {
    flatWon: number;
    rateText: string;
    sourceArticle: string;
  };
  provisionalStatus: {
    ratioToMainStampDuty: number;
    capWon: number;
    rateText: string;
    sourceArticle: string;
  };
}

export interface StampDutyAppealsMultipliers {
  firstInstance: number;
  appeal: number;
  supreme: number;
  sourceArticle: string;
}

export interface StampDutyElectronicFilingDiscount {
  multiplier: number;
  rateText: string;
  sourceArticle: string;
  effectiveFrom: IsoDate;
  sourceLawNumber: string;
}

export interface StampDutyHistoryNote {
  bracketTableStableSince: string;
  paymentOrderChangedAt: string;
  electronicFilingIntroducedAt: string;
  refundIntroducedAt: string;
}

/**
 * 인지법 dataset. AGPL-3.0-or-later — 본 dataset 의 source 메타는 법령 호수 + 조문 + 정부 URL 만.
 */
export interface StampDutyDataset {
  version: string;
  updatedAt: IsoDate;
  sourceLaw: StampDutySourceLaw;
  roundingPolicy: StampDutyRoundingPolicy & {
    sourceArticle: string;
    note: string;
  };
  brackets: StampDutyBracket[];
  appealsMultipliers: StampDutyAppealsMultipliers;
  specialProcedures: StampDutySpecialProcedures;
  provisionalMeasures: StampDutyProvisionalMeasures;
  electronicFilingDiscount: StampDutyElectronicFilingDiscount;
  historyNote: StampDutyHistoryNote;
}

const DEFAULT_DATASET: StampDutyDataset = DEFAULT_STAMP_DUTY_DATASET;

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

function assertMultiplierInOpenUnit(value: number, context: string): void {
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new RangeError(`${context}: must be in (0, 1] (got ${value})`);
  }
}

/**
 * dataset 정합성 검증. validate 항목:
 *   - version / updatedAt ISO 형식 + 존재.
 *   - sourceLaw.* 존재 + sourceUrl 비어있지 않음.
 *   - brackets.length >= 1 + sortOrder 1..N 유니크 + scopeStart 오름차순 정렬 + scopeEnd null 은 마지막 row 만.
 *   - 각 bracket 의 baseAmount/rate 0 이상 + rate <= 1.
 *   - roundingPolicy.floorMinimumWon/truncateBelowWon 0 이상.
 *   - appealsMultipliers.firstInstance > 0 (== 1.0 강제) + appeal/supreme > 0.
 *   - specialProcedures.paymentOrder/settlement multiplier ∈ (0, 1].
 *   - electronicFilingDiscount.multiplier ∈ (0, 1] + effectiveFrom ISO.
 */
function validate(dataset: StampDutyDataset): void {
  if (!dataset.version || !dataset.updatedAt) {
    throw new Error("StampDutyDataset: version/updatedAt are required");
  }
  assertIsoDate(dataset.updatedAt, "updatedAt");

  const { sourceLaw } = dataset;
  if (!sourceLaw || !sourceLaw.name || !sourceLaw.sourceUrl) {
    throw new Error("StampDutyDataset: sourceLaw.name/sourceUrl are required");
  }
  if (!sourceLaw.currentEffectiveFrom) {
    throw new Error("StampDutyDataset: sourceLaw.currentEffectiveFrom is required");
  }
  assertIsoDate(sourceLaw.currentEffectiveFrom, "sourceLaw.currentEffectiveFrom");

  if (!Array.isArray(dataset.brackets) || dataset.brackets.length === 0) {
    throw new Error("StampDutyDataset: brackets must be a non-empty array");
  }

  const sorted = dataset.brackets.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const seenSortOrder = new Set<number>();
  for (const [i, b] of sorted.entries()) {
    if (seenSortOrder.has(b.sortOrder)) {
      throw new RangeError(`StampDutyDataset: duplicate sortOrder ${b.sortOrder}`);
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
        `brackets: scopeEnd of sortOrder ${b.sortOrder} (${b.scopeEnd}) must equal scopeStart of sortOrder ${next.sortOrder} (${next.scopeStart})`,
      );
    }
    if (!next && b.scopeEnd !== null) {
      throw new RangeError(
        `brackets: last bracket (sortOrder ${b.sortOrder}) must have scopeEnd=null`,
      );
    }
  }

  const { roundingPolicy } = dataset;
  if (!roundingPolicy) {
    throw new Error("StampDutyDataset: roundingPolicy is required");
  }
  assertFiniteNonNegative(roundingPolicy.floorMinimumWon, "roundingPolicy.floorMinimumWon");
  assertFiniteNonNegative(roundingPolicy.truncateBelowWon, "roundingPolicy.truncateBelowWon");

  const { appealsMultipliers } = dataset;
  if (!appealsMultipliers) {
    throw new Error("StampDutyDataset: appealsMultipliers is required");
  }
  if (!Number.isFinite(appealsMultipliers.firstInstance) || appealsMultipliers.firstInstance <= 0) {
    throw new RangeError(
      `appealsMultipliers.firstInstance: must be > 0 (got ${appealsMultipliers.firstInstance})`,
    );
  }
  if (!Number.isFinite(appealsMultipliers.appeal) || appealsMultipliers.appeal <= 0) {
    throw new RangeError(
      `appealsMultipliers.appeal: must be > 0 (got ${appealsMultipliers.appeal})`,
    );
  }
  if (!Number.isFinite(appealsMultipliers.supreme) || appealsMultipliers.supreme <= 0) {
    throw new RangeError(
      `appealsMultipliers.supreme: must be > 0 (got ${appealsMultipliers.supreme})`,
    );
  }

  const { specialProcedures } = dataset;
  if (!specialProcedures) {
    throw new Error("StampDutyDataset: specialProcedures is required");
  }
  assertMultiplierInOpenUnit(
    specialProcedures.paymentOrder.multiplier,
    "specialProcedures.paymentOrder.multiplier",
  );
  assertMultiplierInOpenUnit(
    specialProcedures.settlement.multiplier,
    "specialProcedures.settlement.multiplier",
  );
  if (!specialProcedures.mediation) {
    throw new Error("StampDutyDataset: specialProcedures.mediation is required");
  }
  assertMultiplierInOpenUnit(
    specialProcedures.mediation.multiplier,
    "specialProcedures.mediation.multiplier",
  );
  const ia = specialProcedures.interlocutoryAppeal;
  if (!ia) {
    throw new Error("StampDutyDataset: specialProcedures.interlocutoryAppeal is required");
  }
  if (!Number.isFinite(ia.flatWon) || ia.flatWon <= 0) {
    throw new RangeError(
      `specialProcedures.interlocutoryAppeal.flatWon: must be > 0 (got ${ia.flatWon})`,
    );
  }
  if (!Number.isFinite(ia.underlyingMultiplier) || ia.underlyingMultiplier <= 0) {
    throw new RangeError(
      `specialProcedures.interlocutoryAppeal.underlyingMultiplier: must be > 0 (got ${ia.underlyingMultiplier})`,
    );
  }
  const deemed = specialProcedures.deemedCaseValues;
  if (!deemed) {
    throw new Error("StampDutyDataset: specialProcedures.deemedCaseValues is required");
  }
  for (const key of ["standardWon", "highTierWon"] as const) {
    if (!Number.isSafeInteger(deemed[key]) || deemed[key] <= 0) {
      throw new RangeError(
        `specialProcedures.deemedCaseValues.${key}: must be a positive safe integer (got ${deemed[key]})`,
      );
    }
  }
  if (deemed.highTierWon < deemed.standardWon) {
    throw new RangeError("specialProcedures.deemedCaseValues: highTierWon must be >= standardWon");
  }

  const { provisionalMeasures } = dataset;
  if (!provisionalMeasures) {
    throw new Error("StampDutyDataset: provisionalMeasures is required");
  }
  assertFiniteNonNegative(
    provisionalMeasures.general.flatWon,
    "provisionalMeasures.general.flatWon",
  );
  assertMultiplierInOpenUnit(
    provisionalMeasures.provisionalStatus.ratioToMainStampDuty,
    "provisionalMeasures.provisionalStatus.ratioToMainStampDuty",
  );
  if (
    !Number.isFinite(provisionalMeasures.provisionalStatus.capWon) ||
    provisionalMeasures.provisionalStatus.capWon <= 0
  ) {
    throw new RangeError(
      `provisionalMeasures.provisionalStatus.capWon: must be > 0 (got ${provisionalMeasures.provisionalStatus.capWon})`,
    );
  }

  const { electronicFilingDiscount } = dataset;
  if (!electronicFilingDiscount) {
    throw new Error("StampDutyDataset: electronicFilingDiscount is required");
  }
  assertMultiplierInOpenUnit(
    electronicFilingDiscount.multiplier,
    "electronicFilingDiscount.multiplier",
  );
  assertIsoDate(electronicFilingDiscount.effectiveFrom, "electronicFilingDiscount.effectiveFrom");
}

/**
 * 기본 인라인 dataset 또는 호출자가 제공한 외부 dataset 을 검증해 반환한다.
 *
 * @internal core-engine 내부 전용 — litigation-cost / stamp-duty 도메인이 dataset 주입 receiver.
 *           외부 consumer 는 `computeStampDuty(input, { dataset })` 형태로 주입한다.
 */
export function loadStampDutyDataset(override?: StampDutyDataset): StampDutyDataset {
  const dataset = override ?? DEFAULT_DATASET;
  validate(dataset);
  return dataset;
}

/**
 * dataset 식별자 (`stamp-duty/vX.Y.Z`). `.lcalc` envelope v3 의
 * `dataVersions["stamp-duty"]` 와 `StampDutyResult.dataVersion` 에 그대로 기록.
 */
export function stampDutyVersionTag(dataset: StampDutyDataset): string {
  return `stamp-duty/v${dataset.version}`;
}

/**
 * 소가에 해당하는 누진 bracket 반환. 매칭 규칙:
 *   scopeStart <= caseValue < scopeEnd (마지막 bracket 의 scopeEnd null = 무한대).
 *
 * caseValue 가 음수면 RangeError. validator (`validateStampDutyInput`) 가 이미 거부하지만
 * dataset-only 호출 경로 안전망.
 */
export function getStampDutyBracket(
  dataset: StampDutyDataset,
  caseValue: number,
): StampDutyBracket {
  if (!Number.isFinite(caseValue) || caseValue < 0) {
    throw new RangeError(`getStampDutyBracket.caseValue: must be >= 0 (got ${caseValue})`);
  }
  const sorted = dataset.brackets.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  for (const b of sorted) {
    if (caseValue >= b.scopeStart && (b.scopeEnd === null || caseValue < b.scopeEnd)) {
      return b;
    }
  }
  throw new Error(`getStampDutyBracket: no bracket matched for caseValue ${caseValue}`);
}

/**
 * 심급별 multiplier 반환 (1심 1.0 / 항소 1.5 / 상고 2.0).
 */
export function getAppealsMultiplier(
  dataset: StampDutyDataset,
  appealsLevel: AppealsLevel,
): number {
  switch (appealsLevel) {
    case "firstInstance":
      return dataset.appealsMultipliers.firstInstance;
    case "appeal":
      return dataset.appealsMultipliers.appeal;
    case "supreme":
      return dataset.appealsMultipliers.supreme;
  }
}
