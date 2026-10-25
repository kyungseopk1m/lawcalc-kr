import { describe, expect, it } from "vitest";

import {
  computeCompensation,
  computeCompensationDeath,
  shiftMonths,
} from "@lawcalc-kr/compensation";

import {
  applyWageScheduleInput,
  buildWageScheduleInput,
  emptyIncomeStep,
  manualRowsFromSegments,
  segmentWageText,
} from "../lib/compensation-extras";
import { migrateLcalcFile } from "../lib/lcalc-migrations";
import { parseLoadedCompensationLcalcInput, validateLcalcEnvelope } from "../lib/lcalc-validation";
import {
  applyLoadedCompensationDeathInput,
  applyLoadedCompensationInput,
  buildCompensationDeathInput,
  buildCompensationDeathLcalcFile,
  buildCompensationInput,
  buildCompensationLcalcFile,
  defaultCompensationDeathFormState,
  defaultCompensationFormState,
  formatCompensationForClipboard,
} from "./CompensationCalculator";

function reopen(file: unknown) {
  const migrated = migrateLcalcFile(JSON.parse(JSON.stringify(file)));
  validateLcalcEnvelope(migrated);
  return parseLoadedCompensationLcalcInput(migrated).input;
}

// VK 호봉승급 5-4 (영구 30%, 2010.01.01 사고, 가동 60세, 2단계 승급) = 165,819,114원.
function vkInjuryState() {
  const state = defaultCompensationFormState();
  return {
    ...state,
    birthDate: "1980-01-01",
    accidentDate: "2010-01-01",
    treatmentEndDate: "2010-01-01",
    retirementAgeText: "60",
    permanent: [{ uid: "p", department: "", ratioText: "0.3" }],
    hospitalizationFullLoss: false,
    courtTruncation: true,
    wageSchedule: {
      mode: "steps" as const,
      steps: [
        emptyIncomeStep("2010-01-01", "2320000"),
        emptyIncomeStep("2012-01-01", "2436000"),
        emptyIncomeStep("2014-01-01", "2552000"),
      ],
      rows: [],
    },
  };
}

describe("호봉승급 · 일실수입 표 직접 편집 (화면 상태)", () => {
  it("자동 구간이면 lostIncome 에 키가 없다 (종전 입력 그대로)", () => {
    const input = buildCompensationInput(defaultCompensationFormState());
    expect("incomeSteps" in input.lostIncome).toBe(false);
    expect("manualRows" in input.lostIncome).toBe(false);
  });

  it("호봉승급: VK 5-4 금액, 결과표·클립보드는 월소득 /월, .lcalc 왕복", () => {
    const input = buildCompensationInput(vkInjuryState());
    expect(input.lostIncome.incomeSteps).toHaveLength(3);
    const result = computeCompensation(input);
    expect(result.lostIncomeSubtotalWon).toBe(165_819_114);
    expect(segmentWageText(result.segments[0]!)).toBe("2,320,000원/월");
    expect(formatCompensationForClipboard(result)).toContain("2,436,000원/월");
    const reopened = reopen(buildCompensationLcalcFile(input, result, ""));
    expect(reopened.lostIncome).toEqual(input.lostIncome);
    const state = applyLoadedCompensationInput(reopened as typeof input);
    expect(state.wageSchedule.mode).toBe("steps");
    expect(buildCompensationInput(state)).toEqual(input);
  });

  it("표 직접 편집: 결과 구간으로 채운 뒤 행 하나를 고치면 그 행만 다시 계산", () => {
    const base = computeCompensation(buildCompensationInput(vkInjuryState()));
    const rows = manualRowsFromSegments(base.segments, false);
    rows[2] = { ...rows[2]!, lossPercentText: "20" };
    const state = {
      ...vkInjuryState(),
      wageSchedule: { mode: "manual" as const, steps: [], rows },
    };
    const input = buildCompensationInput(state);
    const result = computeCompensation(input);
    expect(result.segments.slice(0, 2).map((s) => s.amountFloorWon)).toEqual([
      15_888_984, 15_233_452,
    ]);
    // 2,552,000 × 0.2 × 175.9361 = 89,797,785.4 → 89,797,785.
    expect(result.segments[2]?.amountFloorWon).toBe(89_797_785);
    expect(segmentWageText(result.segments[2]!, "/일")).toBe("2,552,000원/월 (편집)");
    expect(
      buildCompensationInput(
        applyLoadedCompensationInput(
          reopen(buildCompensationLcalcFile(input, result, "")) as typeof input,
        ),
      ),
    ).toEqual(input);
  });

  it("사망: 직접 편집 표 왕복과 생계비 공제 끈 행", () => {
    const state = {
      ...defaultCompensationDeathFormState(),
      birthDate: "1980-01-01",
      accidentDate: "2010-01-01",
      retirementAgeText: "60",
      wageSchedule: applyWageScheduleInput({
        manualRows: [
          {
            startMonth: 0,
            endMonth: 24,
            monthlyWageWon: 2_320_000,
            lossRate: 1,
            livingCostDeducted: false,
          },
        ],
      }),
    };
    const input = buildCompensationDeathInput(state);
    const result = computeCompensationDeath(input);
    expect(result.segments[0]?.livingCostDeducted).toBe(false);
    expect(manualRowsFromSegments(result.segments, true)[0]?.livingCost).toBe(false);
    const reopened = reopen(buildCompensationDeathLcalcFile(input, result, ""));
    expect(
      buildCompensationDeathInput(applyLoadedCompensationDeathInput(reopened as typeof input)),
    ).toEqual(input);
  });

  it("입력 오류는 한국어 칸 이름으로 막는다", () => {
    expect(() =>
      buildWageScheduleInput({ mode: "steps", steps: [emptyIncomeStep("", "1")], rows: [] }),
    ).toThrow("호봉승급 1번째");
    expect(shiftMonths("2010-01-31", 1)).toBe("2010-02-28");
  });
});
