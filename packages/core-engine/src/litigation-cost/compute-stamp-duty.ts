import { decimalToFraction } from "./helpers";
import {
  getAppealsMultiplier,
  getStampDutyBracket,
  loadStampDutyDataset,
  stampDutyVersionTag,
  type StampDutyDataset,
} from "./stamp-duty-dataset";
import type {
  AppealsLevel,
  CaseType,
  StampDutyBracket,
  StampDutyInput,
  StampDutyRefund,
  StampDutyResult,
  StampDutyRoundingPolicy,
} from "./types";
import { validateStampDutyInput } from "./validators";

/**
 * 인지대 engine. 「민사소송 등 인지법」 제2조 + 제3조 + 제7조 + 제16조 wire-up.
 *
 * 산식 (PR 1 정정 spec 제1조 정합):
 *
 *   1. validateStampDutyInput(input)  — 음수 소가 / 무효 caseType / 항소 + 특별절차 등 거부.
 *   2. bracket = getStampDutyBracket(dataset, caseValue)  — 4구간 매칭.
 *   3. baseLine = caseValue × bracket.rate + bracket.baseAmount — 인지법 제2조 제1항은 **소가
 *      전체**에 구간 요율을 곱하고 보정 상수(5천/5만5천/55만5천원)를 더하는 연속 보정식이다
 *      (구간 경계에서 값이 이어진다: 1천만×50/10,000 = 1천만×45/10,000 + 5,000 = 50,000).
 *      v0.10.0 전 구현은 변호사보수 별표("…까지 부분" 요율)와 동형인 구간별 누진식
 *      `baseAmount + (caseValue − scopeStart) × rate` 로 오적용해 1천만원 이상 전 구간을
 *      과소계산했다 (예: 소가 5천만 소장 185,000 ← 정답 230,000). KLAC 자동계산·법령
 *      원문(법률 제20003호) 대조로 확정 후 교정.
 *   4. × appealsMultiplier (1심 1.0 / 항소 1.5 / 상고 2.0, 제3조).
 *   5. × specialProcedure (지급명령 ×0.1 제7조 제2항 / 화해 ×0.2 제7조 제1항, 1심 only).
 *   6. × electronicFiling (×0.9, 제16조 — filingDate 가 시행일 2011-10-19 이전이면 미적용).
 *   7. 재심 (isRetrial=true): 산식 무영향 (제8조 본문 "심급에 따라 ... 금액"), formulaText prefix 만.
 *   8. 제2조 제2항 1,000원 하한은 **배수를 곱하기 전** baseLine 에 건다. 문언이 "**제1항에
 *      따라 계산한** 인지액이 1천원 미만이면" 이고, 제3조("제2조에 따른 금액"의 1.5배·2배)와
 *      제16조("제2조에 따른 인지액"의 10분의 9)가 곱하는 대상은 그 하한이 적용된 금액이다.
 *      하한을 배수 **뒤**에 걸면 배수가 하한에 통째로 먹힌다 — 소가 10,000 항소가
 *      1,000원(정답 1,500), 상고가 1,000원(정답 2,000), 전자가 1,000원(정답 900)이 됐다.
 *      영향 구간은 제2조 제1항 금액이 1,000원 미만인 소가 약 222,222원 이하 전체다.
 *      예외로 화해·지급명령은 제7조 제4항이 "제1항과 제2항에 따른 인지액에 관하여는
 *      제2조제2항을 준용한다" 며 배수 **뒤**에 다시 걸라고 명문화했으므로 한 번 더 건다.
 *      민사조정규칙 제3조 제2항도 같은 구조다 — "제1항 본문에 따른 수수료가 1천원 미만이면
 *      1천원으로 하고, 제1항 본문 또는 단서에 따른 수수료 중 100원 미만은 계산하지
 *      아니한다" (하한은 감액 전 본문에만, 절사는 감액 전후 양쪽에).
 *   9. 항소·상고는 제2조 제2항(하한 + 100원 절사)을 마친 금액에 제3조 배수를 곱한다. 제3조가
 *      곱하는 대상이 "제2조에 따른 금액" 이고 법원 소장 작성안내도 절사 뒤 배수 순서로 적는다
 *      (2026-10-25 결정). 소가 3,350,000 항소 = floor100(16,750) × 1.5 = 25,050. 배수 뒤에 한 번
 *      절사하는 다른 해석(25,100)과 갈리면 `roundingOrderNotice` 로 알린다.
 *  10. 종이 항소·상고는 배수 뒤에 다시 절사하지 않는다 (25,050 그대로). 그 밖에는 100원 절사를
 *      모든 배수·감액이 끝난 뒤 마지막에 건다. 제16조(전자 10분의 9)에는 절사 준용 문언이 없지만
 *      현행 동작을 유지한다 (항소 전자 25,050 × 0.9 = 22,545 → 22,500).
 *
 * 누적 multiplier 가 [0, 1.5] 범위 외인 변호사보수와 달리 인지법의 multiplier 는 본 규칙상
 * 각각 명시적이므로 clamp 미적용 (특별절차 0.1 < 항소 1.5 < 상고 + 1심외 X 조합 차단은 validator 에서).
 */

