// @vitest-environment jsdom
import { beforeAll, afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { App } from "./App";
import { ThemeProvider } from "./contexts/ThemeContext";

/**
 * 이자 탭의 프리셋 커버리지 안내 — 화면까지 실제로 닿는지 본다.
 *
 * 프리셋이 계산 기간을 못 덮으면 `resolveSegments` 가 함수명과 영어 지시문이 든 RangeError 를
 * 던지고 그 문구가 결과 영역에 그대로 노출됐다. 검증 함수만 만들어 두고 표시 경로가 끊기면
 * 고친 게 아니므로(실제로 한 번 끊겨 있었다) 렌더까지 확인한다.
 */
afterEach(cleanup);

// jsdom 에는 matchMedia 가 없다. ThemeProvider 의 시스템 테마 판정에만 쓰이므로 최소 stub.
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

/** main.tsx 와 같은 provider 조합으로 띄운다. */
const renderApp = () =>
  render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  );

describe("법정이율 프리셋 커버리지 안내", () => {
  /** 다섯 탭 패널이 모두 DOM 에 있으므로(숨김은 CSS) 이자 패널로 범위를 좁힌다. */
  const setup = () => {
    renderApp();
    const panel = within(document.getElementById("tabpanel-interest") as HTMLElement);
    fireEvent.change(panel.getByLabelText("시작일"), { target: { value: "2001-01-01" } });
    fireEvent.change(panel.getByLabelText("종료일"), { target: { value: "2026-01-01" } });
    return panel;
  };

  it("소촉법 + 2003-06-01 이전이면 한국어 안내가 화면에 뜨고 계산이 막힌다", () => {
    const panel = setup();
    fireEvent.change(panel.getByLabelText(/법정이율 프리셋/), {
      target: { value: "promotion" },
    });

    const alert = panel.getByRole("alert");
    expect(alert.textContent).toContain("2003-06-01");
    expect(alert.textContent).toContain("이율 구간");
    // 개발자용 문구가 사용자 화면에 새지 않는다.
    expect(alert.textContent).not.toContain("resolveSegments");
    expect(panel.getByRole("button", { name: "계산" })).toHaveProperty("disabled", true);
  });

  it("민법 프리셋은 같은 기간에서도 막지 않는다", () => {
    const panel = setup();
    fireEvent.change(panel.getByLabelText(/법정이율 프리셋/), { target: { value: "civil" } });

    expect(panel.queryByRole("alert")).toBeNull();
    expect(panel.getByRole("button", { name: "계산" })).toHaveProperty("disabled", false);
  });
});

/** 탭이 시맨틱 탭으로 노출되고 활성 탭이 색 외의 표시를 갖는지. */
describe("상단 탭 접근성", () => {
  it("tablist / tab / aria-selected 가 붙는다", () => {
    renderApp();
    expect(screen.getByRole("tablist")).toBeTruthy();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(8);

    const interest = screen.getByRole("tab", { name: "이자 계산" });
    expect(interest.getAttribute("aria-selected")).toBe("true");
    // 색 외의 표시(밑줄 막대와 굵기)가 활성 탭에만 붙는다.
    expect(interest.className).toContain("border-primary");
    expect(interest.className).toContain("font-semibold");

    const litigation = screen.getByRole("tab", { name: "소송비용" });
    expect(litigation.getAttribute("aria-selected")).toBe("false");
    expect(litigation.className).not.toContain("border-primary");
    expect(litigation.className).not.toContain("font-semibold");

    fireEvent.click(litigation);
    expect(litigation.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "이자 계산" }).getAttribute("aria-selected")).toBe(
      "false",
    );
  });

  it("좌우 화살표로 옮기고, 탭 순서에는 선택된 탭 하나만 있다", () => {
    renderApp();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.tabIndex)).toEqual(tabs.map((_, i) => (i === 0 ? 0 : -1)));
    fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" });
    expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[1]);
    fireEvent.keyDown(tabs[1]!, { key: "ArrowLeft" });
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
  });
});

describe("도구 하위 탭", () => {
  const openTools = () => {
    renderApp();
    fireEvent.click(screen.getByRole("tab", { name: "도구" }));
    return within(screen.getByRole("tablist", { name: "도구" }));
  };

  it("좌우 화살표·Home·End 로 옮기고, 탭 순서에는 선택된 탭 하나만 있다", () => {
    const tools = openTools();
    const tabs = tools.getAllByRole("tab");
    const last = tabs.length - 1;
    const order = (selected: number) => tabs.map((_, i) => (i === selected ? 0 : -1));
    expect(tabs).toHaveLength(8);
    expect(tabs.map((t) => t.tabIndex)).toEqual(order(0));

    fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" });
    expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs.map((t) => t.tabIndex)).toEqual(order(1));

    fireEvent.keyDown(tabs[1]!, { key: "End" });
    expect(document.activeElement).toBe(tabs[last]);
    fireEvent.keyDown(tabs[last]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs[0]);
    fireEvent.keyDown(tabs[0]!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tabs[last]);
    fireEvent.keyDown(tabs[last]!, { key: "Home" });
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
  });

  it("여명표·노임표는 다른 하위 탭에 다녀와도 검색어가 남는다", () => {
    const tools = openTools();
    fireEvent.click(tools.getByRole("tab", { name: "여명표·노임표" }));
    fireEvent.change(screen.getByLabelText(/나이 검색/), { target: { value: "30" } });
    fireEvent.click(tools.getByRole("tab", { name: "계산기" }));
    fireEvent.click(tools.getByRole("tab", { name: "여명표·노임표" }));
    expect(screen.getByLabelText<HTMLInputElement>(/나이 검색/).value).toBe("30");
  });
});
