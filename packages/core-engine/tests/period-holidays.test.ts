import { describe, expect, it } from "vitest";

import { computePeriod, createHolidayDeps } from "../src";

/**
 * 기간 엔진과 공휴일 데이터셋의 실제 배선 검증.
 *
 * `period.test.ts` 는 공휴일 stub 으로 계약만 확인한다. 여기서는 번들 데이터셋을
 * 그대로 물려 실제 공휴일에 걸리는지를 본다. 둘을 잇는 방법이 하나(`createHolidayDeps`)
 * 라는 것도 함께 고정한다.
 */
describe("기간 엔진 + 공휴일 데이터셋 실배선", () => {
  const deps = createHolidayDeps();

  it("말일이 근무일이면 조정하지 않는다", () => {
    // 판결서 송달 2026-02-27 (금). 초일 불산입으로 기산 2026-02-28, 2주 만료 2026-03-13 (금).
    const result = computePeriod(
      { from: "2026-02-27", unit: "week", count: 2, holidayExtension: true },
      deps,
    );
    expect(result.startDate).toBe("2026-02-28");
    expect(result.expiryDate).toBe("2026-03-13");
    expect(result.holidayExtension).toBe("notApplied");
  });

  it("말일이 대체공휴일이면 다음 근무일로 만료한다", () => {
    // 기산 2026-02-17, 2주 만료 2026-03-02 는 삼일절 대체공휴일이다.
    const result = computePeriod(
      { from: "2026-02-16", unit: "week", count: 2, holidayExtension: true },
      deps,
    );
    expect(result.rawExpiry).toBe("2026-03-02");
    expect(result.expiryDate).toBe("2026-03-03");
    expect(result.holidayExtension).toBe("applied");
    expect(result.articles).toContain("제161조");
  });

  it("말일이 토요일이면 공휴일이 아니어도 다음 근무일로 만료한다", () => {
    // 기산 2026-06-02, 5일 만료 2026-06-06 은 토요일인 현충일이다. 현충일은 규정
    // 제3조 제1항 어느 호에도 없어 대체공휴일이 생기지 않지만, 제161조는 토요일
    // 자체를 말일에서 배제한다.
    const result = computePeriod(
      { from: "2026-06-01", unit: "day", count: 5, holidayExtension: true },
      deps,
    );
    expect(result.rawExpiry).toBe("2026-06-06");
    expect(result.expiryDate).toBe("2026-06-08");
    expect(result.holidayExtension).toBe("applied");
  });

  it("커버리지 밖으로 넘어가면 연장 여부를 단정하지 않는다", () => {
    const result = computePeriod(
      { from: "2027-12-20", unit: "day", count: 30, holidayExtension: true },
      deps,
    );
    expect(result.holidayExtension).toBe("outOfCoverage");
    expect(result.expiryDate).toBe(result.rawExpiry);
    expect(result.adjustmentReasonKo).toBeTruthy();
  });

  it("2008-03-22 이전 토요일 말일은 연장하지 않고 판정 불가로 남긴다", () => {
    // 기산 2006-02-19, 14일 만료 2006-03-04 (토). 당시 법으로는 토요일 만료이고 엔진이 03-06 으로 밀면 틀린다.
    const result = computePeriod(
      { from: "2006-02-18", unit: "day", count: 14, holidayExtension: true },
      deps,
    );
    expect(result.rawExpiry).toBe("2006-03-04");
    expect(result.holidayExtension).toBe("outOfCoverage");
    expect(result.expiryDate).toBe("2006-03-04");
  });

  it("2008-03-22 이전이어도 토요일이 걸리지 않는 말일은 판정한다", () => {
    // 2006-03-03 (금) 만료는 근무일, 2006-03-05 (일) 만료는 월요일로 민다.
    const fri = computePeriod(
      { from: "2006-02-18", unit: "day", count: 13, holidayExtension: true },
      deps,
    );
    expect(fri.rawExpiry).toBe("2006-03-03");
    expect(fri.holidayExtension).toBe("notApplied");
    const sun = computePeriod(
      { from: "2006-02-18", unit: "day", count: 15, holidayExtension: true },
      deps,
    );
    expect(sun.rawExpiry).toBe("2006-03-05");
    expect(sun.expiryDate).toBe("2006-03-06");
    expect(sun.holidayExtension).toBe("applied");
  });

  it("금요일 공휴일 연장이 2008-03-22 이전 토요일에 닿으면 판정 불가다", () => {
    // 2006-03-01 삼일절은 수요일이라 직접 쓰지 못한다. 2007-12-25 성탄절(화)은 토요일을 안 거치므로
    // 금요일 공휴일인 2004-04-15 는 제17대 총선(목)이라 맞지 않는다. 2006-05-05 어린이날(금)이 걸린다.
    const result = computePeriod(
      { from: "2006-05-01", unit: "day", count: 4, holidayExtension: true },
      deps,
    );
    expect(result.rawExpiry).toBe("2006-05-05");
    expect(result.holidayExtension).toBe("outOfCoverage");
  });

  it("2008-03-22 이후 토요일 말일은 연장한다 (시행일 당일 경계)", () => {
    // 2008-03-22 는 토요일이다. 03-23(일)을 건너 03-24(월)로 만료한다.
    const onDay = computePeriod(
      { from: "2008-03-21", unit: "day", count: 1, holidayExtension: true },
      deps,
    );
    expect(onDay.rawExpiry).toBe("2008-03-22");
    expect(onDay.expiryDate).toBe("2008-03-24");
    expect(onDay.holidayExtension).toBe("applied");
    // 시행일 전날(금) 말일은 근무일이라 그대로다.
    const before = computePeriod(
      { from: "2008-03-20", unit: "day", count: 1, holidayExtension: true },
      deps,
    );
    expect(before.rawExpiry).toBe("2008-03-21");
    expect(before.holidayExtension).toBe("notApplied");
  });

  it("옵션을 끄면 데이터셋을 보지 않는다", () => {
    const result = computePeriod({ from: "2026-02-16", unit: "week", count: 2 });
    expect(result.expiryDate).toBe("2026-03-02");
    expect(result.holidayExtension).toBe("off");
  });
});
