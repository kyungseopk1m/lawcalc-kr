import { describe, expect, it } from "vitest";
import { loadHoffmanTable, loadLaborRatesTable } from "@lawcalc-kr/datasets-compensation";
import { computeCompensation } from "../../src/auto-injury/compute";
import { computeCompensationDeath } from "../../src/auto-death/compute";
import { computeOtherDamages } from "../../src/other-damages/compute";
import type { CompensationInput } from "../../src/auto-injury/types";

/**
 * 노임단가 시점 분할 + 계산 기준일 + 적용일 규약 (C3).
 * 기대값 출처와 산식은 for-claude `r2a-golden-derivation-2026-10-04.md`.
 *
 * 판결 별지와 법원 계산 프로그램 예시는 누적 호프만 계수를 소수 4자리에서 버린 표를 쓴다.
 * 행별 원 단위 재현을 위해 여기서만 데이터셋 값을 4자리 절사한 표를 주입한다.
 */
const FIXED_NOW = () => new Date("2026-10-04T00:00:00.000Z");
const HOFFMAN = loadHoffmanTable();
const HOFFMAN_4DP = {
  ...HOFFMAN,
  values: HOFFMAN.values.map((v) => Math.floor(v * 1e4) / 1e4),
};

describe("노임 시점 분할: 판결 별지·법원 프로그램 예시 재현 (조사 시점 규약, 4자리 호프만표)", () => {
  it("서울중앙지법 2019나48259 일실수입 별지 8행", () => {
    const result = computeCompensation(
      {
        base: {
          birthDate: "1972-01-07",
          accidentDate: "2016-07-08",
          treatmentEndDate: "2016-07-08",
          sex: "male",
          retirementAge: 65,
          calculationDate: "2020-07-22",
          laborRateEffectiveRule: "survey",
        },
        lossRate: { permanent: [{ ratio: 0.03 }] },
        lostIncome: { occupation: "보통인부", workingDaysPerMonth: 22 },
      },
      { hoffman: HOFFMAN_4DP, now: FIXED_NOW },
    );
    expect(
      result.segments.map((s) => [
        s.startDate,
        s.endDate,
        s.dailyWageWon,
        s.endMonth,
        s.amountFloorWon,
      ]),
    ).toEqual([
      ["2016-07-08", "2016-08-31", 99882, 1, 65645],
      ["2016-09-01", "2017-04-30", 102628, 9, 529785],
      ["2017-05-01", "2017-08-31", 106846, 13, 269175],
      ["2017-09-01", "2018-04-30", 109819, 21, 540480],
      ["2018-05-01", "2018-08-31", 118130, 25, 284060],
      ["2018-09-01", "2019-04-30", 125427, 33, 589803],
      ["2019-05-01", "2019-08-31", 130264, 37, 299585],
      ["2019-09-01", "2037-01-06", 138290, 245, 12252811],
    ]);
    expect(result.lostIncomeSubtotalWon).toBe(14831344);
  });

  it("법원 프로그램 예시 BIN0094 일실수입 (그림 18행, 0개월 행 3개 포함, 합계 209,460,543)", () => {
    // 예시는 상실률을 소수 4자리(%. 2자리)에서 버린 53.24%·44.99%·38.88% 를 쓴다.
    // 같은 구간 상실률이 나오도록 영구·한시 비율을 역산해 넣는다 (상실률 절사는 C3 범위 밖).
    const result = computeCompensation(
      {
        base: {
          birthDate: "1987-08-11",
          accidentDate: "2010-04-21",
          treatmentEndDate: "2010-06-30",
          sex: "male",
          retirementAge: 60,
          calculationDate: "2017-01-31",
          laborRateEffectiveRule: "survey",
        },
        lossRate: {
          permanent: [{ ratio: 0.3888 }],
          temporary: [
            { ratio: 1 - 0.5501 / 0.6112, years: 5 },
            { ratio: 1 - 0.4676 / 0.5501, years: 2 },
          ],
        },
        lostIncome: { occupation: "보통인부", workingDaysPerMonth: 22 },
      },
      { hoffman: HOFFMAN_4DP, now: FIXED_NOW },
    );
    // 기대값은 예시 그림 판독값 (초일·말일·노임단가·상실률(%)·m1·기간일실수입).
    expect(
      result.segments.map((s) => [
        s.startDate,
        s.endDate,
        s.dailyWageWon,
        Math.round(s.lossRate * 10000) / 100,
        s.endMonth,
        s.amountFloorWon,
      ]),
    ).toEqual([
      ["2010-04-21", "2010-04-30", 68965, 100, 0, 0],
      ["2010-05-01", "2010-06-30", 70497, 100, 2, 3082481],
      ["2010-07-01", "2010-08-31", 70497, 53.24, 4, 1627736],
      ["2010-09-01", "2011-04-30", 72415, 53.24, 12, 6553905],
      ["2011-05-01", "2011-08-31", 74008, 53.24, 16, 3269897],
      ["2011-09-01", "2012-04-20", 75608, 53.24, 24, 6527620],
      ["2012-04-21", "2012-04-30", 75608, 44.99, 24, 0],
      ["2012-05-01", "2012-08-31", 80732, 44.99, 28, 2878486],
      ["2012-09-01", "2013-04-30", 81443, 44.99, 36, 5680149],
      ["2013-05-01", "2013-08-31", 83975, 44.99, 40, 2865118],
      ["2013-09-01", "2014-04-30", 84166, 44.99, 48, 5622393],
      ["2014-05-01", "2014-08-31", 86686, 44.99, 52, 2835434],
      ["2014-09-01", "2015-04-20", 87805, 44.99, 60, 5628051],
      ["2015-04-21", "2015-04-30", 87805, 38.88, 60, 0],
      ["2015-05-01", "2015-08-31", 89566, 38.88, 64, 2431332],
      ["2015-09-01", "2016-04-30", 94338, 38.88, 72, 5022329],
      ["2016-05-01", "2016-08-31", 99882, 38.88, 76, 2607905],
      ["2016-09-01", "2047-08-10", 102628, 38.88, 447, 152827707],
    ]);
    expect(result.hoffman240Cap.appliedHoffman.at(-1)).toBeCloseTo(174.0954, 10);
    expect(result.lostIncomeSubtotalWon).toBe(209460543);
  });

  it("법원 프로그램 예시 BIN0094: 실제 장해율 + courtTruncation (데이터셋 원 표) 합계 209,460,543", () => {
    // 예시 노동능력상실률 표: 영구 신장내과 58%(기왕증 50%) · 안과 13% · 치과 1.06%,
    // 한시 정형외과 20%(기왕증 50%) 5년 · 비뇨기과 15% 2년. 항목별 기왕증은 비율에 미리 곱한다.
    // 산식 53.2468% · 44.9963% · 38.8848% 가 53.24 · 44.99 · 38.88 로, 누적 호프만이 4자리로 잘린다.
    // r2b-golden-derivation-2026-10-04.md 3절 (8자리 표면 +57원, 상실률 미절사면 +25,823원).
    const input: CompensationInput = {
      base: {
        birthDate: "1987-08-11",
        accidentDate: "2010-04-21",
        treatmentEndDate: "2010-06-30",
        sex: "male",
        retirementAge: 60,
        calculationDate: "2017-01-31",
        laborRateEffectiveRule: "survey",
        courtTruncation: true,
      },
      lossRate: {
        permanent: [{ ratio: 0.29 }, { ratio: 0.13 }, { ratio: 0.0106 }],
        temporary: [
          { ratio: 0.1, years: 5 },
          { ratio: 0.15, years: 2 },
        ],
      },
      lostIncome: { occupation: "보통인부", workingDaysPerMonth: 22 },
    };
    const result = computeCompensation(input, { now: FIXED_NOW });
    expect(result.segments.map((s) => s.lossRate)).toEqual([
      1, 1, 0.5324, 0.5324, 0.5324, 0.5324, 0.4499, 0.4499, 0.4499, 0.4499, 0.4499, 0.4499, 0.4499,
      0.3888, 0.3888, 0.3888, 0.3888, 0.3888,
    ]);
    expect(result.segments.map((s) => s.amountFloorWon)).toEqual([
      0, 3082481, 1627736, 6553905, 3269897, 6527620, 0, 2878486, 5680149, 2865118, 5622393,
      2835434, 5628051, 0, 2431332, 5022329, 2607905, 152827707,
    ]);
    expect(result.hoffman240Cap.appliedHoffman.at(-1)).toBeCloseTo(174.0954, 10);
    expect(result.lostIncomeSubtotalWon).toBe(209460543);

    // false 와 키 없음은 절사 없는 종전 결과로 같다.
    const baseWithoutKey = { ...input.base };
    delete baseWithoutKey.courtTruncation;
    const plain = computeCompensation(
      { ...input, base: { ...input.base, courtTruncation: false } },
      { now: FIXED_NOW },
    );
    expect(plain).toEqual(
      computeCompensation({ ...input, base: baseWithoutKey }, { now: FIXED_NOW }),
    );
    expect(plain.lostIncomeSubtotalWon).not.toBe(209460543);
    expect(() =>
      computeCompensation({
        ...input,
        base: { ...input.base, courtTruncation: "yes" },
      } as unknown as CompensationInput),
    ).toThrow(/courtTruncation/);
  });

  it("법원 프로그램 예시 BIN0095 향후개호비 1~15행 (손계산, 예시 표시값과 행마다 0~20원 차이)", () => {
    const result = computeOtherDamages(
      {
        attendantCare: {
          future: [
            {
              startDate: "2010-04-21",
              endDate: "2017-05-01",
              occupation: "보통인부",
              personCount: 1,
              priorRatio: 0.3616,
            },
            {
              startDate: "2017-05-01",
              endDate: "2030-04-22",
              occupation: "보통인부",
              personCount: 1,
              priorRatio: 0.3616,
            },
          ],
        },
      },
      {
        accidentDate: "2010-04-21",
        calculationDate: "2017-01-31",
        laborRateEffectiveRule: "survey",
        laborRates: loadLaborRatesTable(),
        hoffman: HOFFMAN_4DP,
      },
    );
    expect(result?.attendantCare?.futureWon).toBe(117353801 + 187744382);
    expect(result?.attendantCare?.hoffman240CappedAtIndex).toBeNull();
  });

  it("법원 프로그램 예시 BIN0095 향후개호비 16행: 연속 구간이라 누적 240, 적용계수 240 - H[240]", () => {
    // 1~15행 계수 합 H[240] = 166.1055 에 이어 16행은 240 - 166.1055 = 73.8945 (8자리 표 73.89441625).
    // 예시 16행 135.3402 (= H[604] - H[240]) 는 연속 구간에 240 을 합산하지 않은 값으로
    // 대법원 85다카819 와 어긋나 따르지 않는다. 손계산 floor(1,560,801 × 73.8945 × 0.6384) = 73,629,614.
    // r2b-golden-derivation-2026-10-04.md 2.1절.
    const seg = (startDate: string, endDate: string, personCount: number) => ({
      startDate,
      endDate,
      occupation: "보통인부",
      personCount,
      priorRatio: 0.3616,
    });
    const ctx = {
      accidentDate: "2010-04-21",
      calculationDate: "2017-01-31",
      laborRateEffectiveRule: "survey" as const,
      laborRates: loadLaborRatesTable(),
      hoffman: HOFFMAN_4DP,
    };
    const result = computeOtherDamages(
      {
        attendantCare: {
          future: [
            seg("2010-04-21", "2017-05-01", 1),
            seg("2017-05-01", "2030-04-22", 1),
            seg("2030-04-22", "2060-09-19", 0.5),
          ],
        },
      },
      ctx,
    );
    expect(result?.attendantCare?.futureWon).toBe(117353801 + 187744382 + 73629614);
    expect(result?.attendantCare?.hoffman240CappedAtIndex).toBe(2);
  });
});

