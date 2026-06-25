import { STANDARD_DISCLAIMER, addYears, type IsoDate } from "@lawcalc-kr/core-engine";
import {
  applyHoffman240Cap,
  getHoffmanAt,
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

const DEFAULT_WORKING_DAYS_PER_MONTH = 22;
const DEFAULT_RETIREMENT_AGE = 65;
const FINAL_FLOOR_UNIT = 100;

/** `H[0] = 0` 정원 보강 (dataset 의 1-based index 와 segment boundary 통합). */
function getCumulativeHoffman(dataset: HoffmanDataset, month: number): number {
  if (month === 0) return 0;
  return getHoffmanAt(dataset, month);
}

/**
 * 두 ISO 날짜 사이의 calendar month floor 차이.
 *
 * - `to.day` 가 `from.day` 보다 작으면 -1 (월 미충족 분 제거).
 * - 사고일 ~ (생년 + retirementAge 년) 정원에서는 day 가 정확 동일하므로 -1 발생 안 함.
 */
function monthsBetween(from: IsoDate, to: IsoDate): number {
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return months;
}

/**
 * 자×부상 손해배상 계산. 10 단계 순서 (plan v2 §6 트랙 4 A):
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
 *    `monthlyWage = dailyWage × workingDaysPerMonth` (default 22).
 * 6. 원 단위 절사: segment amount = `Math.floor(...)`, 최종 합 후 100원 미만 절사.
 * 7. 위자료: 입력 그대로 합산.
 * 8. 과실상계: `Math.floor((재산상 + 위자료) × (1 - 과실비율))`.
 * 9. 공제: 비율공제소계 = `Math.floor(afterFault × Σ ratio_i)`, 전액공제소계 = `Σ amount_i`.
 *    afterDeduction = `afterFault - ratioSubtotal - absoluteSubtotal`.
 * 10. 최종 = `max(0, afterDeduction)` → 100원 미만 절사.
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

  // 2. segment 분해 (Option B 기간식 — 한시장해는 실제 한시기간 [0, 종료월) 에만 적용)
  const retirementAge = input.base.retirementAge ?? DEFAULT_RETIREMENT_AGE;
  const retirementEndDate = addYears(input.base.birthDate, retirementAge);
  const totalMonths = monthsBetween(input.base.accidentDate, retirementEndDate);
  if (totalMonths <= 0) {
    throw new RangeError("손해배상 계산 실패: 가동연한 종료일이 사고일 이전이거나 같습니다.");
  }

  interface SegmentPlan {
    startMonth: number;
    endMonth: number;
    lossRate: number;
  }
  // 각 한시장해는 [0, 종료월) 적용. 가동연한 초과분은 clamp.
  const temporaries = temporaryItems.map((item) => ({
    endMonth: Math.min(Math.round(item.years * 12), totalMonths),
    ratio: item.ratio,
  }));
  // segment 경계 = distinct 한시 종료월(0 초과 ~ totalMonths) + 가동연한 종료월.
  const boundaries = Array.from(new Set([...temporaries.map((t) => t.endMonth), totalMonths]))
    .filter((m) => m > 0 && m <= totalMonths)
    .sort((a, b) => a - b);
  const segmentPlans: SegmentPlan[] = [];
  let cursorMonth = 0;
  for (const boundary of boundaries) {
    if (boundary <= cursorMonth) continue;
    // 이 구간 [cursorMonth, boundary) 동안 살아있는 한시장해(종료 ≥ boundary)만 영구분과 중복.
    let factor = permFactor;
    for (const t of temporaries) {
      if (t.endMonth >= boundary) factor *= 1 - t.ratio;
    }
    segmentPlans.push({ startMonth: cursorMonth, endMonth: boundary, lossRate: 1 - factor });
    cursorMonth = boundary;
  }
  // combinedLossRate = 첫 segment(한시기간 포함 최고율). 영구만일 때 = permanentTotal.
  const combinedLossRate = (segmentPlans[0] as SegmentPlan).lossRate;

  // 3. segment 단가
  let dailyWageWon: number;
  if (input.lostIncome.directWageWon !== undefined) {
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
  const rawHoffmanList: number[] = [];
  for (const plan of segmentPlans) {
    rawHoffmanList.push(
      getCumulativeHoffman(hoffman, plan.endMonth) - getCumulativeHoffman(hoffman, plan.startMonth),
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

  // 7. 위자료
  const solatiumWon = input.solatiumWon ?? 0;
  const pecuniaryDamagesSubtotalWon = lostIncomeSubtotalWon + otherDamagesSubtotalWon + solatiumWon;

  // 8. 과실상계
  const faultRatio = input.faultRatio ?? 0;
  const faultBeforeWon = pecuniaryDamagesSubtotalWon;
  const faultAfterWon = Math.floor(faultBeforeWon * (1 - faultRatio));

  // 9. 공제 (과실상계 후). 산재(산×부상) 는 장해급여를 absolute 와 동일 위치에서 추가 차감 (매뉴얼 §11).
  const accidentType = input.accidentType ?? "auto";
  const ratioItems = input.deductions?.ratio ?? [];
  const absoluteItems = input.deductions?.absolute ?? [];
  let ratioSum = 0;
  for (const item of ratioItems) ratioSum += item.ratio;
  const ratioSubtotalWon = Math.floor(faultAfterWon * ratioSum);
  let absoluteSubtotalWon = 0;
  for (const item of absoluteItems) absoluteSubtotalWon += item.amount;
  const industrialBenefitWon =
    accidentType === "industrial" ? (input.industrialInsurance?.disabilityBenefitWon ?? 0) : 0;
  const deductionsAfterWon =
    faultAfterWon - ratioSubtotalWon - absoluteSubtotalWon - industrialBenefitWon;

  // 10. final
  const finalRawWon = Math.max(0, deductionsAfterWon);
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
    pecuniaryDamagesSubtotalWon,
    faultOffset: {
      ratio: faultRatio,
      beforeWon: faultBeforeWon,
      afterWon: faultAfterWon,
    },
    deductions: {
      ratioSubtotalWon,
      absoluteSubtotalWon,
      ...(accidentType === "industrial" ? { industrialBenefitWon } : {}),
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
