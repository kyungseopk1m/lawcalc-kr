// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ServiceDateSwitch } from "./ServiceDateSwitch";

afterEach(cleanup);

describe("ServiceDateSwitch (소촉법 제3조 제1항)", () => {
  it("송달일을 넣으면 송달일까지 프리셋, 다음 날부터 소촉법 이율 구간을 채운다", () => {
    const onApply = vi.fn();
    render(
      <ServiceDateSwitch
        preset="civil"
        customRate={0.05}
        startDate="2024-01-01"
        endDate="2024-12-31"
        onApply={onApply}
      />,
    );
    const button = screen.getByRole("button", { name: "구간 채우기" });
    expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText(/소장 송달일/), { target: { value: "2024-03-15" } });
    fireEvent.click(button);
    expect(onApply).toHaveBeenCalledWith([
      { from: "2024-01-01", to: "2024-03-15", rate: 0.05 },
      { from: "2024-03-16", to: "2024-12-31", rate: 0.12 },
    ]);
  });

  it("소촉법 프리셋에서는 쓸 수 없다", () => {
    render(
      <ServiceDateSwitch
        preset="promotion"
        customRate={0.05}
        startDate="2024-01-01"
        endDate="2024-12-31"
        onApply={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText(/소장 송달일/), { target: { value: "2024-03-15" } });
    expect(screen.getByRole("button", { name: "구간 채우기" }).hasAttribute("disabled")).toBe(true);
  });

  it("오류는 원인별로 알린다 (소촉법 이율 시작 전 / 직접 입력 이율)", () => {
    const { rerender } = render(
      <ServiceDateSwitch
        preset="civil"
        customRate={0.05}
        startDate="2003-01-01"
        endDate="2003-12-31"
        onApply={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText(/소장 송달일/), { target: { value: "2003-05-01" } });
    fireEvent.click(screen.getByRole("button", { name: "구간 채우기" }));
    expect(screen.getByText(/2003-06-01부터 있습니다/)).toBeTruthy();

    rerender(
      <ServiceDateSwitch
        preset="custom"
        customRate={Number.NaN}
        startDate="2024-01-01"
        endDate="2024-12-31"
        onApply={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText(/소장 송달일/), { target: { value: "2024-03-15" } });
    fireEvent.click(screen.getByRole("button", { name: "구간 채우기" }));
    expect(screen.getByText("직접 입력한 이율을 확인해 주세요.")).toBeTruthy();
    expect(screen.queryByText(/2003-06-01/)).toBeNull();
  });

  it("장래이행의 소(민사소송법 제251조) 제외 단서를 안내한다", () => {
    render(
      <ServiceDateSwitch
        preset="civil"
        customRate={0.05}
        startDate="2024-01-01"
        endDate="2024-12-31"
        onApply={() => {}}
      />,
    );
    expect(screen.getByText(/민사소송법 제251조/)).toBeTruthy();
  });
});
