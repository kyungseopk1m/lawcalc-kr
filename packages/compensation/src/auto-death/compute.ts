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
  CompensationDeathOtherClaimant,
  CompensationInheritanceShare,
} from "./types";
import { computeOtherDamages } from "../other-damages/compute";
import { computeLifeExpectancy } from "../life-expectancy/compute";
import { computeLostRetirement } from "../lost-retirement/compute";
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
  floorEachStep,
  floorProduct,
  floorTimesComplements,
  getCumulativeHoffmanClamped,
  livingCostKeepFraction,
  resolveOccupationRate,
  type CompensationWarning,
  laborRateChanges,
  laborRateDateAt,
  monthsBetween,
  sumCourtDeductions,
  truncateHoffman4,
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
 *    `claimants` 가 있으면 원고별 귀속(상속대상 → 상속분 floor → 고유 위자료·장례비)으로 대신한다.
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
  // 표 범위(1,440개월)를 넘는 월수는 clamp 한다. 240 한도가 414개월에서 걸려 금액 영향 없음 (`../internal` 참조).
  // 법원 예시 절사면 누적 계수를 4자리에서 버린 표를 쓴다 (일실수입만, 개호비는 원 표).
  const courtTruncation = input.base.courtTruncation === true;
  const truncateEachStep = input.base.truncateEachStep === true;
  const lostIncomeHoffman = courtTruncation ? truncateHoffman4(hoffman) : hoffman;
  const rawHoffmanList: number[] = [];
  let cursorMonth = 0;
  for (const boundary of boundaries) {
    rawHoffmanList.push(
      getCumulativeHoffmanClamped(lostIncomeHoffman, boundary.month) -
        getCumulativeHoffmanClamped(lostIncomeHoffman, cursorMonth),
    );
    cursorMonth = boundary.month;
  }
  const capResult = applyHoffman240Cap(rawHoffmanList);

  // 4. 일실수입 (생계비 공제 반영, 노동능력 100% 상실)
  // 절사 경로는 floor(월급여 × 계수 × (1 - 생계비)) 를 정수·분수로 정확히 (1/3 은 정확히 2/3).
  const keep = livingCostKeepFraction(livingCostDeductionRatio);
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
      // 단계마다 절사면 월급여 × (1 - 생계비) 를 먼저 버린 뒤 호프만을 곱한다.
      amountFloorWon: truncateEachStep
        ? floorEachStep(monthlyWageWon, [keep, appliedHoffman])
        : courtTruncation
          ? Number(
              (BigInt(monthlyWageWon) * BigInt(Math.round(appliedHoffman * 1e4)) * keep.num) /
                (10000n * keep.den),
            )
          : floorProduct(monthlyWageWon, [appliedHoffman, keep]),
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

  // 4.6. 일실퇴직금 (망인의 재산상 손해, 상실률 100). 기대여명은 표시용으로만 계산한다.
  const lostRetirementResult =
    input.lostRetirement === undefined
      ? undefined
      : computeLostRetirement(
          input.lostRetirement.method === "direct"
            ? input.lostRetirement
            : { ...input.lostRetirement, lossRatePercent: 100 },
          accidentDate,
        );
  const lostRetirementSubtotalWon = lostRetirementResult?.amountWon ?? 0;
  const lifeExpectancyResult =
    input.lifeExpectancy === undefined
      ? undefined
      : computeLifeExpectancy(
          {
            ...input.lifeExpectancy,
            sex: input.base.sex,
            birthDate: input.base.birthDate,
            accidentDate,
          },
          { lifeExpectancy },
        );

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
  // 일실수입이 아닌 재산상 손해 (장례비·기타손해·일실퇴직금, 약관 기준이면 위자료).
  const otherPecuniaryWon =
    otherDamagesSubtotalWon +
    lostRetirementSubtotalWon +
    funeralExpenseWon +
    (solatiumInFaultBase ? solatiumWon : 0);
  const faultRatio = input.faultRatio ?? 0;
  // 공제. 비율공제·지급치료비 = 항목 금액 × [1 - (1 - 기왕증)(1 - 과실)], 사망은 기왕증 0 이라 × 과실.
  const deductions = input.deductions ?? {};
  const ratioSubtotalWon = sumCourtDeductions(deductions.ratio, 0, faultRatio);
  const paidTreatmentSubtotalWon = sumCourtDeductions(deductions.paidTreatment, 0, faultRatio);
  let legacyRatioSum = 0;
  for (const item of deductions.legacyRatio ?? []) legacyRatioSum += item.ratio;
  let absoluteTotalWon = 0;
  for (const item of deductions.absolute ?? []) absoluteTotalWon += item.amount;

  // 6~9. 과실상계 → 공제 → 위자료 가산 → 장례비 가산 → 100원 미만 절사. 총액 1회 또는 상속인별로 쓴다.
  // 비율공제·지급치료비는 장례비를 뺀 재산상 손해 한도에서만 빼고, 전액공제(선급금 등)가 그 한도를
  // 넘으면 초과분은 위자료를 차감한다 (`applyDeductions`, 원장 결정 9 재검토). 장례비 손해(과실상계 후)는
  // 공제로 깎지 않고 마지막에 그대로 더한다 (2026-10-25 결정, 원고별 귀속 경로와 같은 한도).
  const settle = (
    lostIncomeAfterWon: number,
    otherWon: number,
    funeralWon: number,
    solatiumAddWon: number,
    absoluteWon: number,
    propertyOnlyWon: number,
  ) => {
    // `otherWon` 은 장례비를 포함한다 (과실상계 대상 소계는 종전 그대로).
    const pecuniaryWon = lostIncomeAfterWon + otherWon;
    const afterFaultWon = floorTimesComplements(pecuniaryWon, [faultRatio]);
    // 과실상계 후 총액에서 장례비 몫을 뗀다. 총액 floor 를 유지해 초과가 없으면 종전 금액과 같다.
    const funeralClaimWon = floorTimesComplements(funeralWon, [faultRatio]);
    const estateAfterFaultWon = afterFaultWon - funeralClaimWon;
    // 구 파일 금액 유지(결정 5): 종전 실수식 그대로. 다만 장례비를 깎지 않도록 장례비 뺀 재산상 손해를
    // 넘는 몫은 버린다 (비율공제와 같은 한도).
    const legacyRatioWon = Math.min(
      Math.floor(afterFaultWon * legacyRatioSum),
      estateAfterFaultWon,
    );
    const { afterWon: estateAfterDeductionWon, propertyOnlyAppliedWon } = applyDeductions(
      estateAfterFaultWon,
      legacyRatioWon,
      propertyOnlyWon,
      absoluteWon,
    );
    // 전액공제가 장례비 뺀 재산상 손해를 넘은 부분: 위자료에서 빠진 몫과 위자료까지 넘어 버려진 몫.
    const overWon = Math.max(0, -estateAfterDeductionWon);
    const solatiumReducedWon = Math.min(solatiumAddWon, overWon);
    const finalRawWon = Math.max(0, estateAfterDeductionWon + solatiumAddWon) + funeralClaimWon;
    return {
      pecuniaryWon,
      afterFaultWon,
      legacyRatioWon,
      propertyOnlyAppliedWon,
      absoluteWon,
      // 공제 후 재산상 손해 = 장례비 뺀 공제 후 금액(음수 가능) + 장례비 손해. 항등식
      // 최종액(절사 전) = afterDeductionWon + 위자료 가산 + 버린 초과분 이 성립한다.
      afterDeductionWon: estateAfterDeductionWon + funeralClaimWon,
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
  const claimants = input.claimants;
  let estateWon: number | undefined;
  let otherClaimants: CompensationDeathOtherClaimant[] | undefined;
  // 고유 위자료(상속인·상속인 아닌 유족). 판결 방식은 책임비율을 곱하지 않고, 보험약관 지급기준이면
  // 망인 위자료처럼 floor(위자료 × (1 - 과실)) 로 줄인다 (2026-10-25 결정).
  const ownSolatiumOf = (won: number) =>
    solatiumInFaultBase ? floorTimesComplements(won, [faultRatio]) : won;
  if (claimants !== undefined && input.heirs !== undefined) {
    // 원고별 귀속 (판결 방식, 2008가단245503·2003가단361721). 장례비는 지출한 원고의 손해라
    // 상속대상에 넣지 않는다. 공제는 상속대상에서 뺀다 (재산상 손해가 모자랄 때 위자료 잠식은 settle 과 같은 규칙).
    // 상속인별 floor(상속대상 × 상속분) 의 나머지 원은 배정하지 않는다 (finalWon = 원고별 합).
    const shares = calculateInheritance(input.heirs).shares;
    rawInheritanceShares = shares;
    const estatePecuniaryWon = lostIncomeAfterIndustrialWon + otherPecuniaryWon - funeralExpenseWon;
    const afterFaultWon = floorTimesComplements(estatePecuniaryWon, [faultRatio]);
    const legacyRatioWon = Math.floor(afterFaultWon * legacyRatioSum);
    // 비율공제·지급치료비는 재산상 손해 한도에서만 빼고, 전액공제만 모자라면 망인 위자료까지
    // 깎는다. 원고별 귀속이 없는 경로(`settle`)와 같은 규칙이다 (R2-a 결정 9).
    const { afterWon: afterDeductionWon, propertyOnlyAppliedWon } = applyDeductions(
      afterFaultWon,
      legacyRatioWon,
      ratioSubtotalWon + paidTreatmentSubtotalWon,
      absoluteTotalWon,
    );
    const overWon = Math.max(0, -afterDeductionWon);
    const solatiumReducedWon = Math.min(solatiumAddWon, overWon);
    const estate = Math.max(0, afterDeductionWon + solatiumAddWon);
    const estateSolatiumWon = Math.min(solatiumAddWon, estate);
    const funeralClaimWon = floorTimesComplements(funeralExpenseWon, [faultRatio]);
    const funeralBenefitWon =
      accidentType === "industrial" ? input.industrialInsurance?.funeralBenefitWon : undefined;
    const unit = claimants.finalRounding === "hundred" ? FINAL_FLOOR_UNIT : 1;
    if (recipients !== undefined) {
      benefitWon = recipients.reduce((acc, r) => acc + r.survivorBenefitWon, 0);
      deductedWon = 0;
    }
    estateWon = estate;
    // 수급권자형은 상속인별로 유족급여를 먼저 빼고(2008다13104, 2021다241618 공제 후 과실상계)
    // 과실상계·공제·위자료 잠식을 상속인 몫마다 한다. 원고별 귀속이 없는 수급권자 경로와 같은
    // 순서이고, 장례비만 상속대상에서 뺀다.
    const recipientTotals =
      recipients === undefined
        ? undefined
        : {
            estateWon: 0,
            afterFaultWon: 0,
            legacyRatioWon: 0,
            propertyOnlyAppliedWon: 0,
            afterDeductionWon: 0,
            solatiumReducedWon: 0,
            absoluteExcessDroppedWon: 0,
          };
    inheritanceShares = shares.map((share) => {
      const part = (won: number) => Math.floor((won * share.numerator) / share.denominator);
      let inheritedSolatiumWon = part(estateSolatiumWon);
      let inheritedPecuniaryWon = part(estate) - inheritedSolatiumWon;
      let survivorBenefitDeductedWon: number | undefined;
      if (recipients !== undefined && recipientTotals !== undefined) {
        const lostIncomeShareWon = part(lostIncomeSubtotalWon);
        const benefitShareWon = recipients
          .filter((r) => r.heirName === share.name)
          .reduce((acc, r) => acc + r.survivorBenefitWon, 0);
        survivorBenefitDeductedWon = Math.min(benefitShareWon, lostIncomeShareWon);
        deductedWon += survivorBenefitDeductedWon;
        const solatiumShareWon = part(solatiumAddWon);
        const heir = settle(
          lostIncomeShareWon - survivorBenefitDeductedWon,
          part(otherPecuniaryWon - funeralExpenseWon),
          0,
          solatiumShareWon,
          part(absoluteTotalWon),
          part(ratioSubtotalWon + paidTreatmentSubtotalWon),
        );
        const heirEstateWon = Math.max(0, heir.afterDeductionWon + solatiumShareWon);
        inheritedSolatiumWon = Math.min(solatiumShareWon, heirEstateWon);
        inheritedPecuniaryWon = heirEstateWon - inheritedSolatiumWon;
        recipientTotals.estateWon += heirEstateWon;
        recipientTotals.afterFaultWon += heir.afterFaultWon;
        recipientTotals.legacyRatioWon += heir.legacyRatioWon;
        recipientTotals.propertyOnlyAppliedWon += heir.propertyOnlyAppliedWon;
        recipientTotals.afterDeductionWon += heir.afterDeductionWon;
        recipientTotals.solatiumReducedWon += heir.solatiumReducedWon;
        recipientTotals.absoluteExcessDroppedWon += heir.absoluteExcessDroppedWon;
      }
      const isPayer = claimants.funeralPayer === share.name;
      const funeralWon =
        claimants.funeralPayer === undefined
          ? part(funeralClaimWon)
          : isPayer
            ? funeralClaimWon
            : 0;
      // 장의비는 장례비 손해에서만, 그 금액 한도로 (2021다241618).
      const funeralBenefitDeductedWon =
        isPayer && funeralBenefitWon !== undefined ? Math.min(funeralBenefitWon, funeralWon) : 0;
      const ownSolatiumWon = ownSolatiumOf(
        (claimants.ownSolatium ?? [])
          .filter((o) => o.heirName === share.name)
          .reduce((acc, o) => acc + o.solatiumWon, 0),
      );
      const rawWon =
        inheritedPecuniaryWon +
        inheritedSolatiumWon +
        ownSolatiumWon +
        funeralWon -
        funeralBenefitDeductedWon;
      return {
        name: share.name,
        numerator: share.numerator,
        denominator: share.denominator,
        amountWon: Math.floor(rawWon / unit) * unit,
        ...(survivorBenefitDeductedWon !== undefined ? { survivorBenefitDeductedWon } : {}),
        inheritedPecuniaryWon,
        inheritedSolatiumWon,
        ownSolatiumWon,
        funeralWon,
        ...(isPayer && funeralBenefitWon !== undefined ? { funeralBenefitDeductedWon } : {}),
      };
    });
    otherClaimants = claimants.otherClaimants?.map((o) => {
      // 상속인 행의 ownSolatiumWon 과 같은 기준(과실 적용 후, 절사 전)으로 싣는다.
      const solatiumWon = ownSolatiumOf(o.solatiumWon);
      return { name: o.name, solatiumWon, amountWon: Math.floor(solatiumWon / unit) * unit };
    });
    const finalWon = [...inheritanceShares, ...(otherClaimants ?? [])].reduce(
      (acc, s) => acc + s.amountWon,
      0,
    );
    if (recipientTotals !== undefined) {
      estateWon = recipientTotals.estateWon;
      totals = {
        pecuniaryWon: lostIncomeSubtotalWon - deductedWon + otherPecuniaryWon,
        afterFaultWon: recipientTotals.afterFaultWon + funeralClaimWon,
        legacyRatioWon: recipientTotals.legacyRatioWon,
        propertyOnlyAppliedWon: recipientTotals.propertyOnlyAppliedWon,
        absoluteWon: absoluteTotalWon,
        afterDeductionWon: recipientTotals.afterDeductionWon,
        solatiumReducedWon: recipientTotals.solatiumReducedWon,
        absoluteExcessDroppedWon: recipientTotals.absoluteExcessDroppedWon,
        finalWon,
      };
    } else {
      totals = {
        pecuniaryWon: estatePecuniaryWon + funeralExpenseWon,
        afterFaultWon: afterFaultWon + funeralClaimWon,
        legacyRatioWon,
        propertyOnlyAppliedWon,
        absoluteWon: absoluteTotalWon,
        afterDeductionWon,
        solatiumReducedWon,
        absoluteExcessDroppedWon: overWon - solatiumReducedWon,
        finalWon,
      };
    }
  } else if (recipients !== undefined && input.heirs !== undefined) {
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
        part(funeralExpenseWon),
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
      funeralExpenseWon,
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
  const byHeir = recipients !== undefined && input.heirs !== undefined && claimants === undefined;
  const totalPathOverflow =
    !byHeir &&
    claimants === undefined &&
    totals.solatiumReducedWon + totals.absoluteExcessDroppedWon > 0;
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
    // 입력 시에만 포함 → 기존 골든/.lcalc byte-identical (회귀 0).
    ...(lostRetirementResult !== undefined
      ? { lostRetirementSubtotalWon, lostRetirement: lostRetirementResult }
      : {}),
    ...(lifeExpectancyResult !== undefined ? { lifeExpectancy: lifeExpectancyResult } : {}),
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
      // 총액 계산에서 전액공제가 장례비 뺀 재산상 손해를 넘었을 때만: 위자료 감액과 버린 초과분.
      // `afterWon` 이 장례비 손해를 포함해 양수일 수 있어 화면이 `-afterWon` 으로 역산할 수 없다.
      ...(totalPathOverflow
        ? {
            solatiumReducedWon: totals.solatiumReducedWon,
            absoluteExcessDroppedWon: totals.absoluteExcessDroppedWon,
          }
        : {}),
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
    // 원고별 귀속(claimants)일 때만 포함 → 기존 골든/.lcalc byte-identical (회귀 0).
    ...(estateWon !== undefined ? { estateWon } : {}),
    ...(otherClaimants !== undefined ? { otherClaimants } : {}),
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
