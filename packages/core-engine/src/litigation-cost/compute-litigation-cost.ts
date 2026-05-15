import { STANDARD_DISCLAIMER } from "../disclaimers";
import { computeDeliveryFee, type ComputeDeliveryFeeDeps } from "./compute-delivery-fee";
import { computeLawyerFee, type ComputeLawyerFeeDeps } from "./compute-lawyer-fee";
import { computeStampDuty, type ComputeStampDutyDeps } from "./compute-stamp-duty";
import { divideEqually, divideProportionally } from "./distribute";
import type { DeliveryDataset } from "./delivery-dataset";
import {
  lawyerFeeDatasetVersionTag,
  loadLawyerFeeDataset,
  type LawyerFeeDataset,
} from "./lawyer-fee-dataset";
import type { StampDutyDataset } from "./stamp-duty-dataset";
import { appliedDomains } from "./helpers";
import type {
  LawyerFeeInput,
  LawyerFeeResult,
  LitigationCostDistributionResult,
  LitigationCostInput,
  LitigationCostResult,
} from "./types";

export interface ComputeLitigationCostDeps {
  stampDutyDataset?: StampDutyDataset;
  deliveryDataset?: DeliveryDataset;
  lawyerFeeDataset?: LawyerFeeDataset;
  /** 결과의 computedAt override (golden 결정성용). 미지정 시 new Date().toISOString(). */
  computedAt?: string;
}

function buildStampDutyDeps(deps: ComputeLitigationCostDeps | undefined): ComputeStampDutyDeps {
  return {
    ...(deps?.stampDutyDataset === undefined ? {} : { dataset: deps.stampDutyDataset }),
    ...(deps?.computedAt === undefined ? {} : { computedAt: deps.computedAt }),
  };
}

function buildDeliveryDeps(deps: ComputeLitigationCostDeps | undefined): ComputeDeliveryFeeDeps {
  return {
    ...(deps?.deliveryDataset === undefined ? {} : { dataset: deps.deliveryDataset }),
    ...(deps?.computedAt === undefined ? {} : { computedAt: deps.computedAt }),
  };
}

function buildLawyerFeeDeps(deps: ComputeLitigationCostDeps | undefined): ComputeLawyerFeeDeps {
  return {
    ...(deps?.lawyerFeeDataset === undefined ? {} : { dataset: deps.lawyerFeeDataset }),
    ...(deps?.computedAt === undefined ? {} : { computedAt: deps.computedAt }),
  };
}

/**
 * 변호사보수 산입 외 사건구분 (현재 `paymentOrder` 만 해당) 의 결과 zero-fill.
 *
 * 「변호사보수의 소송비용 산입에 관한 규칙」 제3조 ①항 본안 사건 한정 — 지급명령(독촉)은 산입 외.
 * `LitigationCostResult` 의 shape 일관성을 위해 0원 결과를 합성하고 dataset 버전 tag 는 유지한다.
 * 인지대/송달료는 정상 계산되므로 caller (UI/PDF/CSV) 는 변호사보수 0 + 안내 formulaText 만 노출.
 */
function buildExcludedLawyerFeeResult(
  input: LawyerFeeInput,
  computedAt: string,
  injected?: LawyerFeeDataset,
): LawyerFeeResult {
  const dataset = loadLawyerFeeDataset(injected);
  return {
    amount: 0,
    baseAmount: 0,
    multiplier: 0,
    rawMultiplier: 0,
    multiplierClamped: false,
    appliedDiscounts: [],
    koreaLegalAidWarnings: [],
    formulaText:
      "변호사보수 산입 외 사건구분 — 「변호사보수의 소송비용 산입에 관한 규칙」 제3조 ①항 본안 사건 한정",
    dataVersion: lawyerFeeDatasetVersionTag(dataset),
    computedAt,
  };
}

function buildDistribution(
  input: LitigationCostInput,
  totalAmount: number,
): LitigationCostDistributionResult | undefined {
  const directive = input.distribution;
  if (directive === undefined) {
    return undefined;
  }
  if (!Number.isInteger(totalAmount)) {
    throw new RangeError(
      `분배 입력 검증 실패: 통합 소송비용 합계는 정수 원 단위여야 합니다 (입력: ${String(totalAmount)})`,
    );
  }

  if (directive.mode === "equal") {
    const partyCount = directive.partyCount ?? input.deliveryFee.partyCount;
    const { perParty, remainder } = divideEqually(totalAmount, partyCount);
    return {
      mode: "equal",
      totalWon: totalAmount,
      perParty,
      remainder,
      basis: "partyCount",
    };
  }

  if (directive.mode === "proportional") {
    if (directive.partyValuesWon === undefined) {
      throw new RangeError("분배 입력 검증 실패: 안분에는 partyValuesWon 이 필요합니다");
    }
    const { perParty, remainder } = divideProportionally(totalAmount, directive.partyValuesWon);
    return {
      mode: "proportional",
      totalWon: totalAmount,
      perParty,
      remainder,
      basis: "partyValuesWon",
    };
  }

  throw new RangeError(
    `분배 입력 검증 실패: 지원하지 않는 분배 방식입니다 (${String(directive.mode)})`,
  );
}

/**
 * 인지대 + 송달료 + 변호사보수 통합 engine.
 *
 * 각 하위 engine 의 검증과 dataset loader 를 그대로 재사용한다. `computedAt` 은 통합 결과와
 * 하위 결과가 같은 시각을 갖도록 한 번만 결정해 주입한다.
 */
export function computeLitigationCost(
  input: LitigationCostInput,
  deps?: ComputeLitigationCostDeps,
): LitigationCostResult {
  const computedAt = deps?.computedAt ?? new Date().toISOString();
  const resolvedDeps: ComputeLitigationCostDeps = {
    ...(deps?.stampDutyDataset === undefined ? {} : { stampDutyDataset: deps.stampDutyDataset }),
    ...(deps?.deliveryDataset === undefined ? {} : { deliveryDataset: deps.deliveryDataset }),
    ...(deps?.lawyerFeeDataset === undefined ? {} : { lawyerFeeDataset: deps.lawyerFeeDataset }),
    computedAt,
  };

  const stampDuty = computeStampDuty(input.stampDuty, buildStampDutyDeps(resolvedDeps));
  const deliveryFee = computeDeliveryFee(input.deliveryFee, buildDeliveryDeps(resolvedDeps));
  const lawyerFeeApplies = appliedDomains(input.lawyerFee.caseType).includes("lawyerFee");
  const lawyerFee = lawyerFeeApplies
    ? computeLawyerFee(input.lawyerFee, buildLawyerFeeDeps(resolvedDeps))
    : buildExcludedLawyerFeeResult(input.lawyerFee, computedAt, resolvedDeps.lawyerFeeDataset);
  const totalAmount = stampDuty.amount + deliveryFee.amount + lawyerFee.amount;
  const distribution = buildDistribution(input, totalAmount);

  return {
    stampDuty,
    deliveryFee,
    lawyerFee,
    totalAmount,
    ...(distribution === undefined ? {} : { distribution }),
    disclaimer: STANDARD_DISCLAIMER,
    dataVersions: {
      "stamp-duty": stampDuty.dataVersion,
      delivery: deliveryFee.dataVersion,
      "lawyer-fee": lawyerFee.dataVersion,
    },
    computedAt,
  };
}