export interface ComputeStampDutyDeps {
  /** 외부 dataset 주입 (테스트/시기별 슬라이스 wire-up). 미지정 시 기본 dataset 사용. */
  dataset?: StampDutyDataset;
  /** 결과의 computedAt override (golden 결정성용). 미지정 시 new Date().toISOString(). */
  computedAt?: string;
}

/**
 * 1,000원 floor + 100원 절사 (인지법 제2조 제2항).
 *
 *   - amount < 1,000 → 1,000.
 *   - amount >= 1,000 → floor to 100원 단위 (100원 미만 절사).
 *
 * truncateBelowWon=100 일 때 (현행), 1,234 → 1,200 / 999 → 1,000 / 1,001 → 1,000.
 * truncateBelowWon=0 일 때 절사 없음 (안전망).
 */
export function applyStampDutyRounding(amount: number, policy: StampDutyRoundingPolicy): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError(`applyStampDutyRounding.amount: must be >= 0 (got ${amount})`);
  }
  if (amount < policy.floorMinimumWon) {
    return policy.floorMinimumWon;
  }
  if (policy.truncateBelowWon <= 0) {
    return amount;
  }
  return Math.floor(amount / policy.truncateBelowWon) * policy.truncateBelowWon;
}

function appealsLevelLabelKo(level: AppealsLevel): string {
  switch (level) {
    case "firstInstance":
      return "1심";
    case "appeal":
      return "항소";
    case "supreme":
      return "상고";
  }
}

function bracketFormulaSegment(bracket: StampDutyBracket, caseValue: number): string {
  if (bracket.baseAmount === 0) {
    return `소가 ${caseValue.toLocaleString("en-US")} × ${bracket.rate}`;
  }
  return `(소가 ${caseValue.toLocaleString("en-US")} × ${bracket.rate} + ${bracket.baseAmount.toLocaleString("en-US")})`;
}