describe("노임 시점 분할: 하위 호환과 경계", () => {
  const input = (): CompensationInput => ({
    base: {
      birthDate: "1972-01-07",
      accidentDate: "2016-07-08",
      treatmentEndDate: "2016-07-08",
      sex: "male",
      retirementAge: 65,
    },
    lossRate: { permanent: [{ ratio: 0.03 }] },
    lostIncome: { occupation: "보통인부" },
  });

  it("계산 기준일이 없으면 사고일 단가 하나, 날짜 키 없음", () => {
    const result = computeCompensation(input(), { now: FIXED_NOW });
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).not.toHaveProperty("startDate");
    expect(result.segments[0]!.dailyWageWon).toBe(94338);
  });

  for (const rule of ["published", "survey"] as const) {
    it(`기준일 = 사고일(7월 사고)이면 기준일 없음과 같다 (${rule})`, () => {
      const without = input();
      without.base.laborRateEffectiveRule = rule;
      const withDate = input();
      withDate.base.laborRateEffectiveRule = rule;
      withDate.base.calculationDate = "2016-07-08";
      const a = computeCompensation(without, { now: FIXED_NOW });
      const b = computeCompensation(withDate, { now: FIXED_NOW });
      expect(b.segments.map((s) => s.dailyWageWon)).toEqual(a.segments.map((s) => s.dailyWageWon));
      expect(b.lostIncomeSubtotalWon).toBe(a.lostIncomeSubtotalWon);
      expect(b.segments[0]).toMatchObject({ startDate: "2016-07-08", endDate: "2037-01-06" });
    });
  }

  it("기준일이 없어도 조사 시점 규약은 사고일 단가 조회에 적용된다", () => {
    const survey = input();
    survey.base.laborRateEffectiveRule = "survey";
    expect(computeCompensation(survey, { now: FIXED_NOW }).segments[0]!.dailyWageWon).toBe(99882);
  });

  it("분할 경계는 기준일까지 공표된 단가만, 사고일 구간 단가는 규약대로", () => {
    const survey = input();
    survey.base.calculationDate = "2019-12-31";
    survey.base.laborRateEffectiveRule = "survey";
    const last = computeCompensation(survey, { now: FIXED_NOW }).segments.at(-1)!;
    expect([last.startDate, last.dailyWageWon]).toEqual(["2019-05-01", 130264]);

    const late = input();
    late.base.accidentDate = "2019-11-01";
    late.base.treatmentEndDate = "2019-11-01";
    late.base.calculationDate = "2019-12-31";
    late.base.laborRateEffectiveRule = "survey";
    const segments = computeCompensation(late, { now: FIXED_NOW }).segments;
    // 사고일 구간 단가는 공표 시점과 무관하게 규약대로 (2020-01-01 공표분을 2019-09-01 부터).
    expect(segments.map((s) => s.dailyWageWon)).toEqual([138290]);
  });

  it("일당 직접 입력은 나누지 않는다", () => {
    const direct = input();
    direct.base.calculationDate = "2019-12-31";
    direct.lostIncome = { directWageWon: 100000 };
    const result = computeCompensation(direct, { now: FIXED_NOW });
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]!.dailyWageWon).toBe(100000);
  });

  it("기준일이 사고일보다 빠르거나 규약 값이 틀리면 거부", () => {
    const early = input();
    early.base.calculationDate = "2016-07-07";
    expect(() => computeCompensation(early)).toThrow(/calculationDate/);
    const bad = input();
    (bad.base as { laborRateEffectiveRule?: string }).laborRateEffectiveRule = "x";
    expect(() => computeCompensation(bad)).toThrow(/laborRateEffectiveRule/);
  });

  it("사망: 공표 적용일 규약 3구간, 생계비 1/3 (손계산 339,624,061)", () => {
    const result = computeCompensationDeath(
      {
        mode: "death",
        base: {
          birthDate: "1980-01-15",
          accidentDate: "2018-03-10",
          sex: "male",
          calculationDate: "2019-06-30",
        },
        lostIncome: { occupation: "보통인부" },
        funeralExpenseWon: 0,
      },
      { now: FIXED_NOW },
    );
    expect(
      result.segments.map((s) => [
        s.startDate,
        s.endDate,
        s.dailyWageWon,
        s.endMonth,
        s.amountFloorWon,
      ]),
    ).toEqual([
      ["2018-03-10", "2018-08-31", 109819, 5, 7231125],
      ["2018-09-01", "2018-12-31", 118130, 9, 6109474],
      ["2019-01-01", "2045-01-14", 125427, 322, 326283462],
    ]);
    expect(result.lostIncomeSubtotalWon).toBe(339624061);
  });

  it("사고 후 0개월째 노임 변경: 사고일 ~ 변경 전날은 월수 0 행으로 따로 (사망, 조사 시점)", () => {
    const result = computeCompensationDeath(
      {
        mode: "death",
        base: {
          birthDate: "1980-01-15",
          accidentDate: "2018-04-21",
          sex: "male",
          calculationDate: "2019-06-30",
          laborRateEffectiveRule: "survey",
        },
        lostIncome: { occupation: "보통인부" },
      },
      { now: FIXED_NOW },
    );
    // 법원 계산표처럼 사고일 ~ 변경 전날을 월수 0 행(사고일 단가 109,819, 금액 0)으로 따로 두고,
    // 조사 시점 2018-05-01 부터 118,130.
    expect(
      result.segments
        .slice(0, 2)
        .map((s) => [
          s.startDate,
          s.endDate,
          s.dailyWageWon,
          s.startMonth,
          s.endMonth,
          s.amountFloorWon,
        ]),
    ).toEqual([
      ["2018-04-21", "2018-04-30", 109819, 0, 0, 0],
      ["2018-05-01", expect.any(String), 118130, 0, expect.any(Number), expect.any(Number)],
    ]);
  });

  it("향후개호비 240 한도 인덱스는 나뉜 조각이 아니라 입력 구간 기준", () => {
    const result = computeOtherDamages(
      {
        attendantCare: {
          future: [
            {
              startDate: "2010-04-21",
              endDate: "2030-04-22",
              occupation: "보통인부",
              personCount: 1,
            },
            {
              startDate: "2030-04-22",
              endDate: "2060-09-19",
              occupation: "보통인부",
              personCount: 1,
            },
          ],
        },
      },
      {
        accidentDate: "2010-04-21",
        calculationDate: "2017-01-31",
        laborRates: loadLaborRatesTable(),
        hoffman: HOFFMAN,
      },
    );
    expect(result?.attendantCare?.hoffman240CappedAtIndex).toBe(1);
  });

  it("computeOtherDamages 직접 호출도 기준일·규약을 검증한다", () => {
    const run = (extra: object) =>
      computeOtherDamages(
        {
          attendantCare: {
            future: [
              {
                startDate: "2010-04-21",
                endDate: "2011-04-21",
                occupation: "보통인부",
                personCount: 1,
              },
            ],
          },
        },
        {
          accidentDate: "2010-04-21",
          laborRates: loadLaborRatesTable(),
          hoffman: HOFFMAN,
          ...extra,
        },
      );
    expect(() => run({ calculationDate: "2010-04-20" })).toThrow(/calculationDate/);
    expect(() => run({ calculationDate: "2010-4-21" })).toThrow(/calculationDate/);
    expect(() => run({ laborRateEffectiveRule: "x" })).toThrow(/laborRateEffectiveRule/);
  });

  describe("직종이 뒤 노임 조사에서 빠질 때 (기계공: 2009-09-01 묶음이 마지막)", () => {
    const mechanic = (accidentDate: string): CompensationInput => ({
      base: { birthDate: "1970-01-01", accidentDate, treatmentEndDate: accidentDate, sex: "male" },
      lossRate: { permanent: [{ ratio: 0.2 }] },
      lostIncome: { occupation: "기계공" },
    });

    it("공표 규약 + 기준일: 2010-01-01 이후 구간은 마지막 단가 81,297 + 경고", () => {
      const c = mechanic("2008-10-15");
      c.base.calculationDate = "2026-10-04";
      const result = computeCompensation(c, { now: FIXED_NOW });
      // 단가가 같은 경계는 나누지 않아 3구간. 금액은 손계산(r2a-golden-derivation 12절)과 같다:
      // 629,094 + 2,526,798 + 62,015,226 = 65,171,118 (81,297 구간을 하나로 계산).
      expect(result.segments.map((s) => [s.endMonth, s.dailyWageWon, s.amountFloorWon])).toEqual([
        [2, 79128, 629094],
        [10, 81094, 2526798],
        [314, 81297, 62015226],
      ]);
      expect(result.lostIncomeSubtotalWon).toBe(65171118);
      expect(result.warnings).toEqual([
        {
          code: "laborRateCarriedForward",
          occupation: "기계공",
          message:
            "기계공 직종은 2010-01-01 이후 조사되지 않아 그 뒤 구간은 마지막 단가 81,297원(2009-09-01 적용)을 씁니다.",
        },
      ]);
    });

    it("조사 시점 규약: 사고일 조회가 실패하면 공표 적용일 단가 + 경고 (기준일 없어도)", () => {
      const c = mechanic("2009-09-15");
      c.base.laborRateEffectiveRule = "survey";
      const result = computeCompensation(c, { now: FIXED_NOW });
      expect(result.segments.map((s) => s.dailyWageWon)).toEqual([81297]);
      expect(result.warnings?.map((w) => w.code)).toEqual(["laborRateSurveyFallback"]);
    });

    it("조사 시점 규약 + 기준일: 사고일 단가는 규약대로, 그 뒤는 마지막 단가 이월", () => {
      const c = mechanic("2008-10-15");
      c.base.calculationDate = "2026-10-04";
      c.base.laborRateEffectiveRule = "survey";
      const result = computeCompensation(c, { now: FIXED_NOW });
      expect([...new Set(result.segments.map((s) => s.dailyWageWon))]).toEqual([81094, 81297]);
      expect(result.warnings?.map((w) => w.code)).toEqual(["laborRateCarriedForward"]);
    });

    it("공표 규약에서 사고일 단가 자체가 없으면 종전처럼 거부, 경고 없는 사건은 키 없음", () => {
      expect(() => computeCompensation(mechanic("2010-03-01"))).toThrow(/기계공/);
      expect(computeCompensation(mechanic("2008-10-15"), { now: FIXED_NOW })).not.toHaveProperty(
        "warnings",
      );
    });
  });
});

