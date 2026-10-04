import { describe, expect, it } from "vitest";
import { loadHoffmanTable, loadLaborRatesTable } from "@lawcalc-kr/datasets-compensation";
import { rawValueSumUnits, truncatedTermUnits } from "../../src/other-damages/treatment";
import type { TreatmentFutureInput } from "../../src/other-damages/types";

/**
 * C7 수치합계 = 지출일별 단리 일시금 계수를 소수 4자리에서 버려 더한 값 (상한 전).
 * 기대값은 법원 손해배상 계산 프로그램 매뉴얼 그림 판독값 (r2a-research-2026-10-04.md 1.1절).
 */
const ctx = {
  accidentDate: "2010-04-21",
  laborRates: loadLaborRatesTable(),
  hoffman: loadHoffmanTable(),
};
const item = (
  firstDate: string,
  lastDate: string,
  lifespanMonths?: number,
): TreatmentFutureInput =>
  lifespanMonths === undefined
    ? { costWon: 1, kind: "oneTime", firstDate, lastDate }
    : { costWon: 1, kind: "recurring", firstDate, lastDate, lifespanMonths };

describe("수치합계 항별 4자리 절사 (상한 없는 경로)", () => {
  it("BIN0094 계산표: 반흔 0.7619, 치아(5년) 3.4235, 비뇨기과(1년) 20.2109", () => {
    expect(rawValueSumUnits(item("2016-08-20", "2016-08-20"), ctx)).toBe(7619);
    expect(rawValueSumUnits(item("2022-05-09", "2060-09-19", 60), ctx)).toBe(34235);
    expect(rawValueSumUnits(item("2016-08-20", "2060-09-19", 12), ctx)).toBe(202109);
  });

  it("BIN0044 보조구: 기저귀 247.3789, 전신휠체어 4.5158 (그림은 달력상 월 차이로 센다)", () => {
    // 이 그림만 사고일 일자 미달을 빼지 않는 월수(76개월부터)를 쓴다. 엔진 월수 규약은 BIN0094 와 같아
    // 항 계수 규칙만 여기서 직접 확인한다.
    const sum = (step: number) => {
      let units = 0;
      for (let m = 76; m <= 644; m += step) units += truncatedTermUnits(m);
      return units;
    };
    expect(sum(1)).toBe(2473789);
    expect(sum(60)).toBe(45158);
  });

  it("지출일은 날짜로 비교한다 (말일 보정 지출일이 최종일을 넘으면 뺀다)", () => {
    const c = { ...ctx, accidentDate: "2026-01-01" };
    // 지출일 01-31, 02-28, 03-31(> 03-30 제외). 월수 비교였다면 3항.
    expect(rawValueSumUnits(item("2026-01-31", "2026-03-30", 1), c)).toBe(
      truncatedTermUnits(0) + truncatedTermUnits(1),
    );
  });
});