function buildFormulaText(args: {
  input: StampDutyInput;
  bracket: StampDutyBracket;
  baseLine: number;
  appealsMultiplier: number;
  specialMultiplier: number | null;
  specialLabel: string | null;
  electronicMultiplier: number | null;
  electronicSkippedNote: string | null;
  /** 제2조 제2항(하한, 항소·상고는 100원 절사 포함)이 제2조 제1항 금액을 실제로 바꿨을 때 그 금액. */
  article2FloorWon: number | null;
  /** article2FloorWon 옆에 붙는 근거 표기. */
  article2Note: string;
  /** 제7조 제4항 준용 하한이 화해·지급명령 금액에 실제로 걸렸을 때 그 금액. 안 걸렸으면 null. */
  specialFloorWon: number | null;
  /** 2013-11-01 전 조정신청일 때 인지법 제2조(같은 조 제2항 포함)로 산출한 기준 금액. 아니면 null. */
  preAmendmentMediationBaseWon: number | null;
  preRounding: number;
  finalAmount: number;
  /** 종이 항소·상고: 제3조 배수 뒤 절사하지 않음. */
  noFinalTruncation: boolean;
  deemedNote?: string | null;
}): string {
  const segments: string[] = [];
  if (args.deemedNote) {
    segments.push(args.deemedNote);
  }
  if (args.input.isRetrial) {
    segments.push("재심소장 (제8조, 심급별 동일 적용)");
  }
  segments.push(`${appealsLevelLabelKo(args.input.appealsLevel)} (×${args.appealsMultiplier})`);
  if (args.specialLabel && args.specialMultiplier !== null) {
    segments.push(`${args.specialLabel} (×${args.specialMultiplier})`);
  }
  if (args.electronicMultiplier !== null) {
    segments.push(`전자소송 (×${args.electronicMultiplier})`);
  }
  if (args.electronicSkippedNote !== null) {
    segments.push(args.electronicSkippedNote);
  }

  const arithmetic: string[] = [bracketFormulaSegment(args.bracket, args.input.caseValue)];
  if (args.preAmendmentMediationBaseWon !== null) {
    arithmetic.push(
      `= ${args.preAmendmentMediationBaseWon.toLocaleString("en-US")}원 (제2조 제2항 하한·100원 절사)`,
    );
  } else if (args.article2FloorWon !== null) {
    arithmetic.push(`= ${args.article2FloorWon.toLocaleString("en-US")}원 (${args.article2Note})`);
  }
  arithmetic.push(`× ${args.appealsMultiplier}`);
  if (args.specialMultiplier !== null) {
    arithmetic.push(`× ${args.specialMultiplier}`);
  }
  if (args.specialFloorWon !== null) {
    arithmetic.push(`= ${args.specialFloorWon.toLocaleString("en-US")}원 (제7조 제4항 하한)`);
  }
  if (args.electronicMultiplier !== null) {
    arithmetic.push(`× ${args.electronicMultiplier}`);
  }

  const preRoundingDisplay = Number.isInteger(args.preRounding)
    ? args.preRounding.toLocaleString("en-US")
    : args.preRounding.toFixed(2);
  const arithmeticText =
    args.preAmendmentMediationBaseWon !== null
      ? `${arithmetic.join(" ")} = ${args.finalAmount.toLocaleString("en-US")}원 (구 민사조정규칙에는 제3조 제2항 하한·절사가 없음)`
      : args.noFinalTruncation && args.finalAmount % 100 !== 0
        ? `${arithmetic.join(" ")} = ${args.finalAmount.toLocaleString("en-US")}원 (제3조 배수 뒤에는 절사하지 않음)`
        : `${arithmetic.join(" ")} = ${preRoundingDisplay}원 → ${args.finalAmount.toLocaleString("en-US")}원 (제2조 제2항 100원 절사)`;
  return `${segments.join(" + ")}: ${arithmeticText}`;
}

function isProvisionalCaseType(caseType: CaseType): boolean {
  return caseType === "provisionalMeasureCollegial" || caseType === "provisionalMeasureSingle";
}

/**
 * 소가 산정 (「민사소송 등 인지규칙」제18조의2).
 *
 * "재산권상의 소로서 그 소가를 산출할 수 없는 것과 비재산권을 목적으로 하는 소송의 소가는
 * 5천만 원으로 한다. 다만, 제15조제1항 내지 제3항, 제15조의2, 제17조의2, 제18조에 정한
 * 소송의 소가는 1억 원으로 한다."
 *
 * 변호사보수도 같은 소가를 쓴다 (「변호사보수의 소송비용 산입에 관한 규칙」제4조 제1항이
 * 소송목적의 값 산정을 인지법 제2조에 따르게 한다). 두 도메인이 갈리지 않도록 이 함수를
 * 단일 출처로 삼는다.
 */
export function resolveEffectiveCaseValue(
  input: Pick<StampDutyInput, "caseValue" | "caseValueBasis">,
  deps?: Pick<ComputeStampDutyDeps, "dataset">,
): { caseValue: number; deemedNote: string | null } {
  const basis = input.caseValueBasis ?? "amount";
  if (basis === "amount") {
    return { caseValue: input.caseValue, deemedNote: null };
  }
  const deemed = loadStampDutyDataset(deps?.dataset).specialProcedures.deemedCaseValues;
  const caseValue = basis === "unascertainableHighTier" ? deemed.highTierWon : deemed.standardWon;
  const label =
    basis === "unascertainableHighTier"
      ? `소가 산출 불가 · ${deemed.highTierNote}`
      : "소가 산출 불가 또는 비재산권 소송";
  return {
    caseValue,
    deemedNote: `${label} → 소가 ${caseValue.toLocaleString("en-US")}원 간주 (${deemed.sourceArticle})`,
  };
}

/**
 * 인지법 제2조 제1항누진 산식의 pre-round baseLine (소가 전체 × 요율 + 보정 상수).
 *
 * float 곱(예: 50,000,000 × 0.0045 = 224,999.99999999997)이 100원 절사(제2조 제2항)를 아래로
 * 새게 하므로, 요율을 정확 유리수(0.0045 → 45/10,000)로 곱해 계산한다 (변호사보수 floor 와 동일).
 */
