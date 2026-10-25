// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { computeCompensationDeath } from "@lawcalc-kr/compensation";

import { DeathClaimantsCard, DeathClaimantsTable } from "../components/compensation-extras-form";
import {
  defaultDeathClaimantsFormState,
  type DeathClaimantsFormState,
} from "../lib/compensation-extras";
import { CompensationCalculator } from "./CompensationCalculator";

afterEach(cleanup);

function renderPanel(mode: "injury" | "death") {
  render(<CompensationCalculator />);
  return within(screen.getByTestId(`compensation-${mode}-panel`));
}

describe("손해배상 추가 섹션 화면", () => {
  it("부상: 절사 기본 켜짐, 기대여명 미리보기, 일실퇴직금 결과 행, 지연손해금 주문 문구", () => {
    const view = renderPanel("injury");
    expect(
      view.getByLabelText<HTMLInputElement>(
        "법원 계산 프로그램 방식 절사 (상실률 % 2자리, 호프만 4자리)",
      ).checked,
    ).toBe(true);

    fireEvent.click(view.getByLabelText("기대여명 반영"));
    expect(view.getByTestId("compensation-life-expectancy-preview").textContent).toContain(
      "최종 여명종료일",
    );

    fireEvent.click(view.getByLabelText("일실퇴직금 포함"));
    fireEvent.change(view.getByLabelText("계산 방식"), { target: { value: "direct" } });
    fireEvent.change(view.getByLabelText("일실퇴직금 직접 입력"), {
      target: { value: "10000000" },
    });
    fireEvent.click(view.getByRole("button", { name: "계산" }));
    expect(view.getByTestId("compensation-lost-retirement").textContent).toBe("10,000,000원");
    expect(view.getByTestId("compensation-life-expectancy-result").textContent).toContain(
      "기대여명:",
    );

    fireEvent.click(view.getByLabelText("지연손해금 계산"));
    fireEvent.change(view.getByLabelText("판결 선고일"), { target: { value: "2026-09-30" } });
    expect(view.getByTestId("compensation-delay-order-text").textContent).toContain(
      "민법이 정한 연 5%",
    );
    // 입력을 바꾸면 낡은 최종액으로 계산한 지연손해금 표를 숨긴다.
    fireEvent.change(view.getByLabelText("일실퇴직금 직접 입력"), {
      target: { value: "20000000" },
    });
    expect(view.queryByTestId("compensation-delay-order-text")).toBeNull();
    expect(view.getByText(/다시 계산하면 새 최종액으로/)).toBeTruthy();
  });

  it("중복장해율 도우미: 33.3% · 15.5% → 43.63%, 영구장해 행으로 추가", () => {
    const view = renderPanel("injury");
    fireEvent.click(view.getByRole("button", { name: "중복장해율 계산 도우미" }));
    fireEvent.change(view.getByLabelText("장해율 1 (%)"), { target: { value: "33.3" } });
    fireEvent.change(view.getByLabelText("장해율 2 (%)"), { target: { value: "15.5" } });
    expect(view.getByTestId("compensation-disability-helper-result").textContent).toBe("43.63%");
    fireEvent.click(view.getByRole("button", { name: "영구장해 행으로 추가" }));
    expect(view.getByDisplayValue("43.63%")).toBeTruthy();
  });

  it("사망: 절사 기본 켜짐, 원고별 귀속은 상속인 입력을 먼저 요구한다", () => {
    const view = renderPanel("death");
    expect(
      view.getByLabelText<HTMLInputElement>("법원 계산 프로그램 방식 절사 (호프만 4자리)").checked,
    ).toBe(true);
    fireEvent.click(view.getByLabelText("원고별 귀속 사용"));
    expect(view.getByText(/상속인을 먼저 입력하세요/)).toBeTruthy();
  });
});

describe("사망 원고별 귀속: 상속인 아닌 유족", () => {
  it("카드에서 유족 행을 추가·입력·삭제한다", () => {
    let state: DeathClaimantsFormState = { ...defaultDeathClaimantsFormState(), enabled: true };
    const onChange = (next: DeathClaimantsFormState) => {
      state = next;
      rerender(ui());
    };
    const ui = () => (
      <DeathClaimantsCard
        value={state}
        onChange={onChange}
        heirNames={["배우자", "자녀"]}
        includeHeirs
        industrial={false}
      />
    );
    const { rerender } = render(ui());
    expect(screen.getByText(/보험약관 지급기준을 켜면/)).toBeTruthy();
    expect(screen.queryByText(/따로 더하세요/)).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /추가/ })[0]!);
    fireEvent.change(screen.getByLabelText("상속인 아닌 유족 이름"), {
      target: { value: "망인의 모" },
    });
    fireEvent.change(screen.getByLabelText("상속인 아닌 유족 위자료"), {
      target: { value: "3000000" },
    });
    expect(state.others).toMatchObject([{ name: "망인의 모", solatiumText: "3000000" }]);
    fireEvent.click(screen.getByRole("button", { name: "상속인 아닌 유족 삭제" }));
    expect(state.others).toEqual([]);
  });

  it("결과 표에 유족 행이 상속인 행 뒤에 실린다", () => {
    const result = computeCompensationDeath({
      mode: "death",
      base: { birthDate: "1980-05-10", accidentDate: "2025-03-01", sex: "male" },
      lostIncome: { directWageWon: 100_000 },
      heirs: {
        decedent: { deceasedAt: "2025-03-01" },
        spouse: { name: "배우자", alive: true },
        linealDescendants: [{ name: "자녀", deceasedBeforeOpening: false }],
      },
      claimants: { otherClaimants: [{ name: "망인의 모", solatiumWon: 3_000_000 }] },
    });
    render(<DeathClaimantsTable result={result} />);
    const row = screen.getByTestId("compensation-death-other-claimant-row");
    expect(row.textContent).toContain("망인의 모 (상속인 아님)");
    expect(row.textContent).toContain("3,000,000원");
  });
});
