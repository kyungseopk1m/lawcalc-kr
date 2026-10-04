import { describe, expect, it } from "vitest";

import { STANDARD_DISCLAIMER } from "@lawcalc-kr/core-engine";
import {
  computeCompensation,
  computeCompensationDeath,
  type CompensationAutoDeathResult,
  type CompensationInput,
  type CompensationResult,
} from "@lawcalc-kr/compensation";
import { computeStaleBadge } from "@lawcalc-kr/datasets-compensation";

import {
  defaultOtherDamagesFormState,
  emptyAttendantFuture,
  emptyAttendantPast,
  emptyTreatmentFuture,
  emptyTreatmentPast,
  type OtherDamagesFormState,
} from "../components/other-damages-form";
import {
  propertyOnlyExcessWon,
  solatiumAddedAfterDeductionsWon,
  solatiumSettlement,
  withCompensationExportWarnings,
} from "../lib/compensation-warnings";
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
  formatCompensationDeathForClipboard,
  formatCompensationForClipboard,
  hospitalizationMonthsOf,
  isLegacySurvivorTotal,
  legacyCompensationNotice,
  NON_HEIR_RECIPIENT,
  occupationHintAt,
  withAccidentDate,
  occupationOptionsAt,
  type CompensationDeathFormState,
  type CompensationFormState,
} from "./CompensationCalculator";

function override(patch: Partial<CompensationFormState>): CompensationFormState {
  return { ...defaultCompensationFormState(), ...patch };
}

function overrideDeath(patch: Partial<CompensationDeathFormState>): CompensationDeathFormState {
  return { ...defaultCompensationDeathFormState(), ...patch };
}

describe("buildCompensationInput", () => {
  it("default state produces a valid CompensationInput with 보통인부 occupation and 20 working days", () => {
    const input = buildCompensationInput(defaultCompensationFormState());
    expect(input.base.birthDate).toBe("1996-01-01");
    expect(input.base.accidentDate).toBe("2026-01-01");
    expect(input.base.sex).toBe("male");
    expect(input.base.retirementAge).toBe(65);
    expect(input.lostIncome.occupation).toBe("보통인부");
    expect(input.lostIncome.workingDaysPerMonth).toBe(20);
    expect(input.lostIncome.discountMethod).toBe("hoffman");
    expect(input.lossRate.permanent?.[0]?.ratio).toBe(0.3);
    expect(input.lossRate.permanent?.[0]?.department).toBe("정형외과");
  });

  it("filters empty/0 ratio permanent items so validator does not reject the input", () => {
    const state = override({
      permanent: [
        { uid: "p1", department: "정형외과", ratioText: "0.30" },
        { uid: "p2", department: "신장내과", ratioText: "" },
        { uid: "p3", department: "마취과", ratioText: "0" },
      ],
    });
    const input = buildCompensationInput(state);
    expect(input.lossRate.permanent).toHaveLength(1);
    expect(input.lossRate.permanent?.[0]?.department).toBe("정형외과");
  });

  it("forwards directWageWon override on top of occupation so engine takes the override path", () => {
    const state = override({ directWageWonText: "200000" });
    const input = buildCompensationInput(state);
    expect(input.lostIncome.occupation).toBe("보통인부");
    expect(input.lostIncome.directWageWon).toBe(200_000);
  });

  it("omits empty optional fields (위자료/공제/과실/한시) so compute uses defaults", () => {
    const input = buildCompensationInput(defaultCompensationFormState());
    expect(input.solatiumWon).toBeUndefined();
    expect(input.faultRatio).toBeUndefined();
    expect(input.deductions).toBeUndefined();
    expect(input.lossRate.temporary).toBeUndefined();
  });

  it("encodes faultRatio + 전액공제 + temporary disability through the compute pipeline", () => {
    const state = override({
      temporary: [{ uid: "t1", department: "정형외과", ratioText: "0.20", yearsText: "5" }],
      faultRatioText: "0.30",
      absoluteDeductions: [{ uid: "a1", label: "치료비", amountText: "5000000" }],
    });
    const input = buildCompensationInput(state);
    expect(input.lossRate.temporary?.[0]?.years).toBe(5);
    expect(input.faultRatio).toBeCloseTo(0.3);
    expect(input.deductions?.absolute?.[0]).toEqual({ label: "치료비", amount: 5_000_000 });
  });
});

describe("applyLoadedCompensationInput", () => {
  it("round-trips: build → load returns equivalent shape (no UID dependency)", () => {
    const initial = override({
      temporary: [{ uid: "t1", department: "정형외과", ratioText: "0.20", yearsText: "5" }],
      absoluteDeductions: [{ uid: "a1", label: "치료비", amountText: "5000000" }],
    });
    const input = buildCompensationInput(initial);
    const reloaded = applyLoadedCompensationInput(input);
    expect(reloaded.birthDate).toBe(initial.birthDate);
    expect(reloaded.occupation).toBe("보통인부");
    expect(reloaded.permanent[0]?.ratioText).toBe("0.3");
    expect(reloaded.temporary[0]?.yearsText).toBe("5");
    expect(reloaded.absoluteDeductions[0]?.amountText).toBe("5000000");
  });
});

describe("computeCompensation integration via builder", () => {
  it("default state yields finalWon > 0 with STANDARD_DISCLAIMER and 4 dataVersions", () => {
    const input = buildCompensationInput(defaultCompensationFormState());
    const result = computeCompensation(input);
    expect(result.finalWon).toBeGreaterThan(0);
    expect(result.disclaimer).toBe(STANDARD_DISCLAIMER);
    expect(result.dataVersions.laborRates).toBe("labor-rates/v1.1.0");
    expect(result.dataVersions.lifeExpectancy).toBe("life-expectancy/v1.1.0");
    expect(result.dataVersions.hoffman).toBe("hoffman/v1.0.0");
    expect(result.dataVersions.leibniz).toBe("leibniz/v1.0.0");
  });

  it("matches CAP fixture case-comp-001 expected finalWon (226,727,100) with 보통인부 + 30% + 가동 60세", () => {
    // 픽스처는 사고일 단가 하나로 손계산했다: 기준일 = 사고일, 공표 적용일 규약.
    const state = override({
      retirementAgeText: "60",
      permanent: [{ uid: "p1", department: "정형외과", ratioText: "0.30" }],
      calculationDate: "2026-01-01",
      laborRateEffectiveRule: "published",
    });
    const result = computeCompensation(buildCompensationInput(state));
    // 골든 픽스처 case-comp-001 의 expected.finalWon (가동일수 20일 기준).
    expect(result.finalWon).toBe(226_727_100);
  });
});

describe("formatCompensationForClipboard + buildCompensationLcalcFile", () => {
  it("clipboard 본문은 STANDARD_DISCLAIMER 로 끝남 + 4 dataVersions 라벨 노출", () => {
    const result = computeCompensation(buildCompensationInput(defaultCompensationFormState()));
    const text = formatCompensationForClipboard(result);
    expect(text).toContain("LawCalc Korea 자동차 사고 부상 손해배상 계산 결과");
    expect(text).toContain("laborRates=labor-rates/v1.1.0");
    expect(text).toContain("lifeExpectancy=life-expectancy/v1.1.0");
    expect(text).toContain("hoffman=hoffman/v1.0.0");
    expect(text).toContain("leibniz=leibniz/v1.0.0");
    expect(text.trim().endsWith(STANDARD_DISCLAIMER)).toBe(true);
  });

  it("lcalc envelope = v3 + compensation kind + compensation@5 capability + 4 dataVersions", () => {
    const input = buildCompensationInput(defaultCompensationFormState());
    const result = computeCompensation(input);
    const file = buildCompensationLcalcFile(input, result, "메모");
    expect(file.schemaVersion).toBe("3");
    expect(file.kind).toBe("compensation");
    expect(file.envelopeFeatures).toEqual(["compensation@5"]);
    expect(file.dataVersions).toEqual({
      laborRates: result.dataVersions.laborRates,
      lifeExpectancy: result.dataVersions.lifeExpectancy,
      hoffman: result.dataVersions.hoffman,
      leibniz: result.dataVersions.leibniz,
    });
    expect(file.payload.disclaimer).toBe(STANDARD_DISCLAIMER);
    expect(file.payload.note).toBe("메모");
  });
});

describe("computeStaleBadge wire (트랙 D + U 5-1 정원)", () => {
  it("snapshot ≤ 6m → neutral, override 강조 false", () => {
    const stale = computeStaleBadge("2026-05-01", "2026-05-18");
    expect(stale.level).toBe("neutral");
    expect(stale.overrideStrongly).toBe(false);
  });

  it("snapshot 7~12m → amber, override 강조 true + 메시지", () => {
    const stale = computeStaleBadge("2025-08-01", "2026-05-18");
    expect(stale.level).toBe("amber");
    expect(stale.overrideStrongly).toBe(true);
    expect(stale.message).toContain("대한건설협회");
  });

  it("snapshot > 12m → red, override 강조 true + 갱신 메시지", () => {
    const stale = computeStaleBadge("2024-01-01", "2026-05-18");
    expect(stale.level).toBe("red");
    expect(stale.overrideStrongly).toBe(true);
    expect(stale.message).toContain("데이터셋 갱신");
  });
});

