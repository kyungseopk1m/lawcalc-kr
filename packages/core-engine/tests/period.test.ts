import { describe, expect, it } from "vitest";

import { addDays } from "../src";
import {
  computeDateSpan,
  computePeriod,
  type PeriodArticleLabels,
  type PeriodDeps,
} from "../src/period";

/**
 * 공휴일 판정 stub. 트랙 A 의 `holidays.ts` 계약 (커버리지 밖 RangeError) 만 흉내낸다.
 * 실제 데이터셋은 여기서 쓰지 않는다.
 */
function makeDeps(options: { holidays?: string[]; coverage?: [string, string] } = {}): PeriodDeps {
  const [coverFrom, coverTo] = options.coverage ?? ["2024-01-01", "2024-12-31"];
  const holidays = new Set(options.holidays ?? []);

  const isCovered = (date: string): boolean => date >= coverFrom && date <= coverTo;
  const isWeekend = (date: string): boolean => {
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    return dow === 0 || dow === 6;
  };
  const isBusinessDay = (date: string): boolean => {
    if (!isCovered(date)) throw new RangeError(`커버리지 밖: ${date}`);
    return !isWeekend(date) && !holidays.has(date);
  };

  return {
    isCovered,
    isBusinessDay,
    rollToNextBusinessDay(date) {
      if (isBusinessDay(date)) return { date, rolled: false };
      const reasonKo = isWeekend(date)
        ? "말일이 토요일 또는 일요일이라 다음 근무일로 만료"
        : "말일이 공휴일이라 다음 근무일로 만료";
      let cursor = addDays(date, 1);
      while (!isBusinessDay(cursor)) {
        cursor = addDays(cursor, 1);
      }
      return { date: cursor, rolled: true, reasonKo };
    },
  };
}

describe("computePeriod - 제157조 기산일", () => {
  it("초일을 산입하지 않는 것이 원칙이다 (제157조 본문)", () => {
    const result = computePeriod({ from: "2024-04-01", unit: "day", count: 5 });
    expect(result.startDate).toBe("2024-04-02");
    expect(result.expiryDate).toBe("2024-04-06");
    expect(result.articles).toContain("제157조");
  });

  it("기간이 오전 0시로부터 시작하면 초일을 산입한다 (제157조 단서)", () => {
    const result = computePeriod({
      from: "2024-04-01",
      unit: "day",
      count: 5,
      includeFirstDay: true,
    });
    expect(result.startDate).toBe("2024-04-01");
    expect(result.expiryDate).toBe("2024-04-05");
  });
});

