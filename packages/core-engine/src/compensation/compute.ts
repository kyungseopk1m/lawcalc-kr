import { STANDARD_DISCLAIMER } from "../disclaimers";
import { addYears } from "../days";
import type { IsoDate } from "../types";
import type { HoffmanDataset } from "./datasets/hoffman";
import {
  applyHoffman240Cap,
  getHoffmanAt,
  hoffmanDatasetVersionTag,
  loadHoffmanTable,
} from "./datasets/hoffman";
import type { LaborRatesDataset } from "./datasets/labor-rates";
import {
  getLaborRateAt,
  laborRatesDatasetVersionTag,
  loadLaborRatesTable,
} from "./datasets/labor-rates";
import type { LeibnizDataset } from "./datasets/leibniz";
import { leibnizDatasetVersionTag, loadLeibnizTable } from "./datasets/leibniz";
import type { LifeExpectancyDataset } from "./datasets/life-expectancy";
import {
  lifeExpectancyDatasetVersionTag,
  loadLifeExpectancyTable,
} from "./datasets/life-expectancy";
import type { CompensationInput, CompensationResult, CompensationSegment } from "./types";
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
 * 1. 노동력상실률 계산:
 *    - 영구 중복 = `1 - Π(1 - perm_i.ratio)`
 *    - 한시 영구 환산 합 = `Σ (temp_i.years / 10) × temp_i.ratio` (CAP 노트 § 1.2 정원)
 *    - 합산 lossRate = `1 - (1 - 영구중복) × (1 - 한시환산합)`
 * 2. segment 분해:
 *    - 영구 중복 > 0 또는 한시 없음 → 단일 segment `[0, totalMonths)` lossRate = 합산 lossRate
 *    - 영구 중복 = 0 AND 한시 존재 → segment A `[0, tempEndMonth)` lossRate = 한시환산합 +
 *      segment B `[tempEndMonth, totalMonths)` lossRate = 0
 *      (CAP 노트 § 5.2 case-comp-005 정원 — 한시 종료 boundary 가 cut)
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

  // 1. 노동력상실률
  let permFactor = 1;
  for (const item of permanentItems) {
    permFactor *= 1 - item.ratio;
  }
  const permanentTotal = 1 - permFactor;
  let temporaryConvertedSum = 0;
  for (const item of temporaryItems) {
    temporaryConvertedSum += (item.years / 10) * item.ratio;
  }
  if (temporaryConvertedSum > 1) {
    temporaryConvertedSum = 1;
  }
  const combinedLossRate = 1 - (1 - permanentTotal) * (1 - temporaryConvertedSum);

  // 2. segment 분해
  const retirementAge = input.base.retirementAge ?? DEFAULT_RETIREMENT_AGE;
  const retirementEndDate = addYears(input.base.birthDate, retirementAge);
  const totalMonths = monthsBetween(input.base.accidentDate, retirementEndDate);
  if (totalMonths <= 0) {
    throw new RangeError("손해배상 계산 실패: 가동연한 종료일이 사고일 이전이거나 같습니다.");
  }
  const hasTemporary = temporaryItems.length > 0;
  let temporaryEndMonth = 0;
  if (hasTemporary) {
    for (const item of temporaryItems) {
      const candidate = Math.round(item.years * 12);
      if (candidate > temporaryEndMonth) temporaryEndMonth = candidate;
    }
    if (temporaryEndMonth > totalMonths) temporaryEndMonth = totalMonths;
  }

  interface SegmentPlan {
    startMonth: number;
    endMonth: number;
    lossRate: number;
  }
  let segmentPlans: SegmentPlan[];
  if (
    permanentTotal === 0 &&
    hasTemporary &&
    temporaryEndMonth > 0 &&
    temporaryEndMonth < totalMonths
  ) {
    segmentPlans = [
      { startMonth: 0, endMonth: temporaryEndMonth, lossRate: combinedLossRate },
      { startMonth: temporaryEndMonth, endMonth: totalMonths, lossRate: 0 },
    ];
  } else {
    segmentPlans = [{ startMonth: 0, endMonth: totalMonths, lossRate: combinedLossRate }];
  }

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

  // 7. 위자료
  const solatiumWon = input.solatiumWon ?? 0;
  const pecuniaryDamagesSubtotalWon = lostIncomeSubtotalWon + solatiumWon;

  // 8. 과실상계
  const faultRatio = input.faultRatio ?? 0;
  const faultBeforeWon = pecuniaryDamagesSubtotalWon;
  const faultAfterWon = Math.floor(faultBeforeWon * (1 - faultRatio));

  // 9. 공제
  const ratioItems = input.deductions?.ratio ?? [];
  const absoluteItems = input.deductions?.absolute ?? [];
  let ratioSum = 0;
  for (const item of ratioItems) ratioSum += item.ratio;
  const ratioSubtotalWon = Math.floor(faultAfterWon * ratioSum);
  let absoluteSubtotalWon = 0;
  for (const item of absoluteItems) absoluteSubtotalWon += item.amount;
  const deductionsAfterWon = faultAfterWon - ratioSubtotalWon - absoluteSubtotalWon;

  // 10. final
  const finalRawWon = Math.max(0, deductionsAfterWon);
  const finalWon = Math.floor(finalRawWon / FINAL_FLOOR_UNIT) * FINAL_FLOOR_UNIT;

  const computedAtIso = (deps.now ?? (() => new Date()))().toISOString();

  return {
    combinedLossRate,
    segments,
    lostIncomeSubtotalWon,
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
