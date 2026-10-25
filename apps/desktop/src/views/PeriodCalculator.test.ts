import { describe, expect, it } from "vitest";

import { STANDARD_DISCLAIMER } from "@lawcalc-kr/core-engine";

import type { LcalcFile } from "../lib/ipc";
import { validateLcalcEnvelope, parseLoadedPeriodLcalcInput } from "../lib/lcalc-validation";
import {
  applyLoadedPeriodInput,
  buildPeriodLcalcFile,
  buildPeriodTabInput,
  computePeriodOutcome,
  emptyPeriodForm,
  formatPeriodForClipboard,
  type PeriodFormState,
} from "./PeriodCalculator";

const FIXED_NOW = "2026-09-04T00:00:00.000Z";

function form(overrides: Partial<PeriodFormState> = {}): PeriodFormState {
  return {
    mode: "expiry",
    from: "2026-09-04",
    unit: "day",
    countText: "1",
    includeFirstDay: false,
    holidayExtension: true,
    pendingOn20080322: false,
    to: "2026-12-31",
    extraHolidays: [],
    ...overrides,
  };
}

type PeriodLcalcFile = Extract<LcalcFile, { kind: "period" }>;

/** `.lcalc` envelope 를 period 분기로 좁혀 돌려준다. 좁히지 않으면 payload 가 union 이다. */
function periodLcalcFile(state: PeriodFormState, note = ""): PeriodLcalcFile {
  const input = buildPeriodTabInput(state);
  const file = buildPeriodLcalcFile(input, computePeriodOutcome(input, FIXED_NOW), note);
  if (file.kind !== "period") throw new Error("period envelope 가 아닙니다");
  return file;
}

describe("buildPeriodTabInput", () => {
  it("두 산식의 입력을 함께 담고 mode 로 구분한다", () => {
    const input = buildPeriodTabInput(form({ mode: "span" }));
    expect(input.mode).toBe("span");
    expect(input.period).toEqual({
      from: "2026-09-04",
      unit: "day",
      count: 1,
      includeFirstDay: false,
      holidayExtension: true,
    });
    expect(input.span).toEqual({
      from: "2026-09-04",
      to: "2026-12-31",
      includeFirstDay: false,
    });
  });

  it("수량은 비-숫자를 걷어내고 정수로 읽는다", () => {
    expect(buildPeriodTabInput(form({ countText: "1,2" })).period.count).toBe(12);
    expect(buildPeriodTabInput(form({ countText: "3.9" })).period.count).toBe(3);
    expect(buildPeriodTabInput(form({ countText: "" })).period.count).toBe(0);
  });

  it("초일 산입은 두 산식에 같은 값으로 들어간다 (제157조)", () => {
    const input = buildPeriodTabInput(form({ includeFirstDay: true }));
    expect(input.period.includeFirstDay).toBe(true);
    expect(input.span.includeFirstDay).toBe(true);
  });
});

describe("2008-03-22 당시 계속 중인 사건 (민법 부칙 제3조 제1항)", () => {
  it("켰을 때만 입력에 싣고, 왕복하면 복원된다", () => {
    expect("pendingOn20080322" in buildPeriodTabInput(form()).period).toBe(false);
    const on = form({ pendingOn20080322: true, from: "2026-09-05", countText: "14" });
    const input = buildPeriodTabInput(on);
    expect(input.period.pendingOn20080322).toBe(true);
    expect(applyLoadedPeriodInput(input)).toEqual(on);
    // 송달 2026-09-05 → 14일 만료 09-19(토). 토요일을 연장하지 않는다.
    const result = computePeriodOutcome(input, FIXED_NOW);
    expect(result.mode === "expiry" && result.expiryDate).toBe("2026-09-19");
  });
});

describe("일수 산식은 공휴일 키를 싣지 않는다", () => {
  it("계속 사건·사용자 지정 공휴일이 있어도 span 이면 period@1", () => {
    const state = form({
      mode: "span",
      pendingOn20080322: true,
      extraHolidays: [{ date: "2026-09-07", nameKo: "임시공휴일" }],
    });
    const input = buildPeriodTabInput(state);
    expect("pendingOn20080322" in input.period).toBe(false);
    expect("extraHolidays" in input).toBe(false);
    expect(periodLcalcFile(state).envelopeFeatures).toEqual(["period@1"]);
    // 같은 입력의 만료일 산식은 그대로 싣는다.
    expect(periodLcalcFile({ ...state, mode: "expiry" }).envelopeFeatures).toEqual(["period@3"]);
  });
});

