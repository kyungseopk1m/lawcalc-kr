import {
  STANDARD_DISCLAIMER,
  addDays,
  addYears,
  calculateInheritance,
  type InheritanceShare,
  type IsoDate,
} from "@lawcalc-kr/core-engine";
import {
  applyHoffman240Cap,
  hoffmanDatasetVersionTag,
  laborRatesDatasetVersionTag,
  leibnizDatasetVersionTag,
  lifeExpectancyDatasetVersionTag,
  loadHoffmanTable,
  loadLaborRatesTable,
  loadLeibnizTable,
  loadLifeExpectancyTable,
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

// 대법원 2024. 4. 25. 선고 2020다271650 (월 가동일수 20일 초과 인정 곤란). 부상 엔진과 같다.
const DEFAULT_WORKING_DAYS_PER_MONTH = 20;
const DEFAULT_RETIREMENT_AGE = 65;
const DEFAULT_LIVING_COST_DEDUCTION_RATIO = 1 / 3;
const DEFAULT_FUNERAL_EXPENSE_WON = 5_000_000;
const FINAL_FLOOR_UNIT = 100;

import {
  applyDeductions,
  dropUnchangedLaborRates,
  floorTimesComplements,
  getCumulativeHoffmanClamped,
  resolveOccupationRate,
  type CompensationWarning,
  laborRateChanges,
  laborRateDateAt,
  monthsBetween,
  sumCourtDeductions,
} from "../internal";

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
 *    `base.calculationDate` 가 있으면 노임 변경월마다 나눈다 (자×부상과 같은 규칙).
 * 2. 일실수입 = `floor(월급여 × appliedHoffman × (1 - 생계비비율))` (default 생계비 1/3).
 * 3. 장례비(default 5,000,000) 합산 → 과실상계 (장례비도 적극손해로 과실상계 대상).
 *    위자료는 과실상계 대상이 아니다 (`applyFaultToSolatium` 이면 이전처럼 포함).
 * 4. 공제(비율/전액) 적용 → 위자료 가산 → `max(0, ...)` → 100원 미만 절사 = finalWon.
 * 5. heirs 입력 시 finalWon 을 상속분(numerator/denominator)으로 분배 (floor + 잔여원 선순위).
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
  // 사고일에 가동연한이 이미 지난 고령 피해자도 위자료·장례비는 당연히 인정된다.
  // 일실수입 기간만 0 으로 두고 나머지는 그대로 계산한다 (자×부상과 동일 정원).
  // `accidentDate >= birthDate` 는 validator 가 이미 강제하므로 음수 월수가 생년월일
  // 오타를 가리는 경우는 없다.
  const totalMonths = Math.max(0, monthsBetween(input.base.accidentDate, retirementEndDate));

  // 2. segment 단가
  // 일실수입 기간이 없으면 단가는 결과에 쓰이지 않는다. 위자료·장례비만 청구하는 고령
  // 사건에서 직종 단가 조회 실패로 계산이 막히지 않도록 이 경우에만 조회를 건너뛴다.
  const accidentDate = input.base.accidentDate;
  const calculationDate = input.base.calculationDate;
  const rateRule = input.base.laborRateEffectiveRule ?? "published";
  const warnings: CompensationWarning[] = [];
  const resolveDailyWage = (date: IsoDate): number => {
    if (totalMonths === 0 && input.lostIncome.directWageWon === undefined) return 0;
    if (input.lostIncome.directWageWon !== undefined) return input.lostIncome.directWageWon;
    const occupation = input.lostIncome.occupation;
    if (occupation === undefined) {
      throw new RangeError(
        "사망 손해배상 계산 실패: lostIncome.occupation 또는 lostIncome.directWageWon 중 하나는 필요합니다.",
      );
    }
    const rate = resolveOccupationRate(
      laborRates,
      occupation,
      date,
      rateRule,
      accidentDate,
      warnings,
    );
    if (rate === undefined) {
      throw new RangeError(
        `사망 손해배상 계산 실패: 직종 "${occupation}"의 단가를 ${date === accidentDate ? "사고일 " : ""}${date} 기준으로 찾을 수 없습니다. 일당을 직접 입력해 주세요.`,
      );
    }
    return rate;
  };
  const dailyWageWon = resolveDailyWage(accidentDate);

  // 2.5. 노임단가 변경 경계. 계산 기준일이 있고 직종 단가일 때만 나눈다.
  // 직종 단가가 직전과 같은 변경일은 뺀다 (직종이 뒤 조사에서 빠져 마지막 단가를 이어 쓸 때).
  const laborOccupation = input.lostIncome.occupation;
  const laborChanges =
    calculationDate !== undefined &&
    input.lostIncome.directWageWon === undefined &&
    laborOccupation !== undefined
      ? dropUnchangedLaborRates(
          laborRateChanges(laborRates, accidentDate, calculationDate, rateRule).filter(
            (c) => c.month < totalMonths,
          ),
          (date) =>
            resolveOccupationRate(
              laborRates,
              laborOccupation,
              date,
              rateRule,
              accidentDate,
              warnings,
            ),
          accidentDate,
        )
      : [];
  // 경계 = 노임 변경일(0개월째 변경도 따로 두어 금액 0 인 행이 생긴다, 법원 계산표와 같음) + 가동종료.
  const boundaries = [...laborChanges, { month: totalMonths, date: retirementEndDate }];

  // 3. 호프만 + 240 cap
  // coverage clamp — 만 25세 미만 사망 사건은 가동연한까지 480개월을 넘는다 (`../internal` 참조).
  const rawHoffmanList: number[] = [];
  let cursorMonth = 0;
  for (const boundary of boundaries) {
    rawHoffmanList.push(
      getCumulativeHoffmanClamped(hoffman, boundary.month) -
        getCumulativeHoffmanClamped(hoffman, cursorMonth),
    );
    cursorMonth = boundary.month;
  }
  const capResult = applyHoffman240Cap(rawHoffmanList);

  // 4. 일실수입 (생계비 공제 반영, 노동능력 100% 상실)
  let cursor = { month: 0, date: accidentDate };
  const segments: CompensationSegment[] = boundaries.map((boundary, i) => {
    const start = cursor;
    cursor = boundary;
    const rawHoffman = rawHoffmanList[i] as number;
    const appliedHoffman = capResult.appliedHoffman[i] as number;
    const segmentDailyWageWon =
      laborChanges.length > 0
        ? resolveDailyWage(laborRateDateAt(laborChanges, start.date, accidentDate))
        : dailyWageWon;
    const monthlyWageWon = segmentDailyWageWon * workingDays;
    return {
      startMonth: start.month,
      endMonth: boundary.month,
      // 계산 기준일 미지정 시 키 생략 → 기존 골든/.lcalc byte-identical (회귀 0).
      ...(calculationDate !== undefined
        ? { startDate: start.date, endDate: addDays(boundary.date, -1) }
        : {}),
      lossRate: 1,
      dailyWageWon: segmentDailyWageWon,
      monthlyWageWon,
      rawHoffman,
      appliedHoffman,
      amountFloorWon: Math.floor(monthlyWageWon * appliedHoffman * (1 - livingCostDeductionRatio)),
    };
  });
  const lostIncomeSubtotalWon = segments.reduce((acc, segment) => acc + segment.amountFloorWon, 0);

  // 4.5. 기타손해 (개호비/치료비/보조구). 미지정·빈 입력 시 null → undefined → skip (회귀 0).
  const otherDamagesResult =
    (input.otherDamages
      ? computeOtherDamages(input.otherDamages, {
          accidentDate: input.base.accidentDate,
          ...(calculationDate !== undefined ? { calculationDate } : {}),
          laborRateEffectiveRule: rateRule,
          warnings,
          laborRates,
          hoffman,
        })
      : null) ?? undefined;
  const otherDamagesSubtotalWon = otherDamagesResult?.subtotalWon ?? 0;

  // 4.7. 산재보험급여(유족급여) 공제 — 같은 성질의 손해(생계비 공제 후 일실수입=소극손해)
  //      한도에서 먼저 공제한 뒤 과실상계 한다 (대법원 2022. 3. 24. 선고 2021다241618
  //      전원합의체 "공제 후 과실상계"). 위자료·장례비·기타손해는 잠식하지 않는다.
  //      자동차 모드는 benefit 0 → byte-identical (회귀 0).
  const accidentType = input.accidentType ?? "auto";
  const industrialBenefitInputWon =
    accidentType === "industrial" ? (input.industrialInsurance?.survivorBenefitWon ?? 0) : 0;
  const industrialDeductedWon = Math.min(industrialBenefitInputWon, lostIncomeSubtotalWon);
  const lostIncomeAfterIndustrialWon = lostIncomeSubtotalWon - industrialDeductedWon;

  // 5. 장례비는 적극적 손해라 과실상계 대상이다. 위자료는 과실 정도 등을 참작해 정하고
  //    과실상계·공제 뒤에 더한다 (서울고법 2022. 2. 18. 선고 2020나2039267,
  //    광주고법(전주) 2016. 7. 21. 선고 2015나100421). 위자료에 과실을 곱하는 것은
  //    보험약관 지급기준(`applyFaultToSolatium`)일 때뿐이다.
  const solatiumWon = input.solatiumWon ?? 0;
  const solatiumInFaultBase = input.applyFaultToSolatium === true;
  const funeralExpenseWon = input.funeralExpenseWon ?? DEFAULT_FUNERAL_EXPENSE_WON;
  // 일실수입이 아닌 재산상 손해 (장례비·기타손해, 약관 기준이면 위자료).
  const otherPecuniaryWon =
    otherDamagesSubtotalWon + funeralExpenseWon + (solatiumInFaultBase ? solatiumWon : 0);
  const faultRatio = input.faultRatio ?? 0;
  // 공제. 비율공제·지급치료비 = 항목 금액 × [1 - (1 - 기왕증)(1 - 과실)], 사망은 기왕증 0 이라 × 과실.
  const deductions = input.deductions ?? {};
  const ratioSubtotalWon = sumCourtDeductions(deductions.ratio, 0, faultRatio);
  const paidTreatmentSubtotalWon = sumCourtDeductions(deductions.paidTreatment, 0, faultRatio);
  let legacyRatioSum = 0;
  for (const item of deductions.legacyRatio ?? []) legacyRatioSum += item.ratio;
  let absoluteTotalWon = 0;
  for (const item of deductions.absolute ?? []) absoluteTotalWon += item.amount;

  // 6~9. 과실상계 → 공제 → 위자료 가산 → 100원 미만 절사. 총액 1회 또는 상속인별로 쓴다.
  // 비율공제·지급치료비는 재산상 손해 한도에서만 빼고, 전액공제(선급금 등)가 재산상 손해를 넘으면
  // 그 초과분은 위자료를 차감한다 (`applyDeductions`, 원장 결정 9 재검토).
  const settle = (
    lostIncomeAfterWon: number,
    otherWon: number,
    solatiumAddWon: number,
    absoluteWon: number,
    propertyOnlyWon: number,
  ) => {
    const pecuniaryWon = lostIncomeAfterWon + otherWon;
    const afterFaultWon = floorTimesComplements(pecuniaryWon, [faultRatio]);
    // 구 파일 금액 유지(결정 5): 종전 실수식 그대로.
    const legacyRatioWon = Math.floor(afterFaultWon * legacyRatioSum);
    const { afterWon: afterDeductionWon, propertyOnlyAppliedWon } = applyDeductions(
      afterFaultWon,
      legacyRatioWon,
      propertyOnlyWon,
      absoluteWon,
    );
    // 전액공제가 재산상 손해를 넘은 부분: 위자료에서 빠진 몫과 위자료까지 넘어 버려진 몫.
    const overWon = Math.max(0, -afterDeductionWon);
    const solatiumReducedWon = Math.min(solatiumAddWon, overWon);
    const finalRawWon = Math.max(0, afterDeductionWon + solatiumAddWon);
    return {
      pecuniaryWon,
      afterFaultWon,
      legacyRatioWon,
      propertyOnlyAppliedWon,
      absoluteWon,
      afterDeductionWon,
      solatiumReducedWon,
      absoluteExcessDroppedWon: overWon - solatiumReducedWon,
      finalWon: Math.floor(finalRawWon / FINAL_FLOOR_UNIT) * FINAL_FLOOR_UNIT,
    };
  };
  const solatiumAddWon = solatiumInFaultBase ? 0 : solatiumWon;

  // 10. 상속분 분배 (heirs 입력 시)
  // 유족급여 수급권자(`industrialInsurance.recipients`)를 지정하면 대법원 2009. 5. 21. 선고
  // 2008다13104 전원합의체에 따라 일실수입을 먼저 상속분대로 나누고, 수급권자가 상속한 몫에서만
  // 그 몫을 한도로 공제한다 (초과분은 다른 상속인 몫·다른 손해에서 빼지 않는다). 그 뒤 상속인별로
  // 공제 후 과실상계(2021다241618)와 이후 절사를 한다. 나머지 손해·위자료·전액공제도 상속분대로
  // 나눈다. recipients 가 없으면 종전처럼 총액에서 공제하고 최종액을 나눈다.
  const recipients =
    accidentType === "industrial" ? input.industrialInsurance?.recipients : undefined;
  let inheritanceShares: CompensationInheritanceShare[] | undefined;
  let rawInheritanceShares: InheritanceShare[] | undefined;
  let totals: ReturnType<typeof settle>;
  let benefitWon = industrialBenefitInputWon;
  let deductedWon = industrialDeductedWon;
  if (recipients !== undefined && input.heirs !== undefined) {
    const shares = calculateInheritance(input.heirs).shares;
    rawInheritanceShares = shares;
    benefitWon = recipients.reduce((acc, r) => acc + r.survivorBenefitWon, 0);
    deductedWon = 0;
    totals = {
      pecuniaryWon: 0,
      afterFaultWon: 0,
      legacyRatioWon: 0,
      propertyOnlyAppliedWon: 0,
      absoluteWon: 0,
      afterDeductionWon: 0,
      solatiumReducedWon: 0,
      absoluteExcessDroppedWon: 0,
      finalWon: 0,
    };
    inheritanceShares = shares.map((share) => {
      const part = (won: number) => Math.floor((won * share.numerator) / share.denominator);
      const lostIncomeShareWon = part(lostIncomeSubtotalWon);
      const benefitShareWon = recipients
        .filter((r) => r.heirName === share.name)
        .reduce((acc, r) => acc + r.survivorBenefitWon, 0);
      const survivorBenefitDeductedWon = Math.min(benefitShareWon, lostIncomeShareWon);
      deductedWon += survivorBenefitDeductedWon;
      const heir = settle(
        lostIncomeShareWon - survivorBenefitDeductedWon,
        part(otherPecuniaryWon),
        part(solatiumAddWon),
        part(absoluteTotalWon),
        part(ratioSubtotalWon + paidTreatmentSubtotalWon),
      );
      for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] += heir[key];
      return {
        name: share.name,
        numerator: share.numerator,
        denominator: share.denominator,
        amountWon: heir.finalWon,
        survivorBenefitDeductedWon,
      };
    });
  } else {
    totals = settle(
      lostIncomeAfterIndustrialWon,
      otherPecuniaryWon,
      solatiumAddWon,
      absoluteTotalWon,
      ratioSubtotalWon + paidTreatmentSubtotalWon,
    );
    if (input.heirs !== undefined) {
      const inheritance = calculateInheritance(input.heirs);
      rawInheritanceShares = inheritance.shares;
      inheritanceShares = distributeFinal(totals.finalWon, inheritance.shares);
    }
  }
  const pecuniaryDamagesSubtotalWon = totals.pecuniaryWon;
  const faultBeforeWon = totals.pecuniaryWon;
  const faultAfterWon = totals.afterFaultWon;
  const legacyRatioSubtotalWon = totals.legacyRatioWon;
  const absoluteSubtotalWon = totals.absoluteWon;
  const deductionsAfterWon = totals.afterDeductionWon;
  const finalWon = totals.finalWon;
  const byHeir = recipients !== undefined && input.heirs !== undefined;
  const propertyOnlyWon = ratioSubtotalWon + paidTreatmentSubtotalWon;
  const hasPropertyOnly =
    (deductions.ratio?.length ?? 0) + (deductions.paidTreatment?.length ?? 0) > 0;

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
    // 산재만 포함 — 자동차 모드 키 생략 → 기존 골든/.lcalc byte-identical (회귀 0).
    ...(accidentType === "industrial"
      ? {
          industrialBenefit: {
            benefitWon,
            deductedWon,
            lostIncomeAfterWon: lostIncomeSubtotalWon - deductedWon,
          },
        }
      : {}),
    pecuniaryDamagesSubtotalWon,
    faultOffset: {
      ratio: faultRatio,
      beforeWon: faultBeforeWon,
      afterWon: faultAfterWon,
    },
    funeralExpenseWon,
    deductions: {
      ratioSubtotalWon,
      // 입력 시에만 포함 → 기존 골든/.lcalc byte-identical (회귀 0).
      ...(deductions.paidTreatment !== undefined ? { paidTreatmentSubtotalWon } : {}),
      ...(deductions.legacyRatio !== undefined ? { legacyRatioSubtotalWon } : {}),
      ...(hasPropertyOnly
        ? {
            propertyOnlyAppliedWon: totals.propertyOnlyAppliedWon,
            propertyOnlyDiscardedWon: propertyOnlyWon - totals.propertyOnlyAppliedWon,
          }
        : {}),
      absoluteSubtotalWon,
      afterWon: deductionsAfterWon,
      // 상속인별 계산(recipients)일 때만: 행 합 = 최종액이 되게 하는 상속인별 합계.
      ...(byHeir
        ? {
            solatiumReducedWon: totals.solatiumReducedWon,
            absoluteExcessDroppedWon: totals.absoluteExcessDroppedWon,
            roundingWon:
              deductionsAfterWon + solatiumAddWon + totals.absoluteExcessDroppedWon - finalWon,
          }
        : {}),
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
    // 대체 처리가 있을 때만 포함 → 기존 골든/.lcalc byte-identical (회귀 0).
    ...(warnings.length > 0 ? { warnings } : {}),
    disclaimer: STANDARD_DISCLAIMER,
    computedAt: computedAtIso,
  };
}
