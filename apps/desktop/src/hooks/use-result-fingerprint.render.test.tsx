// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
  type BoundFunctions,
  type queries,
} from "@testing-library/react";

import type * as IpcModule from "../lib/ipc";

/**
 * 결과-입력 지문. 계산한 뒤 입력을 바꾸면 옛 결과가 내보내기·`.lcalc` 저장으로 나가지 않아야
 * 한다. 화면마다 "계산 → 입력 변경 → 버튼 비활성 + 안내" 를 확인한다.
 */
const { savedFiles, loadQueue } = vi.hoisted(() => ({
  savedFiles: [] as unknown[],
  loadQueue: [] as unknown[],
}));

vi.mock("../lib/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof IpcModule>();
  return {
    ...actual,
    ipc: {
      saveLcalc: (file: unknown) => {
        savedFiles.push(JSON.parse(JSON.stringify(file)));
        return Promise.resolve("/tmp/test.lcalc");
      },
      loadLcalc: () => Promise.resolve(loadQueue.shift() ?? null),
      copyToClipboard: () => Promise.resolve(),
    },
  };
});

const { App } = await import("../App");
const { ThemeProvider } = await import("../contexts/ThemeContext");
const { AppropriationCalculator } = await import("../views/AppropriationCalculator");
const { CompensationCalculator } = await import("../views/CompensationCalculator");
const { DeadlineCalculator } = await import("../views/DeadlineCalculator");
const { InheritanceCalculator } = await import("../views/InheritanceCalculator");
const { LitigationCostCalculator } = await import("../views/LitigationCostCalculator");
const { PeriodCalculator } = await import("../views/PeriodCalculator");

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
beforeEach(() => {
  savedFiles.length = 0;
  loadQueue.length = 0;
});
afterEach(cleanup);

type View = BoundFunctions<typeof queries>;

const calculate = (view: View) => fireEvent.click(view.getByRole("button", { name: "계산" }));
const change = (element: HTMLElement, value: string) =>
  fireEvent.change(element, { target: { value } });
const button = (view: View, name: string) => view.getByRole<HTMLButtonElement>("button", { name });

function expectStale(view: View, exportButtons: string[]) {
  expect(view.getByTestId("result-freshness-notice").textContent).toContain(
    "결과가 지금 입력과 맞지 않습니다",
  );
  for (const name of [...exportButtons, ".lcalc 저장"]) {
    expect(button(view, name).disabled).toBe(true);
  }
}

function expectFresh(view: View, exportButtons: string[]) {
  expect(view.queryByTestId("result-freshness-notice")).toBeNull();
  for (const name of [...exportButtons, ".lcalc 저장"]) {
    expect(button(view, name).disabled).toBe(false);
  }
}

