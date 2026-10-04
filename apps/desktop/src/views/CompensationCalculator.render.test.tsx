// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { computeCompensation, computeCompensationDeath } from "@lawcalc-kr/compensation";

import { applyCaseCalculations, caseMismatchNotice } from "../lib/case-file";
import type { LcalcCaseCalculationKey, LcalcFile } from "../lib/ipc";
import { useHasUnsavedLcalcChanges } from "../lib/lcalc-dirty-state";
import {
  CompensationCalculator,
  buildCompensationDeathInput,
  buildCompensationDeathLcalcFile,
  buildCompensationInput,
  buildCompensationLcalcFile,
  defaultCompensationDeathFormState,
  defaultCompensationFormState,
} from "./CompensationCalculator";

afterEach(cleanup);

/** 부상·사망 view 가 함께 마운트돼 있으므로 부상 패널로 범위를 좁힌다. */
function renderInjury() {
  render(<CompensationCalculator />);
  return within(screen.getByTestId("compensation-injury-panel"));
}

describe("손해배상 숫자 칸 오류 표시", () => {
  it('과실비율 "30" 은 칸 옆에 한국어 오류를 내고 계산을 막는다', () => {
    const view = renderInjury();
    fireEvent.change(view.getByPlaceholderText("예: 0.30"), { target: { value: "30" } });

    expect(view.getByText(/퍼센트라면 30% 처럼/)).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "계산" }));
    expect(view.getByText(/^과실비율: /)).toBeTruthy();
    expect(view.queryByText("계산 결과")).toBeNull();
  });

  it('과실비율 "30%" 는 오류 없이 계산하고, 위자료는 공제 뒤 가산 행으로 보인다', () => {
    const view = renderInjury();
    fireEvent.change(view.getByPlaceholderText("예: 0.30"), { target: { value: "30%" } });
    fireEvent.change(view.getByPlaceholderText("예: 5,000,000"), {
      target: { value: "10000000" },
    });
    fireEvent.click(view.getByRole("button", { name: "계산" }));

    expect(view.queryByRole("alert")).toBeNull();
    expect(view.getByText("과실상계 (30%)")).toBeTruthy();
    expect(view.getByTestId("compensation-solatium-added").textContent).toBe("10,000,000원");
  });

  it("라벨은 입원치료 종료일, 토글 기본값은 위자료 과실상계 꺼짐 · 입원기간 100% 켜짐", () => {
    const view = renderInjury();
    expect(view.getByLabelText(/^입원치료 종료일/)).toBeTruthy();
    expect(
      view.getByLabelText<HTMLInputElement>("위자료에도 과실상계 적용 (보험약관 기준)").checked,
    ).toBe(false);
    expect(view.getByLabelText<HTMLInputElement>("입원기간 노동능력상실률 100% 적용").checked).toBe(
      true,
    );
  });

  it("비율공제 안내는 보험약관 기준 토글을 켜면 위자료 포함으로 바뀐다", () => {
    const view = renderInjury();
    expect(view.getByText(/재산상 손해 전체에\s*비율을 곱해 뺍니다/)).toBeTruthy();
    fireEvent.click(view.getByLabelText("위자료에도 과실상계 적용 (보험약관 기준)"));
    expect(view.getByText(/위자료를 포함한 손해 전체에\s*비율을 곱해 뺍니다/)).toBeTruthy();
  });
});

function DirtyProbe() {
  return <span data-testid="dirty">{String(useHasUnsavedLcalcChanges())}</span>;
}

describe("부상 ↔ 사망 전환", () => {
  it("부상 입력 → 사망 → 부상으로 돌아와도 값과 미저장 표시가 남는다", () => {
    render(
      <>
        <CompensationCalculator />
        <DirtyProbe />
      </>,
    );
    const injury = within(screen.getByTestId("compensation-injury-panel"));
    fireEvent.change(injury.getByPlaceholderText("예: 0.30"), { target: { value: "0.25" } });
    expect(screen.getByTestId("dirty").textContent).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "자동차 사고 · 사망" }));
    expect(screen.getByTestId("compensation-injury-panel").className).toBe("hidden");
    expect(screen.getByTestId("dirty").textContent).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "자동차 사고 · 부상" }));
    expect(
      within(
        screen.getByTestId("compensation-injury-panel"),
      ).getByPlaceholderText<HTMLInputElement>("예: 0.30").value,
    ).toBe("0.25");
    expect(screen.getByTestId("dirty").textContent).toBe("true");
  });

  it("사망 쪽만 고쳐도 부상으로 돌아왔을 때 미저장 표시가 남는다", () => {
    render(
      <>
        <CompensationCalculator />
        <DirtyProbe />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "자동차 사고 · 사망" }));
    const death = within(screen.getByTestId("compensation-death-panel"));
    fireEvent.change(death.getByPlaceholderText("예: 0.30"), { target: { value: "0.2" } });

    fireEvent.click(screen.getByRole("button", { name: "자동차 사고 · 부상" }));
    expect(screen.getByTestId("dirty").textContent).toBe("true");
    expect(death.getByPlaceholderText<HTMLInputElement>("예: 0.30").value).toBe("0.2");
  });
});