describe("validator 거부 path (UI 측 오류 노출 사슬)", () => {
  // 가동연한이 사고일에 이미 지난 고령 피해자도 위자료·치료비·개호비는 인정되므로
  // 계산을 거부하지 않는다. 일실수입만 0 이 되고 나머지 항목은 그대로 산출된다.
  it("가동연한 경과 사건은 일실수입 0 으로 계산된다 (전체 거부 아님)", () => {
    const state = override({
      birthDate: "1900-01-01",
      accidentDate: "2026-01-01",
      treatmentEndDate: "2026-01-01",
      retirementAgeText: "65",
    });
    const input: CompensationInput = buildCompensationInput(state);
    const result = computeCompensation(input);
    expect(result.segments).toHaveLength(0);
    expect(result.lostIncomeSubtotalWon).toBe(0);
  });

  it("생년월일이 사고일보다 늦으면 여전히 거부된다 (입력 오류)", () => {
    const state = override({
      birthDate: "2027-01-01",
      accidentDate: "2026-01-01",
      treatmentEndDate: "2026-01-01",
      retirementAgeText: "65",
    });
    const input: CompensationInput = buildCompensationInput(state);
    expect(() => computeCompensation(input)).toThrow(/birthDate/);
  });
});

describe("buildCompensationDeathInput (자×사망)", () => {
  it("default 상태는 mode:death + 장례비 500만 + 생계비 1/3 기본 입력을 만든다", () => {
    const input = buildCompensationDeathInput(defaultCompensationDeathFormState());
    expect(input.mode).toBe("death");
    expect(input.base.birthDate).toBe("1996-01-01");
    expect(input.base.accidentDate).toBe("2026-01-01");
    expect(input.lostIncome.occupation).toBe("보통인부");
    expect(input.lostIncome.workingDaysPerMonth).toBe(20);
    expect(input.funeralExpenseWon).toBe(5_000_000);
    expect(input.livingCostDeductionRatio).toBeCloseTo(0.3333, 4);
    expect(input.heirs).toBeUndefined();
  });

  it("상속인 체크 시 heirs 입력이 inheritance 컴포넌트 변환으로 만들어진다", () => {
    const state = overrideDeath({
      includeHeirs: true,
      spouse: { alive: true, name: "배우자" },
      linealDescendants: [
        { id: "c1", name: "자녀1", deceasedBeforeOpening: false, representatives: [] },
      ],
    });
    const input = buildCompensationDeathInput(state);
    expect(input.heirs?.spouse?.alive).toBe(true);
    expect(input.heirs?.linealDescendants?.[0]?.name).toBe("자녀1");
  });

  it("위자료·과실·공제 빈 값은 생략하고 기본값을 쓴다", () => {
    const input = buildCompensationDeathInput(defaultCompensationDeathFormState());
    expect(input.solatiumWon).toBeUndefined();
    expect(input.faultRatio).toBeUndefined();
    expect(input.deductions).toBeUndefined();
  });
});

describe("computeCompensationDeath integration via death builder", () => {
  it("사망 결과는 생계비 공제 후 일실수입 + 장례비 가산 + finalWon>0 + STANDARD_DISCLAIMER", () => {
    const input = buildCompensationDeathInput(defaultCompensationDeathFormState());
    const result = computeCompensationDeath(input);
    expect(result.mode).toBe("death");
    expect(result.finalWon).toBeGreaterThan(0);
    expect(result.funeralExpenseWon).toBe(5_000_000);
    expect(result.disclaimer).toBe(STANDARD_DISCLAIMER);
    expect(result.dataVersions.laborRates).toBe("labor-rates/v1.1.0");
  });

  it("상속인 입력 시 분배 합계 = finalWon (round-trip 보장)", () => {
    const state = overrideDeath({
      includeHeirs: true,
      spouse: { alive: true, name: "배우자" },
      linealDescendants: [
        { id: "c1", name: "자녀1", deceasedBeforeOpening: false, representatives: [] },
        { id: "c2", name: "자녀2", deceasedBeforeOpening: false, representatives: [] },
      ],
    });
    const result = computeCompensationDeath(buildCompensationDeathInput(state));
    expect(result.inheritanceShares).toBeDefined();
    const sum = result.inheritanceShares!.reduce((acc, s) => acc + s.amountWon, 0);
    expect(sum).toBe(result.finalWon);
  });

  it("1990 이전 사망 상속인 입력은 inheritance 엔진 RangeError 를 전파한다 (Option B toast 사슬)", () => {
    const state = overrideDeath({
      birthDate: "1960-01-01",
      accidentDate: "1989-01-01",
      includeHeirs: true,
      decedent: { name: "망인", deceasedAt: "1989-01-01" },
      spouse: { alive: true, name: "배우자" },
    });
    const input = buildCompensationDeathInput(state);
    expect(() => computeCompensationDeath(input)).toThrow();
  });
});

describe("자×사망 clipboard + .lcalc (compensation@2)", () => {
  it("clipboard 본문은 STANDARD_DISCLAIMER 로 끝나고 장례비·생계비 라벨을 노출한다", () => {
    const result = computeCompensationDeath(
      buildCompensationDeathInput(defaultCompensationDeathFormState()),
    );
    const text = formatCompensationDeathForClipboard(result);
    expect(text).toContain("LawCalc Korea 자동차 사고 사망 손해배상 계산 결과");
    expect(text).toContain("생계비 공제 비율");
    expect(text).toContain("장례비");
    expect(text.trim().endsWith(STANDARD_DISCLAIMER)).toBe(true);
  });

  it("death lcalc envelope = v3 + compensation kind + compensation@5 capability + 4 dataVersions", () => {
    const input = buildCompensationDeathInput(defaultCompensationDeathFormState());
    const result = computeCompensationDeath(input);
    const file = buildCompensationDeathLcalcFile(input, result, "사망 메모");
    expect(file.schemaVersion).toBe("3");
    expect(file.kind).toBe("compensation");
    expect(file.envelopeFeatures).toEqual(["compensation@5"]);
    expect(file.payload.disclaimer).toBe(STANDARD_DISCLAIMER);
    expect(file.payload.note).toBe("사망 메모");
  });

  it("death .lcalc round-trip: 저장 → validate → load 가 동일 입력 형태를 복원한다", () => {
    const state = overrideDeath({
      includeHeirs: true,
      spouse: { alive: true, name: "배우자" },
      linealDescendants: [
        { id: "c1", name: "자녀1", deceasedBeforeOpening: false, representatives: [] },
      ],
    });
    const input = buildCompensationDeathInput(state);
    const result = computeCompensationDeath(input);
    const file = buildCompensationDeathLcalcFile(input, result, "");
    expect(() => validateLcalcEnvelope(file)).not.toThrow();
    const loaded = parseLoadedCompensationLcalcInput(file);
    expect(loaded.input.mode).toBe("death");
    if (loaded.input.mode !== "death") throw new Error("expected death");
    expect(loaded.input.funeralExpenseWon).toBe(5_000_000);
    expect(loaded.input.heirs?.linealDescendants?.[0]?.name).toBe("자녀1");
    const reapplied = applyLoadedCompensationDeathInput(loaded.input);
    expect(reapplied.includeHeirs).toBe(true);
    expect(reapplied.linealDescendants[0]?.name).toBe("자녀1");
    expect(reapplied.funeralExpenseWonText).toBe("5000000");
  });
});

describe("compensation @1 → @2 migration + 부상 회귀", () => {
  it("@1 자×부상 파일(mode 없음)을 로드하면 mode:injury 가 주입되고 부상 입력이 그대로 복원된다", () => {
    const injuryInput = buildCompensationInput(defaultCompensationFormState());
    const injuryResult = computeCompensation(injuryInput);
    // 새 저장은 @5 다. v0.5.x 파일 모양을 흉내 내려고 capability 만 @1 로 바꾼다.
    const legacyFile = {
      ...buildCompensationLcalcFile(injuryInput, injuryResult, "부상"),
      envelopeFeatures: ["compensation@1"],
    };
    if (legacyFile.kind !== "compensation") throw new Error("expected compensation");
    // payload.input 에 mode 가 없는 v0.5.x 형태
    expect("mode" in (legacyFile.payload.input as unknown as Record<string, unknown>)).toBe(false);

    const migrated = migrateLcalcFile(legacyFile);
    if (migrated.kind !== "compensation") throw new Error("expected compensation");
    expect((migrated.payload.input as { mode?: string }).mode).toBe("injury");

    validateLcalcEnvelope(migrated);
    const loaded = parseLoadedCompensationLcalcInput(migrated);
    expect(loaded.input.mode).not.toBe("death");
    if (loaded.input.mode === "death") throw new Error("expected injury");
    const reapplied = applyLoadedCompensationInput(loaded.input);
    expect(reapplied.occupation).toBe("보통인부");
    expect(reapplied.permanent[0]?.ratioText).toBe("0.3");
    expect(loaded.note).toBe("부상");
  });

  it("@2 사망 파일은 migration 을 거쳐도 mode:death 가 유지된다 (오인 주입 없음)", () => {
    const input = buildCompensationDeathInput(defaultCompensationDeathFormState());
    const result = computeCompensationDeath(input);
    const file = buildCompensationDeathLcalcFile(input, result, "");
    const migrated = migrateLcalcFile(file);
    if (migrated.kind !== "compensation") throw new Error("expected compensation");
    expect((migrated.payload.input as { mode?: string }).mode).toBe("death");
  });
});

