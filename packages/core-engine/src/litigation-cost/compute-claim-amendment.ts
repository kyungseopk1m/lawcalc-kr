import {
  loadStampDutyDataset,
  stampDutyVersionTag,
  type StampDutyDataset,
} from "./stamp-duty-dataset";
import { applyStampDutyRounding, computeStampDuty } from "./compute-stamp-duty";
import type { ClaimAmendmentInput, ClaimAmendmentResult } from "./types";
import { validateClaimAmendmentInput } from "./validators";

/**
 * 청구취지 확장(청구변경신청) 인지액 engine. 「민사소송 등 인지법」 제5조.
 *
 * 정본 산식 (대법원 전자소송 소송비용계산이 민사·가사·행정 세 탭에서 동일하게 고지):
 *
 *   제1심: (변경 후 청구 인지액 - 변경 전 청구 인지액) × 0.9
 *   제2심: (변경 후 청구 인지액 × 1.5 - 변경 전 청구 인지액) × 0.9
 *
 * 두 가지가 이 산식의 핵심이고 둘 다 틀리기 쉽다.
 *
 * 1. **전자소송 감액은 차액에 한 번만 건다.** 고지가 "인지액(변경 후·변경 전 모두 종이소송
 *    기준)을 먼저 계산한 후 최종적으로 0.9 를 곱한다" 로 명시했다. 항마다 0.9 를 곱해 빼면
 *    수학적으로는 같아 보이지만, 각 항이 제2조 제2항의 100원 절사를 먼저 거치기 때문에
 *    실제로는 결과가 갈린다.
 * 2. **심급 배수는 변경 후 항에만 곱한다.** 제5조 각 호는 심급 배수를 "변경 후의 청구에 관한
 *    제2조에 따른 금액" 에만 붙이고(제1심 1배, 항소심 1.5배), 뺄 항은 심급과 무관하게
 *    "변경 전의 청구에 관한 인지액" 으로 둔다. 조문 구조 자체가 배수를 다시 곱할 자리를
 *    주지 않는다. 변경 전 실제 납부액이 소가 역산값과 다르면 `beforeStampDutyWon` 으로
 *    직접 넣는다.
 *
 * 감축(변경 후 < 변경 전)은 추가 납부가 없다. 음수를 반환하지 않고 0 으로 둔다 (인지법에
 * 환급 규정은 제14조에 따로 있고 본 engine 의 대상이 아니다).
 */
export interface ComputeClaimAmendmentDeps {
  dataset?: StampDutyDataset;
  computedAt?: string;
}

function paperStampDuty(
  dataset: StampDutyDataset,
  input: ClaimAmendmentInput,
  caseValue: number,
  computedAt: string,
): number {
  return computeStampDuty(
    {
      caseValue,
      caseType: input.caseType,
      appealsLevel: "firstInstance",
      // 종이소송 기준액을 먼저 구한다 (감액은 마지막 차액에 한 번).
      isElectronicFiling: false,
      ...(input.filingDate === undefined ? {} : { filingDate: input.filingDate }),
    },
    { dataset, computedAt },
  ).amount;
}

export function computeClaimAmendmentStampDuty(
  input: ClaimAmendmentInput,
  deps?: ComputeClaimAmendmentDeps,
): ClaimAmendmentResult {
  validateClaimAmendmentInput(input);
  const dataset = loadStampDutyDataset(deps?.dataset);
  const computedAt = deps?.computedAt ?? new Date().toISOString();
  const rule = dataset.claimAmendment;

  const afterMultiplier =
    input.appealsLevel === "appeal"
      ? rule.afterMultipliers.appeal
      : rule.afterMultipliers.firstInstance;

  const afterBase = paperStampDuty(dataset, input, input.afterCaseValue, computedAt);
  const afterAmount = applyStampDutyRounding(afterBase * afterMultiplier, {
    ...dataset.roundingPolicy,
    floorMinimumWon: 0,
  });
  const beforeAmount =
    input.beforeStampDutyWon ??
    applyStampDutyRounding(
      paperStampDuty(dataset, input, input.beforeCaseValue, computedAt) * rule.beforeMultiplier,
      { ...dataset.roundingPolicy, floorMinimumWon: 0 },
    );

  const rawDifference = afterAmount - beforeAmount;
  const difference = rawDifference > 0 ? rawDifference : 0;

  const discount = dataset.electronicFilingDiscount;
  const electronicApplies =
    input.isElectronicFiling === true &&
    (input.filingDate === undefined || input.filingDate >= discount.effectiveFrom);
  const preRounding = electronicApplies ? difference * discount.multiplier : difference;
  const amount = applyStampDutyRounding(preRounding, {
    ...dataset.roundingPolicy,
    floorMinimumWon: 0,
  });

  const segments = [
    `${rule.sourceArticle} 청구취지 확장`,
    `변경 후 인지액 ${afterAmount.toLocaleString("en-US")}원` +
      (afterMultiplier === 1 ? "" : ` (1심 기준 × ${afterMultiplier})`),
    `변경 전 인지액 ${beforeAmount.toLocaleString("en-US")}원` +
      (input.beforeStampDutyWon === undefined ? "" : " (실제 납부액 직접 입력)"),
    `차액 ${difference.toLocaleString("en-US")}원`,
  ];
  if (rawDifference <= 0) {
    segments.push("청구가 확장되지 않아 추가 납부 인지액이 없습니다");
  }
  if (electronicApplies) {
    segments.push(`전자소송 (×${discount.multiplier})`);
  }

  return {
    amount,
    afterAmount,
    beforeAmount,
    differenceAmount: difference,
    formulaText: `${segments.join(", ")} → ${amount.toLocaleString("en-US")}원`,
    dataVersion: stampDutyVersionTag(dataset),
    computedAt,
  };
}
