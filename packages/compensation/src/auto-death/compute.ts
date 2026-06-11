import {
  STANDARD_DISCLAIMER,
  addYears,
  calculateInheritance,
  type IsoDate,
  type InheritanceShare,
} from "@lawcalc-kr/core-engine";
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
} from "@lawcalc-kr/datasets-compensation";
import type { CompensationSegment } from "../auto-injury/types";
import type { ComputeCompensationDeps } from "../auto-injury/compute";
import type {
  CompensationAutoDeathInput,
  CompensationAutoDeathResult,
  CompensationInheritanceShare,
} from "./types";
import { computeOtherDamages } from "../other-damages/compute";
import { validateCompensationDeathInput } from "./validators";

const DEFAULT_WORKING_DAYS_PER_MONTH = 22;
const DEFAULT_RETIREMENT_AGE = 65;
const DEFAULT_LIVING_COST_DEDUCTION_RATIO = 1 / 3;
const DEFAULT_FUNERAL_EXPENSE_WON = 5_000_000;
const FINAL_FLOOR_UNIT = 100;

/** `H[0] = 0` 정원 보강 (자×부상 compute 와 동일 정원). */
function getCumulativeHoffman(dataset: HoffmanDataset, month: number): number {
  if (month === 0) return 0;
  return getHoffmanAt(dataset, month);
}

/** 두 ISO 날짜 사이의 calendar month floor 차이 (자×부상 compute 와 동일 정원). */
function monthsBetween(from: IsoDate, to: IsoDate): number {
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return months;
}

/**
 * 최종액을 상속분으로 분배한다.
 *
 * 각 상속인 = `floor(finalWon × numerator / denominator)`, 잔여원(`finalWon - Σ floor`)은
 * `shares` 선순위(inheritance 결과 순서) 순으로 1원씩 배정한다. 합계 = `finalWon` round-trip 보장.
 */
function distributeFinal(
  finalWon: number,
  shares: readonly InheritanceShare[],
): CompensationInheritanceShare[] {
  const allocated: CompensationInheritanceShare[] = shares.map((s) => ({
    name: s.name,
    numerator: s.numerator,
    denominator: s.denominator,
    amountWon: Math.floor((finalWon * s.numerator) / s.denominator),
  }));
  let remainder = finalWon - allocated.reduce((acc, s) => acc + s.amountWon, 0);
  for (let i = 0; remainder > 0 && allocated.length > 0; i = (i + 1) % allocated.length) {
    allocated[i]!.amountWon += 1;
    remainder -= 1;
  }
  return allocated;
}

/**
 * 자×사망 손해배상 계산. 자×부상 엔진(`computeCompensation`)의 호프만 240·과실상계·공제·원단위절사
 * 로직을 재사용하되, 사망 특화 차이는 다음과 같다:
 *
 * 1. 노동능력 100% 상실 전제 → 단일 segment `[0, totalMonths)` lossRate = 1.
 * 2. 일실수입 = `floor(월급여 × appliedHoffman × (1 - 생계비비율))` (default 생계비 1/3).
 * 3. 위자료 합산 → 과실상계.
 * 4. 과실상계 후 장례비(default 5,000,000) 전액 가산.
 * 5. 공제(비율/전액) 적용 → `max(0, ...)` → 100원 미만 절사 = finalWon.
 * 6. heirs 입력 시 finalWon 을 상속분(numerator/denominator)으로 분배 (floor + 잔여원 선순위).
 */