describe("산재 (compensation@3) — 산×부상 / 산×사망", () => {
  it("산×부상 builder: accidentType + 장해급여 주입, compute 결과 산재 라인", () => {
    // case-comp-010 정합: 가동연한 60 (default 65 override), 과실 20% + 장해급여 5천만.
    const state = override({
      accidentType: "industrial",
      retirementAgeText: "60",
      faultRatioText: "0.2",
      disabilityBenefitWonText: "50000000",
    });
    const input = buildCompensationInput(state);
    expect(input.accidentType).toBe("industrial");
    expect(input.industrialInsurance?.disabilityBenefitWon).toBe(50_000_000);
    const result = computeCompensation(input);
    expect(result.accidentType).toBe("industrial");
    // 2021다241618 전합 — 장해급여는 일실수입 한도에서 선공제 후 과실상계.
    expect(result.industrialBenefit?.deductedWon).toBe(50_000_000);
    expect(result.deductions.industrialBenefitWon).toBeUndefined();
    // 골든 픽스처 case-comp-010 의 expected.finalWon (가동일수 20일 기준).
    expect(result.finalWon).toBe(141_381_700);
  });

  it("산×부상 자동차 회귀: accidentType auto 면 산재 필드 미주입 + 새 저장은 @5 envelope", () => {
    const input = buildCompensationInput(defaultCompensationFormState());
    expect(input.accidentType).toBeUndefined();
    expect(input.industrialInsurance).toBeUndefined();
    const result = computeCompensation(input);
    const file = buildCompensationLcalcFile(input, result, "");
    expect(file.envelopeFeatures).toEqual(["compensation@5"]);
  });

  it("산×부상 .lcalc 는 compensation@5 envelope + round-trip 복원", () => {
    const state = override({
      accidentType: "industrial",
      disabilityBenefitWonText: "50000000",
    });
    const input = buildCompensationInput(state);
    const result = computeCompensation(input);
    const file = buildCompensationLcalcFile(input, result, "산재 부상");
    expect(file.envelopeFeatures).toEqual(["compensation@5"]);
    validateLcalcEnvelope(file);
    const loaded = parseLoadedCompensationLcalcInput(file);
    if (loaded.input.mode === "death") throw new Error("expected injury");
    const reapplied = applyLoadedCompensationInput(loaded.input);
    expect(reapplied.accidentType).toBe("industrial");
    expect(reapplied.disabilityBenefitWonText).toBe("50000000");
  });

  it("산×부상 clipboard 에 산재보험급여(장해급여) 라인 포함", () => {
    const state = override({
      accidentType: "industrial",
      disabilityBenefitWonText: "50000000",
    });
    const result = computeCompensation(buildCompensationInput(state));
    const text = formatCompensationForClipboard(result);
    expect(text).toContain("산재 사고 부상");
    expect(text).toContain("산재보험급여 공제 (장해급여·휴업급여)");
  });

  it("산×사망 builder: accidentType + 유족급여 주입, compute 결과 + 분배 round-trip", () => {
    // case-comp-011 정합: 생계비 1/3 (default "0.3333" override), 과실 10% + 유족급여 1억.
    const state = overrideDeath({
      accidentType: "industrial",
      livingCostDeductionRatioText: "0.3333333333333333",
      faultRatioText: "0.1",
      survivorBenefitWonText: "100000000",
      includeHeirs: true,
      decedent: { name: "", deceasedAt: "2026-01-01" },
      spouse: { alive: true, name: "배우자" },
      linealDescendants: [
        { id: "c1", name: "자녀1", deceasedBeforeOpening: false, representatives: [] },
      ],
    });
    const input = buildCompensationDeathInput(state);
    expect(input.accidentType).toBe("industrial");
    expect(input.industrialInsurance?.survivorBenefitWon).toBe(100_000_000);
    const result = computeCompensationDeath(input);
    expect(result.accidentType).toBe("industrial");
    // 2021다241618 전합: 유족급여는 일실수입(생계비 공제 후) 한도에서 선공제 후 과실상계.
    // 기대값은 골든 픽스처 case-comp-011 의 expected.finalWon (가동일수 20일 기준).
    expect(result.industrialBenefit?.deductedWon).toBe(100_000_000);
    expect(result.deductions.industrialBenefitWon).toBeUndefined();
    expect(result.finalWon).toBe(410_055_800);
    const sum = (result.inheritanceShares ?? []).reduce((acc, s) => acc + s.amountWon, 0);
    expect(sum).toBe(result.finalWon);
  });

  it("산×사망 clipboard + .lcalc compensation@5 envelope + round-trip 복원", () => {
    const state = overrideDeath({
      accidentType: "industrial",
      survivorBenefitWonText: "100000000",
    });
    const input = buildCompensationDeathInput(state);
    const result = computeCompensationDeath(input);
    expect(formatCompensationDeathForClipboard(result)).toContain("산재보험급여 공제 (유족급여)");
    const file = buildCompensationDeathLcalcFile(input, result, "산재 사망");
    expect(file.envelopeFeatures).toEqual(["compensation@5"]);
    validateLcalcEnvelope(file);
    const loaded = parseLoadedCompensationLcalcInput(file);
    if (loaded.input.mode !== "death") throw new Error("expected death");
    const reapplied = applyLoadedCompensationDeathInput(loaded.input);
    expect(reapplied.accidentType).toBe("industrial");
    expect(reapplied.survivorBenefitWonText).toBe("100000000");
  });

  it("산×사망 자동차 회귀: accidentType auto 여도 새 저장은 @5 envelope", () => {
    const input = buildCompensationDeathInput(defaultCompensationDeathFormState());
    expect(input.accidentType).toBeUndefined();
    const result = computeCompensationDeath(input);
    const file = buildCompensationDeathLcalcFile(input, result, "");
    expect(file.envelopeFeatures).toEqual(["compensation@5"]);
  });
});

/** 개호비(기왕·향후) + 치료비(기왕·향후) + 보조구를 모두 채운 기타손해 폼 state. */
function filledOtherDamages(): OtherDamagesFormState {
  const attendantPast = {
    ...emptyAttendantPast(),
    occupation: "보통인부",
    totalDaysText: "100",
  };
  const attendantFuture = {
    ...emptyAttendantFuture(),
    occupation: "보통인부",
    startDate: "2026-01-01",
    endDate: "2030-01-01",
    personCountText: "1",
  };
  const treatmentPast = { ...emptyTreatmentPast(), label: "수술", costWonText: "3000000" };
  const treatmentFuture = {
    ...emptyTreatmentFuture(),
    label: "재활",
    costWonText: "1000000",
    kind: "recurring" as const,
    firstDate: "2026-06-01",
    lastDate: "2030-06-01",
    lifespanMonthsText: "12",
  };
  const appliance = {
    ...emptyTreatmentFuture(),
    label: "휠체어",
    costWonText: "2000000",
    kind: "oneTime" as const,
    firstDate: "2026-06-01",
  };
  return {
    attendantPast: [attendantPast],
    attendantFuture: [attendantFuture],
    treatmentPast: [treatmentPast],
    treatmentFuture: [treatmentFuture],
    appliance: [appliance],
  };
}

describe("기타손해 (compensation@4) — 자×부상 / 자×사망", () => {
  it("자×부상 builder: otherDamages 주입 + compute 결과 기타손해 라인", () => {
    const input = buildCompensationInput(override({ otherDamages: filledOtherDamages() }));
    expect(input.otherDamages).toBeDefined();
    expect(input.otherDamages?.attendantCare?.past).toHaveLength(1);
    expect(input.otherDamages?.attendantCare?.future).toHaveLength(1);
    expect(input.otherDamages?.treatment?.past).toHaveLength(1);
    expect(input.otherDamages?.treatment?.future).toHaveLength(1);
    expect(input.otherDamages?.appliance).toHaveLength(1);
    const result = computeCompensation(input);
    expect(result.otherDamages).toBeDefined();
    expect(result.otherDamages?.subtotalWon).toBeGreaterThan(0);
    expect(result.otherDamagesSubtotalWon).toBe(result.otherDamages?.subtotalWon);
  });

  it("자×부상 빈 기타손해 폼은 otherDamages 미주입 (회귀 0)", () => {
    const input = buildCompensationInput(
      override({ otherDamages: defaultOtherDamagesFormState() }),
    );
    expect(input.otherDamages).toBeUndefined();
    const result = computeCompensation(input);
    expect(result).not.toHaveProperty("otherDamages");
    expect(result).not.toHaveProperty("otherDamagesSubtotalWon");
  });

  it("자×부상 .lcalc 는 compensation@5 envelope + round-trip 복원", () => {
    const state = override({ otherDamages: filledOtherDamages() });
    const input = buildCompensationInput(state);
    const result = computeCompensation(input);
    const file = buildCompensationLcalcFile(input, result, "기타손해 부상");
    expect(file.envelopeFeatures).toEqual(["compensation@5"]);
    validateLcalcEnvelope(file);
    const loaded = parseLoadedCompensationLcalcInput(file);
    if (loaded.input.mode === "death") throw new Error("expected injury");
    const reapplied = applyLoadedCompensationInput(loaded.input);
    expect(reapplied.otherDamages.attendantPast).toHaveLength(1);
    expect(reapplied.otherDamages.attendantFuture).toHaveLength(1);
    expect(reapplied.otherDamages.appliance).toHaveLength(1);
    // build → apply → build 가 동일 도메인 입력을 만든다.
    expect(
      buildCompensationInput(override({ otherDamages: reapplied.otherDamages })).otherDamages,
    ).toEqual(input.otherDamages);
  });

  it("자×부상 기타손해 + 산재도 새 저장은 @5 envelope", () => {
    const state = override({
      accidentType: "industrial",
      disabilityBenefitWonText: "50000000",
      otherDamages: filledOtherDamages(),
    });
    const input = buildCompensationInput(state);
    const result = computeCompensation(input);
    const file = buildCompensationLcalcFile(input, result, "");
    expect(file.envelopeFeatures).toEqual(["compensation@5"]);
  });

  it("자×부상 clipboard 에 개호비/치료비/보조구 라인 포함", () => {
    const result = computeCompensation(
      buildCompensationInput(override({ otherDamages: filledOtherDamages() })),
    );
    const text = formatCompensationForClipboard(result);
    expect(text).toContain("개호비:");
    expect(text).toContain("치료비:");
    expect(text).toContain("보조구:");
    expect(text).toContain("기타손해 소계:");
    expect(text.endsWith(STANDARD_DISCLAIMER)).toBe(true);
  });

  it("자×부상 자동차 회귀: 기타손해 미입력이어도 새 저장은 @5 envelope", () => {
    const input = buildCompensationInput(defaultCompensationFormState());
    expect(input.otherDamages).toBeUndefined();
    const result = computeCompensation(input);
    const file = buildCompensationLcalcFile(input, result, "");
    expect(file.envelopeFeatures).toEqual(["compensation@5"]);
  });

  it("자×사망 builder + compute + @5 envelope + round-trip", () => {
    const state = overrideDeath({ otherDamages: filledOtherDamages() });
    const input = buildCompensationDeathInput(state);
    expect(input.otherDamages).toBeDefined();
    const result = computeCompensationDeath(input);
    expect(result.otherDamages).toBeDefined();
    expect(result.otherDamagesSubtotalWon).toBe(result.otherDamages?.subtotalWon);
    const file = buildCompensationDeathLcalcFile(input, result, "기타손해 사망");
    expect(file.envelopeFeatures).toEqual(["compensation@5"]);
    validateLcalcEnvelope(file);
    const loaded = parseLoadedCompensationLcalcInput(file);
    if (loaded.input.mode !== "death") throw new Error("expected death");
    const reapplied = applyLoadedCompensationDeathInput(loaded.input);
    expect(
      buildCompensationDeathInput(overrideDeath({ otherDamages: reapplied.otherDamages }))
        .otherDamages,
    ).toEqual(input.otherDamages);
  });

  it("자×사망 clipboard 에 기타손해 라인 포함", () => {
    const result = computeCompensationDeath(
      buildCompensationDeathInput(overrideDeath({ otherDamages: filledOtherDamages() })),
    );
    const text = formatCompensationDeathForClipboard(result);
    expect(text).toContain("개호비:");
    expect(text).toContain("치료비:");
    expect(text).toContain("보조구:");
    expect(text).toContain("기타손해 소계:");
  });

  it("자×사망 회귀: 기타손해 미입력 시 @5 envelope + 결과 키 생략", () => {
    const input = buildCompensationDeathInput(defaultCompensationDeathFormState());
    expect(input.otherDamages).toBeUndefined();
    const result = computeCompensationDeath(input);
    expect(result).not.toHaveProperty("otherDamages");
    const file = buildCompensationDeathLcalcFile(input, result, "");
    expect(file.envelopeFeatures).toEqual(["compensation@5"]);
  });
});

