// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { calculateInterest, type CalcOptions } from "@lawcalc-kr/core-engine";

import { SegmentTable } from "./SegmentTable";

/**
 * 대조값은 for-claude `personal/lawcalc-kr/docs/data/vk-run-2026-10-20/session-dates.md` 이자 A-3·이율 변경 실측.
 * VK 이자 화면은 행마다 원금을 보이고 이자 누계를 행별 절사값의 합으로 쌓는다.
 */
const PERIOD: CalcOptions = { mode: "period", leapYear: "actual", includeFirstDay: true };
const TOTAL_DAYS: CalcOptions = { mode: "totalDays", leapYear: "fixed365", includeFirstDay: true };

const CASES = [
  {
    name: "A-3 기간식",
    principal: 10_000_000,
    segments: [
      { from: "2024-01-01", to: "2024-12-31", rate: 0.05 },
      { from: "2025-01-01", to: "2025-12-31", rate: 0.12 },
    ],
    options: PERIOD,
    rows: [
      ["500,000", "500,000"],
      ["1,200,000", "1,700,000"],
    ],
  },
  {
    name: "A-3 총일수",
    principal: 10_000_000,
    segments: [
      { from: "2024-01-01", to: "2024-12-31", rate: 0.05 },
      { from: "2025-01-01", to: "2025-12-31", rate: 0.12 },
    ],
    options: TOTAL_DAYS,
    rows: [
      ["501,369", "501,369"],
      ["1,200,000", "1,701,369"],
    ],
  },
  {
    name: "이율 변경 기간식",
    principal: 50_000_000,
    segments: [
      { from: "2023-06-15", to: "2024-05-31", rate: 0.06 },
      { from: "2024-06-01", to: "2025-03-15", rate: 0.12 },
    ],
    options: PERIOD,
    rows: [
      ["2,885,245", "2,885,245"],
      ["4,734,246", "7,619,491"],
    ],
  },
  {
    name: "이율 변경 총일수",
    principal: 50_000_000,
    segments: [
      { from: "2023-06-15", to: "2024-05-31", rate: 0.06 },
      { from: "2024-06-01", to: "2025-03-15", rate: 0.12 },
    ],
    options: TOTAL_DAYS,
    rows: [
      ["2,893,150", "2,893,150"],
      ["4,734,246", "7,627,396"],
    ],
  },
];

afterEach(cleanup);

describe("SegmentTable 행별 원금 + 이자 누계 (VK 실측)", () => {
  it.each(CASES)("$name", ({ principal, segments, options, rows }) => {
    const result = calculateInterest({
      principal,
      startDate: segments[0]!.from,
      endDate: segments[segments.length - 1]!.to,
      segments,
      options,
    });
    render(<SegmentTable result={result} />);

    const header = screen.getAllByRole("columnheader").map((th) => th.textContent);
    expect(header).toEqual(["기간", "일수", "이율", "원금", "이자", "이자 누계"]);

    const bodyRows = screen
      .getAllByRole("row")
      .filter((tr) => tr.querySelectorAll("td").length === 6)
      .map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent ?? ""));
    const won = (s: string) => `${s}원`;
    expect(bodyRows.map((cells) => cells.slice(3))).toEqual(
      rows.map(([interest, cumulative]) => [
        won(principal.toLocaleString("ko-KR")),
        won(interest!),
        won(cumulative!),
      ]),
    );
    // 마지막 누계 = 합계 행.
    expect(result.totalInterest.toLocaleString("ko-KR")).toBe(rows[rows.length - 1]![1]);
  });
});