describe("applyLoadedPeriodInput", () => {
  it("왕복: build → apply 시 화면 상태가 그대로 복원된다", () => {
    const original = form({
      mode: "span",
      unit: "month",
      countText: "6",
      includeFirstDay: true,
      holidayExtension: false,
      to: "2027-03-31",
    });
    expect(applyLoadedPeriodInput(buildPeriodTabInput(original))).toEqual(original);
  });

  it("옵션이 빠진 구파일은 false 로 복원한다 (엔진 기본값과 같다)", () => {
    const restored = applyLoadedPeriodInput({
      mode: "expiry",
      period: { from: "2026-09-04", unit: "day", count: 1 },
      span: { from: "2026-09-04", to: "2026-12-31" },
    });
    expect(restored.includeFirstDay).toBe(false);
    expect(restored.holidayExtension).toBe(false);
  });
});

describe("computePeriodOutcome", () => {
  it("만료일이 토요일이면 제161조로 익일 근무일까지 밀린다", () => {
    const result = computePeriodOutcome(buildPeriodTabInput(form()), FIXED_NOW);
    expect(result.mode).toBe("expiry");
    if (result.mode !== "expiry") throw new Error("expiry 결과가 아닙니다");
    expect(result.startDate).toBe("2026-09-05");
    expect(result.rawExpiry).toBe("2026-09-05");
    expect(result.expiryDate).toBe("2026-09-07");
    expect(result.holidayExtension).toBe("applied");
    expect(result.articles).toContain("제161조");
  });

  it("커버리지 밖 만료일은 만료일을 내되 제161조 판정은 하지 않는다", () => {
    const result = computePeriodOutcome(
      buildPeriodTabInput(form({ from: "2030-01-01" })),
      FIXED_NOW,
    );
    if (result.mode !== "expiry") throw new Error("expiry 결과가 아닙니다");
    // 계산 자체는 막지 않는다. 판정하지 못했다는 사실만 남는다.
    expect(result.expiryDate).toBe("2030-01-02");
    expect(result.holidayExtension).toBe("outOfCoverage");
    expect(result.adjustmentReasonKo).toBeDefined();
  });

  it("일수 산식은 제157조 기산일부터 종료일까지를 센다", () => {
    const result = computePeriodOutcome(
      buildPeriodTabInput(form({ mode: "span", from: "2026-01-01", to: "2026-01-31" })),
      FIXED_NOW,
    );
    if (result.mode !== "span") throw new Error("span 결과가 아닙니다");
    expect(result.startDate).toBe("2026-01-02");
    expect(result.days).toBe(30);
  });
});

describe("formatPeriodForClipboard + buildPeriodLcalcFile", () => {
  it("clipboard 본문은 STANDARD_DISCLAIMER 로 끝난다", () => {
    const input = buildPeriodTabInput(form());
    const text = formatPeriodForClipboard(computePeriodOutcome(input, FIXED_NOW));
    expect(text).toContain("LawCalc Korea 기간 계산 결과");
    expect(text).toContain("제161조");
    expect(text.trim().endsWith(STANDARD_DISCLAIMER)).toBe(true);
  });

  it("lcalc envelope 는 v3 + period kind + period@1 capability", () => {
    const file = periodLcalcFile(form(), "비고 메모");
    expect(file.schemaVersion).toBe("3");
    expect(file.kind).toBe("period");
    expect(file.envelopeFeatures).toEqual(["period@1"]);
    expect(file.dataVersions.holidays).toBe(file.payload.result?.dataVersion);
    expect(file.payload.disclaimer).toBe(STANDARD_DISCLAIMER);
    expect(file.payload.result?.disclaimer).toBe(STANDARD_DISCLAIMER);
    expect(file.payload.note).toBe("비고 메모");
  });
});

/**
 * 저장 → 검증 → 로드 왕복. 파서가 입력 필드 하나를 빠뜨리면 throw 없이 조용히 기본값으로
 * 되돌아가므로, 화면 상태까지 되돌려서 같은지 본다.
 */
