import { describe, expect, it } from "vitest";

import {
  findHoliday,
  holidaysVersionTag,
  isBusinessDay,
  isCovered,
  isWeekend,
  loadHolidays,
  rollToNextBusinessDay,
} from "../src/holidays";
import type { HolidayDataset } from "../src/holidays";

const ds = loadHolidays();

describe("holidays dataset / 관공서의 공휴일에 관한 규정 스냅샷", () => {
  it("커버리지가 2003-01-01 ~ 2027-12-31 이고 버전 태그가 나온다", () => {
    expect(ds.coverage).toEqual({ from: "2003-01-01", to: "2027-12-31" });
    expect(holidaysVersionTag(ds)).toBe("holidays/v1.0.0");
  });

  it("날짜가 오름차순이고 중복이 없다", () => {
    const dates = ds.holidays.map((h) => h.date);
    expect([...dates].sort()).toEqual(dates);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it("연도에 따라 달라지는 항목이 규정 개정 시점과 맞는다", () => {
    // 식목일: 제2조 제5호, 2005-06-30 삭제. 삭제 시점이 4월 5일 뒤라 2005년까지 공휴일이다.
    expect(findHoliday("2005-04-05", ds)?.nameKo).toBe("식목일");
    expect(findHoliday("2006-04-05", ds)).toBeNull();
    // 제헌절: 2005-06-30 개정 부칙 제2항으로 2007-12-31 까지 공휴일, 2026-04-30 개정으로 재지정.
    expect(findHoliday("2007-07-17", ds)?.nameKo).toBe("제헌절");
    expect(findHoliday("2008-07-17", ds)).toBeNull();
    expect(findHoliday("2026-07-17", ds)?.nameKo).toBe("제헌절");
    // 한글날: 2012-12-28 개정으로 국경일 중 공휴일에 추가.
    expect(findHoliday("2012-10-09", ds)).toBeNull();
    expect(findHoliday("2013-10-09", ds)?.nameKo).toBe("한글날");
    // 노동절: 2026-04-30 개정 제2조 제6호 신설, 2026-05-01 시행.
    expect(findHoliday("2025-05-01", ds)).toBeNull();
    expect(findHoliday("2026-05-01", ds)?.nameKo).toBe("노동절");
  });

  it("임기만료 선거일과 임시공휴일이 kind 로 구분된다", () => {
    expect(findHoliday("2024-04-10", ds)?.kind).toBe("election");
    expect(findHoliday("2015-08-14", ds)?.kind).toBe("temporary");
    expect(findHoliday("2024-10-01", ds)?.kind).toBe("temporary");
    expect(findHoliday("2025-01-27", ds)?.kind).toBe("temporary");
    // 보궐 성격의 대통령선거라 법정공휴일이 아니고 임시공휴일로 지정됐다.
    expect(findHoliday("2025-06-03", ds)?.kind).toBe("temporary");
  });

  it("법정공휴일이 아닌 선거일을 election 으로 적지 않는다", () => {
    // 제2조 제10의2호는 「공직선거법」 제34조의 임기만료에 의한 선거의 선거일만 공휴일로
    // 정한다. 아래 셋은 그 범위 밖이라 임시공휴일(제2조 제11호)로 지정된 날이다. kind 는
    // 계산에 쓰이지 않지만(요일·날짜만 본다), 데이터셋이 스스로 밝힌 기준과 어긋나면
    // 다음에 이 표를 고치는 사람이 기준을 잘못 읽는다.

    // 대통령 궐위로 인한 선거라 「공직선거법」 제35조가 적용된다.
    expect(findHoliday("2017-05-09", ds)?.kind).toBe("temporary");
    // 제10의2호 신설(2006-09-06) 이전이라 임기만료 선거여도 법정공휴일이 아니었다.
    expect(findHoliday("2004-04-15", ds)?.kind).toBe("temporary");
    expect(findHoliday("2006-05-31", ds)?.kind).toBe("temporary");
    // 신설 이후의 임기만료 선거는 election 이다.
    expect(findHoliday("2007-12-19", ds)?.kind).toBe("election");
    expect(findHoliday("2022-03-09", ds)?.kind).toBe("election");

    // election 으로 남은 항목은 전부 제10의2호 신설일 이후여야 한다.
    const elections = ds.holidays.filter((h) => h.kind === "election");
    expect(elections.length).toBeGreaterThan(0);
    for (const h of elections) {
      expect(h.date >= "2006-09-06").toBe(true);
    }
  });

  it("대체공휴일 제도 확대 시점이 반영돼 있다", () => {
    // 2014 도입분은 설·추석·어린이날 한정.
    expect(findHoliday("2014-09-10", ds)?.kind).toBe("substitute");
    // 2021-08-04 확대로 국경일까지 대상이 됐다 (2021-08-15 광복절이 일요일).
    expect(findHoliday("2021-08-16", ds)?.kind).toBe("substitute");
    // 2023-05-04 개정으로 부처님오신날·기독탄신일 추가 (2023-05-27 부처님오신날이 토요일).
    expect(findHoliday("2023-05-29", ds)?.kind).toBe("substitute");
  });
});

describe("isCovered / isWeekend", () => {
  it("커버리지 첫날과 마지막날은 포함이다", () => {
    expect(isCovered("2003-01-01", ds)).toBe(true);
    expect(isCovered("2027-12-31", ds)).toBe(true);
    expect(isCovered("2002-12-31", ds)).toBe(false);
    expect(isCovered("2028-01-01", ds)).toBe(false);
  });

  it("토·일만 주말이다", () => {
    expect(isWeekend("2026-08-29")).toBe(true); // 토
    expect(isWeekend("2026-08-30")).toBe(true); // 일
    expect(isWeekend("2026-08-28")).toBe(false); // 금
    expect(isWeekend("2026-08-31")).toBe(false); // 월
  });

  it("잘못된 날짜 문자열은 RangeError", () => {
    expect(() => isWeekend("2026-13-01")).toThrow(RangeError);
    expect(() => isCovered("20260101", ds)).toThrow(RangeError);
  });
});

describe("isBusinessDay", () => {
  it("커버리지 밖 날짜는 평일로 취급하지 않고 던진다", () => {
    expect(() => isBusinessDay("2002-12-31", ds)).toThrow(RangeError);
    expect(() => isBusinessDay("2028-01-03", ds)).toThrow(RangeError);
  });

  it("커버리지 경계 첫날·마지막날은 판정한다", () => {
    expect(isBusinessDay("2003-01-01", ds)).toBe(false); // 신정
    expect(isBusinessDay("2027-12-31", ds)).toBe(true); // 금요일, 공휴일 아님
  });

  it("토·일·공휴일이 아닌 날만 근무일이다", () => {
    expect(isBusinessDay("2026-08-28", ds)).toBe(true);
    expect(isBusinessDay("2026-08-29", ds)).toBe(false); // 토
    expect(isBusinessDay("2026-08-30", ds)).toBe(false); // 일
    expect(isBusinessDay("2026-03-01", ds)).toBe(false); // 삼일절(일)
    expect(isBusinessDay("2026-03-02", ds)).toBe(false); // 대체공휴일
    expect(isBusinessDay("2026-03-03", ds)).toBe(true);
  });
});

describe("2008-03-22 이전 토요일", () => {
  it("isBusinessDay 와 rollToNextBusinessDay 는 판정하지 않고 던진다", () => {
    expect(() => isBusinessDay("2008-03-15", ds)).toThrow(RangeError); // 토
    expect(() => rollToNextBusinessDay("2006-03-04", ds)).toThrow(RangeError);
  });

  it("시행일 당일(토)부터 판정한다. 평일·일요일은 이전에도 판정한다", () => {
    expect(isBusinessDay("2008-03-22", ds)).toBe(false);
    expect(isBusinessDay("2008-03-21", ds)).toBe(true);
    expect(isBusinessDay("2006-03-06", ds)).toBe(true);
    expect(rollToNextBusinessDay("2006-03-05", ds).date).toBe("2006-03-06");
  });

  it("isCovered 는 영향받지 않는다", () => {
    expect(isCovered("2006-03-04", ds)).toBe(true);
  });
});

describe("rollToNextBusinessDay / 민법 제161조", () => {
  it("근무일은 밀지 않는다", () => {
    expect(rollToNextBusinessDay("2026-08-28", ds)).toEqual({
      date: "2026-08-28",
      rolled: false,
      skipped: [],
    });
  });

  it("토요일 말일은 다음 근무일로 밀고 사유를 남긴다", () => {
    const r = rollToNextBusinessDay("2026-08-29", ds);
    expect(r).toMatchObject({ date: "2026-08-31", rolled: true, skipped: [] });
    expect(r.reasonKo).toBe("말일이 토요일이라 다음 근무일로 만료");
  });

  it("일요일 말일도 민다", () => {
    const r = rollToNextBusinessDay("2026-08-30", ds);
    expect(r.date).toBe("2026-08-31");
    expect(r.reasonKo).toBe("말일이 일요일이라 다음 근무일로 만료");
  });

  it("설 연휴 3일을 통째로 건너뛴다", () => {
    // 2026 설 연휴 2/16(월)~2/18(수).
    const r = rollToNextBusinessDay("2026-02-16", ds);
    expect(r.date).toBe("2026-02-19");
    expect(r.rolled).toBe(true);
    expect(r.skipped.map((h) => h.date)).toEqual(["2026-02-16", "2026-02-17", "2026-02-18"]);
    expect(r.reasonKo).toBe("말일이 공휴일이라 다음 근무일로 만료 (설날)");
  });

  it("대체공휴일이 끼면 그것도 건너뛴다", () => {
    // 2026-03-01 삼일절(일) → 3/2 대체공휴일(월) → 3/3(화).
    const r = rollToNextBusinessDay("2026-03-01", ds);
    expect(r.date).toBe("2026-03-03");
    expect(r.skipped.map((h) => h.nameKo)).toEqual(["삼일절", "대체공휴일(삼일절)"]);
    expect(r.reasonKo).toBe("말일이 공휴일이라 다음 근무일로 만료 (삼일절)");
  });

  it("공휴일이 토·일과 붙으면 연속으로 민다", () => {
    // 2026-10-03 개천절(토) → 10/4(일) → 10/5 대체공휴일(월) → 10/6(화).
    const r = rollToNextBusinessDay("2026-10-03", ds);
    expect(r.date).toBe("2026-10-06");
    expect(r.skipped.map((h) => h.date)).toEqual(["2026-10-03", "2026-10-05"]);
    expect(r.reasonKo).toBe("말일이 공휴일이라 다음 근무일로 만료 (개천절)");
  });

  it("2027 노동절·제헌절 대체공휴일까지 밀린다", () => {
    // 특일정보 스냅샷에 없어 제3조 제1항 제1호로 도출해 넣은 2건이다.
    expect(rollToNextBusinessDay("2027-05-01", ds).date).toBe("2027-05-04");
    expect(rollToNextBusinessDay("2027-07-17", ds).date).toBe("2027-07-20");
  });

  it("임시공휴일도 근무일이 아니다", () => {
    // 2015-08-14(금) 광복 70주년 임시공휴일 → 8/15 광복절(토) → 8/16(일) → 8/17(월).
    const r = rollToNextBusinessDay("2015-08-14", ds);
    expect(r.date).toBe("2015-08-17");
    expect(r.skipped.map((h) => h.kind)).toEqual(["temporary", "statutory"]);
  });

  it("선거일도 근무일이 아니다", () => {
    // 2024-04-10(수) 국회의원선거 → 4/11(목).
    const r = rollToNextBusinessDay("2024-04-10", ds);
    expect(r.date).toBe("2024-04-11");
    expect(r.skipped.map((h) => h.kind)).toEqual(["election"]);
  });

  it("커버리지 밖 날짜와 커버리지 끝에서 넘어가는 경우는 던진다", () => {
    expect(() => rollToNextBusinessDay("2002-12-31", ds)).toThrow(RangeError);
    // 2027-12-31 은 금요일이라 밀리지 않는다. 커버리지를 넘겨야 하는 축약 dataset 으로 확인한다.
    const truncated: HolidayDataset = {
      ...ds,
      coverage: { from: "2003-01-01", to: "2026-08-29" },
      holidays: ds.holidays.filter((h) => h.date <= "2026-08-29"),
    };
    expect(() => rollToNextBusinessDay("2026-08-29", truncated)).toThrow(RangeError);
  });
});

describe("loadHolidays 검증", () => {
  it("날짜가 오름차순이 아니면 거부한다", () => {
    const broken: HolidayDataset = {
      ...ds,
      holidays: [
        { date: "2003-02-01", nameKo: "설날", kind: "statutory" },
        { date: "2003-01-01", nameKo: "신정", kind: "statutory" },
      ],
    };
    expect(() => loadHolidays(broken)).toThrow(RangeError);
  });

  it("커버리지 밖 항목이 있으면 거부한다", () => {
    const broken: HolidayDataset = {
      ...ds,
      holidays: [{ date: "2002-01-01", nameKo: "신정", kind: "statutory" }],
    };
    expect(() => loadHolidays(broken)).toThrow(RangeError);
  });

  it("알 수 없는 kind 는 거부한다", () => {
    const broken = {
      ...ds,
      holidays: [{ date: "2003-01-01", nameKo: "신정", kind: "national" }],
    } as unknown as HolidayDataset;
    expect(() => loadHolidays(broken)).toThrow(RangeError);
  });
});
