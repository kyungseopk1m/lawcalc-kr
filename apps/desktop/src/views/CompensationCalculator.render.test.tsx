// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { computeCompensation, computeCompensationDeath } from "@lawcalc-kr/compensation";

import { applyCaseCalculations, caseMismatchNotice } from "../lib/case-file";
import type { LcalcCaseCalculationKey, LcalcFile } from "../lib/ipc";
import { useHasUnsavedLcalcChanges } from "../lib/lcalc-dirty-state";
import { todayIso } from "../lib/today";
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

  it("공제 칸: 비율공제·지급치료비는 항목 금액 × 기왕증·과실 계수, 이전 방식 칸은 기본으로 없다", () => {
    const view = renderInjury();
    expect(
      view.getByText(/항목 금액 ×\s*\[1 − \(1 − 기왕증\)\(1 − 과실\)\]을 재산상 손해에서 뺍니다/),
    ).toBeTruthy();
    expect(view.getByText(/기왕치료비에 넣지 말고 여기 넣으세요/)).toBeTruthy();
    expect(
      view.getByText(/기왕치료비에 이미 넣었다면 지급치료비 대신 전액공제에 넣으세요/),
    ).toBeTruthy();
    expect(view.queryByTestId("compensation-legacy-ratio-deductions")).toBeNull();
  });

  it("새 입력은 계산 기준일 = 오늘, 노임 적용일 규약 = 조사 시점이 기본값이다", () => {
    const view = renderInjury();
    expect(view.getByLabelText<HTMLInputElement>(/^계산 기준일/).value).toBe(todayIso());
    expect(view.getByLabelText<HTMLSelectElement>(/^노임 적용일 규약/).value).toBe("survey");
    expect(view.queryByTestId("compensation-legacy-labor-rate-notice")).toBeNull();
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

describe("R2-a 이전 버전 파일 (계산 기준일 없음 · 구 비율공제)", () => {
  function legacyFile() {
    const file = injuryFile();
    const input = file.payload.input as {
      base: Record<string, unknown>;
      deductions?: Record<string, unknown>;
    };
    delete input.base.calculationDate;
    delete input.base.laborRateEffectiveRule;
    input.deductions = { ratio: [{ label: "기타", ratio: 0.1 }] };
    file.envelopeFeatures = ["compensation@4"];
    return file;
  }

  it("공표 적용일·기준일 = 사고일로 열고, 구 비율공제는 이전 방식 칸에 보존하며 안내한다", () => {
    const view = renderInjury();
    applyCase(legacyFile());
    expect(view.getByLabelText<HTMLInputElement>(/^계산 기준일/).value).toBe(
      view.getByLabelText<HTMLInputElement>("사고일자").value,
    );
    expect(view.getByLabelText<HTMLSelectElement>(/^노임 적용일 규약/).value).toBe("published");
    const notice = view.getByTestId("compensation-legacy-labor-rate-notice").textContent ?? "";
    expect(notice).toContain("이전 버전 파일이라 ");
    expect(notice).toContain("저장 당시 방식대로 열었습니다");
    expect(notice).not.toContain("저장 당시 금액");
    expect(notice).toContain("이전 방식 비율공제를 지우고");
    expect(view.getByTestId("compensation-legacy-ratio-deductions")).toBeTruthy();
    expect(view.getByLabelText<HTMLInputElement>("이전 방식 비율공제 비율 (0~1)").value).toBe(
      "0.1",
    );
  });

  it("저장 결과와 금액이 다르면(C7 절사 등) 저장 당시와 다르다고 알린다", () => {
    renderInjury();
    const file = injuryFile();
    (file.payload as unknown as { result: { finalWon: number } }).result.finalWon += 300;
    expect(applyCase(file)).toEqual(["compensation"]);
    expect(screen.getByTestId("result-freshness-notice").textContent).toContain(
      "저장 당시 결과와 다릅니다",
    );
  });

  it("새 파일은 안내 없이 저장된 기준일·규약대로 연다", () => {
    const view = renderInjury();
    applyCase(injuryFile());
    expect(view.queryByTestId("compensation-legacy-labor-rate-notice")).toBeNull();
    expect(view.getByLabelText<HTMLSelectElement>(/^노임 적용일 규약/).value).toBe("survey");
  });
});

describe("R2-a 산재 사망 유족급여 입력 (2008다13104)", () => {
  function renderDeathIndustrial() {
    render(<CompensationCalculator />);
    fireEvent.click(screen.getByRole("button", { name: "자동차 사고 · 사망" }));
    const death = within(screen.getByTestId("compensation-death-panel"));
    fireEvent.click(death.getByRole("button", { name: "산재" }));
    return death;
  }

  it("상속인이 없으면 총액 칸, 상속인을 켜면 총액 칸 대신 수급권자 입력이고 첫 줄은 첫 상속인이다", () => {
    const death = renderDeathIndustrial();
    expect(death.getByTestId("compensation-survivor-benefit-input")).toBeTruthy();
    expect(death.queryByTestId("compensation-survivor-recipients")).toBeNull();

    fireEvent.click(death.getByLabelText("상속분 분배 사용"));
    fireEvent.change(death.getByPlaceholderText("예: 배우자"), { target: { value: "배우자" } });
    expect(death.queryByTestId("compensation-survivor-benefit-input")).toBeNull();
    const recipients = within(death.getByTestId("compensation-survivor-recipients"));
    fireEvent.click(recipients.getByRole("button", { name: "추가" }));
    expect(recipients.getByLabelText<HTMLSelectElement>("유족급여 수급권자").value).toBe("배우자");
  });

  function deathFileWith(patch: Partial<ReturnType<typeof defaultCompensationDeathFormState>>) {
    const state = {
      ...defaultCompensationDeathFormState(),
      accidentType: "industrial" as const,
      includeHeirs: true,
      spouse: { alive: true, name: "배우자" },
      linealDescendants: [
        { id: "c1", name: "자녀", deceasedBeforeOpening: false, representatives: [] },
      ],
      ...patch,
    };
    const input = buildCompensationDeathInput(state);
    return JSON.parse(
      JSON.stringify(buildCompensationDeathLcalcFile(input, computeCompensationDeath(input), "")),
    ) as LcalcFile;
  }

  it("상속인 + 유족급여 총액만 든 이전 파일을 열면 총액 칸과 이전 방식 안내가 뜬다", () => {
    render(<CompensationCalculator />);
    const death = within(screen.getByTestId("compensation-death-panel"));
    const file = deathFileWith({ survivorBenefitWonText: "150000000" });
    (file as unknown as { envelopeFeatures: string[] }).envelopeFeatures = ["compensation@3"];
    applyCase(file);
    expect(death.getByTestId<HTMLInputElement>("compensation-survivor-benefit-input").value).toBe(
      "150,000,000",
    );
    expect(death.getByTestId("compensation-survivor-total-legacy-notice").textContent).toContain(
      "이전 방식(유족급여 총액을 먼저 공제한 뒤 상속)",
    );
  });

  it("수급권자별 결과 카드는 소계가 상속인별 버림 합이라는 각주를 단다", () => {
    render(<CompensationCalculator />);
    const death = within(screen.getByTestId("compensation-death-panel"));
    applyCase(
      deathFileWith({
        solatiumWonText: "100000000",
        faultRatioText: "0.3",
        survivorRecipients: [{ uid: "s1", heirName: "배우자", amountText: "150000000" }],
      }),
    );
    expect(death.getByTestId("compensation-heir-subtotal-note").textContent).toContain(
      "상속인별 몫(원 미만 버림)의 합",
    );
    expect(death.queryByTestId("compensation-survivor-total-legacy-notice")).toBeNull();
  });

  it("상속인 이름이 겹치면 수급권자를 지정할 수 없다고 미리 알린다", () => {
    render(<CompensationCalculator />);
    const death = within(screen.getByTestId("compensation-death-panel"));
    applyCase(
      deathFileWith({
        spouse: { alive: false, name: "" },
        linealDescendants: [
          { id: "c1", name: "자녀", deceasedBeforeOpening: false, representatives: [] },
          { id: "c2", name: "자녀", deceasedBeforeOpening: false, representatives: [] },
        ],
      }),
    );
    expect(death.getByTestId("compensation-duplicate-heir-names").textContent).toContain(
      "상속인 이름이 서로 달라야 수급권자를 지정할 수 있습니다",
    );
  });

  it("상속인을 켜기 전에 넣은 총액은 보이게 두고 이전 방식이라고 알린다", () => {
    const death = renderDeathIndustrial();
    fireEvent.change(death.getByTestId("compensation-survivor-benefit-input"), {
      target: { value: "150000000" },
    });
    fireEvent.click(death.getByLabelText("상속분 분배 사용"));
    expect(death.getByTestId("compensation-survivor-benefit-input")).toBeTruthy();
    expect(death.getByTestId("compensation-survivor-total-legacy-notice").textContent).toContain(
      "이전 방식(유족급여 총액을 먼저 공제한 뒤 상속)",
    );
  });
});

describe("R2-a 엔진 대체 처리 경고", () => {
  it("직종 조사가 중단돼 마지막 단가를 이어 쓰면 결과 카드에 엔진 문구를 그대로 띄운다", () => {
    const view = renderInjury();
    const file = injuryFile();
    const input = file.payload.input as {
      base: Record<string, unknown>;
      lostIncome: Record<string, unknown>;
    };
    Object.assign(input.base, {
      birthDate: "1970-01-01",
      accidentDate: "2009-03-01",
      treatmentEndDate: "2009-03-01",
      calculationDate: "2012-01-01",
      laborRateEffectiveRule: "published",
    });
    input.lostIncome.occupation = "갱부";
    applyCase(file);
    expect(view.getByTestId("compensation-engine-warnings").textContent).toContain(
      "갱부 직종은 2010-01-01 이후 조사되지 않아",
    );
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
