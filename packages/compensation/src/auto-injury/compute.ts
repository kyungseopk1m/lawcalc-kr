import { STANDARD_DISCLAIMER, addYears } from "@lawcalc-kr/core-engine";
import {
  applyHoffman240Cap,
  getLaborRateAt,
  hoffmanDatasetVersionTag,
  laborRatesDatasetVersionTag,
  leibnizDatasetVersionTag,
  lifeExpectancyDatasetVersionTag,
  loadHoffmanTable,
  loadLaborRatesTable,
  loadLeibnizTable,
  loadLifeExpectancyTable,
  type HoffmanDataset,
  type LaborRatesDataset,
  type LeibnizDataset,
  type LifeExpectancyDataset,
} from "@lawcalc-kr/datasets-compensation";
import type { CompensationInput, CompensationResult, CompensationSegment } from "./types";
import { computeOtherDamages } from "../other-damages/compute";
import { validateCompensationInput } from "./validators";

/** compute(input) 의 dataset 주입 / 시간 주입 deps. 미지정 시 default dataset + 실시간 now. */
export interface ComputeCompensationDeps {
  laborRates?: LaborRatesDataset;
  lifeExpectancy?: LifeExpectancyDataset;
  hoffman?: HoffmanDataset;
  leibniz?: LeibnizDataset;
  now?: () => Date;
}

// 대법원 2024. 4. 25. 선고 2020다271650: 도시 일용근로자의 월 가동일수를 20일을 초과하여
// 인정하기 어렵다. 사고 시기와 무관하게 기본값은 20 이고, 달리 볼 사정은 직접 입력한다.
const DEFAULT_WORKING_DAYS_PER_MONTH = 20;
const DEFAULT_RETIREMENT_AGE = 65;
const FINAL_FLOOR_UNIT = 100;

import { getCumulativeHoffmanClamped, monthsBetween } from "../internal";

/**
 * 자×부상 손해배상 계산. 10 단계 순서 (plan v2 6절 트랙 4 A):
 *
 * 1. 노동능력상실률 factor:
 *    - 영구 중복 = `1 - Π(1 - perm_i.ratio)`.
 *    - 한시장해는 환산하지 않고 raw `ratio` 를 실제 한시기간 `[0, round(years×12))` 에만 적용한다.
 *      (법령원본상 `년수/10` 환산은 기왕증 기여도 산정 전용이며 일실수입 상실률에는 쓰지 않는다.)
 * 2. segment 분해 (기간식):
 *    - 경계 = distinct 한시 종료월 + 가동연한 종료월(totalMonths).
 *    - segment `[s, e)` lossRate = `1 - Π(1 - perm_i.ratio) × Π(1 - temp_j.ratio | temp_j 종료 ≥ e)`
 *      (그 구간 동안 살아있는 한시장해만 영구분과 중복 합산). 한시 종료 후 segment 는 영구분만.
 *    - `combinedLossRate` = 첫 segment lossRate (한시기간 포함 최고율; 영구만일 때 = permanentTotal).
 * 3. segment 단가:
 *    - `directWageWon` override 우선, 없으면 `getLaborRateAt(dataset, occupation, accidentDate)`.
 *    - lookup miss 시 RangeError (UI 측 트랙 U 5-1 에서 directWageWon override 노출).
 * 4. segment 호프만 = `H[endMonth] - H[startMonth]`. 240 cap = `applyHoffman240Cap` cumulative.
 * 5. segment 합산 = `Σ (monthlyWage × lossRate × appliedHoffman)`,
 *    `monthlyWage = dailyWage × workingDaysPerMonth` (default 20).
 * 6. 원 단위 절사: segment amount = `Math.floor(...)`, 최종 합 후 100원 미만 절사.
 * 2.5. 입원기간 `[0, monthsBetween(사고일, 입원치료 종료일))` 은 lossRate 1 (기왕증 미적용).
 * 7. 위자료: 과실상계 대상에서 뺀다 (`applyFaultToSolatium` 이면 이전처럼 포함).
 * 8. 과실상계: `Math.floor(재산상 손해 × (1 - 과실비율))`.
 * 9. 공제: 비율공제소계 = `Math.floor(afterFault × Σ ratio_i)`, 전액공제소계 = `Σ amount_i`.
 *    afterDeduction = `afterFault - ratioSubtotal - absoluteSubtotal`.
 * 10. 최종 = `max(0, afterDeduction + 위자료)` → 100원 미만 절사.
 */