describe("결과-입력 지문: 계산 뒤 입력을 바꾸면 내보내기·저장을 막는다", () => {
  it("이자: 입력 오류로 자동 계산이 멈추면 옛 결과를 내보내지 않는다", () => {
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );
    const view = within(document.getElementById("tabpanel-interest") as HTMLElement);
    expectFresh(view, ["PDF", "CSV"]);

    change(view.getByLabelText("종료일"), "2000-01-01");

    expectStale(view, ["PDF", "CSV"]);
  });

  it("상속: 사망일을 바꾸면 결과가 낡았다고 표시한다", () => {
    render(<InheritanceCalculator />);
    const view = within(document.body);
    calculate(view);
    expectFresh(view, ["PDF", "CSV", "복사"]);

    change(view.getByLabelText("사망일"), "2024-01-01");

    expectStale(view, ["PDF", "CSV", "복사"]);
  });

  it("소송비용: 소가를 5억으로 바꾸면 Ctrl+S 로도 옛 결과(인지대 140,000원)를 저장하지 못한다", async () => {
    render(<LitigationCostCalculator />);
    const view = within(document.body);
    calculate(view);
    expect(view.getByText("140,000원")).toBeTruthy();
    expectFresh(view, ["PDF", "CSV", "복사"]);

    change(view.getByLabelText("소가"), "500000000");
    expectStale(view, ["PDF", "CSV", "복사"]);

    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await waitFor(() =>
      expect(view.getByText("계산 후 .lcalc 파일을 저장해 주세요.")).toBeTruthy(),
    );
    expect(savedFiles).toHaveLength(0);

    // 다시 계산하면 새 소가의 인지대로 저장된다.
    calculate(view);
    expectFresh(view, ["PDF", "CSV", "복사"]);
    fireEvent.click(button(view, ".lcalc 저장"));
    await waitFor(() => expect(savedFiles).toHaveLength(1));
    const saved = savedFiles[0] as {
      payload: { result: { stampDuty: { amount: number } } };
    };
    expect(saved.payload.result.stampDuty.amount).toBe(2_055_000);
  });

  it("변제충당: 변제 금액을 바꾸면 결과가 낡았다고 표시한다", () => {
    render(<AppropriationCalculator />);
    const view = within(document.body);
    calculate(view);
    expectFresh(view, ["복사"]);

    change(view.getByLabelText("변제 금액"), "700000");

    expectStale(view, ["복사"]);
  });

  it("손해배상: 과실비율을 고치면 결과가 낡고, 이전 오류 배너도 사라진다", () => {
    render(<CompensationCalculator />);
    const view = within(screen.getByTestId("compensation-injury-panel"));
    const fault = view.getByPlaceholderText("예: 0.30");

    change(fault, "30");
    calculate(view);
    expect(view.getByText(/^과실비율: /)).toBeTruthy();
    change(fault, "0.3");
    expect(view.queryByText(/^과실비율: /)).toBeNull();

    calculate(view);
    expectFresh(view, ["PDF", "CSV", "복사"]);
    change(fault, "0.4");
    expectStale(view, ["PDF", "CSV", "복사"]);
  });

  it("기간: 기간 수량을 바꾸면 결과가 낡았다고 표시한다", () => {
    render(<PeriodCalculator />);
    const view = within(document.body);
    calculate(view);
    expectFresh(view, ["복사"]);

    change(view.getByLabelText("기간 수량"), "30");

    expectStale(view, ["복사"]);
  });

  it("불변기한: 기산 사건일을 바꾸면 결과가 낡았다고 표시한다", () => {
    render(<DeadlineCalculator />);
    const view = within(document.body);
    change(view.getByLabelText(/기산 사건일/), "2026-09-05");
    calculate(view);
    expectFresh(view, ["복사"]);

    change(view.getByLabelText(/기산 사건일/), "2026-09-10");

    expectStale(view, ["복사"]);
  });
});

describe(".lcalc 열기: 현재 엔진으로 다시 계산한다", () => {
  it("손해배상 구 결과는 재계산 값으로 바꿔 보이고 저장 당시 금액과 다르다고 알린다", async () => {
    render(<CompensationCalculator />);
    const view = within(screen.getByTestId("compensation-injury-panel"));
    change(view.getByPlaceholderText("예: 5,000,000"), "10000000");
    calculate(view);
    fireEvent.click(button(view, ".lcalc 저장"));
    await waitFor(() => expect(savedFiles).toHaveLength(1));

    // 구 엔진이 남긴 결과처럼 최종액만 다르게 만든다.
    const file = savedFiles[0] as { payload: { result: { finalWon: number } } };
    const currentFinal = file.payload.result.finalWon;
    file.payload.result.finalWon = currentFinal + 1_000_000;
    loadQueue.push(file);

    fireEvent.click(button(view, ".lcalc 열기"));

    await waitFor(() =>
      expect(view.getByTestId("result-freshness-notice").textContent).toContain(
        "저장 당시 결과와 다릅니다",
      ),
    );
    const notice = view.getByTestId("result-freshness-notice").textContent ?? "";
    expect(notice).toContain(`저장 ${(currentFinal + 1_000_000).toLocaleString("ko-KR")}원`);
    expect(notice).toContain(`현재 ${currentFinal.toLocaleString("ko-KR")}원`);
    // 재계산이 성공했으므로 결과는 입력과 맞고, 내보내기·저장이 열려 있다.
    expect(notice).not.toContain("결과가 지금 입력과 맞지 않습니다");
    expect(button(view, ".lcalc 저장").disabled).toBe(false);
  });
});

