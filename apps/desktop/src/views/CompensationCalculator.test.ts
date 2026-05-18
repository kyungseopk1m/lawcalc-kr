import { describe, expect, it } from "vitest";

import {
  STANDARD_DISCLAIMER,
  computeCompensation,
  computeStaleBadge,
  type CompensationInput,
} from "@lawcalc-kr/core-engine";

import {
  applyLoadedCompensationInput,
  buildCompensationInput,
  buildCompensationLcalcFile,
  defaultCompensationFormState,
  formatCompensationForClipboard,
  type CompensationFormState,
} from "./CompensationCalculator";

function override(patch: Partial<CompensationFormState>): CompensationFormState {
  return { ...defaultCompensationFormState(), ...patch };
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