describe("computePeriod - 제160조 역법적 계산", () => {
  it("주는 최종 주의 해당일 전일로 만료한다", () => {
    const result = computePeriod({ from: "2024-04-01", unit: "week", count: 1 });
    expect(result.startDate).toBe("2024-04-02");
    expect(result.rawExpiry).toBe("2024-04-08");
    expect(result.articles).toContain("제160조 제2항");
  });

  it("월은 최종 월의 해당일 전일로 만료한다", () => {
    const result = computePeriod({ from: "2024-01-01", unit: "month", count: 1 });
    expect(result.startDate).toBe("2024-01-02");
    expect(result.rawExpiry).toBe("2024-02-01");
    expect(result.articles).toContain("제160조 제2항");
  });

  it("년은 최종 년의 해당일 전일로 만료한다", () => {
    const result = computePeriod({
      from: "2023-03-01",
      unit: "year",
      count: 1,
      includeFirstDay: true,
    });
    expect(result.rawExpiry).toBe("2024-02-29");
    expect(result.articles).toContain("제160조 제2항");
  });

  it("1월 31일 기산 + 1개월 = 윤년 2월 29일 (제160조 제3항)", () => {
    const result = computePeriod({
      from: "2024-01-31",
      unit: "month",
      count: 1,
      includeFirstDay: true,
    });
    expect(result.rawExpiry).toBe("2024-02-29");
    expect(result.articles).toContain("제160조 제3항");
    expect(result.formulaText).toContain("최종 월에 해당일이 없어");
  });

  it("1월 31일 기산 + 1개월 = 평년 2월 28일 (제160조 제3항)", () => {
    const result = computePeriod({
      from: "2023-01-31",
      unit: "month",
      count: 1,
      includeFirstDay: true,
    });
    expect(result.rawExpiry).toBe("2023-02-28");
    expect(result.articles).toContain("제160조 제3항");
  });

  it("2월 29일 기산 + 1년 = 다음해 2월 28일 (제160조 제3항)", () => {
    const result = computePeriod({
      from: "2024-02-29",
      unit: "year",
      count: 1,
      includeFirstDay: true,
    });
    expect(result.rawExpiry).toBe("2025-02-28");
    expect(result.articles).toContain("제160조 제3항");
  });

  /**
   * 제160조 제2항과 제3항의 경계. 최종 월에 기산일의 해당일이 **있으면** 그 날이 그 달의
   * 말일이더라도 제2항으로 전일에 만료한다. 해당일이 있는지의 판정을 `>` 대신 `>=` 로
   * 쓰면 이 입력이 제3항으로 넘어가 만료일이 하루 늦어진다.
   */
  it("최종 월의 해당일이 그 달의 말일이면 제3항이 아니라 제2항이다", () => {
    const result = computePeriod({
      from: "2026-07-31",
      unit: "month",
      count: 1,
      includeFirstDay: true,
    });
    expect(result.startDate).toBe("2026-07-31");
    expect(result.rawExpiry).toBe("2026-08-30");
    expect(result.articles).toContain("제160조 제2항");
    expect(result.articles).not.toContain("제160조 제3항");
    expect(result.formulaText).toContain("최종 월의 해당일 2026-08-31 의 전일");
  });

  it("최종 월의 말일이 기산일보다 이르면 제3항으로 그 말일에 만료한다", () => {
    const result = computePeriod({
      from: "2026-08-31",
      unit: "month",
      count: 1,
      includeFirstDay: true,
    });
    expect(result.rawExpiry).toBe("2026-09-30");
    expect(result.articles).toContain("제160조 제3항");
    expect(result.articles).not.toContain("제160조 제2항");
  });

  it("월 계산이 연을 넘어간다", () => {
    const result = computePeriod({
      from: "2024-11-15",
      unit: "month",
      count: 3,
      includeFirstDay: true,
    });
    expect(result.rawExpiry).toBe("2025-02-14");
  });
});

