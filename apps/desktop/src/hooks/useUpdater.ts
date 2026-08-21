import { relaunch as relaunchProcess } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 인앱 업데이터 state machine — hop 패턴 차용 (5 단계).
 *
 * 흐름:
 *   Idle ──check()──▶ Available ──confirm──▶ Downloading ──100%──▶ Ready ──relaunch──▶ (앱 재시작)
 *                          │                       │                   │
 *                          └──── later ──────▶ Idle│                   │
 *                                                  └──── error ───▶ Error ──retry──▶ 직전 단계
 *
 * 체크 실패는 자동/수동에 따라 다르게 다룬다.
 *
 * - 자동(앱 시작 시): 조용히 `Idle`. 이 앱은 오프라인 사용이 정상 시나리오라
 *   인터넷이 없는 사용자에게 매 실행마다 오류창을 띄우면 안 된다.
 * - 수동(정보 다이얼로그의 "업데이트 확인"): 사용자가 결과를 기다리고 있으므로
 *   "최신 버전"과 "확인 실패"를 반드시 구분해 보여준다. 이 구분이 없으면
 *   방화벽/프록시로 check() 가 죽어도 사용자·개발자 모두 알 방법이 없다.
 */
export type UpdaterState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "uptodate" }
  | { status: "available"; version: string; notes?: string | undefined }
  | { status: "downloading"; downloaded: number; contentLength?: number | undefined }
  | { status: "ready" }
  | { status: "error"; message: string; previous: "checking" | "downloading" };

export interface UpdaterApi {
  state: UpdaterState;
  /** 사용자가 직접 요청한 확인. 결과(최신/신버전/실패)를 반드시 화면에 보여준다. */
  checkNow: () => Promise<void>;
  /** Available state 에서 사용자 confirm. download + install 진행. */
  confirmInstall: () => Promise<void>;
  /** Available state 에서 "나중에" 선택. Idle 로 dismiss. */
  dismiss: () => void;
  /** Ready state 에서 사용자 "재시작" 클릭. 앱 종료 + 재실행. */
  relaunch: () => Promise<void>;
  /** Error state 에서 "다시 시도" 클릭. previous 단계 재실행. */
  retry: () => Promise<void>;
}

export function useUpdater(): UpdaterApi {
  const [state, setState] = useState<UpdaterState>({ status: "idle" });
  const pendingRef = useRef<Update | null>(null);

  const runCheck = useCallback(async (manual: boolean) => {
    if (manual) {
      setState({ status: "checking" });
    }
    try {
      const update = await check();
      if (!update) {
        setState(manual ? { status: "uptodate" } : { status: "idle" });
        return;
      }
      pendingRef.current = update;
      setState({
        status: "available",
        version: update.version,
        notes: update.body,
      });
    } catch (err) {
      // signing key 미설정 / 네트워크 실패 / endpoint 미설정 모두 여기로.
      if (import.meta.env.DEV) {
        console.debug("[useUpdater] check failed:", err);
      }
      if (!manual) {
        // 자동 체크의 의도된 noop. 오프라인 사용자를 방해하지 않는다.
        setState({ status: "idle" });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      setState({ status: "error", message, previous: "checking" });
    }
  }, []);

  const runDownloadAndInstall = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending) {
      setState({ status: "idle" });
      return;
    }
    try {
      let downloaded = 0;
      let contentLength: number | undefined;
      setState({ status: "downloading", downloaded: 0, contentLength });
      await pending.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          contentLength = event.data.contentLength;
          setState({ status: "downloading", downloaded: 0, contentLength });
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          setState({ status: "downloading", downloaded, contentLength });
        } else if (event.event === "Finished") {
          setState({ status: "ready" });
        }
      });
      // hop 패턴: Finished event 가 없는 platform 도 있음 → fallback.
      setState((prev) => (prev.status === "downloading" ? { status: "ready" } : prev));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ status: "error", message, previous: "downloading" });
    }
  }, []);

  const checkNow = useCallback(async () => {
    await runCheck(true);
  }, [runCheck]);

  const confirmInstall = useCallback(async () => {
    await runDownloadAndInstall();
  }, [runDownloadAndInstall]);

  const dismiss = useCallback(() => {
    pendingRef.current = null;
    setState({ status: "idle" });
  }, []);

  const relaunch = useCallback(async () => {
    try {
      await relaunchProcess();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ status: "error", message, previous: "downloading" });
    }
  }, []);

  const retry = useCallback(async () => {
    if (state.status !== "error") return;
    if (state.previous === "checking") {
      await runCheck(true);
    } else {
      await runDownloadAndInstall();
    }
  }, [state, runCheck, runDownloadAndInstall]);

  // 앱 시작 시 1 회 백그라운드 체크 (hop 패턴: 시작 시만, 주기적 체크 없음).
  useEffect(() => {
    void runCheck(false);
  }, [runCheck]);

  return { state, checkNow, confirmInstall, dismiss, relaunch, retry };
}