/**
 * 직종 선택지는 사고일이 속한 노임단가 회차에서 나와야 한다.
 *
 * 노임단가 슬라이스가 하나뿐이던 동안에는 "최신 슬라이스" 가 곧 정답이라 이 구분이 없었다.
 * 1991년부터 반기별로 들어오면서 회차마다 조사 직종이 달라졌다.
 */
describe("직종 선택지 · 안내 (사고일 기준)", () => {
  const names = (accidentDate: string, selected?: string) =>
    occupationOptionsAt(accidentDate, selected).map((o) => o.value);

  it("2009년 사고에는 갱부가 있고 2015년 사고에는 없다", () => {
    expect(names("2009-09-01")).toContain("갱부");
    expect(names("2015-01-01")).not.toContain("갱부");
    expect(names("2015-01-01")).toContain("특별인부");
  });

  it("사고일이 다르면 선택지 자체가 다르다", () => {
    const old2005 = names("2005-01-01");
    const now = names("2026-01-01");
    expect(old2005).not.toEqual(now);
    // 창호공은 2010년 통합으로 생긴 이름이라 2005년에는 없다.
    expect(old2005).not.toContain("창호공");
    expect(now).toContain("창호공");
  });

  it("데이터셋이 덮지 않는 시점에도 빈 목록을 내지 않는다", () => {
    expect(names("1980-01-01")).toEqual(["보통인부"]);
  });

  /**
   * 고른 직종이 그 회차 목록에 없으면 <select> 가 값을 못 찾아 첫 옵션을 보여 준다.
   * 화면에 보이는 직종과 계산에 쓰이는 직종이 어긋나므로 목록에 남겨 둔다.
   */
  it("고른 직종이 그 사고일에 없어도 목록에서 사라지지 않는다", () => {
    const options = occupationOptionsAt("2015-01-01", "갱부");
    expect(options[0]).toEqual({ value: "갱부", available: false });
    expect(options.filter((o) => o.value === "갱부")).toHaveLength(1);
    // 조회 가능한 직종은 중복으로 추가되지 않는다.
    const normal = occupationOptionsAt("2015-01-01", "보통인부");
    expect(normal.filter((o) => o.value === "보통인부")).toHaveLength(1);
    expect(normal.every((o) => o.available)).toBe(true);
  });

  it("통합으로 사라진 직종을 고르면 흡수처를 안내한다", () => {
    expect(occupationHintAt("갱부", "2009-09-01")).toBeNull();
    const hint = occupationHintAt("갱부", "2015-01-01");
    expect(hint).toContain("특별인부");
    expect(hint).toContain("2010-01-01");
  });

  it("안내 문구의 조사가 받침을 따른다", () => {
    // 갱부(받침 없음) → 는, 특별인부(받침 없음) → 로
    const 갱부 = occupationHintAt("갱부", "2015-01-01")!;
    expect(갱부).toContain('"갱부"는');
    expect(갱부).toContain("특별인부로");
    expect(갱부).not.toContain("(으)로");
    // 함석공(받침 있음) → 은, 덕트공(받침 있음) → 으로
    const 함석공 = occupationHintAt("함석공", "2015-01-01")!;
    expect(함석공).toContain('"함석공"은');
    expect(함석공).toContain("덕트공으로");
  });

  it("여럿으로 갈린 직종은 흡수처를 모두 안내한다", () => {
    const hint = occupationHintAt("절단공", "2015-01-01")!;
    for (const name of ["철근공", "철공", "철판공", "철골공"]) {
      expect(hint, name).toContain(name);
    }
  });

  it("조회 가능한 직종에는 안내를 띄우지 않는다", () => {
    expect(occupationHintAt("보통인부", "2015-01-01")).toBeNull();
    expect(occupationHintAt("보통인부", "2026-01-01")).toBeNull();
  });

  it("데이터셋 범위 밖 사고일은 일당 직접 입력을 안내한다", () => {
    expect(occupationHintAt("보통인부", "1980-01-01")).toContain("일당을 직접 입력");
  });
});

describe("숫자 칸 공용 파서 (기본값으로 바꾸지 않는다)", () => {
  it('과실 "30%" 는 0.3 으로 읽는다 (0 이 아니다)', () => {
    expect(buildCompensationInput(override({ faultRatioText: "30%" })).faultRatio).toBe(0.3);
    expect(buildCompensationDeathInput(overrideDeath({ faultRatioText: "30%" })).faultRatio).toBe(
      0.3,
    );
  });

  it('사망 생계비 "50%" 는 0.5, % 없는 "50" 은 1/3 로 바꾸지 않고 오류', () => {
    const input = buildCompensationDeathInput(
      overrideDeath({ livingCostDeductionRatioText: "50%" }),
    );
    expect(input.livingCostDeductionRatio).toBe(0.5);
    expect(() =>
      buildCompensationDeathInput(overrideDeath({ livingCostDeductionRatioText: "50" })),
    ).toThrow(/^생계비 공제 비율: /);
  });

  it('영구장해 "30%" 는 행을 유지하고, "30" 은 행을 버리지 않고 오류', () => {
    const kept = buildCompensationInput(
      override({ permanent: [{ uid: "p1", department: "정형외과", ratioText: "30%" }] }),
    );
    expect(kept.lossRate.permanent).toEqual([{ department: "정형외과", ratio: 0.3 }]);
    expect(() =>
      buildCompensationInput(
        override({ permanent: [{ uid: "p1", department: "정형외과", ratioText: "30" }] }),
      ),
    ).toThrow(/^영구장해 1번째 비율: /);
  });

  it("한시장해 비율만 넣고 년수를 비우면 행을 버리지 않고 오류", () => {
    expect(() =>
      buildCompensationInput(
        override({ temporary: [{ uid: "t1", department: "", ratioText: "0.1", yearsText: "" }] }),
      ),
    ).toThrow(/^한시장해 1번째 년수: /);
  });

  it('기왕치료비 기왕증 "30%" 를 반영한다 (치료비 1,000만 → 700만)', () => {
    const otherDamages: OtherDamagesFormState = {
      ...defaultOtherDamagesFormState(),
      treatmentPast: [{ ...emptyTreatmentPast(), costWonText: "10000000", priorRatioText: "30%" }],
    };
    const result = computeCompensation(buildCompensationInput(override({ otherDamages })));
    expect(result.otherDamages?.treatmentWon).toBe(7_000_000);
  });

  it("가동연한·월 가동일수의 잘못된 값은 기본값으로 바꾸지 않고 한국어 라벨로 오류", () => {
    expect(() => buildCompensationInput(override({ retirementAgeText: "육십" }))).toThrow(
      /^가동연한: /,
    );
    expect(() => buildCompensationInput(override({ workingDaysPerMonthText: "32" }))).toThrow(
      /^월 가동일수: 1~31일 사이여야 합니다/,
    );
    expect(
      buildCompensationInput(override({ workingDaysPerMonthText: "22일" })).lostIncome
        .workingDaysPerMonth,
    ).toBe(22);
  });
});

