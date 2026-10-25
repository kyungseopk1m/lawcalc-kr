// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { AppropriationCalculator } from "./AppropriationCalculator";

/**
 * 변제충당 탭의 DOM 렌더 테스트.
 *
 * 엔진은 채권마다 `statutoryRank` 를 돌려주는데 화면에서 참조가 0건이라, 변제일을 바꿔도
 * 숫자만 움직이고 이유를 검산할 수 없었다. 그 배선이 살아 있는지 본다.
 */
afterEach(cleanup);

describe("충당 순위 노출", () => {
  it("변제일 입력이 있고, 계산하면 결과 표에 충당 순위가 나온다", () => {
    render(<AppropriationCalculator />);

    // 변제일은 제477조 제1호 변제기 도래 판정의 기준일이다.
    expect(screen.getByLabelText(/변제일/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "계산" }));

    const table = screen.getByRole("table");
    expect(within(table).getByText("충당 순위")).toBeTruthy();
    // 영어 식별자와 기호를 걷어낸 사용자 문구여야 한다.
    const label = within(table).getAllByText(/법정충당 \d+순위/)[0]!;
    expect(label.textContent).toContain("변제이익 순위");
    expect(label.textContent).not.toContain("rank");
    expect(label.textContent).not.toContain("—");
  });
});

describe("여러 번 변제 [P5-4]", () => {
  it("변제를 추가하면 변제별 충당 표가 나온다", () => {
    render(<AppropriationCalculator />);
    fireEvent.change(screen.getByLabelText(/변제일/), { target: { value: "2025-03-31" } });
    fireEvent.click(screen.getByRole("button", { name: /변제·상계 추가/ }));
    const dates = screen.getAllByLabelText(/^변제일/);
    expect(dates).toHaveLength(2);
    fireEvent.change(dates[1]!, { target: { value: "2025-06-30" } });
    fireEvent.change(screen.getAllByLabelText(/변제 금액/)[1]!, {
      target: { value: "100000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "계산" }));

    const events = screen.getByRole("table", { name: "변제별 충당" });
    expect(within(events).getAllByRole("row")).toHaveLength(3);
    expect(within(events).getByText("2025-06-30")).toBeTruthy();
  });
});
