// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useUpdater } from "./useUpdater";

/**
 * 자동 체크와 수동 확인의 실패 처리가 갈리는지에 대한 회귀 가드.
 *
 * v0.2.5 가 깔린 Windows 노트북에서 업데이트 안내가 안 뜬 적이 있는데, 당시 hook 이
 * 모든 실패를 idle 로 삼켜서 "최신"인지 "확인 실패"인지 구분할 방법이 없었다.
 * 그렇다고 자동 체크까지 오류창을 띄우면 오프라인 사용자를 매 실행마다 막는다.
 */
/** check() 가 실제로 쓰는 필드만 흉내낸다. 반환 타입을 박아야 mock 이 any 로 새지 않는다. */
type FakeUpdate = { version: string; body?: string };
const check = vi.fn<() => Promise<FakeUpdate | null>>();

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: () => check(),
}));
vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

afterEach(() => {
  check.mockReset();
});

describe("useUpdater", () => {
  it("자동 체크가 실패해도 조용히 idle 을 유지한다", async () => {
    check.mockRejectedValue(new Error("network unreachable"));

    const { result } = renderHook(() => useUpdater());

    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));
    expect(result.current.state.status).toBe("idle");
  });

  it("수동 확인이 실패하면 오류를 표면화한다", async () => {
    check.mockRejectedValue(new Error("network unreachable"));

    const { result } = renderHook(() => useUpdater());
    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.checkNow();
    });

    expect(result.current.state).toEqual({
      status: "error",
      message: "network unreachable",
      previous: "checking",
    });
  });

  it("수동 확인에서 새 버전이 없으면 최신임을 알린다 (자동은 idle 그대로)", async () => {
    check.mockResolvedValue(null);

    const { result } = renderHook(() => useUpdater());
    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));
    expect(result.current.state.status).toBe("idle");

    await act(async () => {
      await result.current.checkNow();
    });

    expect(result.current.state.status).toBe("uptodate");
  });

  it("새 버전이 있으면 자동 체크에서도 안내한다", async () => {
    check.mockResolvedValue({ version: "0.12.2", body: "release notes" });

    const { result } = renderHook(() => useUpdater());

    await waitFor(() =>
      expect(result.current.state).toEqual({
        status: "available",
        version: "0.12.2",
        notes: "release notes",
      }),
    );
  });
});