describe("향후개호 월 개호일수 (소수 허용, 빈칸 = 엔진 기본 365/12)", () => {
  function withAttendantFuture(daysPerMonthText: string): CompensationFormState {
    return override({
      otherDamages: {
        ...defaultOtherDamagesFormState(),
        attendantFuture: [
          {
            ...emptyAttendantFuture(),
            directDailyWageWonText: "100000",
            startDate: "2026-01-01",
            endDate: "2027-01-01",
            personCountText: "1명",
            daysPerMonthText,
          },
        ],
      },
    });
  }

  it("소수 일수를 그대로 넘기고, 빈칸은 키를 생략한다", () => {
    const decimal = buildCompensationInput(withAttendantFuture("15.5일"));
    expect(decimal.otherDamages?.attendantCare?.future?.[0]?.daysPerMonth).toBe(15.5);
    const blank = buildCompensationInput(withAttendantFuture(""));
    expect(blank.otherDamages?.attendantCare?.future?.[0]).not.toHaveProperty("daysPerMonth");
    expect(blank.otherDamages?.attendantCare?.future?.[0]?.personCount).toBe(1);
  });

  it("빈칸 결과는 365/12 를 직접 넣은 결과와 같다", () => {
    const blank = computeCompensation(buildCompensationInput(withAttendantFuture("")));
    const explicit = computeCompensation(
      buildCompensationInput(withAttendantFuture(String(365 / 12))),
    );
    expect(blank.otherDamages?.attendantCareWon).toBe(explicit.otherDamages?.attendantCareWon);
  });
});

describe("위자료 가산 행 · 보험약관 기준 토글", () => {
  const base = { solatiumWonText: "30000000", faultRatioText: "0.4" };

  it("기본(꺼짐): 위자료는 과실상계·공제 뒤에 더하고, 행들의 합이 최종액과 맞는다", () => {
    const state = override({
      ...base,
      ratioDeductions: [{ uid: "r1", label: "", amountText: "5000000" }],
      absoluteDeductions: [{ uid: "a1", label: "", amountText: "1000000" }],
    });
    const input = buildCompensationInput(state);
    expect(input).not.toHaveProperty("applyFaultToSolatium");
    const result = computeCompensation(input);
    const added = solatiumAddedAfterDeductionsWon(result);
    expect(added).toBe(30_000_000);
    const shown =
      result.faultOffset.afterWon -
      result.deductions.ratioSubtotalWon -
      result.deductions.absoluteSubtotalWon +
      added;
    expect(Math.floor(shown / 100) * 100).toBe(result.finalWon);
    expect(formatCompensationForClipboard(result)).toContain("위자료 가산: 30,000,000원");
  });

  it("켜짐: 위자료가 소계에 들어가고 가산 행이 없다 (옛 표시)", () => {
    const input = buildCompensationInput(override({ ...base, applyFaultToSolatium: true }));
    expect(input.applyFaultToSolatium).toBe(true);
    const result = computeCompensation(input);
    expect(solatiumAddedAfterDeductionsWon(result)).toBe(0);
    expect(formatCompensationForClipboard(result)).not.toContain("위자료 가산");
  });

  it("사망도 같은 규칙: 꺼짐이면 장례비는 소계에, 위자료는 가산 행에", () => {
    const result = computeCompensationDeath(
      buildCompensationDeathInput(overrideDeath({ solatiumWonText: "80000000" })),
    );
    expect(solatiumAddedAfterDeductionsWon(result)).toBe(80_000_000);
    expect(formatCompensationDeathForClipboard(result)).toContain("위자료 가산: 80,000,000원");
  });
});

describe(".lcalc 왕복: 위자료 과실상계·입원기간 100% 토글", () => {
  it("두 토글 값이 저장·불러오기 뒤에도 유지된다", () => {
    const state = override({ applyFaultToSolatium: true, hospitalizationFullLoss: false });
    const input = buildCompensationInput(state);
    expect(input.lossRate.hospitalizationFullLoss).toBe(false);
    const file = buildCompensationLcalcFile(input, computeCompensation(input), "");
    const migrated = migrateLcalcFile(JSON.parse(JSON.stringify(file)));
    validateLcalcEnvelope(migrated);
    const loaded = parseLoadedCompensationLcalcInput(migrated);
    if (loaded.input.mode === "death") throw new Error("expected injury");
    const reapplied = applyLoadedCompensationInput(loaded.input);
    expect(reapplied.applyFaultToSolatium).toBe(true);
    expect(reapplied.hospitalizationFullLoss).toBe(false);
  });

  it("새 파일은 입원기간 100% 키를 늘 명시한다 (기본 켜짐도 true 로 저장)", () => {
    const input = buildCompensationInput(defaultCompensationFormState());
    expect(input).not.toHaveProperty("applyFaultToSolatium");
    expect(input.lossRate.hospitalizationFullLoss).toBe(true);
    const reapplied = applyLoadedCompensationInput(input);
    expect(reapplied.applyFaultToSolatium).toBe(false);
    expect(reapplied.hospitalizationFullLoss).toBe(true);
  });

  it("입원기간 키가 없는 구 파일은 끔으로 연다 (위자료 과실상계도 꺼짐)", () => {
    const input = buildCompensationInput(defaultCompensationFormState());
    delete input.lossRate.hospitalizationFullLoss;
    const reapplied = applyLoadedCompensationInput(input);
    expect(reapplied.applyFaultToSolatium).toBe(false);
    expect(reapplied.hospitalizationFullLoss).toBe(false);
  });

  it("토글 조합 어디서도 두 필드는 boolean 이거나 생략이고 null 을 쓰지 않는다", () => {
    for (const applyFaultToSolatium of [false, true]) {
      for (const hospitalizationFullLoss of [false, true]) {
        const input = buildCompensationInput(
          override({ applyFaultToSolatium, hospitalizationFullLoss }),
        );
        const file = JSON.parse(
          JSON.stringify(buildCompensationLcalcFile(input, computeCompensation(input), "")),
        ) as {
          payload: { input: Record<string, unknown> & { lossRate: Record<string, unknown> } };
        };
        const saved = file.payload.input;
        expect(
          saved.applyFaultToSolatium === undefined || saved.applyFaultToSolatium === true,
        ).toBe(true);
        // 입원기간 키는 늘 명시한다. 키가 없으면 구 파일로 보고 끈 상태로 열기 때문이다.
        expect(saved.lossRate.hospitalizationFullLoss).toBe(hospitalizationFullLoss);
        // 엔진 validator 는 null 을 RangeError 로 거부한다. 저장 파일이 검증을 통과해야 한다.
        const migrated = migrateLcalcFile(file);
        validateLcalcEnvelope(migrated);
        const loaded = parseLoadedCompensationLcalcInput(migrated);
        if (loaded.input.mode === "death") throw new Error("expected injury");
        const reapplied = applyLoadedCompensationInput(loaded.input);
        expect(reapplied.applyFaultToSolatium).toBe(applyFaultToSolatium);
        expect(reapplied.hospitalizationFullLoss).toBe(hospitalizationFullLoss);
      }
    }
    for (const applyFaultToSolatium of [false, true]) {
      const input = buildCompensationDeathInput(overrideDeath({ applyFaultToSolatium }));
      const saved = JSON.parse(
        JSON.stringify(buildCompensationDeathLcalcFile(input, computeCompensationDeath(input), "")),
      ) as { payload: { input: Record<string, unknown> } };
      expect(saved.payload.input.applyFaultToSolatium).toBe(
        applyFaultToSolatium ? true : undefined,
      );
      validateLcalcEnvelope(migrateLcalcFile(saved));
    }
  });

  it("null 이 든 파일은 엔진 validator 가 거부한다 (화면이 null 을 만들지 않는 이유)", () => {
    const input = buildCompensationInput(defaultCompensationFormState());
    const file = JSON.parse(
      JSON.stringify(buildCompensationLcalcFile(input, computeCompensation(input), "")),
    ) as { payload: { input: Record<string, unknown> } };
    file.payload.input.applyFaultToSolatium = null;
    expect(() => parseLoadedCompensationLcalcInput(migrateLcalcFile(file))).toThrow(
      /applyFaultToSolatium/,
    );
  });

  it("사망 화면도 위자료 과실상계 토글이 왕복한다", () => {
    const input = buildCompensationDeathInput(overrideDeath({ applyFaultToSolatium: true }));
    expect(applyLoadedCompensationDeathInput(input).applyFaultToSolatium).toBe(true);
    const legacy = buildCompensationDeathInput(defaultCompensationDeathFormState());
    expect(applyLoadedCompensationDeathInput(legacy).applyFaultToSolatium).toBe(false);
  });

  it("구 .lcalc 의 월 가동일수 22 는 저장된 값 그대로 연다", () => {
    const input = buildCompensationInput(override({ workingDaysPerMonthText: "22" }));
    expect(applyLoadedCompensationInput(input).workingDaysPerMonthText).toBe("22");
  });
});