export function computeCompensation(
  input: CompensationInput,
  deps: ComputeCompensationDeps = {},
): CompensationResult {
  validateCompensationInput(input);
  const laborRates = loadLaborRatesTable(deps.laborRates);
  const lifeExpectancy = loadLifeExpectancyTable(deps.lifeExpectancy);
  const hoffman = loadHoffmanTable(deps.hoffman);
  const leibniz = loadLeibnizTable(deps.leibniz);

  const workingDays = input.lostIncome.workingDaysPerMonth ?? DEFAULT_WORKING_DAYS_PER_MONTH;
  const permanentItems = input.lossRate.permanent ?? [];
  const temporaryItems = input.lossRate.temporary ?? [];

  // 1. 노동능력상실률 factor (영구 중복 = 1 - Π(1 - r_i))
  let permFactor = 1;
  for (const item of permanentItems) {
    permFactor *= 1 - item.ratio;
  }

  // 1.5. 기왕증 기여도 공제.
  // 사고와 무관한 기왕증이 현재 장해에 기여한 비율만큼 배상 대상 상실률에서 뺀다.
  // 같은 앱의 기타손해(개호비·치료비)가 이미 `× (1 - priorRatio)` 로 처리하므로
  // 일실수입도 같은 산식을 쓴다 (`other-damages/attendant.ts`).
  // 미입력·0 이면 계수가 1 이라 기존 결과와 완전히 동일하다 (회귀 0).
  const priorImpairmentRatio = input.lossRate.priorImpairmentRatio ?? 0;
  const priorImpairmentFactor = 1 - priorImpairmentRatio;

  // 2. segment 분해 (Option B 기간식 — 한시장해는 실제 한시기간 [0, 종료월) 에만 적용)
  const retirementAge = input.base.retirementAge ?? DEFAULT_RETIREMENT_AGE;
  const retirementEndDate = addYears(input.base.birthDate, retirementAge);
  const rawTotalMonths = monthsBetween(input.base.accidentDate, retirementEndDate);
  // 사고일에 가동연한이 이미 지난 고령 피해자도 위자료·치료비·개호비는 당연히 인정된다.
  // 일실수입 기간만 0 으로 두고 나머지 항목은 그대로 계산한다 — 계산 자체를 거부하면
  // 위자료만 청구하는 사건을 이 도구로 다룰 수 없다.
  // `accidentDate >= birthDate` 는 validator 가 이미 강제하므로(validators.ts) 음수 월수가
  // 생년월일 오타를 가리는 경우는 없다.
  const totalMonths = Math.max(0, rawTotalMonths);
  const retirementAgeReached = totalMonths === 0;

  interface SegmentPlan {
    startMonth: number;
    endMonth: number;
    lossRate: number;
  }
  // 입원기간은 상실률 100% (외부 reference 매뉴얼 본문과 계산표 예시 1·2행).
  // 기왕증 기여도를 입원기간에도 곱할지는 원문으로 확인하지 못해 곱하지 않는다.
  const hospitalMonths =
    input.lossRate.hospitalizationFullLoss === false
      ? 0
      : Math.min(monthsBetween(input.base.accidentDate, input.base.treatmentEndDate), totalMonths);
  // 각 한시장해는 [0, 종료월) 적용. 가동연한 초과분은 clamp.
  const temporaries = temporaryItems.map((item) => ({
    endMonth: Math.min(Math.round(item.years * 12), totalMonths),
    ratio: item.ratio,
  }));
  // segment 경계 = 입원 종료월 + distinct 한시 종료월(0 초과 ~ totalMonths) + 가동연한 종료월.
  // 가동연한 경과 시 경계가 모두 걸러져 segmentPlans 가 빈 배열이 되고 일실수입은 0 이 된다.
  const boundaries = Array.from(
    new Set([hospitalMonths, ...temporaries.map((t) => t.endMonth), totalMonths]),
  )
    .filter((m) => m > 0 && m <= totalMonths)
    .sort((a, b) => a - b);
  const segmentPlans: SegmentPlan[] = [];
  let firstDisabilityRate: number | undefined;
  let cursorMonth = 0;
  for (const boundary of boundaries) {
    if (boundary <= cursorMonth) continue;
    // 이 구간 [cursorMonth, boundary) 동안 살아있는 한시장해(종료 ≥ boundary)만 영구분과 중복.
    let factor = permFactor;
    for (const t of temporaries) {
      if (t.endMonth >= boundary) factor *= 1 - t.ratio;
    }
    const disabilityRate = (1 - factor) * priorImpairmentFactor;
    firstDisabilityRate ??= disabilityRate;
    segmentPlans.push({
      startMonth: cursorMonth,
      endMonth: boundary,
      lossRate: boundary <= hospitalMonths ? 1 : disabilityRate,
    });
    cursorMonth = boundary;
  }
  // combinedLossRate = 첫 segment 의 장해율(한시기간 포함 최고율, 입원 100% 제외). 영구만일 때 = permanentTotal.
  // 가동연한 경과로 segment 가 없으면 영구장해 병합률을 그대로 표시한다 (일실수입은 0 이지만
  // 상실률 자체는 위자료 산정 참고치로 의미가 있다).
  const combinedLossRate = firstDisabilityRate ?? (1 - permFactor) * priorImpairmentFactor;

  // 3. segment 단가
  // 일실수입 기간이 없으면 단가는 결과에 쓰이지 않는다. 위자료만 청구하는 고령 사건에서
  // 직종 단가 조회 실패로 계산이 막히지 않도록 이 경우에만 조회를 건너뛴다.
  let dailyWageWon: number;
  if (retirementAgeReached && input.lostIncome.directWageWon === undefined) {
    dailyWageWon = 0;
  } else if (input.lostIncome.directWageWon !== undefined) {
    dailyWageWon = input.lostIncome.directWageWon;
  } else {
    const occupation = input.lostIncome.occupation;
    if (occupation === undefined) {
      throw new RangeError(
        "손해배상 계산 실패: lostIncome.occupation 또는 lostIncome.directWageWon 중 하나는 필요합니다.",
      );
    }
    const rate = getLaborRateAt(laborRates, occupation, input.base.accidentDate);
    if (rate === undefined) {
      throw new RangeError(
        `손해배상 계산 실패: 직종 "${occupation}"의 단가를 사고일 ${input.base.accidentDate} 기준으로 찾을 수 없습니다. 일당을 직접 입력해 주세요.`,
      );
    }
    dailyWageWon = rate;
  }
  const monthlyWageWon = dailyWageWon * workingDays;

  // 4. segment 호프만 + 240 cap
  // coverage clamp — 만 25세 미만이면 가동연한까지 480개월을 넘는다.
  // 240 한도가 414개월에서 이미 걸리므로 clamp 는 금액에 영향이 없다 (`../internal` 주석 참조).
  const rawHoffmanList: number[] = [];
  for (const plan of segmentPlans) {
    rawHoffmanList.push(
      Math.max(
        0,
        getCumulativeHoffmanClamped(hoffman, plan.endMonth) -
          getCumulativeHoffmanClamped(hoffman, plan.startMonth),
      ),
    );
  }
  const capResult = applyHoffman240Cap(rawHoffmanList);

  // 5. segment 합산 + 6. floor
  const segments: CompensationSegment[] = segmentPlans.map((plan, i) => {
    const rawHoffman = rawHoffmanList[i] as number;
    const appliedHoffman = capResult.appliedHoffman[i] as number;
    const amountFloorWon = Math.floor(monthlyWageWon * plan.lossRate * appliedHoffman);
    return {
      startMonth: plan.startMonth,
      endMonth: plan.endMonth,
      lossRate: plan.lossRate,
      dailyWageWon,
      monthlyWageWon,
      rawHoffman,
      appliedHoffman,
      amountFloorWon,
    };
  });
  const lostIncomeSubtotalWon = segments.reduce((acc, segment) => acc + segment.amountFloorWon, 0);

  // 6.5. 기타손해 (개호비/치료비/보조구). 미지정 시 skip → byte-identical (회귀 0).
  const otherDamagesResult =
    (input.otherDamages
      ? computeOtherDamages(input.otherDamages, {
          accidentDate: input.base.accidentDate,
          laborRates,
          hoffman,
        })
      : null) ?? undefined;
  const otherDamagesSubtotalWon = otherDamagesResult?.subtotalWon ?? 0;

  // 6.7. 산재보험급여(장해급여) 공제 — 같은 성질의 손해(일실수입=소극손해) 한도에서
  //      먼저 공제한 뒤 과실상계 한다 (대법원 2022. 3. 24. 선고 2021다241618 전원합의체
  //      "공제 후 과실상계"). 위자료·기타손해 등 다른 성질의 손해는 잠식하지 않는다.
  //      자동차 모드는 benefit 0 → byte-identical (회귀 0).
  const accidentType = input.accidentType ?? "auto";
  const industrialBenefitInputWon =
    accidentType === "industrial" ? (input.industrialInsurance?.disabilityBenefitWon ?? 0) : 0;
  const industrialDeductedWon = Math.min(industrialBenefitInputWon, lostIncomeSubtotalWon);
  const lostIncomeAfterIndustrialWon = lostIncomeSubtotalWon - industrialDeductedWon;

  // 7. 위자료. 법원은 과실 정도 등을 참작해 위자료를 정하고 과실상계·공제 뒤에 더한다
  //    (서울고법 2022. 2. 18. 선고 2020나2039267, 광주고법(전주) 2016. 7. 21. 선고 2015나100421).
  //    위자료에도 과실을 곱하는 것은 보험약관 지급기준(`applyFaultToSolatium`)일 때뿐이다.
  const solatiumWon = input.solatiumWon ?? 0;
  const solatiumInFaultBase = input.applyFaultToSolatium === true;
  const pecuniaryDamagesSubtotalWon =
    lostIncomeAfterIndustrialWon +
    otherDamagesSubtotalWon +
    (solatiumInFaultBase ? solatiumWon : 0);

  // 8. 과실상계
  const faultRatio = input.faultRatio ?? 0;
  const faultBeforeWon = pecuniaryDamagesSubtotalWon;
  const faultAfterWon = Math.floor(faultBeforeWon * (1 - faultRatio));

  // 9. 공제 (과실상계 후) — 비율·전액 공제. 산재급여는 6.7 에서 선공제 (2021다241618 전합).
  const ratioItems = input.deductions?.ratio ?? [];
  const absoluteItems = input.deductions?.absolute ?? [];
  let ratioSum = 0;
  for (const item of ratioItems) ratioSum += item.ratio;
  const ratioSubtotalWon = Math.floor(faultAfterWon * ratioSum);
  let absoluteSubtotalWon = 0;
  for (const item of absoluteItems) absoluteSubtotalWon += item.amount;
  const deductionsAfterWon = faultAfterWon - ratioSubtotalWon - absoluteSubtotalWon;

  // 10. final
  // 공제 후 값이 음수(전액공제가 재산상 손해를 넘음)면 그 초과분이 위자료를 차감한다.
  // 2020나2039267 은 선급금·치료비를 재산상 손해에서만 공제했고, 산재 급여도 위자료를
  // 잠식하지 않는다(6.7). 이와 다른 동작이며 정책은 미확정이다.
  const finalRawWon = Math.max(0, deductionsAfterWon + (solatiumInFaultBase ? 0 : solatiumWon));
  const finalWon = Math.floor(finalRawWon / FINAL_FLOOR_UNIT) * FINAL_FLOOR_UNIT;

  const computedAtIso = (deps.now ?? (() => new Date()))().toISOString();

  return {
    // 자동차 모드는 accidentType 키 생략 → 기존 골든/.lcalc byte-identical (회귀 0).
    ...(accidentType === "industrial" ? { accidentType } : {}),
    combinedLossRate,
    segments,
    lostIncomeSubtotalWon,
    // 기타손해 미지정 시 키 생략 → 기존 골든/.lcalc byte-identical (회귀 0).
    ...(otherDamagesResult !== undefined
      ? { otherDamagesSubtotalWon, otherDamages: otherDamagesResult }
      : {}),
    solatiumWon,
    // 산재만 포함 — 자동차 모드 키 생략 → 기존 골든/.lcalc byte-identical (회귀 0).
    ...(accidentType === "industrial"
      ? {
          industrialBenefit: {
            benefitWon: industrialBenefitInputWon,
            deductedWon: industrialDeductedWon,
            lostIncomeAfterWon: lostIncomeAfterIndustrialWon,
          },
        }
      : {}),
    pecuniaryDamagesSubtotalWon,
    faultOffset: {
      ratio: faultRatio,
      beforeWon: faultBeforeWon,
      afterWon: faultAfterWon,
    },
    deductions: {
      ratioSubtotalWon,
      absoluteSubtotalWon,
      afterWon: deductionsAfterWon,
    },
    finalWon,
    hoffman240Cap: {
      appliedHoffman: capResult.appliedHoffman,
      cappedAtIndex: capResult.cappedAtIndex,
    },
    dataVersions: {
      laborRates: laborRatesDatasetVersionTag(laborRates),
      lifeExpectancy: lifeExpectancyDatasetVersionTag(lifeExpectancy),
      hoffman: hoffmanDatasetVersionTag(hoffman),
      leibniz: leibnizDatasetVersionTag(leibniz),
    },
    disclaimer: STANDARD_DISCLAIMER,
    computedAt: computedAtIso,
  };
}