describe("courtTruncation 금액은 정수 연산 (만분율 상실률 × 만분율 계수)", () => {
  const input = (wage: number, days: number, hosp: number, perm: number, age: number) =>
    ({
      base: {
        birthDate: "1990-01-01",
        accidentDate: "2020-01-01",
        treatmentEndDate: `${2020 + Math.floor(hosp / 12)}-${String((hosp % 12) + 1).padStart(2, "0")}-01`,
        sex: "male",
        retirementAge: age,
        courtTruncation: true,
      },
      lossRate: { permanent: [{ ratio: perm }] },
      lostIncome: { directWageWon: wage, workingDaysPerMonth: days },
    }) satisfies CompensationInput;

  // 엔진을 쓰지 않는 기대값: 데이터셋 8자리 값을 정수로 바꿔 4자리 절사, 240 누적, BigInt 곱.
  const H4 = [0n, ...HOFFMAN.values.map((v) => BigInt(Math.round(v * 1e8)) / 10000n)];
  const expected = (wage: number, days: number, hosp: number, perm: number, age: number) => {
    const total = (age - 30) * 12; // 1990-01-01생, 2020-01-01 사고
    const permRate = BigInt(Math.round(perm * 100)) * 100n; // perm 은 0.01 단위라 절사 없음
    const rows: [number, number, bigint][] = [];
    if (hosp > 0) rows.push([0, Math.min(hosp, total), 10000n]);
    if (hosp < total) rows.push([hosp, total, permRate]);
    let cum = 0n;
    return rows.map(([s, e, rate]) => {
      const raw = H4[e]! - H4[s]!;
      const applied = cum + raw > 2400000n ? 2400000n - cum : raw;
      cum = cum + raw > 2400000n ? 2400000n : cum + raw;
      return Number((BigInt(wage * days) * rate * applied) / 100000000n);
    });
  };

  it("재현: 일당 150,000 × 22일, 입원 5개월, 영구 0.5 → 1행 3,300,000 × 4.9384 = 16,296,720", () => {
    const result = computeCompensation(input(150000, 22, 5, 0.5, 60), { now: FIXED_NOW });
    expect(result.segments[0]!.amountFloorWon).toBe(16296720);
    expect(result.segments.map((s) => s.amountFloorWon)).toEqual(expected(150000, 22, 5, 0.5, 60));
  });

  it("만 원 단위 일당 3,000건 무작위가 독립 BigInt 기대값과 같다", () => {
    let seed = 20261004;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let i = 0; i < 3000; i++) {
      const args = [
        (1 + rand(50)) * 10000,
        20 + rand(6),
        rand(25),
        (1 + rand(99)) / 100,
        60 + rand(6),
      ] as const;
      const result = computeCompensation(input(...args), { now: FIXED_NOW });
      expect(
        result.segments.map((s) => s.amountFloorWon),
        JSON.stringify(args),
      ).toEqual(expected(...args));
    }
  });
});