describe(".lcalc 저장 → 열기 왕복", () => {
  it("모든 입력이 살아남는다", () => {
    const original = form({
      mode: "span",
      from: "2026-02-10",
      unit: "year",
      countText: "3",
      includeFirstDay: true,
      holidayExtension: false,
      to: "2027-05-06",
    });
    const file = periodLcalcFile(original, "메모");

    const serialized = JSON.parse(JSON.stringify(file)) as PeriodLcalcFile;
    validateLcalcEnvelope(serialized);
    const loaded = parseLoadedPeriodLcalcInput(serialized);

    expect(applyLoadedPeriodInput(loaded.input)).toEqual(original);
    expect(loaded.note).toBe("메모");
    expect(loaded.result?.mode).toBe("span");
  });

  it("계속 사건 키가 있으면 period@2 로 저장하고 왕복에서 살아남는다", () => {
    const original = form({ pendingOn20080322: true, from: "2026-09-05", countText: "14" });
    const file = periodLcalcFile(original);
    expect(file.envelopeFeatures).toEqual(["period@2"]);

    const serialized = JSON.parse(JSON.stringify(file)) as PeriodLcalcFile;
    validateLcalcEnvelope(serialized);
    const loaded = parseLoadedPeriodLcalcInput(serialized);
    expect(applyLoadedPeriodInput(loaded.input)).toEqual(original);
  });

  it("입력이 잘못된 파일은 조용히 넘기지 않고 한국어 오류로 거절한다", () => {
    const broken = JSON.parse(JSON.stringify(periodLcalcFile(form()))) as PeriodLcalcFile;
    broken.payload.input.period.count = 0;
    expect(() => validateLcalcEnvelope(broken)).toThrow(/count/);
  });

  it("미지원 capability 는 envelope 단계에서 거절한다", () => {
    const future = JSON.parse(JSON.stringify(periodLcalcFile(form()))) as PeriodLcalcFile;
    future.envelopeFeatures = ["period@9"];
    expect(() => validateLcalcEnvelope(future)).toThrow(/period@9/);
  });
});

describe("emptyPeriodForm", () => {
  it("초기 상태는 만료일 산식 + 제161조 적용", () => {
    const initial = emptyPeriodForm();
    expect(initial.mode).toBe("expiry");
    expect(initial.holidayExtension).toBe(true);
    expect(initial.includeFirstDay).toBe(false);
  });
});

describe("사용자 지정 공휴일 (임시공휴일·선거일)", () => {
  const extra = [{ date: "2026-09-18", nameKo: "임시공휴일(가정)" }];
  const base = { countText: "14" };

  it("지정한 날이 말일이면 다음 근무일로 밀고, 적용한 날을 결과와 클립보드에 적는다", () => {
    const plain = computePeriodOutcome(buildPeriodTabInput(form(base)), FIXED_NOW);
    expect(plain.mode === "expiry" && plain.expiryDate).toBe("2026-09-18");

    const input = buildPeriodTabInput(form({ ...base, extraHolidays: extra }));
    expect(input.extraHolidays).toEqual(extra);
    const result = computePeriodOutcome(input, FIXED_NOW);
    expect(result.mode === "expiry" && result.expiryDate).toBe("2026-09-21");
    const text = formatPeriodForClipboard(result, input.extraHolidays);
    expect(text).toContain("이번 말일 연장에 적용: 2026-09-18 임시공휴일(가정)");
  });

  it("날짜 없는 행은 버리고, 비면 키를 싣지 않으며 말일 연장을 끄면 싣지 않는다", () => {
    const blank = form({ extraHolidays: [{ date: "", nameKo: "임시공휴일" }] });
    expect("extraHolidays" in buildPeriodTabInput(blank)).toBe(false);
    const off = form({ holidayExtension: false, extraHolidays: extra });
    expect("extraHolidays" in buildPeriodTabInput(off)).toBe(false);
    expect(periodLcalcFile(form()).envelopeFeatures).toEqual(["period@1"]);
  });

  it("커버리지 밖 날짜는 한국어 오류로 거절한다", () => {
    const input = buildPeriodTabInput(
      form({ extraHolidays: [{ date: "2099-01-02", nameKo: "x" }] }),
    );
    expect(() => computePeriodOutcome(input, FIXED_NOW)).toThrow(/커버리지/);
  });

  it("지정 공휴일이 있으면 period@3 으로 저장하고 왕복에서 같은 만료일을 낸다", () => {
    const original = form({ ...base, pendingOn20080322: true, extraHolidays: extra });
    const file = periodLcalcFile(original);
    expect(file.envelopeFeatures).toEqual(["period@3"]);

    const serialized = JSON.parse(JSON.stringify(file)) as PeriodLcalcFile;
    validateLcalcEnvelope(serialized);
    const loaded = parseLoadedPeriodLcalcInput(serialized);
    expect(applyLoadedPeriodInput(loaded.input)).toEqual(original);
    // 계속 사건이라 토요일(09-19)은 근무일이다. 지정 공휴일 09-18 만 넘는다.
    expect(loaded.result?.mode === "expiry" && loaded.result.expiryDate).toBe("2026-09-19");
  });

  it("모양이 잘못된 지정 공휴일은 열지 않는다", () => {
    const broken = JSON.parse(
      JSON.stringify(periodLcalcFile(form({ extraHolidays: extra }))),
    ) as PeriodLcalcFile;
    (broken.payload.input.extraHolidays as unknown[]) = [{ date: "2026/09/18", nameKo: "x" }];
    expect(() => parseLoadedPeriodLcalcInput(broken)).toThrow(/YYYY-MM-DD/);
  });
});
