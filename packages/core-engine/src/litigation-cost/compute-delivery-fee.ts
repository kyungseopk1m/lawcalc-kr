import {
  deliveryDatasetVersionTag,
  getDeliveryCount,
  getDeliveryUnitPriceAt,
  loadDeliveryDataset,
  type DeliveryDataset,
} from "./delivery-dataset";
import type { DeliveryFeeInput, DeliveryFeeResult, DeliveryFormula } from "./types";
import { validateDeliveryFeeInput } from "./validators";

/**
 * 송달료 engine. 「송달료규칙」 (회당 단가 수권) + 「재일 87-4」 별표 1 (사건구분 매트릭스) wire-up.
 *
 * 산식 (PR 1 정정 spec §2 정합):
 *
 *   1. validateDeliveryFeeInput(input)  — 음수 partyCount / 무효 caseType / 도메인 mismatch 등 거부.
 *   2. countEntry = getDeliveryCount(dataset, caseType)  — 매트릭스 lookup.
 *      unverifiedMatrix 의 caseType (지급명령 등) 시 RangeError throw.
 *   3. formula.kind 분기:
 *        - simplePerParty: count = countPerParty × partyCount.
 *        - partyOffsetTimesCount: count = (partyCount + partyOffset) × countPerParty.
 *        - baseCountPlusCreditorMultiple: count = baseCount + creditorCount × creditorMultiple.
 *        - range: count = customCount (countMin ~ countMax 범위 강제).
 *   4. perDeliveryUnitPriceWon 결정 (우선순위):
 *        - input.perDeliveryUnitPriceWon override (가장 우선).
 *        - getDeliveryUnitPriceAt(dataset, input.filingDate) — filingDate 기준 시기별 슬라이스.
 *        - filingDate 미지정 시 dataset 의 현행 단가 (5,500원).
 *   5. amount = count × perDeliveryUnitPriceWon (정수, floor/truncate 정책 부재 — G3 §4).
 *   6. formulaText 생성 (사건구분 라벨 + 산식 kind + 회수 + 단가 + 합산).
 */

export interface ComputeDeliveryFeeDeps {
  /** 외부 dataset 주입 (테스트/시기별 슬라이스 wire-up). 미지정 시 기본 dataset 사용. */
  dataset?: DeliveryDataset;
  /** 결과의 computedAt override (golden 결정성용). 미지정 시 new Date().toISOString(). */
  computedAt?: string;
}

interface CountComputation {
  count: number;
  /** 산식 분기 라벨 — formulaText 의 일부. */
  segment: string;
}

function computeCount(input: DeliveryFeeInput, formula: DeliveryFormula): CountComputation {
  switch (formula.kind) {
    case "simplePerParty":
      return {
        count: formula.countPerParty * input.partyCount,
        segment: `당사자수 ${input.partyCount} × ${formula.countPerParty}회`,
      };
    case "partyOffsetTimesCount": {
      const adjustedPartyCount = input.partyCount + formula.partyOffset;
      return {
        count: adjustedPartyCount * formula.countPerParty,
        segment: `(이해관계인수 ${input.partyCount} + 가산 ${formula.partyOffset}) × ${formula.countPerParty}회`,
      };
    }
    case "baseCountPlusCreditorMultiple": {
      if (input.creditorCount === undefined) {
        throw new RangeError(
          "computeDeliveryFee: baseCountPlusCreditorMultiple 분기에는 input.creditorCount 가 필요합니다",
        );
      }
      const count = formula.baseCount + input.creditorCount * formula.creditorMultiple;
      return {
        count,
        segment: `기본 ${formula.baseCount}회 + 채권자수 ${input.creditorCount} × ${formula.creditorMultiple}회`,
      };
    }
    case "range": {
      if (input.customCount === undefined) {
        throw new RangeError(
          "computeDeliveryFee: range 분기에는 input.customCount 가 필요합니다 (사용자 직접 입력)",
        );
      }
      if (input.customCount < formula.countMin || input.customCount > formula.countMax) {
        throw new RangeError(
          `computeDeliveryFee: customCount ${input.customCount} 가 허용 범위 [${formula.countMin}, ${formula.countMax}] 를 벗어납니다`,
        );
      }
      return {
        count: input.customCount,
        segment: `사용자 입력 ${input.customCount}회 (허용 범위 ${formula.countMin}~${formula.countMax})`,
      };
    }
  }
}

interface UnitPriceResolution {
  perDeliveryUnitPriceWon: number;
  /** 단가 결정 source 라벨 — formulaText 의 일부. */
  segment: string;
}

function resolveUnitPrice(input: DeliveryFeeInput, dataset: DeliveryDataset): UnitPriceResolution {
  if (input.perDeliveryUnitPriceWon !== undefined) {
    return {
      perDeliveryUnitPriceWon: input.perDeliveryUnitPriceWon,
      segment: `회당 단가 ${input.perDeliveryUnitPriceWon.toLocaleString("en-US")}원 (직접 입력)`,
    };
  }
  const entry = getDeliveryUnitPriceAt(dataset, input.filingDate);
  const suffix = input.filingDate
    ? `${entry.effectiveFrom} 시행 슬라이스, filingDate ${input.filingDate} 기준`
    : `${entry.effectiveFrom} 시행, 현행`;
  return {
    perDeliveryUnitPriceWon: entry.unitPriceWon,
    segment: `회당 단가 ${entry.unitPriceWon.toLocaleString("en-US")}원 (${suffix})`,
  };
}

function buildFormulaText(args: {
  labelKo: string;
  countSegment: string;
  count: number;
  unitPriceSegment: string;
  perDeliveryUnitPriceWon: number;
  amount: number;
}): string {
  const product = `${args.count} × ${args.perDeliveryUnitPriceWon.toLocaleString("en-US")} = ${args.amount.toLocaleString("en-US")}원`;
  return `${args.labelKo}: ${args.countSegment} = ${args.count}회 송달, ${args.unitPriceSegment} → ${product}`;
}

/**
 * 송달료 계산. 입력 검증 → 매트릭스 lookup → 산식 분기 → 시기별 단가 → 합산.
 *
 * 단가 결정 우선순위: input.perDeliveryUnitPriceWon (override) > getDeliveryUnitPriceAt(filingDate)
 * > dataset 의 현행 단가.
 */
export function computeDeliveryFee(
  input: DeliveryFeeInput,
  deps?: ComputeDeliveryFeeDeps,
): DeliveryFeeResult {
  validateDeliveryFeeInput(input);
  const dataset = loadDeliveryDataset(deps?.dataset);
  const countEntry = getDeliveryCount(dataset, input.caseType);
  const { count, segment: countSegment } = computeCount(input, countEntry.formula);
  const { perDeliveryUnitPriceWon, segment: unitPriceSegment } = resolveUnitPrice(input, dataset);

  const amount = count * perDeliveryUnitPriceWon;

  const formulaText = buildFormulaText({
    labelKo: countEntry.labelKo,
    countSegment,
    count,
    unitPriceSegment,
    perDeliveryUnitPriceWon,
    amount,
  });

  return {
    amount,
    deliveryCount: count,
    perDeliveryUnitPriceWon,
    formulaText,
    dataVersion: deliveryDatasetVersionTag(dataset),
    computedAt: deps?.computedAt ?? new Date().toISOString(),
  };
}
