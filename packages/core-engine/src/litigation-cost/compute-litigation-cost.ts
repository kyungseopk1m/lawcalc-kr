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
import {
  loadStampDutyDataset,
  stampDutyVersionTag,
  type StampDutyDataset,
} from "./stamp-duty-dataset";
import { appliedDomains } from "./helpers";
import type {
  LawyerFeeInput,
  LawyerFeeResult,
  LitigationCostDistributionResult,
  LitigationCostInput,
  LitigationCostResult,
  StampDutyResult,
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
 * 「변호사보수의 소송비용 산입에 관한 규칙」 제3조 제1항 본안 사건 한정 — 지급명령(독촉)은 산입 외.
 * `LitigationCostResult` 의 shape 일관성을 위해 0원 결과를 합성하고 dataset 버전 tag 는 유지한다.
 * 인지대/송달료는 정상 계산되므로 caller (UI/PDF/CSV) 는 변호사보수 0 + 안내 formulaText 만 노출.
 */
/**
 * 인지대 산입 외 사건구분의 0원 결과.
 *
 * 「민사소송 등 인지법」 제2조의 누진 산식이 적용되지 않는 사건구분 (민사집행·도산·가사비송·
 * 각종 신청사건) 은 인지액이 별도 예규의 정액이라 본 엔진이 산출할 수 없다. 0원을 계산 결과로
 * 제시하는 대신 formulaText 로 산출 대상이 아님을 밝힌다.
 */
function buildExcludedStampDutyResult(
  computedAt: string,
  injected?: StampDutyDataset,
): StampDutyResult {
  const dataset = loadStampDutyDataset(injected);
  return {
    amount: 0,
    formulaText:
      "인지액 산출 외 사건구분입니다. 「민사소송 등 인지법」 제2조의 누진 산식 대상이 아니며, " +
      "해당 사건의 인지액은 별도 예규가 정하는 정액입니다.",
    dataVersion: stampDutyVersionTag(dataset),
    computedAt,
  };
}

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
      "변호사보수 산입 외 사건구분입니다. 「변호사보수의 소송비용 산입에 관한 규칙」 제3조 제1항은 본안 사건에만 적용합니다.",
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

  // 민사집행·도산·가사비송처럼 인지액 근거가 「민사소송 등 인지법」의 누진 산식이 아닌
  // 사건구분은 `appliedDomains` 에 stampDuty 가 없다. 그대로 computeStampDuty 를 부르면
  // validator 가 거부해 통합 계산 전체가 던진다 — 변호사보수와 같은 방식으로 건너뛴다.
  const stampDutyApplies = appliedDomains(input.stampDuty.caseType).includes("stampDuty");
  const stampDuty = stampDutyApplies
    ? computeStampDuty(input.stampDuty, buildStampDutyDeps(resolvedDeps))
    : buildExcludedStampDutyResult(computedAt, resolvedDeps.stampDutyDataset);
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
