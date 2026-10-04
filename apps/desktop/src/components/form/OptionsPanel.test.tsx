// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { calculateInterest, type CalcOptions } from "@lawcalc-kr/core-engine";

import { COURT_STYLE_OPTIONS, OptionsPanel } from "./OptionsPanel";

afterEach(cleanup);

describe("법원 방식 프리셋", () => {
  it("버튼을 누르면 법원 방식 옵션이 한 번에 적용된다", () => {
    const onChange = vi.fn();
    const defaults: CalcOptions = {
      mode: "period",
      leapYear: "fixed365",
      includeFirstDay: false,
      rounding: "floor",
    };
    render(<OptionsPanel value={defaults} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "법원 방식 적용" }));
    expect(onChange).toHaveBeenCalledWith({
      mode: "period",
      leapYear: "actual",
      includeFirstDay: true,
      rounding: "floor",
    });
  });

  it("법원 이자계산 매뉴얼 예시 4행(원금 1,000,000)이 법원 합계 295,989 로 나온다", () => {
    // 행별 법원 화면값: 66,301 / 83,333 / 39,068 / 107,287 (기간식)
    const rows: Array<[string, string, number, number]> = [
      ["2011-01-01", "2011-05-01", 0.2, 66_301],
      ["2011-05-02", "2012-03-01", 0.1, 83_333],
      ["2012-03-02", "2012-05-02", 0.23, 39_068],
      ["2012-05-03", "2015-01-06", 0.04, 107_287],
    ];
    const interest = (options: CalcOptions) =>
      rows.map(
        ([startDate, endDate, rate]) =>
          calculateInterest({
            principal: 1_000_000,
            startDate,
            endDate,
            segments: [{ from: startDate, to: endDate, rate }],
            options,
          }).totalInterest,
      );

    const court = interest(COURT_STYLE_OPTIONS);
    expect(court).toEqual(rows.map((r) => r[3]));
    expect(court.reduce((a, b) => a + b, 0)).toBe(295_989);
    // 기본값(fixed365, 초일 불산입)은 294,656 이라 법원과 1,333원 차이가 난다.
    const basic = interest({
      mode: "period",
      leapYear: "fixed365",
      includeFirstDay: false,
      rounding: "floor",
    });
    expect(basic.reduce((a, b) => a + b, 0)).toBe(294_656);
  });
});
