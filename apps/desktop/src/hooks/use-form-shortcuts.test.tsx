// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ResetHint } from "../components/layout/ResetHint";
import { useFormShortcuts } from "./use-form-shortcuts";

const Probe = ({ onReset }: { onReset: () => void }) => {
  useFormShortcuts({ onReset });
  return <ResetHint />;
};

const esc = () => fireEvent.keyDown(window, { key: "Escape" });

describe("Esc 초기화 확인", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("첫 Esc 는 안내만 띄우고, 2초 안의 두 번째 Esc 에서 초기화한다", () => {
    const onReset = vi.fn();
    render(<Probe onReset={onReset} />);

    esc();
    expect(onReset).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("한 번 더");

    vi.advanceTimersByTime(1500);
    esc();
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("2초가 지나면 다시 첫 Esc 로 취급하고 안내도 사라진다", () => {
    const onReset = vi.fn();
    render(<Probe onReset={onReset} />);

    esc();
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.queryByRole("status")).toBeNull();
    esc();
    expect(onReset).not.toHaveBeenCalled();
  });

  it("두 번째 Esc 로 초기화하면 안내를 바로 내린다", () => {
    const onReset = vi.fn();
    render(<Probe onReset={onReset} />);

    esc();
    expect(screen.getByRole("status")).toBeTruthy();
    esc();
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