describe("입원치료 종료일 · 입원기간 100% 표시", () => {
  it("사고일을 바꾸면 고치지 않은 종료일이 따라간다", () => {
    const moved = withAccidentDate(defaultCompensationFormState(), "2026-03-01");
    expect(moved.accidentDate).toBe("2026-03-01");
    expect(moved.treatmentEndDate).toBe("2026-03-01");
  });

  it("사용자가 종료일을 고친 뒤에는 사고일을 바꿔도 따라가지 않는다", () => {
    const edited = override({ treatmentEndDate: "2026-04-15" });
    expect(withAccidentDate(edited, "2026-02-01").treatmentEndDate).toBe("2026-04-15");
  });

  it("입원기간 개월 수는 결과의 앞쪽 상실률 1 구간에서 구하고, 엔진 구간과 맞는다", () => {
    const state = override({ treatmentEndDate: "2026-03-15" });
    const result = computeCompensation(buildCompensationInput(state));
    // 엔진: 2026-01-01 ~ 03-15 는 월 단위 내림 2개월. 첫 구간 [0, 2) 이 상실률 1 이다.
    expect(result.segments[0]).toMatchObject({ startMonth: 0, endMonth: 2, lossRate: 1 });
    expect(result.segments[1]?.lossRate).toBeLessThan(1);
    expect(hospitalizationMonthsOf(result)).toBe(2);

    const underOneMonth = computeCompensation(
      buildCompensationInput(override({ treatmentEndDate: "2026-01-31" })),
    );
    expect(hospitalizationMonthsOf(underOneMonth)).toBe(0);
    const off = computeCompensation(
      buildCompensationInput({ ...state, hospitalizationFullLoss: false }),
    );
    expect(hospitalizationMonthsOf(off)).toBe(0);

    expect(formatCompensationForClipboard(result, 2)).toContain(
      "입원기간 2개월 상실률 100% (월 단위 내림)",
    );
    expect(formatCompensationForClipboard(result)).not.toContain("입원기간");
  });
});

describe("공제가 재산상 손해를 넘을 때 (공제 초과분은 위자료에서 차감)", () => {
  function withExcess(solatiumWonText: string, excessWon: number) {
    const base = computeCompensation(buildCompensationInput(override({ solatiumWonText })));
    const amountText = String(base.faultOffset.afterWon + excessWon);
    return computeCompensation(
      buildCompensationInput(
        override({ solatiumWonText, absoluteDeductions: [{ uid: "a1", label: "", amountText }] }),
      ),
    );
  }

  it("초과분 500만, 위자료 3,000만: 0원 → -500만 → +3,000만 이 최종액 2,500만과 맞는다", () => {
    const result = withExcess("30000000", 5_000_000);
    const settlement = solatiumSettlement(result);
    expect(settlement).toEqual({
      addedWon: 30_000_000,
      deductionExcessWon: 5_000_000,
      uncoveredExcessWon: 0,
      heirExcessDroppedWon: 0,
      heirRoundingWon: 0,
    });
    expect(result.finalWon).toBe(25_000_000);
    expect(0 - settlement.deductionExcessWon + settlement.addedWon).toBe(result.finalWon);
    const text = formatCompensationForClipboard(result);
    expect(text).toContain("공제 후 재산상 손해: 0원");
    expect(text).toContain("공제 초과분 (위자료에서 차감): -5,000,000원");
    expect(text.indexOf("공제 초과분")).toBeLessThan(text.indexOf("위자료 가산"));
    const payload = withCompensationExportWarnings(result);
    expect(payload.deductionExcessWon).toBe(5_000_000);
    expect(payload.deductionExcessLabel).toBe("공제 초과분 (위자료에서 차감)");
  });

  it("위자료보다 초과분이 크면 위자료까지만 빼고 남은 금액은 0원 하한이라고 밝힌다", () => {
    const result = withExcess("3000000", 5_000_000);
    expect(result.finalWon).toBe(0);
    expect(solatiumSettlement(result)).toEqual({
      addedWon: 3_000_000,
      deductionExcessWon: 3_000_000,
      uncoveredExcessWon: 2_000_000,
      heirExcessDroppedWon: 0,
      heirRoundingWon: 0,
    });
    expect(formatCompensationForClipboard(result)).toContain(
      "공제 초과분 (위자료에서 차감, 남은 2,000,000원은 최종액 0원 하한으로 차감하지 않음): -3,000,000원",
    );
  });

  it("초과가 없으면 공제 초과분 행이 없다", () => {
    const result = computeCompensation(
      buildCompensationInput(override({ solatiumWonText: "30000000" })),
    );
    expect(formatCompensationForClipboard(result)).not.toContain("공제 초과분");
  });
});

/**
 * 화면 행 합: 과실상계 후 − 공제 소계 + 재산상 손해 초과분 = 엔진 공제 후 금액, 그리고
 * (공제 후 금액 또는 0원 → 공제 초과분) + 위자료 가산 = 최종액 (100원 미만 버림 전).
 */
function expectRowsMatchFinal(result: CompensationResult | CompensationAutoDeathResult) {
  const d = result.deductions;
  const afterDeductions =
    result.faultOffset.afterWon -
    d.ratioSubtotalWon -
    (d.paidTreatmentSubtotalWon ?? 0) -
    (d.legacyRatioSubtotalWon ?? 0) -
    d.absoluteSubtotalWon +
    propertyOnlyExcessWon(result);
  expect(afterDeductions).toBe(d.afterWon);
  const settlement = solatiumSettlement(result);
  if (d.roundingWon !== undefined) {
    // 상속인별 계산: 버린 초과분·절사 차이 행까지 더하면 원 단위로 최종액이다.
    expect(
      afterDeductions +
        settlement.heirExcessDroppedWon +
        settlement.addedWon -
        settlement.heirRoundingWon,
    ).toBe(result.finalWon);
    return;
  }
  const shown =
    (afterDeductions < 0 ? -settlement.deductionExcessWon : afterDeductions) + settlement.addedWon;
  expect(Math.floor(Math.max(0, shown) / 100) * 100).toBe(result.finalWon);
}