function progressiveBaseLine(
  dataset: StampDutyDataset,
  caseValue: number,
): { bracket: StampDutyBracket; baseLine: number } {
  const bracket = getStampDutyBracket(dataset, caseValue);
  const rate = decimalToFraction(bracket.rate);
  const value = decimalToFraction(caseValue);
  const num = value.num * rate.num + BigInt(bracket.baseAmount) * value.den * rate.den;
  const den = value.den * rate.den;
  return { bracket, baseLine: Number(num) / Number(den) };
}

/** 민사조정규칙 제3조 제1항 단서(전자 제출 10분의 9)의 시행일. 대법원규칙 제2344호. */
const MEDIATION_ELECTRONIC_DISCOUNT_FROM = "2011-07-28";

/** 제16조 전자소송 감액. filingDate 가 시행일 이전이면 적용하지 않는다 (미지정이면 현행 사건으로 본다). */
function resolveElectronicDiscount(
  dataset: StampDutyDataset,
  input: StampDutyInput,
): { multiplier: number | null; skippedNote: string | null } {
  // 조정신청은 인지법 제16조가 아니라 민사조정규칙 제3조 제1항 단서(대법원규칙 제2344호,
  // 2011-07-28 공포·시행)가 전자 제출 10분의 9 를 정한다. 그 단서가 인지법 제16조 시행
  // (2011-10-19)보다 먼저라 조정신청만 시작일이 다르다.
  const isMediation = input.caseType === "civilMediation";
  const effectiveFrom = isMediation
    ? MEDIATION_ELECTRONIC_DISCOUNT_FROM
    : dataset.electronicFilingDiscount.effectiveFrom;
  const applies =
    input.isElectronicFiling === true &&
    (input.filingDate === undefined || input.filingDate >= effectiveFrom);
  return {
    multiplier: applies ? dataset.electronicFilingDiscount.multiplier : null,
    skippedNote:
      input.isElectronicFiling === true && !applies
        ? `전자소송 감액 미적용 (접수일 ${input.filingDate}, ${isMediation ? "민사조정규칙 제3조 제1항 단서" : "제16조"} 시행 ${effectiveFrom} 전)`
        : null,
  };
}

/**
 * 보전처분(가압류·가처분) 인지는 인지법 제9조 제2항이 근거다. 제2조 소장 누진표와 별개 체계다.
 *
 *   - `general` (기본): 가압류·다툼대상 가처분 신청/이의/취소 = 정액 (현행 1만원).
 *   - `provisionalStatus`: 임시의 지위를 정하는 가처분 = 본안 인지액(제2조 1심)의 1/2, 상한 50만원.
 *
 * 심급 배수(제3조)·지급명령/화해(제7조)는 신청사건에 무의미하므로 미적용 (validator 가 조합 거부).
 * 전자소송 감액(제16조)은 신청서에도 적용되므로 유지.
 */
function computeProvisionalMeasureStampDuty(
  dataset: StampDutyDataset,
  input: StampDutyInput,
  computedAt: string,
): StampDutyResult {
  const pm = dataset.provisionalMeasures;
  const type = input.provisionalMeasureType ?? "general";
  const electronic = resolveElectronicDiscount(dataset, input);
  const segments: string[] = [];
  let preRounding: number;

  if (type === "provisionalStatus") {
    const { baseLine } = progressiveBaseLine(dataset, input.caseValue);
    const mainStampDuty = applyStampDutyRounding(baseLine, dataset.roundingPolicy);
    const half = mainStampDuty * pm.provisionalStatus.ratioToMainStampDuty;
    const capped = Math.min(half, pm.provisionalStatus.capWon);
    preRounding = electronic.multiplier !== null ? capped * electronic.multiplier : capped;
    segments.push(
      `임시지위 가처분 (${pm.provisionalStatus.sourceArticle}): 본안 인지액 ${mainStampDuty.toLocaleString("en-US")} × ${pm.provisionalStatus.ratioToMainStampDuty}` +
        (half > pm.provisionalStatus.capWon
          ? ` → 상한 ${pm.provisionalStatus.capWon.toLocaleString("en-US")}원 적용`
          : ""),
    );
  } else {
    preRounding =
      electronic.multiplier !== null
        ? pm.general.flatWon * electronic.multiplier
        : pm.general.flatWon;
    segments.push(`가압류·가처분 신청 (${pm.general.sourceArticle}): ${pm.general.rateText}`);
  }

  if (electronic.multiplier !== null) {
    segments.push(`전자소송 (×${electronic.multiplier})`);
  }
  if (electronic.skippedNote !== null) {
    segments.push(electronic.skippedNote);
  }

  // 제2조 제2항(1,000원 floor + 100원 절사)은 여기 적용하지 않는다. 제7조 제4항은 화해·지급명령에
  // 대해 그 항을 준용한다고 명시했는데, 나중에 신설된(2011.7.18) 제9조 제2항 단서에는 그 문구가
  // 없다. 인지규칙과 재민 91-1 예규 본문에서도 일반 절사 규정을 찾지 못했다.
  // 그래서 본안 인지액의 1/2 은 50원 단위로 남을 수 있다 (소가 1,100만이면 27,250).
  // 실무에서 100원 단위로 받는다는 근거를 찾으면 다시 본다.
  const finalAmount = preRounding;
  const formulaText = `${segments.join(" + ")} = ${finalAmount.toLocaleString("en-US")}원`;

  return {
    amount: finalAmount,
    formulaText,
    dataVersion: stampDutyVersionTag(dataset),
    computedAt,
  };
}