describe("computePeriod - 제161조 공휴일 연장", () => {
  it("말일이 토요일이면 익일(월요일)로 만료한다", () => {
    const result = computePeriod(
      { from: "2024-04-01", unit: "day", count: 5, holidayExtension: true },
      makeDeps(),
    );
    expect(result.rawExpiry).toBe("2024-04-06");
    expect(result.expiryDate).toBe("2024-04-08");
    expect(result.holidayExtension).toBe("applied");
    expect(result.articles).toContain("제161조");
    expect(result.adjustmentReasonKo).toContain("제161조 적용");
  });

  it("말일이 일요일이면 익일로 만료한다", () => {
    const result = computePeriod(
      { from: "2024-04-01", unit: "day", count: 6, holidayExtension: true },
      makeDeps(),
    );
    expect(result.rawExpiry).toBe("2024-04-07");
    expect(result.expiryDate).toBe("2024-04-08");
    expect(result.holidayExtension).toBe("applied");
  });

  it("말일이 평일 공휴일이면 익일로 만료한다", () => {
    const result = computePeriod(
      { from: "2024-05-01", unit: "day", count: 5, holidayExtension: true },
      makeDeps({ holidays: ["2024-05-06"] }),
    );
    expect(result.rawExpiry).toBe("2024-05-06");
    expect(result.expiryDate).toBe("2024-05-07");
    expect(result.adjustmentReasonKo).toContain("공휴일");
  });

  it("연속 공휴일은 전부 건너뛰고 다음 근무일로 만료한다", () => {
    const result = computePeriod(
      { from: "2024-02-08", unit: "day", count: 1, holidayExtension: true },
      makeDeps({ holidays: ["2024-02-09", "2024-02-12"] }),
    );
    expect(result.rawExpiry).toBe("2024-02-09");
    expect(result.expiryDate).toBe("2024-02-13");
    expect(result.holidayExtension).toBe("applied");
  });

  it("말일이 근무일이면 조정하지 않는다", () => {
    const result = computePeriod(
      { from: "2024-04-01", unit: "day", count: 4, holidayExtension: true },
      makeDeps(),
    );
    expect(result.rawExpiry).toBe("2024-04-05");
    expect(result.expiryDate).toBe("2024-04-05");
    expect(result.holidayExtension).toBe("notApplied");
    expect(result.articles).not.toContain("제161조");
  });

  it("holidayExtension 을 켜지 않으면 말일이 토요일이어도 조정하지 않는다", () => {
    const result = computePeriod({ from: "2024-04-01", unit: "day", count: 5 }, makeDeps());
    expect(result.expiryDate).toBe("2024-04-06");
    expect(result.holidayExtension).toBe("off");
    expect(result.adjustmentReasonKo).toBeUndefined();
  });

  it("말일이 커버리지 밖이면 연장 여부를 판정하지 못했다는 사실을 남긴다", () => {
    const result = computePeriod(
      { from: "2024-12-30", unit: "day", count: 10, holidayExtension: true },
      makeDeps(),
    );
    expect(result.rawExpiry).toBe("2025-01-09");
    expect(result.expiryDate).toBe("2025-01-09");
    expect(result.holidayExtension).toBe("outOfCoverage");
    expect(result.adjustmentReasonKo).toContain("커버리지 밖");
    expect(result.articles).not.toContain("제161조");
  });

  it("말일은 커버리지 안이지만 연장 대상일이 커버리지를 벗어나면 판정 불가로 남긴다", () => {
    const result = computePeriod(
      { from: "2024-12-27", unit: "day", count: 1, holidayExtension: true },
      makeDeps({ coverage: ["2024-01-01", "2024-12-28"] }),
    );
    expect(result.rawExpiry).toBe("2024-12-28");
    expect(result.holidayExtension).toBe("outOfCoverage");
    expect(result.expiryDate).toBe("2024-12-28");
  });

  it("holidayExtension 을 켜고 deps 를 주지 않으면 거부한다", () => {
    expect(() =>
      computePeriod({ from: "2024-04-01", unit: "day", count: 5, holidayExtension: true }),
    ).toThrow(RangeError);
  });
});

describe("computePeriod - 제155조 고지와 산식 서술", () => {
  it("보충 규정에 따른 계산이라는 사실을 결과에 남긴다", () => {
    const result = computePeriod({ from: "2024-04-01", unit: "day", count: 5 });
    expect(result.noteKo).toContain("제155조");
    expect(result.formulaText).toContain("기산일 2024-04-02");
    expect(result.formulaText).toContain("제159조");
  });
});

describe("computePeriod - 조문 라벨 주입", () => {
  /** 형사소송법 제66조. 제159조·제160조 제3항에 대응하는 규정이 없어 두 자리가 비어 있다. */
  const criminal: PeriodArticleLabels = {
    firstDay: "형사소송법 제66조 제1항",
    endOfPeriod: "",
    calendar: "형사소송법 제66조 제2항",
    monthEndClip: "",
    holidayRollover: "형사소송법 제66조 제3항",
    noteKo: "형사소송법 제66조가 기간의 계산을 직접 정하므로, 그 조문에 따라 계산한 결과입니다.",
  };

  it("라벨을 넘기지 않으면 민법 세트로 계산한다", () => {
    const result = computePeriod({ from: "2024-04-01", unit: "day", count: 5 });
    expect(result.articles).toEqual(["제157조", "제159조"]);
    expect(result.noteKo).toContain("민법 제155조");
  });

  it("넘긴 라벨이 조문·산식·고지를 모두 대체한다", () => {
    const result = computePeriod(
      { from: "2024-04-01", unit: "day", count: 5, holidayExtension: true },
      makeDeps(),
      criminal,
    );
    expect(result.expiryDate).toBe("2024-04-08");
    expect(result.articles).toEqual(["형사소송법 제66조 제1항", "형사소송법 제66조 제3항"]);
    expect(result.adjustmentReasonKo).toContain("형사소송법 제66조 제3항 적용");
    expect(result.noteKo).toBe(criminal.noteKo);
    // 계산 결과 어디에도 민법 조문이 남지 않는다.
    expect(JSON.stringify(result)).not.toMatch(/민법|제15[5-9]조|제16[01]조/);
  });

  it("빈 라벨 자리는 조문 없이 사유만 적고 articles 에도 담지 않는다", () => {
    const result = computePeriod(
      { from: "2024-04-01", unit: "day", count: 5 },
      undefined,
      criminal,
    );
    expect(result.articles).toEqual(["형사소송법 제66조 제1항"]);
    expect(result.formulaText).toContain("(말일의 종료로 만료)");
    expect(result.formulaText).not.toContain("제159조");
  });

  it("빈 monthEndClip 라벨도 계산 자체는 그대로 한다", () => {
    const result = computePeriod(
      { from: "2024-01-31", unit: "month", count: 1, includeFirstDay: true },
      undefined,
      criminal,
    );
    expect(result.rawExpiry).toBe("2024-02-29");
    expect(result.articles).toEqual(["형사소송법 제66조 제1항"]);
    expect(result.formulaText).toContain("(최종 월에 해당일이 없어 그 월의 말일)");
  });

  it("커버리지 밖 판정 불가 문구도 넘긴 라벨을 쓴다", () => {
    const result = computePeriod(
      { from: "2024-12-30", unit: "day", count: 10, holidayExtension: true },
      makeDeps(),
      criminal,
    );
    expect(result.holidayExtension).toBe("outOfCoverage");
    expect(result.adjustmentReasonKo).toContain("형사소송법 제66조 제3항 판정 불가");
  });
});