/** JSON 왕복으로 디스크에 저장된 파일처럼 만든다. */
function injuryFile(): LcalcFile & { payload: { input: Record<string, unknown> } } {
  const input = buildCompensationInput(defaultCompensationFormState());
  return JSON.parse(
    JSON.stringify(buildCompensationLcalcFile(input, computeCompensation(input), "")),
  ) as LcalcFile & { payload: { input: Record<string, unknown> } };
}

function applyCase(file: LcalcFile): LcalcCaseCalculationKey[] {
  const mismatched: LcalcCaseCalculationKey[] = [];
  act(() => {
    applyCaseCalculations({ compensation: file }, false, mismatched);
  });
  return mismatched;
}

describe("입원치료 종료일 (사용자 결정 8)", () => {
  it("사고일을 바꾸면 종료일이 따라가고, 종료일을 고친 뒤에는 따라가지 않는다", () => {
    const view = renderInjury();
    const accident = view.getByLabelText<HTMLInputElement>("사고일자");
    const end = view.getByLabelText<HTMLInputElement>(/^입원치료 종료일/);

    fireEvent.change(accident, { target: { value: "2026-03-01" } });
    expect(end.value).toBe("2026-03-01");

    fireEvent.change(end, { target: { value: "2026-05-20" } });
    fireEvent.change(accident, { target: { value: "2026-04-01" } });
    expect(end.value).toBe("2026-05-20");
  });

  it("결과 카드에 입원기간 개월 수를 월 단위 내림으로 보인다", () => {
    const view = renderInjury();
    fireEvent.change(view.getByLabelText(/^입원치료 종료일/), {
      target: { value: "2026-03-15" },
    });
    fireEvent.click(view.getByRole("button", { name: "계산" }));
    expect(view.getByTestId("compensation-hospitalization-months").textContent).toBe(
      "입원기간 2개월 상실률 100% (월 단위 내림)",
    );
  });

  it("입원기간 키가 없는 이전 버전 파일은 끈 상태로 열고 안내한다", () => {
    const view = renderInjury();
    const file = injuryFile();
    delete (file.payload.input.lossRate as Record<string, unknown>).hospitalizationFullLoss;
    expect(applyCase(file)).toEqual([]);

    expect(view.getByLabelText<HTMLInputElement>("입원기간 노동능력상실률 100% 적용").checked).toBe(
      false,
    );
    expect(view.getByTestId("compensation-legacy-hospitalization-notice").textContent).toContain(
      "이전 버전 파일이라 입원기간 100% 적용을 끈 상태로 열었습니다",
    );
  });

  it("키를 명시한 새 파일은 안내 없이 저장된 값대로 연다", () => {
    const view = renderInjury();
    applyCase(injuryFile());
    expect(view.getByLabelText<HTMLInputElement>("입원기간 노동능력상실률 100% 적용").checked).toBe(
      true,
    );
    expect(view.queryByTestId("compensation-legacy-hospitalization-notice")).toBeNull();
  });
});

describe("사건 파일 열기 (손해배상)", () => {
  it("최종액은 같고 소계만 다르면 세부 항목 안내를 내고, 토스트용 탭 목록에 넣는다", () => {
    renderInjury();
    const file = injuryFile();
    const { result } = file.payload as unknown as {
      result: { pecuniaryDamagesSubtotalWon: number };
    };
    result.pecuniaryDamagesSubtotalWon += 1;
    const mismatched = applyCase(file);

    expect(mismatched).toEqual(["compensation"]);
    expect(caseMismatchNotice(mismatched)).toBe(" 결과가 저장 당시와 다른 탭: 손해배상.");
    expect(screen.getByTestId("result-freshness-notice").textContent).toContain(
      "세부 항목 구성이 저장 당시와 다릅니다",
    );
  });

  it("대상 모드 적용이 실패하면 다른 모드 입력을 지우지 않는다", () => {
    render(<CompensationCalculator />);
    const injury = within(screen.getByTestId("compensation-injury-panel"));
    fireEvent.change(injury.getByPlaceholderText("예: 0.30"), { target: { value: "0.25" } });

    const deathInput = buildCompensationDeathInput(defaultCompensationDeathFormState());
    const broken = JSON.parse(
      JSON.stringify(
        buildCompensationDeathLcalcFile(deathInput, computeCompensationDeath(deathInput), ""),
      ),
    ) as LcalcFile & { payload: { input: { base: { birthDate: string } } } };
    broken.payload.input.base.birthDate = "생년월일";

    expect(() => applyCase(broken)).toThrow();
    expect(injury.getByPlaceholderText<HTMLInputElement>("예: 0.30").value).toBe("0.25");
  });

  it("적용에 성공한 뒤에만 다른 모드 입력을 비운다", () => {
    render(<CompensationCalculator />);
    fireEvent.click(screen.getByRole("button", { name: "자동차 사고 · 사망" }));
    const death = within(screen.getByTestId("compensation-death-panel"));
    fireEvent.change(death.getByPlaceholderText("예: 0.30"), { target: { value: "0.2" } });

    applyCase(injuryFile());
    expect(death.getByPlaceholderText<HTMLInputElement>("예: 0.30").value).toBe("");
    expect(screen.getByTestId("compensation-injury-panel").className).toBe("contents");
  });
});
