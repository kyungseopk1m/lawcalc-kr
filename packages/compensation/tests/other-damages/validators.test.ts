import { describe, expect, it } from "vitest";

import { validateOtherDamagesInput } from "../../src/other-damages/validators";

describe("validateOtherDamagesInput", () => {
  it("빈 객체 통과", () => {
    expect(() => validateOtherDamagesInput({})).not.toThrow();
  });

  it("개호비 기왕: 단가 source 없으면 거부", () => {
    expect(() =>
      validateOtherDamagesInput({ attendantCare: { past: [{ totalDays: 10 }] } }),
    ).toThrow(/occupation 또는 directDailyWageWon/);
  });

  it("개호비 기왕: totalDays 양수 강제", () => {
    expect(() =>
      validateOtherDamagesInput({
        attendantCare: { past: [{ directDailyWageWon: 100000, totalDays: 0 }] },
      }),
    ).toThrow(/totalDays/);
  });

  it("개호비 향후: endDate < startDate 거부", () => {
    expect(() =>
      validateOtherDamagesInput({
        attendantCare: {
          future: [
            {
              directDailyWageWon: 100000,
              startDate: "2030-01-01",
              endDate: "2026-01-01",
              personCount: 1,
            },
          ],
        },
      }),
    ).toThrow(/endDate 는 startDate 이상/);
  });

  it("개호비 향후: personCount 양수 강제", () => {
    expect(() =>
      validateOtherDamagesInput({
        attendantCare: {
          future: [
            {
              directDailyWageWon: 100000,
              startDate: "2026-01-01",
              endDate: "2030-01-01",
              personCount: 0,
            },
          ],
        },
      }),
    ).toThrow(/personCount/);
  });

  it("치료비 향후: recurring 인데 lifespanMonths 없으면 거부", () => {
    expect(() =>
      validateOtherDamagesInput({
        treatment: {
          future: [
            {
              costWon: 1000000,
              kind: "recurring",
              firstDate: "2026-01-01",
              lastDate: "2030-01-01",
            },
          ],
        },
      }),
    ).toThrow(/lifespanMonths/);
  });

  it("치료비 향후: lastDate < firstDate 거부", () => {
    expect(() =>
      validateOtherDamagesInput({
        treatment: {
          future: [
            { costWon: 1000000, kind: "oneTime", firstDate: "2030-01-01", lastDate: "2026-01-01" },
          ],
        },
      }),
    ).toThrow(/lastDate 는 firstDate 이상/);
  });

  it("치료비 향후: kind 값 검증", () => {
    expect(() =>
      validateOtherDamagesInput({
        treatment: {
          future: [
            // @ts-expect-error invalid kind
            { costWon: 1000000, kind: "weekly", firstDate: "2026-01-01", lastDate: "2026-01-01" },
          ],
        },
      }),
    ).toThrow(/kind/);
  });

  it("costWon 음수 거부", () => {
    expect(() => validateOtherDamagesInput({ treatment: { past: [{ costWon: -1 }] } })).toThrow(
      /costWon/,
    );
  });

  it("priorRatio 범위 (0~1) 검증", () => {
    expect(() =>
      validateOtherDamagesInput({ treatment: { past: [{ costWon: 1000, priorRatio: 1.5 }] } }),
    ).toThrow(/priorRatio/);
  });

  it("accidentDate 주면 향후개호 startDate 사고일 이전 거부", () => {
    expect(() =>
      validateOtherDamagesInput(
        {
          attendantCare: {
            future: [
              {
                directDailyWageWon: 100000,
                startDate: "2025-01-01",
                endDate: "2030-01-01",
                personCount: 1,
              },
            ],
          },
        },
        "2026-01-01",
      ),
    ).toThrow(/사고일/);
  });

  it("accidentDate 주면 향후치료 firstDate 사고일 이전 거부", () => {
    expect(() =>
      validateOtherDamagesInput(
        {
          treatment: {
            future: [
              { costWon: 1000, kind: "oneTime", firstDate: "2025-01-01", lastDate: "2025-01-01" },
            ],
          },
        },
        "2026-01-01",
      ),
    ).toThrow(/사고일/);
  });

  it("accidentDate 미지정 시 날짜 하한 검사 생략 (하위호환)", () => {
    expect(() =>
      validateOtherDamagesInput({
        treatment: {
          future: [
            { costWon: 1000, kind: "oneTime", firstDate: "2025-01-01", lastDate: "2025-01-01" },
          ],
        },
      }),
    ).not.toThrow();
  });

  it("보조구 oneTime 통과", () => {
    expect(() =>
      validateOtherDamagesInput({
        appliance: [
          { costWon: 500000, kind: "oneTime", firstDate: "2026-01-01", lastDate: "2026-01-01" },
        ],
      }),
    ).not.toThrow();
  });
});
