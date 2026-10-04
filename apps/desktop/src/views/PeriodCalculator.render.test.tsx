// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type * as IpcModule from "../lib/ipc";

/**
 * 기간 계산 탭의 DOM 렌더 테스트.
 *
 * 엔진이 돌려주는 값 중 화면 배선이 끊기면 조용히 사라지는 것들만 표적으로 본다.
 * 특히 제161조 판정 상태는 네 값(off/notApplied/applied/outOfCoverage)이고, 그중
 * "연장 없음"과 "판정하지 못했습니다"를 한 문구로 뭉개면 사용자는 커버리지 밖 날짜를
 * 연장 없는 날로 오해한다.
 */
const { savedFiles } = vi.hoisted(() => ({ savedFiles: [] as unknown[] }));

vi.mock("../lib/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof IpcModule>();
  return {
    ...actual,
    ipc: {
      saveLcalc: (file: unknown) => {
        savedFiles.push(JSON.parse(JSON.stringify(file)));
        return Promise.resolve("/tmp/period.lcalc");
      },
      loadLcalc: () => Promise.resolve(savedFiles.at(-1) ?? null),
      copyToClipboard: () => Promise.resolve(),
    },
  };
});

const { PeriodCalculator } = await import("./PeriodCalculator");

beforeEach(() => {
  savedFiles.length = 0;
});
afterEach(cleanup);

function setDate(labelPattern: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(labelPattern), { target: { value } });
}

function calculate() {
  fireEvent.click(screen.getByRole("button", { name: "계산" }));
}

describe("기간 계산 결과 노출", () => {
  it("만료일이 화면에 나온다", () => {
    render(<PeriodCalculator />);
    setDate(/기산의 기초가 되는 날/, "2026-09-04");
    fireEvent.change(screen.getByLabelText("기간 수량"), { target: { value: "1" } });
    calculate();

    // 2026-09-05(토)가 말일이라 제161조로 2026-09-07(월)까지 밀린다.
    expect(screen.getByTestId("period-expiry-date").textContent).toBe("2026-09-07");
    expect(screen.getByTestId("period-raw-expiry-date").textContent).toBe("2026-09-05");
  });

  it("제161조로 밀린 경우 그 사유가 화면에 보인다", () => {
    render(<PeriodCalculator />);
    setDate(/기산의 기초가 되는 날/, "2026-09-04");
    fireEvent.change(screen.getByLabelText("기간 수량"), { target: { value: "1" } });
    calculate();

    expect(screen.getByTestId("period-extension-status").textContent).toContain("익일로 연장");
    expect(screen.getByTestId("period-adjustment-reason").textContent).toContain("제161조 적용");
  });

  it("커버리지 밖 만료일은 만료일을 내되 판정하지 못했다고 알린다", () => {
    render(<PeriodCalculator />);
    setDate(/기산의 기초가 되는 날/, "2030-01-01");
    fireEvent.change(screen.getByLabelText("기간 수량"), { target: { value: "1" } });
    calculate();

    // 계산 자체는 막지 않는다. 판정만 못 했으므로 조정 전 만료일이 그대로 만료일이 된다.
    expect(screen.getByTestId("period-expiry-date").textContent).toBe("2030-01-02");
    expect(screen.getByTestId("period-extension-status").textContent).toContain(
      "판정하지 못했습니다",
    );
    expect(screen.getByTestId("period-adjustment-reason").textContent).toContain(
      "제161조 판정 불가",
    );
  });

  it("2008-03-22 이전 토요일 말일은 커버리지 안이어도 판정하지 못한 사유를 함께 낸다", () => {
    render(<PeriodCalculator />);
    // 2008-03-14(금) + 1일 = 2008-03-15(토). 토요일 말일 연장 시행 전이다.
    setDate(/기산의 기초가 되는 날/, "2008-03-14");
    fireEvent.change(screen.getByLabelText("기간 수량"), { target: { value: "1" } });
    calculate();

    expect(screen.getByTestId("period-expiry-date").textContent).toBe("2008-03-15");
    expect(screen.getByTestId("period-extension-status").textContent).toContain(
      "2008-03-22 이전 토요일",
    );
    expect(screen.getByTestId("period-adjustment-reason").textContent).toContain("2008-03-22");
  });

  it("두 날짜 사이 기간은 일수와 역법 환산을 함께 낸다", () => {
    render(<PeriodCalculator />);
    fireEvent.change(screen.getByLabelText("계산 방식"), { target: { value: "span" } });
    setDate(/기산의 기초가 되는 날/, "2026-01-01");
    setDate(/종료일/, "2026-01-31");
    calculate();

    expect(screen.getByText("30일")).toBeTruthy();
    expect(screen.getByText("역법 환산 (참고)")).toBeTruthy();
  });
});

describe(".lcalc 왕복", () => {
  it("저장한 파일을 다시 열면 입력이 그대로 복원된다", async () => {
    render(<PeriodCalculator />);
    setDate(/기산의 기초가 되는 날/, "2026-02-10");
    fireEvent.change(screen.getByLabelText("계산 방식"), { target: { value: "expiry" } });
    fireEvent.change(screen.getByLabelText("기간 수량"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("단위"), { target: { value: "month" } });
    fireEvent.click(screen.getByLabelText(/초일 산입/));
    calculate();

    const expiry = screen.getByTestId("period-extension-status").textContent;
    fireEvent.click(screen.getByRole("button", { name: ".lcalc 저장" }));
    await waitFor(() => expect(savedFiles).toHaveLength(1));

    // 입력을 흐트러뜨린 뒤 다시 연다.
    setDate(/기산의 기초가 되는 날/, "2020-01-01");
    fireEvent.change(screen.getByLabelText("기간 수량"), { target: { value: "99" } });
    fireEvent.change(screen.getByLabelText("단위"), { target: { value: "day" } });
    fireEvent.click(screen.getByLabelText(/초일 산입/));

    fireEvent.click(screen.getByRole("button", { name: ".lcalc 열기" }));
    await waitFor(() =>
      expect(screen.getByLabelText(/기산의 기초가 되는 날/)).toHaveProperty("value", "2026-02-10"),
    );
    expect(screen.getByLabelText("기간 수량")).toHaveProperty("value", "3");
    expect(screen.getByLabelText("단위")).toHaveProperty("value", "month");
    expect(screen.getByLabelText(/초일 산입/)).toHaveProperty("checked", true);
    expect(screen.getByTestId("period-extension-status").textContent).toBe(expiry);
  });
});

describe("공휴일 데이터셋 안내", () => {
  it("커버리지와 데이터셋 버전을 배지로 낸다", () => {
    render(<PeriodCalculator />);
    const badge = screen.getByTestId("period-stale-badge");
    expect(badge.textContent).toContain("holidays/v");
    expect(badge.textContent).toContain("2027-12-31");
  });
});
