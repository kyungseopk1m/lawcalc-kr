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
 * tauri.conf.json 의 `plugins.updater.pubkey` 가 비어 있으면 `check()` 가 실패.
 * 본 hook 은 그 경우 silently `Idle` 유지 (dev 환경 + signing key 미생성 상태 가정).
 *
 * @see for-claude/personal/lawcalc-kr/docs/plans/inapp-updater-plan.md
 */
export type UpdaterState =
  | { status: "idle" }
  | { status: "available"; version: string; notes?: string | undefined }
  | { status: "downloading"; downloaded: number; contentLength?: number | undefined }
  | { status: "ready" }
  | { status: "error"; message: string; previous: "checking" | "downloading" };

export interface UpdaterApi {
  state: UpdaterState;
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

  const runCheck = useCallback(async () => {
    try {
      const update = await check();
      if (!update) {
        setState({ status: "idle" });
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
      // dev: 사용자 silent (자동 백그라운드 체크의 의도된 noop).
      if (import.meta.env.DEV) {
        console.debug("[useUpdater] check skipped:", err);
      }
      setState({ status: "idle" });
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
      await runCheck();
    } else {
      await runDownloadAndInstall();
    }
  }, [state, runCheck, runDownloadAndInstall]);

  // 앱 시작 시 1 회 백그라운드 체크 (hop 패턴: 시작 시만, 주기적 체크 없음).
  useEffect(() => {
    void runCheck();
  }, [runCheck]);

  return { state, confirmInstall, dismiss, relaunch, retry };
}