export function computeCompensationDeath(
  input: CompensationAutoDeathInput,
  deps: ComputeCompensationDeps = {},
): CompensationAutoDeathResult {
  validateCompensationDeathInput(input);
  const laborRates = loadLaborRatesTable(deps.laborRates);
  const lifeExpectancy = loadLifeExpectancyTable(deps.lifeExpectancy);
  const hoffman = loadHoffmanTable(deps.hoffman);
  const leibniz = loadLeibnizTable(deps.leibniz);

  const workingDays = input.lostIncome.workingDaysPerMonth ?? DEFAULT_WORKING_DAYS_PER_MONTH;
  const livingCostDeductionRatio =
    input.livingCostDeductionRatio ?? DEFAULT_LIVING_COST_DEDUCTION_RATIO;

  // 1. 단일 segment (노동능력 100% 상실 전제)
  const retirementAge = input.base.retirementAge ?? DEFAULT_RETIREMENT_AGE;
  const retirementEndDate = addYears(input.base.birthDate, retirementAge);
  const totalMonths = monthsBetween(input.base.accidentDate, retirementEndDate);
  if (totalMonths <= 0) {
    throw new RangeError("사망 손해배상 계산 실패: 가동연한 종료일이 사고일 이전이거나 같습니다.");
  }

  // 2. segment 단가
  let dailyWageWon: number;
  if (input.lostIncome.directWageWon !== undefined) {
    dailyWageWon = input.lostIncome.directWageWon;
  } else {
    const occupation = input.lostIncome.occupation;
    if (occupation === undefined) {
      throw new RangeError(
        "사망 손해배상 계산 실패: lostIncome.occupation 또는 lostIncome.directWageWon 중 하나는 필요합니다.",
      );
    }
    const rate = getLaborRateAt(laborRates, occupation, input.base.accidentDate);
    if (rate === undefined) {
      throw new RangeError(
        `사망 손해배상 계산 실패: 직종 "${occupation}"의 단가를 사고일 ${input.base.accidentDate} 기준으로 찾을 수 없습니다. 일당을 직접 입력해 주세요.`,
      );
    }
    dailyWageWon = rate;
  }
  const monthlyWageWon = dailyWageWon * workingDays;

  // 3. 호프만 + 240 cap
  const rawHoffman = getCumulativeHoffman(hoffman, totalMonths) - getCumulativeHoffman(hoffman, 0);
  const capResult = applyHoffman240Cap([rawHoffman]);
  const appliedHoffman = capResult.appliedHoffman[0] as number;

  // 4. 일실수입 (생계비 공제 반영, 노동능력 100% 상실)
  const amountFloorWon = Math.floor(
    monthlyWageWon * appliedHoffman * (1 - livingCostDeductionRatio),
  );
  const segments: CompensationSegment[] = [
    {
      startMonth: 0,
      endMonth: totalMonths,
      lossRate: 1,
      dailyWageWon,
      monthlyWageWon,
      rawHoffman,
      appliedHoffman,
      amountFloorWon,
    },
  ];
  const lostIncomeSubtotalWon = amountFloorWon;

  // 4.5. 기타손해 (개호비/치료비/보조구). 미지정·빈 입력 시 null → undefined → skip (회귀 0).
  const otherDamagesResult =
    (input.otherDamages
      ? computeOtherDamages(input.otherDamages, {
          accidentDate: input.base.accidentDate,
          laborRates,
          hoffman,
        })
      : null) ?? undefined;
  const otherDamagesSubtotalWon = otherDamagesResult?.subtotalWon ?? 0;

  // 5. 위자료
  const solatiumWon = input.solatiumWon ?? 0;
  const pecuniaryDamagesSubtotalWon = lostIncomeSubtotalWon + otherDamagesSubtotalWon + solatiumWon;

  // 6. 과실상계
  const faultRatio = input.faultRatio ?? 0;
  const faultBeforeWon = pecuniaryDamagesSubtotalWon;
  const faultAfterWon = Math.floor(faultBeforeWon * (1 - faultRatio));

  // 7. 장례비 (과실상계 후 전액 가산)
  const funeralExpenseWon = input.funeralExpenseWon ?? DEFAULT_FUNERAL_EXPENSE_WON;
  const afterFuneralWon = faultAfterWon + funeralExpenseWon;

  // 8. 공제 (장례비 가산 후 base 에 적용). 산재(산×사망) 는 유족급여를 absolute 와 동일 위치에서 추가 차감 (매뉴얼 §11).
  const accidentType = input.accidentType ?? "auto";
  const ratioItems = input.deductions?.ratio ?? [];
  const absoluteItems = input.deductions?.absolute ?? [];
  let ratioSum = 0;
  for (const item of ratioItems) ratioSum += item.ratio;
  const ratioSubtotalWon = Math.floor(afterFuneralWon * ratioSum);
  let absoluteSubtotalWon = 0;
  for (const item of absoluteItems) absoluteSubtotalWon += item.amount;
  const industrialBenefitWon =
    accidentType === "industrial" ? (input.industrialInsurance?.survivorBenefitWon ?? 0) : 0;
  const deductionsAfterWon =
    afterFuneralWon - ratioSubtotalWon - absoluteSubtotalWon - industrialBenefitWon;

  // 9. final
  const finalRawWon = Math.max(0, deductionsAfterWon);
  const finalWon = Math.floor(finalRawWon / FINAL_FLOOR_UNIT) * FINAL_FLOOR_UNIT;

  // 10. 상속분 분배 (heirs 입력 시)
  let inheritanceShares: CompensationInheritanceShare[] | undefined;
  let rawInheritanceShares: InheritanceShare[] | undefined;
  if (input.heirs !== undefined) {
    const inheritance = calculateInheritance(input.heirs);
    rawInheritanceShares = inheritance.shares;
    inheritanceShares = distributeFinal(finalWon, inheritance.shares);
  }

  const computedAtIso = (deps.now ?? (() => new Date()))().toISOString();

  return {
    mode: "death",
    // 자동차 모드는 accidentType 키 생략 → 기존 골든/.lcalc byte-identical (회귀 0).
    ...(accidentType === "industrial" ? { accidentType } : {}),
    livingCostDeductionRatio,
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
    funeralExpenseWon,
    deductions: {
      ratioSubtotalWon,
      absoluteSubtotalWon,
      ...(accidentType === "industrial" ? { industrialBenefitWon } : {}),
      afterWon: deductionsAfterWon,
    },
    finalWon,
    ...(inheritanceShares !== undefined ? { inheritanceShares } : {}),
    ...(rawInheritanceShares !== undefined ? { rawInheritanceShares } : {}),
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
