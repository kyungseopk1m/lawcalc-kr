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
    to: "2026-12-31",
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
