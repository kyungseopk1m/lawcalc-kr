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

    // 변제일은 제477조 1호 변제기 도래 판정의 기준일이다.
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
