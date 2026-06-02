import { describe, expect, it } from "vitest";

import { STANDARD_DISCLAIMER } from "@lawcalc-kr/core-engine";
import {
  computeCompensation,
  computeCompensationDeath,
  type CompensationInput,
} from "@lawcalc-kr/compensation";
import { computeStaleBadge } from "@lawcalc-kr/datasets-compensation";

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
  it("default state produces a valid CompensationInput with 보통인부 occupation and 22 working days", () => {
    const input = buildCompensationInput(defaultCompensationFormState());
    expect(input.base.birthDate).toBe("1996-01-01");
    expect(input.base.accidentDate).toBe("2026-01-01");
    expect(input.base.sex).toBe("male");
    expect(input.base.retirementAge).toBe(65);
    expect(input.lostIncome.occupation).toBe("보통인부");
    expect(input.lostIncome.workingDaysPerMonth).toBe(22);
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
    expect(result.dataVersions.laborRates).toBe("labor-rates/v1.0.0");
    expect(result.dataVersions.lifeExpectancy).toBe("life-expectancy/v1.0.0");
    expect(result.dataVersions.hoffman).toBe("hoffman/v1.0.0");
    expect(result.dataVersions.leibniz).toBe("leibniz/v1.0.0");
  });

  it("matches CAP fixture case-comp-001 expected finalWon (249,399,900) with 보통인부 + 30% + 가동 60세", () => {
    const state = override({
      retirementAgeText: "60",
      permanent: [{ uid: "p1", department: "정형외과", ratioText: "0.30" }],
    });
    const result = computeCompensation(buildCompensationInput(state));
    expect(result.finalWon).toBe(249_399_900);
  });
});

describe("formatCompensationForClipboard + buildCompensationLcalcFile", () => {
  it("clipboard 본문은 STANDARD_DISCLAIMER 로 끝남 + 4 dataVersions 라벨 노출", () => {
    const result = computeCompensation(buildCompensationInput(defaultCompensationFormState()));
    const text = formatCompensationForClipboard(result);
    expect(text).toContain("LawCalc Korea 자동차 사고 부상 손해배상 계산 결과");
    expect(text).toContain("laborRates=labor-rates/v1.0.0");
    expect(text).toContain("lifeExpectancy=life-expectancy/v1.0.0");
    expect(text).toContain("hoffman=hoffman/v1.0.0");
    expect(text).toContain("leibniz=leibniz/v1.0.0");
    expect(text.trim().endsWith(STANDARD_DISCLAIMER)).toBe(true);
  });

  it("lcalc envelope = v3 + compensation kind + compensation@1 capability + 4 dataVersions", () => {
    const input = buildCompensationInput(defaultCompensationFormState());
    const result = computeCompensation(input);
    const file = buildCompensationLcalcFile(input, result, "메모");
    expect(file.schemaVersion).toBe("3");
    expect(file.kind).toBe("compensation");
    expect(file.envelopeFeatures).toEqual(["compensation@1"]);
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
  it("가동연한 종료일이 사고일 이전이면 RangeError throw — UI 측 error 카드로 노출", () => {
    const state = override({
      birthDate: "1900-01-01",
      accidentDate: "2026-01-01",
      treatmentEndDate: "2026-01-01",
      retirementAgeText: "65",
    });
    const input: CompensationInput = buildCompensationInput(state);
    expect(() => computeCompensation(input)).toThrow(/가동연한 종료일/);
  });
});

describe("buildCompensationDeathInput (자×사망)", () => {
  it("default 상태는 mode:death + 장례비 500만 + 생계비 1/3 기본 입력을 만든다", () => {
    const input = buildCompensationDeathInput(defaultCompensationDeathFormState());
    expect(input.mode).toBe("death");
    expect(input.base.birthDate).toBe("1996-01-01");
    expect(input.base.accidentDate).toBe("2026-01-01");
    expect(input.lostIncome.occupation).toBe("보통인부");
    expect(input.lostIncome.workingDaysPerMonth).toBe(22);
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
    expect(result.dataVersions.laborRates).toBe("labor-rates/v1.0.0");
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

  it("death lcalc envelope = v3 + compensation kind + compensation@2 capability + 4 dataVersions", () => {
    const input = buildCompensationDeathInput(defaultCompensationDeathFormState());
    const result = computeCompensationDeath(input);
    const file = buildCompensationDeathLcalcFile(input, result, "사망 메모");
    expect(file.schemaVersion).toBe("3");
    expect(file.kind).toBe("compensation");
    expect(file.envelopeFeatures).toEqual(["compensation@2"]);
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
    const legacyFile = buildCompensationLcalcFile(injuryInput, injuryResult, "부상");
    expect(legacyFile.envelopeFeatures).toEqual(["compensation@1"]);
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