/**
 * 항고·재항고(라/마) 인지. 인지법 제11조 별도 체계 — 제2조 소장 누진표를 쓰지 않는다.
 *
 *   - 제11조 제2항 (기본): "제1항의 항고장 외의 항고장에는 2천원의 인지를 붙여야 한다."
 *   - 제11조 제1항: "제9조 또는 제10조의 신청에 관한 재판(항고법원의 재판을 포함한다)에 대한
 *     항고장 및 상소장에는 해당 신청서에 붙인 인지액의 2배에 해당하는 인지를 붙여야 한다."
 *     원신청서 인지액은 계산기가 알 수 없으므로 호출자가 넘길 때만 이 경로를 탄다.
 *
 * 전자소송 감액(제16조)은 준용하지 않는다. 제16조 제2항의 준용 범위가 "제3조부터 제10조까지"라
 * 제11조는 빠진다. 제2조 제2항 절사도 제11조에 준용 문구가 없어 적용하지 않는다.
 */
function computeInterlocutoryAppealStampDuty(
  dataset: StampDutyDataset,
  input: StampDutyInput,
  computedAt: string,
): StampDutyResult {
  const ia = dataset.specialProcedures.interlocutoryAppeal;
  const underlying = input.underlyingApplicationStampDutyWon;

  const finalAmount = underlying !== undefined ? underlying * ia.underlyingMultiplier : ia.flatWon;
  const formulaText =
    underlying !== undefined
      ? `항고장 (${ia.underlyingSourceArticle}): 원신청서 인지액 ${underlying.toLocaleString("en-US")} × ${ia.underlyingMultiplier} = ${finalAmount.toLocaleString("en-US")}원`
      : `항고장 (${ia.sourceArticle}): ${ia.rateText} = ${finalAmount.toLocaleString("en-US")}원`;

  return {
    amount: finalAmount,
    formulaText,
    dataVersion: stampDutyVersionTag(dataset),
    computedAt,
  };
}

/**
 * 인지대 계산. 입력 검증 → 누진 산식 → 심급/특별절차/전자소송 multiplier → 반올림.
 * 보전처분(가압류·가처분)은 제2조 대신 제9조 제2항, 항고·재항고는 제11조 별도 체계로 분기.
 */
