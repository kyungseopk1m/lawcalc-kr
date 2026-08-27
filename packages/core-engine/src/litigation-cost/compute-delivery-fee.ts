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
 * 산식 (PR 1 정정 spec 제2조 정합):
 *
 *   1. validateDeliveryFeeInput(input)  — 음수 partyCount / 무효 caseType / 도메인 mismatch 등 거부.
 *   2. countEntry = getDeliveryCount(dataset, caseType)  — 매트릭스 lookup.
 *      unverifiedMatrix 의 caseType (지급명령 등) 시 RangeError throw.
 *   3. formula.kind 분기:
 *        - simplePerParty: count = countPerParty × partyCount.
 *          보전처분은 provisionalMeasureType 이 provisionalStatus 면 provisionalStatusCountPerParty 를 쓴다.
 *        - partyOffsetTimesCount: count = (partyCount + partyOffset) × countPerParty.
 *        - baseCountPlusCreditorMultiple: count = baseCount + creditorCount × creditorMultiple.
 *        - perPartyPlusExtra: count = countPerParty × partyCount + extraCount (재산조회 기관 가산).
 *        - range: count = customCount (countMin ~ countMax 범위 강제).
 *   4. perDeliveryUnitPriceWon 결정 (우선순위):
 *        - input.perDeliveryUnitPriceWon override (가장 우선).
 *        - getDeliveryUnitPriceAt(dataset, input.filingDate) — filingDate 기준 시기별 슬라이스.
 *        - filingDate 미지정 시 dataset 의 현행 단가 (5,500원).
 *   5. amount = count × perDeliveryUnitPriceWon (정수, floor/truncate 정책 부재 — G3 제4조).
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
    case "simplePerParty": {
      // 별표 1 이 같은 부호에 임시의 지위를 정하는 가처분 행을 따로 둔 사건구분(카합/카단)만
      // provisionalMeasureType 을 본다. 나머지 사건구분에서는 이 필드가 와도 무시된다.
      const isProvisionalStatus =
        input.provisionalMeasureType === "provisionalStatus" &&
        formula.provisionalStatusCountPerParty !== undefined;
      const countPerParty =
        input.provisionalMeasureType === "provisionalStatus" &&
        formula.provisionalStatusCountPerParty !== undefined
          ? formula.provisionalStatusCountPerParty
          : formula.countPerParty;
      return {
        count: countPerParty * input.partyCount,
        segment:
          `당사자수 ${input.partyCount} × ${countPerParty}회` +
          (isProvisionalStatus ? " (임시의 지위를 정하는 가처분)" : ""),
      };
    }
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
    case "perPartyPlusExtra": {
      const extraCount = input.extraCount ?? 0;
      const count = formula.countPerParty * input.partyCount + extraCount;
      return {
        count,
        segment:
          `당사자수 ${input.partyCount} × ${formula.countPerParty}회` +
          (extraCount > 0 ? ` + 조회대상 기관수 ${extraCount}회 가산` : " (기관 가산 없음)"),
      };
    }
    case "range": {
      const count = input.customCount;
      if (count === undefined) {
        throw new RangeError(
          "computeDeliveryFee: range 분기에는 input.customCount 가 필요합니다 (사용자 직접 입력)",
        );
      }
      if (count < formula.countMin || count > formula.countMax) {
        throw new RangeError(
          `computeDeliveryFee: customCount ${count} 가 허용 범위 [${formula.countMin}, ${formula.countMax}] 를 벗어납니다`,
        );
      }
      return {
        count,
        segment: `사용자 입력 ${count}회 (허용 범위 ${formula.countMin}~${formula.countMax})`,
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
  noteKo?: string;
}): string {
  const product = `${args.count} × ${args.perDeliveryUnitPriceWon.toLocaleString("en-US")} = ${args.amount.toLocaleString("en-US")}원`;
  const base = `${args.labelKo}: ${args.countSegment} = ${args.count}회 송달, ${args.unitPriceSegment} → ${product}`;
  return args.noteKo ? `${base} (${args.noteKo})` : base;
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
    ...(countEntry.noteKo !== undefined ? { noteKo: countEntry.noteKo } : {}),
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