describe("열기 → 계산 왕복: 표시값과 지문이 그대로다", () => {
  async function saveAndReload(view: View) {
    fireEvent.click(button(view, ".lcalc 저장"));
    await waitFor(() => expect(savedFiles).toHaveLength(1));
    loadQueue.push(savedFiles[0]);
    fireEvent.click(button(view, ".lcalc 열기"));
    await waitFor(() => expect(view.getByText(".lcalc 파일을 불러왔습니다.")).toBeTruthy());
  }

  it("손해배상", async () => {
    render(<CompensationCalculator />);
    const view = within(screen.getByTestId("compensation-injury-panel"));
    change(view.getByPlaceholderText("예: 0.30"), "30%");
    change(view.getByPlaceholderText("예: 5,000,000"), "10000000");
    calculate(view);
    await saveAndReload(view);

    const final = (savedFiles[0] as { payload: { result: { finalWon: number } } }).payload.result
      .finalWon;
    const finalText = `${final.toLocaleString("ko-KR")}원`;
    expectFresh(view, ["PDF", "CSV", "복사"]);
    expect(view.getAllByText(finalText).length).toBeGreaterThan(0);
    calculate(view);
    expectFresh(view, ["PDF", "CSV", "복사"]);
    expect(view.getAllByText(finalText).length).toBeGreaterThan(0);
  });

  it("기간", async () => {
    render(<PeriodCalculator />);
    const view = within(document.body);
    change(view.getByLabelText("기간 수량"), "1");
    calculate(view);
    const before = view.getByTestId("period-expiry-date").textContent;
    await saveAndReload(view);

    expectFresh(view, ["복사"]);
    expect(view.getByTestId("period-expiry-date").textContent).toBe(before);
    calculate(view);
    expectFresh(view, ["복사"]);
    expect(view.getByTestId("period-expiry-date").textContent).toBe(before);
  });

  it("불변기한", async () => {
    render(<DeadlineCalculator />);
    const view = within(document.body);
    change(view.getByLabelText(/기산 사건일/), "2026-09-05");
    calculate(view);
    const before = view.getByTestId("deadline-expiry-date").textContent;
    await saveAndReload(view);

    expectFresh(view, ["복사"]);
    expect(view.getByTestId("deadline-expiry-date").textContent).toBe(before);
    calculate(view);
    expectFresh(view, ["복사"]);
    expect(view.getByTestId("deadline-expiry-date").textContent).toBe(before);
  });
});

describe("손해배상 사건 파일: 부상·사망 두 view 를 함께 마운트한 뒤", () => {
  type CaseFile = {
    payload: { calculations: { compensation?: { payload: { input: { mode?: string } } } } };
  };
  const compensationModeOf = (file: unknown) =>
    (file as CaseFile).payload.calculations.compensation?.payload.input.mode ?? "injury";

  function setup() {
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("tab", { name: "손해배상" }));
    return {
      injury: within(screen.getByTestId("compensation-injury-panel")),
      death: within(screen.getByTestId("compensation-death-panel")),
      toMode: (name: "부상" | "사망") =>
        fireEvent.click(screen.getByRole("button", { name: `자동차 사고 · ${name}` })),
      saveCase: async () => {
        const count = savedFiles.length;
        fireEvent.click(screen.getByRole("button", { name: /사건 저장/ }));
        await waitFor(() => expect(savedFiles).toHaveLength(count + 1));
        return savedFiles[count];
      },
      openCase: async (file: unknown) => {
        loadQueue.push(file);
        fireEvent.click(screen.getByRole("button", { name: /사건 열기/ }));
        await waitFor(() => expect(screen.getByText(/사건 파일을 불러왔습니다/)).toBeTruthy());
      },
    };
  }

  it("부상만 고치고 사망 화면에서 사건 저장하면 부상 계산이 들어간다", async () => {
    const { injury, toMode, saveCase } = setup();
    change(injury.getByPlaceholderText("예: 0.30"), "0.25");
    toMode("사망");

    const saved = await saveCase();

    expect(compensationModeOf(saved)).toBe("injury");
  });

  it("두 모드 모두 입력이 있으면 지금 모드를 저장하고 빠진 모드를 알린다", async () => {
    const { injury, death, toMode, saveCase } = setup();
    change(injury.getByPlaceholderText("예: 0.30"), "0.25");
    toMode("사망");
    change(death.getByPlaceholderText("예: 0.30"), "0.15");

    const saved = await saveCase();

    expect(compensationModeOf(saved)).toBe("death");
    expect(screen.getByText(/손해배상 부상 입력은 이 사건 파일에 들어가지 않습니다/)).toBeTruthy();
  });

  it("사망 사건을 연 뒤 부상 사건을 열면 사망 입력이 비워져 다음 저장에 섞이지 않는다", async () => {
    const { injury, death, toMode, saveCase, openCase } = setup();
    toMode("사망");
    change(death.getByPlaceholderText("예: 0.30"), "0.15");
    const caseA = await saveCase();
    toMode("부상");
    change(injury.getByPlaceholderText("예: 0.30"), "0.25");
    const caseB = await saveCase();
    expect(compensationModeOf(caseA)).toBe("death");
    expect(compensationModeOf(caseB)).toBe("injury");

    await openCase(caseA);
    expect(death.getByPlaceholderText<HTMLInputElement>("예: 0.30").value).toBe("0.15");
    await openCase(caseB);
    expect(death.getByPlaceholderText<HTMLInputElement>("예: 0.30").value).not.toBe("0.15");

    toMode("사망");
    const caseC = await saveCase();
    expect(compensationModeOf(caseC)).toBe("injury");
  });
});