export function computeStampDuty(
  input: StampDutyInput,
  deps?: ComputeStampDutyDeps,
): StampDutyResult {
  const result = computeStampDutyBase(input, deps);
  if (input.includeRefund !== true && input.includeLawsuitTopUp !== true) {
    return result;
  }
  const special = isSpecialApplication(input);
  const notPleading =
    special ||
    isProvisionalCaseType(input.caseType) ||
    input.caseType === "civilInterlocutoryAppeal";
  const extras: Pick<StampDutyResult, "refund" | "lawsuitTopUp"> = {};
  if (input.includeRefund === true) {
    if (notPleading) {
      throw new RangeError(
        "인지대 입력 검증 실패: 환급액(인지법 제14조 제1항)은 소장·항소장·상고장 인지에서만 계산합니다",
      );
    }
    extras.refund = computeRefund(result.amount);
  }
  if (input.includeLawsuitTopUp === true) {
    if (!special) {
      throw new RangeError(
        "인지대 입력 검증 실패: 소장 보정액은 지급명령·화해·조정신청 인지에서만 계산합니다",
      );
    }
    // 같은 소가·같은 제출 방식의 1심 소장 인지액. 단독·합의 구분은 인지액에 영향이 없다.
    const lawsuit = computeStampDutyBase(
      {
        caseValue: input.caseValue,
        caseType: "civilFirstInstanceSingle",
        appealsLevel: "firstInstance",
        ...(input.caseValueBasis !== undefined ? { caseValueBasis: input.caseValueBasis } : {}),
        ...(input.isElectronicFiling !== undefined
          ? { isElectronicFiling: input.isElectronicFiling }
          : {}),
        ...(input.filingDate !== undefined ? { filingDate: input.filingDate } : {}),
      },
      deps,
    ).amount;
    const article =
      input.caseType === "civilMediation"
        ? "민사조정법 제36조 제2항"
        : input.isSettlement === true
          ? "민사소송 등 인지법 제7조 제3항 (민사소송법 제388조)"
          : "민사소송 등 인지법 제7조 제3항 (민사소송법 제472조)";
    const amount = Math.max(0, lawsuit - result.amount);
    extras.lawsuitTopUp = {
      lawsuitStampDutyWon: lawsuit,
      paidStampDutyWon: result.amount,
      amount,
      formulaText: `소장 인지액 ${won(lawsuit)} − 신청서 인지액 ${won(result.amount)} = ${won(amount)}원 (${article})`,
      article,
    };
  }
  return { ...result, ...extras };
}

function won(n: number): string {
  return n.toLocaleString("en-US");
}

/** 지급명령·화해·조정신청. 소가 제기된 것으로 보면 소장 인지를 보정하는 신청서들이다. */
function isSpecialApplication(input: StampDutyInput): boolean {
  return (
    input.isPaymentOrder === true ||
    input.caseType === "paymentOrder" ||
    input.caseType === "civilMediation" ||
    input.isSettlement === true
  );
}

/**
 * 인지법 제14조 제1항: 인지액의 2분의 1. 그 2분의 1 이 10만원 미만이면 인지액에서 10만원을
 * 빼고 남은 금액. 인지액이 10만원 이하면 남는 금액이 없어 0 이다. 이 산식은 2006-04-01 시행본
 * 부터 현행(2025-03-01 시행본)까지 같다 (2012.1.17·2024.1.16 개정은 환급 사유 각 호만 바꿨다).
 */
function computeRefund(stampDutyWon: number): StampDutyRefund {
  const article = "민사소송 등 인지법 제14조 제1항";
  const half = stampDutyWon / 2;
  if (half >= 100_000) {
    return {
      amount: half,
      formulaText: `인지액 ${won(stampDutyWon)} × 1/2 = ${won(half)}원 (${article})`,
      article,
    };
  }
  const amount = Math.max(0, stampDutyWon - 100_000);
  return {
    amount,
    formulaText: `인지액 ${won(stampDutyWon)} × 1/2 = ${won(half)}원이 10만원 미만이라 인지액 − 100,000 = ${won(amount)}원 (${article})`,
    article,
  };
}