describe("R2-a 입력: 계산 기준일 · 노임 적용일 규약 · 공제 종류", () => {
  const timing = { accidentDate: "2020-03-01", treatmentEndDate: "2020-03-01" };

  it("새 입력은 기준일·규약을 늘 명시하고, 기준일 > 사고일이면 노임 변경일마다 구간을 나눈다", () => {
    const input = buildCompensationInput(
      override({ ...timing, calculationDate: "2023-06-30", laborRateEffectiveRule: "survey" }),
    );
    expect(input.base.calculationDate).toBe("2023-06-30");
    expect(input.base.laborRateEffectiveRule).toBe("survey");
    const result = computeCompensation(input);
    expect(result.segments.length).toBeGreaterThan(1);
    expect(result.segments[0]?.startDate).toBe("2020-03-01");
    const wages = result.segments.map((segment) => segment.dailyWageWon);
    expect(new Set(wages).size).toBeGreaterThan(1);
    const text = formatCompensationForClipboard(result);
    expect(text).toContain("(2020-03-01 ~ ");
  });

  it("지급치료비: 기왕치료비에 넣지 않고 지급치료비 칸 = 기왕치료비 + 전액공제, 두 칸에 모두 넣으면 T(1 − 과실)만큼 더 나온다", () => {
    const T = 1_000_000;
    const withPast = (pastWon: number) => ({
      ...defaultOtherDamagesFormState(),
      treatmentPast: pastWon > 0 ? [{ ...emptyTreatmentPast(), costWonText: String(pastWon) }] : [],
    });
    const final = (patch: Partial<CompensationFormState>) =>
      computeCompensation(
        buildCompensationInput(
          override({ solatiumWonText: "10000000", faultRatioText: "0.3", ...patch }),
        ),
      ).finalWon;
    const paidOnly = final({
      paidTreatmentDeductions: [{ uid: "p", label: "", amountText: String(T) }],
    });
    const pastAndAbsolute = final({
      otherDamages: withPast(T),
      absoluteDeductions: [{ uid: "a", label: "", amountText: String(T) }],
    });
    const mixed = final({
      otherDamages: withPast(T),
      paidTreatmentDeductions: [{ uid: "p", label: "", amountText: String(T) }],
    });
    // 원 미만 버림 위치만 달라 100원 단위 절사 후 한 단위까지 차이를 허용한다.
    expect(Math.abs(paidOnly - pastAndAbsolute)).toBeLessThanOrEqual(100);
    expect(Math.abs(mixed - paidOnly - 700_000)).toBeLessThanOrEqual(100);
  });

  it("클립보드·내보내기 payload 에 계산 기준일과 노임 적용일 규약을 적는다", () => {
    const state = override({ ...timing, calculationDate: "2023-06-30" });
    const result = computeCompensation(buildCompensationInput(state));
    const timingInput = {
      calculationDate: "2023-06-30",
      laborRateEffectiveRule: "survey" as const,
    };
    expect(formatCompensationForClipboard(result, 0, timingInput)).toContain(
      "노임 기준: 계산 기준일 2023-06-30 · 노임 적용일 규약 조사 시점 (5/1·9/1)",
    );
    expect(withCompensationExportWarnings(result, timingInput).laborRateTimingText).toBe(
      "계산 기준일 2023-06-30 · 노임 적용일 규약 조사 시점 (5/1·9/1)",
    );
    expect(withCompensationExportWarnings(result).laborRateTimingText).toBe("");
    const death = computeCompensationDeath(buildCompensationDeathInput(overrideDeath({})));
    expect(
      formatCompensationDeathForClipboard(death, { laborRateEffectiveRule: "published" }),
    ).toContain("노임 기준: 계산 기준일 없음 (사고일 단가 하나) · 노임 적용일 규약 공표 적용일");
  });

  it("금액 0 인 0개월 구간(사고일 ~ 첫 노임 변경 전날)도 날짜·단가와 함께 그대로 보인다", () => {
    const result = computeCompensation(
      buildCompensationInput(override({ ...timing, calculationDate: "2023-06-30" })),
    );
    const zeroRow = {
      ...result.segments[0]!,
      startMonth: 0,
      endMonth: 0,
      startDate: "2020-03-01",
      endDate: "2020-03-31",
      appliedHoffman: 0,
      amountFloorWon: 0,
    };
    const text = formatCompensationForClipboard({
      ...result,
      segments: [zeroRow, ...result.segments],
    });
    expect(text).toContain("1\t0~0개월 (2020-03-01 ~ 2020-03-31)\t");
    expect(text).toMatch(/1\t0~0개월 \(2020-03-01 ~ 2020-03-31\)\t[^\n]*\t0원/);
  });

  it("기준일 = 사고일이면 기준일 없음(이전 동작)과 금액이 같다 (두 규약 모두)", () => {
    for (const rule of ["published", "survey"] as const) {
      const input = buildCompensationInput(
        override({ ...timing, calculationDate: timing.accidentDate, laborRateEffectiveRule: rule }),
      );
      const baseWithoutDate = { ...input.base };
      delete baseWithoutDate.calculationDate;
      const withoutDate = computeCompensation({ ...input, base: baseWithoutDate });
      expect(computeCompensation(input).finalWon).toBe(withoutDate.finalWon);
    }
  });

  it("기준일이 비었거나 사고일보다 앞서면 한국어로 막는다", () => {
    expect(() => buildCompensationInput(override({ ...timing, calculationDate: "" }))).toThrow(
      "계산 기준일을 입력하세요.",
    );
    expect(() =>
      buildCompensationDeathInput(overrideDeath({ ...timing, calculationDate: "2019-12-31" })),
    ).toThrow("계산 기준일은 사고일과 같거나 그 뒤여야 합니다.");
  });

  it("사고일을 바꾸면 사고일과 같던 기준일(이전 버전 파일)만 따라간다", () => {
    const legacy = override({ ...timing, calculationDate: timing.accidentDate });
    expect(withAccidentDate(legacy, "2021-01-01").calculationDate).toBe("2021-01-01");
    const fresh = override({ ...timing, calculationDate: "2026-10-04" });
    expect(withAccidentDate(fresh, "2021-01-01").calculationDate).toBe("2026-10-04");
    const death = overrideDeath({
      accidentDate: timing.accidentDate,
      calculationDate: timing.accidentDate,
    });
    expect(withAccidentDate(death, "2021-01-01").calculationDate).toBe("2021-01-01");
    expect(withAccidentDate(death, "2021-01-01")).not.toHaveProperty("treatmentEndDate");
  });

  it("비율공제(금액)·지급치료비·전액공제·이전 방식 비율공제가 저장·불러오기 뒤에도 그대로다", () => {
    const state = override({
      ...timing,
      calculationDate: "2023-06-30",
      laborRateEffectiveRule: "published",
      priorImpairmentRatioText: "0.2",
      faultRatioText: "0.3",
      ratioDeductions: [{ uid: "r", label: "보험사 지급분", amountText: "2000000" }],
      paidTreatmentDeductions: [{ uid: "p", label: "", amountText: "5000000" }],
      absoluteDeductions: [{ uid: "a", label: "선급금", amountText: "1000000" }],
      legacyRatioDeductions: [{ uid: "l", label: "구", ratioText: "0.05" }],
    });
    const input = buildCompensationInput(state);
    expect(input.deductions).toEqual({
      ratio: [{ label: "보험사 지급분", amount: 2_000_000 }],
      paidTreatment: [{ amount: 5_000_000 }],
      absolute: [{ label: "선급금", amount: 1_000_000 }],
      legacyRatio: [{ label: "구", ratio: 0.05 }],
    });
    const result = computeCompensation(input);
    // 계수 1 − (1 − 0.2)(1 − 0.3) = 0.44.
    expect(result.deductions.ratioSubtotalWon).toBe(880_000);
    expect(result.deductions.paidTreatmentSubtotalWon).toBe(2_200_000);
    const file = buildCompensationLcalcFile(input, result, "");
    expect(file.envelopeFeatures).toEqual(["compensation@5"]);
    const loaded = parseLoadedCompensationLcalcInput(migrateLcalcFile(file));
    if (loaded.input.mode === "death") throw new Error("expected injury");
    expect(buildCompensationInput(applyLoadedCompensationInput(loaded.input))).toEqual(input);
    expect(legacyCompensationNotice(loaded.input)).toContain("이전 방식(과실상계 후 금액 × 비율)");
    expectRowsMatchFinal(result);
    const text = formatCompensationForClipboard(result);
    expect(text).toContain("지급치료비 공제 소계: 2,200,000원");
    expect(text).toContain("이전 방식 비율공제 소계: ");
  });

  it("비율공제가 재산상 손해를 넘으면 넘는 부분은 빼지 않고 위자료도 그대로다 (행 합 = 최종액)", () => {
    const result = computeCompensation(
      buildCompensationInput(
        override({
          solatiumWonText: "30000000",
          faultRatioText: "0.5",
          ratioDeductions: [{ uid: "r", label: "", amountText: "100000000000" }],
        }),
      ),
    );
    expect(propertyOnlyExcessWon(result)).toBeGreaterThan(0);
    expect(result.finalWon).toBe(30_000_000);
    expectRowsMatchFinal(result);
    expect(formatCompensationForClipboard(result)).toContain(
      "비율공제·지급치료비 중 재산상 손해 초과분 (위자료에서 빼지 않음): ",
    );
    expect(withCompensationExportWarnings(result).propertyOnlyExcessWon).toBe(
      propertyOnlyExcessWon(result),
    );
  });

  it("사망: 지급치료비·비율공제 계수는 과실비율이고 행 합 = 최종액", () => {
    const result = computeCompensationDeath(
      buildCompensationDeathInput(
        overrideDeath({
          solatiumWonText: "80000000",
          faultRatioText: "0.3",
          ratioDeductions: [{ uid: "r", label: "", amountText: "1000000" }],
          paidTreatmentDeductions: [{ uid: "p", label: "", amountText: "2000000" }],
          absoluteDeductions: [{ uid: "a", label: "", amountText: "500000" }],
        }),
      ),
    );
    expect(result.deductions.ratioSubtotalWon).toBe(300_000);
    expect(result.deductions.paidTreatmentSubtotalWon).toBe(600_000);
    expectRowsMatchFinal(result);
  });
});

describe("R2-a 사망 산재: 유족급여 수급권자별 공제 (2008다13104 전합)", () => {
  // 골든 case-comp-022 와 같은 사건 (배우자 수급 1.5억, 배우자 3/5 · 자녀 2/5).
  const state = (): CompensationDeathFormState =>
    overrideDeath({
      accidentType: "industrial",
      birthDate: "1980-05-10",
      accidentDate: "2025-03-01",
      calculationDate: "2025-03-01",
      laborRateEffectiveRule: "published",
      solatiumWonText: "100000000",
      faultRatioText: "0.3",
      includeHeirs: true,
      decedent: { name: "", deceasedAt: "2025-03-01" },
      spouse: { alive: true, name: "배우자" },
      linealDescendants: [
        { id: "c1", name: "자녀", deceasedBeforeOpening: false, representatives: [] },
      ],
      survivorRecipients: [{ uid: "s1", heirName: "배우자", amountText: "150000000" }],
    });

  it("수급권자 입력은 recipients 로 가고, 상속인별 공제액이 결과·클립보드에 나온다", () => {
    const input = buildCompensationDeathInput(state());
    expect(input.industrialInsurance).toEqual({
      recipients: [{ heirName: "배우자", survivorBenefitWon: 150_000_000 }],
    });
    // 골든 022 는 생계비 공제 비율 기본값(1/3)이다. 화면 기본값은 "0.3333" 이라 그 키만 빼면
    // 골든 입력과 같다.
    const goldenInput = { ...input };
    delete goldenInput.livingCostDeductionRatio;
    expect(
      computeCompensationDeath(goldenInput).inheritanceShares?.map((share) => share.amountWon),
    ).toEqual([115_998_100, 147_332_000]);
    const result = computeCompensationDeath(input);
    expect(result.inheritanceShares?.map((share) => share.survivorBenefitDeductedWon)).toEqual([
      150_000_000, 0,
    ]);
    // 위자료는 상속인별로 나눠 더해도 가산 행으로 잡힌다 (소계가 몫의 합이라도).
    expect(solatiumAddedAfterDeductionsWon(result)).toBe(100_000_000);
    const text = formatCompensationDeathForClipboard(result);
    expect(text).toContain("상속인\t지분(약분)\t유족급여 공제\t배정 금액");
    expect(text).toContain(
      `배우자\t3/5\t150,000,000원\t${result.inheritanceShares?.[0]?.amountWon.toLocaleString("ko-KR")}원`,
    );
  });

  it("수급권자 입력이 저장·불러오기 뒤에도 그대로이고, 상속인 없이 넣으면 막는다", () => {
    const input = buildCompensationDeathInput(state());
    const loaded = applyLoadedCompensationDeathInput(input);
    expect(
      loaded.survivorRecipients.map(({ heirName, amountText }) => [heirName, amountText]),
    ).toEqual([["배우자", "150000000"]]);
    expect(buildCompensationDeathInput(loaded)).toEqual(input);
    expect(() => buildCompensationDeathInput({ ...state(), includeHeirs: false })).toThrow(
      "수급권자별 유족급여는 상속인을 입력해야",
    );
  });

  it("수급권자를 고르지 않은 줄은 오류, 총액만 넣은 상속인 사건은 이전 방식으로 표시한다", () => {
    expect(() =>
      buildCompensationDeathInput({
        ...state(),
        survivorRecipients: [{ uid: "s1", heirName: "", amountText: "150000000" }],
      }),
    ).toThrow("수급권자 1번째: 상속인을 고르세요");
    const total = { ...state(), survivorRecipients: [], survivorBenefitWonText: "150000000" };
    expect(isLegacySurvivorTotal(total)).toBe(true);
    expect(buildCompensationDeathInput(total).industrialInsurance).toEqual({
      survivorBenefitWon: 150_000_000,
    });
    expect(isLegacySurvivorTotal({ ...total, includeHeirs: false })).toBe(false);
    expect(isLegacySurvivorTotal(state())).toBe(false);
  });

  it("수급권자별 계산의 공제 행은 실제로 뺀 금액이고, 절사 차이 행까지 더하면 최종액이다 (손계산 재현)", () => {
    // 직접 일당 150,000, 위자료 1억, 과실 30%, 배우자 유족급여 9억, 지급치료비 6천만.
    const form: CompensationDeathFormState = {
      ...state(),
      directWageWonText: "150000",
      paidTreatmentDeductions: [{ uid: "p", label: "", amountText: "60000000" }],
      survivorRecipients: [{ uid: "s1", heirName: "배우자", amountText: "900000000" }],
    };
    // 손계산은 생계비 공제 비율 기본값(1/3)이다. 화면 기본값 "0.3333" 키만 뺀다.
    const input = buildCompensationDeathInput(form);
    delete input.livingCostDeductionRatio;
    const result = computeCompensationDeath(input);
    expect(result.deductions.propertyOnlyAppliedWon).toBe(9_300_000);
    expect(result.deductions.propertyOnlyDiscardedWon).toBe(8_700_000);
    expect(result.deductions.afterWon).toBe(87_777_382);
    expect(result.deductions.roundingWon).toBe(82);
    expect(result.finalWon).toBe(187_777_300);
    expect(result.inheritanceShares?.map((share) => share.amountWon)).toEqual([
      60_000_000, 127_777_300,
    ]);
    expect(propertyOnlyExcessWon(result)).toBe(8_700_000);
    expectRowsMatchFinal(result);
    const text = formatCompensationDeathForClipboard(result);
    expect(text).toContain(
      "비율공제·지급치료비 중 재산상 손해 초과분 (위자료에서 빼지 않음) (상속분 원 미만 버림 포함): 8,700,000원",
    );
    expect(text).toContain("상속분 나눗셈·상속인별 100원 미만 버림: -82원");
    expect(text).not.toContain("공제 후 재산상 손해: 0원");
  });

  it("지금 상속인 목록에 없는 수급권자를 고른 채로는 계산하지 않는다", () => {
    expect(() =>
      buildCompensationDeathInput({
        ...state(),
        survivorRecipients: [{ uid: "s1", heirName: "옛 배우자", amountText: "150000000" }],
      }),
    ).toThrow('수급권자 1번째: "옛 배우자"은(는) 지금 상속인 목록에 없습니다.');
  });

  it("상속인 아닌 수급권자(heirName 없음)는 어느 몫에서도 빼지 않는다", () => {
    const input = buildCompensationDeathInput({
      ...state(),
      survivorRecipients: [{ uid: "s1", heirName: NON_HEIR_RECIPIENT, amountText: "150000000" }],
    });
    expect(input.industrialInsurance).toEqual({
      recipients: [{ survivorBenefitWon: 150_000_000 }],
    });
    const result = computeCompensationDeath(input);
    expect(result.inheritanceShares?.every((share) => share.survivorBenefitDeductedWon === 0)).toBe(
      true,
    );
  });
});