describe("computePeriod - 입력 검증", () => {
  it("잘못된 날짜를 거부한다", () => {
    expect(() => computePeriod({ from: "2024-02-30", unit: "day", count: 1 })).toThrow(RangeError);
  });

  it("0 이하 / 소수 수량을 거부한다", () => {
    expect(() => computePeriod({ from: "2024-04-01", unit: "day", count: 0 })).toThrow(RangeError);
    expect(() => computePeriod({ from: "2024-04-01", unit: "day", count: 1.5 })).toThrow(
      RangeError,
    );
  });
});

describe("computeDateSpan", () => {
  it("초일 불산입으로 일수를 센다", () => {
    const result = computeDateSpan({ from: "2024-01-01", to: "2024-01-31" });
    expect(result.startDate).toBe("2024-01-02");
    expect(result.days).toBe(30);
    expect(result.calendar).toEqual({ years: 0, months: 0, days: 30 });
  });

  it("초일을 산입하면 1일 늘어난다", () => {
    const result = computeDateSpan({
      from: "2024-01-01",
      to: "2024-01-31",
      includeFirstDay: true,
    });
    expect(result.days).toBe(31);
  });

  it("윤년 1년을 1년 0개월 0일로 환산한다", () => {
    const result = computeDateSpan({
      from: "2024-01-01",
      to: "2024-12-31",
      includeFirstDay: true,
    });
    expect(result.days).toBe(366);
    expect(result.calendar).toEqual({ years: 1, months: 0, days: 0 });
  });

  it("연·월·일이 섞인 기간을 환산한다", () => {
    const result = computeDateSpan({
      from: "2020-03-01",
      to: "2023-05-10",
      includeFirstDay: true,
    });
    expect(result.calendar).toEqual({ years: 3, months: 2, days: 10 });
  });

  it("같은 날은 초일 불산입 시 0일이다", () => {
    const result = computeDateSpan({ from: "2024-05-09", to: "2024-05-09" });
    expect(result.days).toBe(0);
    expect(result.calendar).toEqual({ years: 0, months: 0, days: 0 });
  });

  it("computePeriod 의 만료일을 되짚으면 같은 기간이 나온다", () => {
    const forward = computePeriod({ from: "2024-01-01", unit: "month", count: 6 });
    const back = computeDateSpan({ from: "2024-01-01", to: forward.rawExpiry });
    expect(back.calendar).toEqual({ years: 0, months: 6, days: 0 });
  });

  it("to 가 from 보다 이르면 거부한다", () => {
    expect(() => computeDateSpan({ from: "2024-05-09", to: "2024-05-08" })).toThrow(RangeError);
  });

  it("제155조 고지를 남긴다", () => {
    expect(computeDateSpan({ from: "2024-01-01", to: "2024-01-31" }).noteKo).toContain("제155조");
  });
});