function computeStampDutyBase(input: StampDutyInput, deps?: ComputeStampDutyDeps): StampDutyResult {
  validateStampDutyInput(input);
  const dataset = loadStampDutyDataset(deps?.dataset);
  const computedAt = deps?.computedAt ?? new Date().toISOString();

  // 규칙 제18조의2 간주 소가를 먼저 해소한 뒤 모든 분기가 같은 값을 쓴다.
  const { caseValue, deemedNote } = resolveEffectiveCaseValue(input, { dataset });
  const effective: StampDutyInput = caseValue === input.caseValue ? input : { ...input, caseValue };

  if (isProvisionalCaseType(effective.caseType)) {
    return computeProvisionalMeasureStampDuty(dataset, effective, computedAt);
  }

  if (effective.caseType === "civilInterlocutoryAppeal") {
    return computeInterlocutoryAppealStampDuty(dataset, effective, computedAt);
  }

  const { bracket, baseLine } = progressiveBaseLine(dataset, effective.caseValue);

  const appealsMultiplier = getAppealsMultiplier(dataset, input.appealsLevel);

  let specialMultiplier: number | null = null;
  let specialLabel: string | null = null;
  let preAmendmentMediation = false;
  // 지급명령(독촉)은 caseType "paymentOrder" (차) 자체가 제7조 제2항 1/10 대상이다. 별도
  // isPaymentOrder flag 는 구파일 호환으로 유지하되 caseType 을 기준으로 삼는다. 사건구분만
  // 고르고 flag 를 놓쳐 소장 인지가 나오던 UI 결함(감사 F3)을 엔진 root 에서 차단한다.
  const isPaymentOrder = input.isPaymentOrder === true || input.caseType === "paymentOrder";
  if (isPaymentOrder) {
    specialMultiplier = dataset.specialProcedures.paymentOrder.multiplier;
    specialLabel = "지급명령";
  } else if (input.caseType === "civilMediation") {
    // 조정신청(머)은 인지법이 아니라 「민사조정규칙」제3조 제1항이 근거다 —
    // "조정신청의 수수료는 「민사소송 등 인지법」 제2조에 따라 산출한 금액의 10분의 1로 한다."
    // 지급명령과 같은 구조라 사건구분만으로 자동 적용한다. 이 분기가 없던 동안
    // 조정신청에 소장 누진식이 그대로 적용되어 10배로 산출됐다.
    // 대법원규칙 제2488호(2013-11-01 시행) 전에는 "5분의 1" 이었고 제2항(1천원 하한·100원
    // 미만 절사)이 없었다. 부칙 제2조 제1항이 시행 후 최초로 신청된 사건부터 개정규정을
    // 적용하므로 신청일(filingDate)로 가른다. 미지정이면 현행 사건으로 본다.
    const mediation = dataset.specialProcedures.mediation;
    preAmendmentMediation =
      input.filingDate !== undefined && input.filingDate < mediation.effectiveFrom;
    const entry = preAmendmentMediation ? mediation.previous : mediation;
    specialMultiplier = entry.multiplier;
    specialLabel = preAmendmentMediation
      ? `조정신청 ${entry.rateText} · ${entry.sourceArticle}, 신청일 ${input.filingDate}`
      : `조정신청 ${entry.rateText} · ${entry.sourceArticle}`;
  } else if (input.isSettlement) {
    specialMultiplier = dataset.specialProcedures.settlement.multiplier;
    specialLabel = "화해";
  }

  const { multiplier: electronicMultiplier, skippedNote: electronicSkippedNote } =
    resolveElectronicDiscount(dataset, input);

  // 제2조 제2항의 1,000원 하한은 문언상 "**제1항에 따라 계산한** 인지액" 에 건다. 제3조가
  // 곱하는 "제2조에 따른 금액", 제16조가 곱하는 "제2조에 따른 인지액" 은 모두 이 하한이
  // 이미 적용된 금액이다. 하한을 배수 **뒤**에 걸면 배수가 하한에 통째로 먹힌다 —
  // 소가 10,000 항소가 1,000원(정답 1,500), 상고가 1,000원(정답 2,000)이 되고,
  // 전자소송 감액도 같은 이유로 사라진다 (소가 10,000 전자 = 1,000원 ← 정답 900원).
  // 소가 약 222,222원 이하(= 제2조 제1항 금액이 1,000원 미만인 구간) 전체가 영향권이다.
  const article2Floor = Math.max(baseLine, dataset.roundingPolicy.floorMinimumWon);
  // 항소·상고는 제3조 "제2조에 따른 금액" 이 제2조 제2항의 100원 절사까지 마친 금액이라 보고
  // 배수 앞에서 절사한다. 1심(화해·지급명령·조정 포함)은 배수가 1 이라 기존 순서를 그대로 둔다.
  const isAppeal = appealsMultiplier !== 1;
  const article2Base = isAppeal
    ? applyStampDutyRounding(baseLine, dataset.roundingPolicy)
    : article2Floor;
  const article2FloorWon = article2Base !== baseLine ? article2Base : null;
  const article2Note =
    article2Base === article2Floor ? "제2조 제2항 하한" : "제2조 제2항 100원 절사";

  // 2013-11-01 전 조정신청은 "인지법 제2조에 따라 산출한 금액" (같은 조 제2항의 하한·절사까지
  // 마친 금액) 의 5분의 1 이다. 규칙 자체의 하한·절사가 없던 시기라 뒤에서 다시 끊지 않는다.
  const preAmendmentMediationBaseWon = preAmendmentMediation
    ? applyStampDutyRounding(baseLine, dataset.roundingPolicy)
    : null;

  let preRounding = (preAmendmentMediationBaseWon ?? article2Base) * appealsMultiplier;

  // 제7조 제4항은 "제1항과 제2항에 따른 인지액에 관하여는 제2조제2항을 준용한다" 로, 화해·
  // 지급명령 배수를 곱한 **뒤**의 금액에 하한을 다시 건다고 명문화했다. 제3조에는 그런
  // 준용 문구가 없어 배수 앞에서 한 번 거는 것으로 끝난다.
  let specialFloorWon: number | null = null;
  if (specialMultiplier !== null && preAmendmentMediation) {
    preRounding *= specialMultiplier;
  } else if (specialMultiplier !== null) {
    const afterSpecial = preRounding * specialMultiplier;
    preRounding = Math.max(afterSpecial, dataset.roundingPolicy.floorMinimumWon);
    specialFloorWon = preRounding > afterSpecial ? preRounding : null;
  }

  if (electronicMultiplier !== null) {
    preRounding *= electronicMultiplier;
  }

  // 종이 항소·상고는 이미 절사한 금액의 1.5배·2배라 다시 끊지 않는다. 그 밖에는 배수·감액이
  // 끝난 뒤 100원 절사 (제16조 10분의 9 뒤 절사는 준용 문언이 없지만 현행 동작 유지).
  const noFinalTruncation = isAppeal && electronicMultiplier === null;
  // 구 조정 슬라이스는 100원 단위 기준 금액 × 5분의 1 (× 10분의 9) 이라 참값이 정수다.
  // float 오차(예: 455,000 × 0.2)만 걷어낸다.
  const finalAmount =
    preAmendmentMediation || noFinalTruncation
      ? Math.round(preRounding)
      : applyStampDutyRounding(preRounding, {
          ...dataset.roundingPolicy,
          floorMinimumWon: 0,
        });

  // 다른 해석: 절사 없이 배수·감액을 곱한 뒤 한 번만 절사 (2026-10-25 이전 동작).
  // 항소·상고에는 특별절차가 붙지 않으므로(validator) 배수와 전자 감액만 곱하면 된다.
  const alternativeAmount = isAppeal
    ? applyStampDutyRounding(article2Floor * appealsMultiplier * (electronicMultiplier ?? 1), {
        ...dataset.roundingPolicy,
        floorMinimumWon: 0,
      })
    : finalAmount;

  // 1심 전자 제출(제16조)도 절사 순서가 갈린다. 결정(2026-10-25): 현행(감액 뒤 절사) 유지,
  // 제2조 제2항 절사를 먼저 마친 금액에 10분의 9 를 곱하고 다시 절사한 금액을 안내한다.
  const electronicFirstInstanceAlternative =
    !isAppeal &&
    electronicMultiplier !== null &&
    specialMultiplier === null &&
    !preAmendmentMediation
      ? applyStampDutyRounding(
          applyStampDutyRounding(baseLine, dataset.roundingPolicy) * electronicMultiplier,
          { ...dataset.roundingPolicy, floorMinimumWon: 0 },
        )
      : null;

  const formulaText = buildFormulaText({
    input: effective,
    bracket,
    baseLine,
    appealsMultiplier,
    specialMultiplier,
    specialLabel,
    electronicMultiplier,
    electronicSkippedNote,
    article2FloorWon,
    article2Note,
    specialFloorWon,
    preAmendmentMediationBaseWon,
    preRounding,
    finalAmount,
    noFinalTruncation,
    deemedNote,
  });

  return {
    amount: finalAmount,
    formulaText,
    dataVersion: stampDutyVersionTag(dataset),
    computedAt,
    ...(electronicFirstInstanceAlternative !== null &&
    electronicFirstInstanceAlternative !== finalAmount
      ? {
          roundingOrderNotice: `제16조 10분의 9 를 제2조 금액에 곱한 뒤 100원 절사해 ${won(finalAmount)}원입니다(현행 동작). 제2조 제2항 절사를 먼저 마친 금액에 곱하는 해석으로는 ${won(electronicFirstInstanceAlternative)}원입니다. 제16조에는 절사 순서를 정한 문언이 없습니다.`,
        }
      : {}),
    ...(alternativeAmount !== finalAmount
      ? {
          roundingOrderNotice: `제2조 제2항 절사 뒤 제3조 배수를 곱해 ${won(finalAmount)}원입니다. 다른 해석(배수 후 절사)으로는 ${won(alternativeAmount)}원입니다.${electronicMultiplier !== null ? " 제16조 10분의 9 뒤 100원 절사는 현행 동작을 따른 것으로, 제16조에는 절사 준용 문언이 없습니다." : ""}`,
        }
      : {}),
  };
}