describe("R2-a 이전 버전 파일 (@1~@4) 은 @5 로 열려 금액이 그대로다", () => {
  const injuryBase = {
    birthDate: "1990-01-01",
    accidentDate: "2020-03-01",
    treatmentEndDate: "2020-06-15",
    sex: "male" as const,
    retirementAge: 65,
    legalRatePreset: "civil" as const,
  };

  function envelope(input: Record<string, unknown>, feature: string): unknown {
    return {
      schemaVersion: "3",
      kind: "compensation",
      envelopeFeatures: [feature],
      dataVersions: {
        laborRates: "labor-rates/v1.1.0",
        lifeExpectancy: "life-expectancy/v1.1.0",
        hoffman: "hoffman/v1.0.0",
        leibniz: "leibniz/v1.0.0",
      },
      payload: {
        appVersion: "0.12.2",
        createdAt: "2026-10-01T00:00:00.000Z",
        input,
        disclaimer: STANDARD_DISCLAIMER,
      },
    };
  }

  /** 화면 열기와 같은 경로: 마이그레이션 → 검증 → 폼 상태 → 다시 만든 입력. */
  function reopen(file: unknown) {
    const migrated = migrateLcalcFile(file);
    validateLcalcEnvelope(migrated);
    return parseLoadedCompensationLcalcInput(migrated).input;
  }

  const injuryCases: [string, Record<string, unknown>][] = [
    [
      "compensation@1",
      {
        base: injuryBase,
        lossRate: { permanent: [{ ratio: 0.3 }], hospitalizationFullLoss: true },
        lostIncome: { occupation: "보통인부", discountMethod: "hoffman", workingDaysPerMonth: 20 },
        solatiumWon: 20_000_000,
        faultRatio: 0.2,
        deductions: { absolute: [{ amount: 3_000_000 }] },
      },
    ],
    [
      "compensation@3",
      {
        mode: "injury",
        accidentType: "industrial",
        base: injuryBase,
        lossRate: { permanent: [{ ratio: 0.3 }], hospitalizationFullLoss: true },
        lostIncome: { occupation: "보통인부", discountMethod: "hoffman", workingDaysPerMonth: 20 },
        industrialInsurance: { disabilityBenefitWon: 30_000_000 },
      },
    ],
    [
      "compensation@4",
      {
        mode: "injury",
        accidentType: "auto",
        base: injuryBase,
        lossRate: { permanent: [{ ratio: 0.3 }], hospitalizationFullLoss: true },
        lostIncome: { occupation: "보통인부", discountMethod: "hoffman", workingDaysPerMonth: 20 },
        otherDamages: {
          attendantCare: {
            future: [
              {
                occupation: "보통인부",
                startDate: "2020-03-01",
                endDate: "2030-02-28",
                personCount: 1,
              },
            ],
          },
        },
      },
    ],
  ];

  for (const [feature, original] of injuryCases) {
    it(`부상 ${feature}: 기준일 = 사고일·공표 적용일로 열려 최종액이 원본 입력 계산과 같다`, () => {
      const loaded = reopen(envelope(original, feature));
      if (loaded.mode === "death") throw new Error("expected injury");
      expect(loaded.base.laborRateEffectiveRule).toBe("published");
      const form = applyLoadedCompensationInput(loaded);
      expect(form.calculationDate).toBe("2020-03-01");
      const reopened = computeCompensation(buildCompensationInput(form));
      const before = computeCompensation(original as unknown as CompensationInput);
      expect(reopened.finalWon).toBe(before.finalWon);
      expect(reopened.lostIncomeSubtotalWon).toBe(before.lostIncomeSubtotalWon);
      expect(legacyCompensationNotice(loaded)).toContain(
        "계산 기준일은 사고일(사고일 단가 하나로 계산)",
      );
      // 다시 저장하면 기준일·규약이 명시되고 @5 가 된다.
      expect(buildCompensationInput(form).base).toMatchObject({
        calculationDate: "2020-03-01",
        laborRateEffectiveRule: "published",
      });
    });
  }

  it("부상 구 비율공제 [{ratio}]: 이전 방식으로 보존해 종전 산식(과실상계 후 × 비율) 금액이 그대로다", () => {
    const original = {
      ...injuryCases[0]![1],
      deductions: { ratio: [{ label: "기타", ratio: 0.1 }], absolute: [{ amount: 3_000_000 }] },
    };
    const loaded = reopen(envelope(original, "compensation@1"));
    if (loaded.mode === "death") throw new Error("expected injury");
    const form = applyLoadedCompensationInput(loaded);
    expect(form.ratioDeductions).toEqual([]);
    expect(form.legacyRatioDeductions.map((item) => item.ratioText)).toEqual(["0.1"]);
    const reopened = computeCompensation(buildCompensationInput(form));
    // 손계산: 종전 비율공제 = floor(과실상계 후 × 0.1), 위자료는 공제 뒤 가산.
    const after = reopened.faultOffset.afterWon;
    const expected =
      Math.floor((after - Math.floor(after * 0.1) - 3_000_000 + 20_000_000) / 100) * 100;
    expect(reopened.deductions.legacyRatioSubtotalWon).toBe(Math.floor(after * 0.1));
    expect(reopened.finalWon).toBe(expected);
    expect(legacyCompensationNotice(loaded)).toContain("이전 방식 비율공제를 지우고");
  });

  it("사망 compensation@2: 같은 규칙으로 열려 최종액이 원본 입력 계산과 같다", () => {
    const original = {
      mode: "death",
      base: { birthDate: "1980-05-10", accidentDate: "2020-03-01", sex: "male", retirementAge: 65 },
      lostIncome: { occupation: "보통인부", discountMethod: "hoffman", workingDaysPerMonth: 20 },
      // 화면이 저장한 파일은 생계비 공제 비율을 늘 담는다.
      livingCostDeductionRatio: 0.3333,
      funeralExpenseWon: 5_000_000,
      solatiumWon: 80_000_000,
      faultRatio: 0.2,
    };
    const loaded = reopen(envelope(original, "compensation@2"));
    if (loaded.mode !== "death") throw new Error("expected death");
    const form = applyLoadedCompensationDeathInput(loaded);
    expect(form.calculationDate).toBe("2020-03-01");
    expect(form.laborRateEffectiveRule).toBe("published");
    const reopened = computeCompensationDeath(buildCompensationDeathInput(form));
    const before = computeCompensationDeath(
      original as unknown as Parameters<typeof computeCompensationDeath>[0],
    );
    expect(reopened.finalWon).toBe(before.finalWon);
  });

  it("새 파일은 이전 버전 안내를 띄우지 않는다", () => {
    const input = buildCompensationInput(defaultCompensationFormState());
    expect(legacyCompensationNotice(input)).toBeNull();
  });
});
